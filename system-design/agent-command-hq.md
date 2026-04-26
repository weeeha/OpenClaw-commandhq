# Agent Command HQ — System Design

**Status:** Draft v2 (+ OpenClaw operator surface merge)
**Last updated:** 2026-04-20
**Companion PRD:** `/specs/agent-command-hq-prd.md` (v2)
**Reference apps:** https://agent-command-hq.vercel.app · OpenClaw Control (see `system-design/README.md`)

---

## Changelog

- **v2 (2026-04-20)** — merged OpenClaw Control operator surface. New domain entities: Session, Channel, Node, CronJob (Scheduler), Instance, ModelProvider, Pricing. New services: Scheduler, Channel Manager, Models/Providers, Node Policy. Deep-dive on the Usage DSL grammar + parser + query plan. Storage shift: sessions join Postgres as a first-class entity; cost time-series moves to ClickHouse as the primary OLAP target. Realtime subscriptions extended with session- and channel-scoped channels. Scheduler pattern chosen: Postgres-backed with advisory locks (see §5).
- **v1 (2026-04-19)** — initial system design.

---

## 1. Requirements

### 1.1 Functional

**Supervision (v1 core):**
- Register agents from multiple runtimes (Claude Code SDK, OpenAI Agents SDK, generic webhook).
- Ingest agent lifecycle events: state changes, step logs, token usage, outcome signals.
- Present live squad roster, activity feed + Attention panel, active-operations progress.
- Issue control commands back to agent runtimes: pause, resume, abort, reassign, chat message.
- Compute and persist RPG progression (XP, levels, perks, achievements) and squad metrics.
- Enforce team-scoped RBAC (Admin / Operator / Viewer) under SSO.

**Operator surface (v2 merge):**
- List / inspect / edit **Sessions** with inline per-session `thinking` and `fast` overrides.
- Query cost/tokens/errors on the **Usage** page via a documented **DSL** and dimension chips.
- Manage **Channels** (Telegram, WhatsApp, Slack, Discord) with per-platform status + allow-lists.
- Manage the **Scheduler** — cron-style recurring missions with per-job isolation, Run Now, next-wake visibility.
- Manage **Nodes** (execution environments) — exec approvals, security/ask modes, per-agent overrides.
- Manage **Models / Providers** — API keys, per-model pricing overrides, test-connection, reconciliation deltas.
- Surface a filterable structured **Log** stream.
- Surface live **Instance** beacons.

### 1.2 Non-functional
- **Freshness:** p95 end-to-end event latency (agent → UI) < 5s.
- **Usage query latency:** p95 < 800ms for DSL queries over 30d windows at v1 scale; < 2s at 10x.
- **Availability:** 99.9% for control plane; degraded-read acceptable if event ingest lags.
- **Scale (v1):** ~50 teams, ~500 agents, ~2k concurrent sessions, ~5k missions/day, ~500 events/s peak, ~1k scheduled jobs.
- **Scale (10x target):** 500 teams, 5k agents, 20k concurrent sessions, 50k missions/day, 5k events/s peak, 10k scheduled jobs — no rewrite.
- **Cost:** aim for <$1/active-user/month infra at v1 scale.
- **Security:** SSO (OIDC + SAML), per-team isolation, at-rest encryption of provider API keys, SOC 2-ready logging.
- **Data retention:** 90 days hot events + sessions, 13 months cold aggregates.

### 1.3 Constraints
- Small team (3–5 eng), ship v1 in ~12 weeks (was 10 — operator surface is substantial).
- Web-responsive UI only; no native mobile.
- Single region at launch (us-east-1); design so multi-region is additive.
- Prefer managed services over self-hosted to control ops load.
- Maintain a credible upgrade path for existing OpenClaw users (see §9 Open Q).

---

## 2. High-Level Design

### 2.1 Component diagram (v2)

```
                ┌─────────────────────────────────────────────────────────┐
                │                      Users (browser)                    │
                └──────────────▲────────────────────────────▲─────────────┘
                               │ HTTPS / WSS                │
                               │                            │
                  ┌────────────┴─────────┐       ┌──────────┴──────────┐
                  │   Web App (Next.js)  │       │  Realtime Gateway   │
                  │   SSR + React RSC    │       │  (WebSocket + SSE)  │
                  └──────┬───────┬───────┘       └──────────┬──────────┘
                         │       │                          │
                         │       │ REST/GraphQL             │ pub/sub
                         │       ▼                          ▼
                         │  ┌─────────────────────────────────────────┐
                         │  │              API Gateway                │
                         │  │    authN / authZ / rate-limit / idem    │
                         │  └─┬──────┬──────┬────────┬──────┬─────┬───┘
                         │    │      │      │        │      │     │
                  ┌──────┘    │      │      │        │      │     │
                  │           │      │      │        │      │     │
          ┌───────▼──┐ ┌──────▼──┐ ┌─▼────┐ ┌─▼──┐ ┌─▼────┐ ┌▼────────┐
          │ Agents + │ │ Missions│ │Usage │ │Chat│ │ Chan │ │  Sched  │
          │ Sessions │ │ Service │ │Query │ │Svc │ │ Svc  │ │  Svc    │
          │ Service  │ └─────┬───┘ │ (DSL)│ └─┬──┘ └─┬────┘ └───┬─────┘
          └──────┬───┘       │     └──┬───┘   │      │          │
                 │           │        │       │      │          │
                 │      ┌────┴───┐ ┌──┴───┐   │  ┌───┴────┐  ┌──┴──────┐
                 │      │ Nodes  │ │Models│   │  │Channel │  │Scheduler│
                 │      │ Policy │ │/Prov │   │  │Brokers │  │Workers  │
                 │      └────┬───┘ └───┬──┘   │  │(TG/WA/…│  │(cron +  │
                 │           │         │      │  │  Slack)│  │ advisory│
                 │           │         │      │  └────┬───┘  │ locks)  │
                 │           │         │      │       │      └────┬────┘
                 └────┬──────┴────┬────┘      │       │           │
                      │           │           │       │           │
                 ┌────▼─────┐ ┌───▼──────┐    │  ┌────▼──────┐  ┌─▼────────┐
                 │ Postgres │ │  Redis   │    │  │ External  │  │ Postgres │
                 │ (OLTP)   │ │ (cache,  │    │  │ platforms │  │ (pg_cron │
                 │          │ │ presence,│    │  │ TG/WA/Slk │  │  +locks) │
                 └──────────┘ │ budgets, │    │  └───────────┘  └──────────┘
                              │ cmd queue│    │
                              └──────────┘    │
                                              ▼
                                        ┌────────────┐
                                        │ Postgres   │
                                        │ (chat hist)│
                                        └────────────┘

                               ▲  ▲  ▲
              (events flow up) │  │  │ (commands flow down)
     ┌─────────────────────────┴──┴──┴────────────────────────┐
     │                    Event Bus (Kafka/Redpanda)          │
     │  topics: agent.events · cmd.outbound · state.changed   │
     │          session.events · channel.events               │
     └─────▲─────────▲───────────────────────────────▲────────┘
           │         │                               │
   ┌───────┴───┐ ┌───┴──────┐                ┌───────┴──────────┐
   │  Ingest   │ │  Cost    │                │    Workers       │
   │  Service  │ │ Collector│                │ XP · metrics ·   │
   │ (SDK +    │ │ (provider│                │ alerts · digest ·│
   │  webhook) │ │  bills)  │                │ usage rollups    │
   └───────▲───┘ └──────────┘                └────────┬─────────┘
           │                                          │
           │                                          ▼
           │                                   ┌────────────┐
           │                                   │ ClickHouse │
           │                                   │ (cold/OLAP │
           │                                   │  + Usage   │
           │                                   │  analytics)│
           │                                   └────────────┘
           │
  ┌────────┴────────────────────────────────┐
  │        Agent Runtimes (external)        │
  │  Claude Code │ OpenAI Agents │ Webhook  │
  └─────────────────────────────────────────┘
```

**New in v2:** Channel Brokers service (one adapter per platform), Scheduler service (Postgres-backed cron engine with advisory locks), Nodes Policy service (exec approvals), Models/Providers service, Usage Query service (DSL parser → ClickHouse SQL). Realtime Gateway gains two new channels: `session:<id>` and `channel:<platform>`.

### 2.2 Data flow

**Event ingest (unchanged):** agent runtime → Ingest Service → Postgres outbox + Kafka → Workers → derived state + Realtime fan-out.

**Session lifecycle (new):**
1. On `mission.started` (or a bare `session.created` from a non-mission entry point like Chat), Agents+Sessions Service inserts a `sessions` row and emits `session.created` to `state.changed`.
2. `token.usage` events keyed by session_id update `sessions.tokens_used` in Redis; flushed to Postgres each minute and indexed in ClickHouse.
3. Inline edits from the Sessions page (thinking/fast overrides) route as commands to the agent runtime via the existing command path (§3.4 v1).
4. On `mission.ended` / `session.closed`, row transitions to `closed` and remains queryable.

**Usage DSL query (new):**
1. User types `key:agent:main:cron* model:gpt-4o has:errors minTokens:2000` in the Usage filter box.
2. Frontend calls `POST /v1/usage/query` with the raw string + date range + pinned filters.
3. Usage Query service lexes + parses via a hand-rolled grammar (§3.8); invalid tokens return a structured error with hint + offset.
4. Parser emits a query plan — a sanitized ClickHouse SQL against the `usage_facts` table (columnar, pre-aggregated per 5-min bucket).
5. Response: metric-card values + time-series bars + sampled rows (paginated).

**Scheduled mission (new):**
1. Scheduler Worker wakes every 10s, uses `pg_advisory_lock` on `scheduler:tick` so only one worker fires per cluster.
2. Queries `cron_jobs` for rows where `next_run_at ≤ now() AND enabled AND NOT isolated_in_progress`.
3. For each eligible row: inserts a new `missions` row, emits `mission.started`, updates `cron_jobs.next_run_at = cron_expr.next_after(now())`, bumps `last_run_at`.
4. Failed executions write `last_status='failed', last_error=…`. Failures emit `scheduler.job_failed` events, which flow through the feed into the Attention panel.

### 2.3 API surface (v2 additions in **bold**)

| Area | Verb + path | Purpose |
|---|---|---|
| Agents | `GET /v1/agents` | List agents for current team |
| Agents | `GET /v1/agents/:id` | Detail + current mission + sub-tab data |
| Agents | `POST /v1/agents/:id/commands` | `{type: pause\|resume\|abort\|reassign}` |
| Agents | **`GET /v1/agents/:id/files`**, **`PUT /v1/agents/:id/files/:role`** | Workspace files (R1 Files tab) |
| Missions | `GET /v1/missions?status=active` | Active ops list |
| Missions | `POST /v1/missions` | Launch a new mission |
| Feed | `GET /v1/events?cursor=...` | Paginated activity feed |
| Feed | **`GET /v1/attention`** | Attention panel payload (failed jobs + skills missing deps) |
| Budget | `GET /v1/budget/current` | Team spend vs. threshold (header widget) |
| **Usage** | **`POST /v1/usage/query`** | DSL query → metric cards + time series |
| **Usage** | **`GET /v1/usage/pinned`**, **`POST /v1/usage/pinned`** | Saved queries per user |
| **Usage** | **`POST /v1/usage/export`** | CSV export aligned to invoice dimensions |
| **Sessions** | **`GET /v1/sessions?filter=…`** | Table with cursor pagination |
| **Sessions** | **`PATCH /v1/sessions/:key`** | Inline update `thinking` / `fast` |
| **Sessions** | **`POST /v1/sessions/bulk`** | Bulk pause/reassign/export |
| Chat | `GET/POST /v1/missions/:id/chat` | Chat history + send |
| RPG | `GET /v1/agents/:id/progression` | XP, level, perks, achievements |
| RPG | **`GET /v1/skills`** | Skill Registry + Skill Tree graph |
| RPG | **`PATCH /v1/skills/:key`** | Enable/disable, per-agent allowlist |
| RPG | **`POST /v1/skills/install`** | Install from first-party skill index |
| **Channels** | **`GET /v1/channels`** | Per-platform status + config |
| **Channels** | **`PUT /v1/channels/:platform`** | Update config |
| **Channels** | **`POST /v1/channels/:platform/link`**, **`…/unlink`** | Auth flows per platform |
| **Scheduler** | **`GET /v1/scheduler/jobs`** | All cron jobs with filter |
| **Scheduler** | **`POST /v1/scheduler/jobs`**, **`PATCH …/:id`**, **`DELETE …/:id`** | CRUD |
| **Scheduler** | **`POST /v1/scheduler/jobs/:id/run`** | Run Now |
| **Nodes** | **`GET /v1/nodes`**, **`PUT /v1/nodes/:id/approvals`** | Exec approvals per scope |
| **Models** | **`GET /v1/models/providers`**, **`POST …`**, **`PUT …/:id`** | Provider registry (keys redacted on read) |
| **Models** | **`POST /v1/models/providers/:id/test`** | Test connection |
| **Models** | **`GET /v1/models/pricing`**, **`PUT /v1/models/pricing/:model`** | Per-model pricing overrides |
| **Instances** | **`GET /v1/instances?showOffline=…`** | Live beacon list (deduped) |
| **Logs** | **`GET /v1/logs?filter=…&tail=true`** | Server-sent stream when tail=true |
| Auth | `POST /v1/auth/sso/callback` | OIDC/SAML callback |
| Admin | `PUT /v1/teams/:id/budget` | Edit thresholds |
| Admin | **`PUT /v1/teams/:id/rpg`** | Toggle RPG visibility team-wide |
| Ingest | `POST /ingest/events` | Agent event (external) |
| Ingest | `WS /ingest/stream` | Bidirectional agent channel |
| Realtime (client) | `WS /rt` | Subscribe by team/agent/mission/**session**/**channel** |

Realtime subscribe payload (v2): `{subscribe: ["roster", "feed", "budget", "mission:abc", "session:xyz", "channel:telegram"]}`.

### 2.4 Storage choices (v2)

| Store | Use | Why |
|---|---|---|
| **Postgres** (primary OLTP) | Agents, missions, **sessions**, **channels**, **cron_jobs**, **nodes**, **providers**, **pricing**, teams, users, commands, events (append-only), RPG ledger, **audit_events** | Relational integrity, JSONB payloads, LISTEN/NOTIFY for low-latency UI refresh on narrow queries, pg_advisory_lock for scheduler leader election. |
| **Redis** | Presence, budget counters, rate-limits, hot session token counters, command queue, **cron job "in-progress" flags** (short-lived, with TTL safety) | Avoids write amplification on high-frequency session.tokens updates. |
| **ClickHouse** | Event analytics, **usage_facts table** (core Usage DSL target), squad metrics, cost breakdowns, retention | Fast aggregates at scale; Usage page's 9 metric cards + time-series all run here. |
| **Kafka / Redpanda** | `agent.events`, `cmd.outbound`, `state.changed`, **`session.events`**, **`channel.events`** | Durable pub/sub + replay. |
| **Object store (S3)** | Large mission artifacts (diffs, long logs), cold exports, **CSV exports from Usage** | Cheap. |

Provider API keys live in Postgres but encrypted via a KMS-backed envelope (AWS KMS or GCP KMS). Never returned in plaintext via API.

---

## 3. Deep Dive

### 3.1 Data model (v2)

Additions to the v1 schema:

```sql
-- SESSIONS
sessions (
  key text pk,                           -- agent:<slug>:<platform>:<kind>:<uuid>
  team_id uuid fk,
  agent_id uuid fk,
  mission_id uuid null fk,               -- populated when session belongs to a mission
  channel_platform text null,            -- telegram/whatsapp/slack/discord/webchat
  kind text check (kind in ('direct','group','cron','heartbeat')),
  label text null,
  tokens_used bigint default 0,
  tokens_limit bigint,
  thinking text check (thinking in ('inherit','low','medium','high')) default 'inherit',
  fast text check (fast in ('inherit','on','off')) default 'inherit',
  state text check (state in ('active','paused','closed')) default 'active',
  started_at timestamptz,
  last_activity_at timestamptz,
  closed_at timestamptz null
)
create index sessions_team_active_idx on sessions(team_id, state, last_activity_at desc)
create index sessions_agent_idx on sessions(agent_id, last_activity_at desc)

-- CHANNELS
channels (
  id uuid pk,
  team_id uuid fk,
  platform text check (platform in ('telegram','whatsapp','slack','discord','webchat')),
  configured bool default false,
  linked bool default false,
  running bool default false,
  connected bool default false,
  last_connect_at timestamptz null,
  last_message_at timestamptz null,
  auth_expires_at timestamptz null,
  mode text null,                        -- e.g. streaming/chunked
  allow_from jsonb default '[]',
  config jsonb default '{}',             -- platform-specific knobs
  secrets_kms_ref text null,             -- envelope-encrypted credentials pointer
  updated_at timestamptz,
  unique (team_id, platform)
)

-- NODES (exec environments)
nodes (
  id text pk,                            -- slug like 'main', 'gateway'
  team_id uuid fk,
  security_mode text check (security_mode in ('strict','standard','permissive')),
  ask_mode text check (ask_mode in ('always','risky','never')),
  ask_fallback text check (ask_fallback in ('deny','allow','defer')),
  auto_allow_skill_clis bool default false,
  default_binding bool default false,
  created_at timestamptz,
  unique (team_id, default_binding) where default_binding = true
)

node_agent_overrides (
  node_id text fk,
  agent_id uuid fk,
  security_mode text,
  ask_mode text,
  ask_fallback text,
  primary key (node_id, agent_id)
)

-- CRON JOBS (Scheduler)
cron_jobs (
  id uuid pk,
  team_id uuid fk,
  agent_id uuid fk,                      -- target agent
  expr text,                             -- cron expression (5- or 7-field)
  timezone text default 'UTC',
  enabled bool default true,
  isolated bool default false,           -- if true, skip tick while in-progress
  command text,                          -- free-text mission template
  last_run_at timestamptz null,
  next_run_at timestamptz,
  last_status text check (last_status in ('ok','failed','skipped',null)),
  last_error text null,
  in_progress_until timestamptz null,    -- expiring lock for isolated=true jobs
  created_at timestamptz,
  updated_at timestamptz
)
create index cron_jobs_due_idx on cron_jobs(next_run_at) where enabled = true

-- INSTANCES (live beacons)
instances (
  id uuid pk,
  team_id uuid fk,
  hostname text,
  ip inet,
  role text check (role in ('gateway','webchat','backend','local')),
  os text,
  version text,
  last_beacon_at timestamptz,
  reason text check (reason in ('self','connect','disconnect','periodic')),
  host_key text,                         -- dedup: shared across "Mikalais-Mac-Studio.local" and "Mikalai's Mac Studio"
  unique (team_id, hostname, role)
)
create index instances_hostkey_idx on instances(team_id, host_key, last_beacon_at desc)

-- PROVIDERS + PRICING
providers (
  id uuid pk,
  team_id uuid fk,
  name text,                             -- anthropic, openai, google, etc.
  base_url text null,                    -- override
  api_key_kms_ref text,                  -- never returned in plaintext
  default_model text,
  rate_limits jsonb default '{}',
  created_at timestamptz,
  unique (team_id, name)
)

pricing (
  id bigserial pk,
  provider_id uuid fk,
  model text,                            -- 'gpt-4o', 'claude-sonnet-4.5', etc.
  per_input_token_cents numeric(12,6),
  per_output_token_cents numeric(12,6),
  per_cached_token_cents numeric(12,6),
  effective_from timestamptz,
  unique (provider_id, model, effective_from)
)

-- AUDIT
audit_events (
  id bigserial pk,
  team_id uuid,
  actor_id uuid,
  action text,                           -- 'scheduler.run_now', 'channel.link', 'pricing.update', etc.
  resource_type text,
  resource_id text,
  before jsonb,
  after jsonb,
  at timestamptz
)
```

**ClickHouse: `usage_facts`** — the Usage DSL target.

```sql
-- ClickHouse (pre-aggregated to 5-min buckets from Kafka 'session.events')
CREATE TABLE usage_facts
(
  ts           DateTime,              -- bucket start
  team_id      UUID,
  agent_slug   LowCardinality(String),
  channel      LowCardinality(String),
  provider     LowCardinality(String),
  model        LowCardinality(String),
  session_key  String,
  tokens_in    UInt64,
  tokens_cached UInt64,
  tokens_out   UInt64,
  messages     UInt32,
  tool_calls   UInt32,
  errors       UInt32,
  cost_cents   UInt64
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (team_id, ts, agent_slug, model);
```

### 3.2 Event ingest pipeline
Unchanged from v1. New event types now first-class on the `agent.events` topic:
`session.created`, `session.tokens_used`, `session.closed`, `channel.linked`, `channel.message_in`, `channel.message_out`, `scheduler.fired`, `scheduler.job_failed`, `instance.beacon`.

### 3.3 Realtime fan-out
Unchanged topology; v2 adds two channel scopes: `session:<key>` for the Sessions drill-down and `channel:<platform>` for Channel page status ticks.

### 3.4 Command delivery
Unchanged. Inline Sessions edits (thinking/fast) route as commands of type `session.update` with the same idempotency + ack contract.

### 3.5 RPG progression engine
Unchanged. Skill Tree graph is served from the same `skills` table as the Skill Registry — the two UIs are different renderers over the same rows. Registry surfaces every skill; Tree surfaces the subset with graph metadata (`prereqs`, `x`, `y`, `hub`).

### 3.6 Budget & cost ingest
Extended: `token.usage` events write into Redis counters AND produce a `session.tokens_used` event that the Workers service rolls into the ClickHouse `usage_facts` table every 60s. The Usage page queries `usage_facts` directly — it is the single source of truth for the UI. Realtime budget thresholds remain on the Redis fast path.

### 3.7 AuthN / AuthZ
Extended with:
- Per-team RPG toggle (`teams.rpg_enabled`).
- Node-level exec approvals (`nodes.security_mode`, `ask_mode`, `ask_fallback`) consulted by the agent runtime via a `POST /v1/nodes/check` call before any tool that is marked "asks."
- Provider API keys envelope-encrypted with a per-team KMS key.
- Audit events written on every mutation of `providers`, `pricing`, `channels`, `cron_jobs`, `nodes`, team RPG toggle, budget thresholds, team membership.

### 3.8 **Usage DSL — grammar, parser, query plan (new)**

**Grammar (v1, EBNF):**

```
query      = clause { WS clause } ;
clause     = key_filter | kv_filter | bool_filter | range_filter | date_filter ;

key_filter  = "key:" glob ;
kv_filter   = ("agent:" | "channel:" | "provider:" | "model:" | "tool:") ident ;
bool_filter = "has:" ("errors" | "tools" | "cache") ;
range_filter= ("minTokens:" | "maxTokens:" | "minCost:" | "maxCost:") number ;
date_filter = ("after:" | "before:") (iso_date | rel_date) ;

glob       = { ident_char | "*" } ;
ident      = ident_char { ident_char } ;
ident_char = ALPHA | DIGIT | "-" | "_" | "." | ":" ;
number     = DIGIT { DIGIT } [ "." DIGIT { DIGIT } ] ;
iso_date   = "YYYY-MM-DD" [ "THH:MM" [ "Z" ] ] ;
rel_date   = number ("h" | "d" | "w") "ago" ;
```

**Parser:** hand-rolled lexer + recursive-descent parser in TypeScript. Why not a library:
- The grammar is tiny; an AST tree from a library would be overkill.
- We need per-token offsets for inline error highlighting in the UI (error says `{ "error": "unknown key 'foobar'", "offset": 12, "hint": "try 'model:' or 'key:'" }`).

**Query plan:** parsed clauses map to ClickHouse SQL predicates against `usage_facts`:

| Clause | SQL predicate |
|---|---|
| `key:agent:main:cron*` | `session_key LIKE 'agent:main:cron%'` |
| `agent:main` | `agent_slug = 'main'` |
| `model:gpt-4o` | `model = 'gpt-4o'` |
| `has:errors` | `errors > 0` |
| `minTokens:2000` | `tokens_in + tokens_out >= 2000` |
| `after:7d ago` | `ts >= now() - INTERVAL 7 DAY` |

Team isolation is enforced as an always-prepended `team_id = $currentTeam` predicate — the parser cannot override it.

**Pinned queries:** stored per user in Postgres `pinned_usage_queries (user_id, team_id, name, raw_dsl, created_at)`.

### 3.9 **Scheduler engine (new)**

Trade-off space: Temporal / River / pg-cron / self-roll. Chosen: **self-rolled, Postgres-backed with advisory locks**.

Why:
- Temporal is overkill for cron and demands ops familiarity we don't have in a 3–5 eng team.
- River is good but adds another infra component; Postgres is already central.
- pg-cron runs inside Postgres, which is fine for hobby but doesn't give us visibility or fault behavior we need.

**Mechanism:**
- `cron_jobs` table holds every job with `next_run_at` indexed.
- Scheduler workers run every 10s, each calls `SELECT pg_try_advisory_xact_lock(hashtext('scheduler:tick'))`.
- Lock holder queries `SELECT * FROM cron_jobs WHERE enabled AND next_run_at <= now() AND (NOT isolated OR in_progress_until IS NULL OR in_progress_until < now()) FOR UPDATE SKIP LOCKED LIMIT 100`.
- For each due row: compute `next_run_at = cron.next(expr, tz, now())`, update row, emit `scheduler.fired` to Kafka, insert `missions` row, set `in_progress_until = now() + max_duration` if `isolated`.
- Missed ticks: if a worker is down and the next tick lands > 10s late, the next healthy worker still catches the row because `next_run_at <= now()`. We do not fire catch-up runs (matches OpenClaw behavior).

**Cron expression validation:** client-side via a vendored expression parser; server-side re-validation on write. 5- and 7-field forms supported; timezone stored alongside.

### 3.10 **Channel broker (new)**

One adapter service per platform, sharing a common protocol:

```
┌──────────────┐     WS/HTTP    ┌──────────────────┐
│ Telegram     │◀─────────────▶│ Telegram Broker  │──┐
│ Bot API      │                 └──────────────────┘  │
└──────────────┘                                       │
┌──────────────┐                 ┌──────────────────┐  │  session.events
│ WhatsApp     │◀─────────────▶│ WhatsApp Broker  │──┼──────────────────▶ Kafka
│ Cloud API    │                 └──────────────────┘  │
└──────────────┘                                       │
┌──────────────┐                 ┌──────────────────┐  │
│ Slack        │◀─────────────▶│ Slack Broker     │──┘
│ Events API   │                 └──────────────────┘
└──────────────┘
```

Brokers are stateless, scale horizontally, and keep long-lived connections per channel. Each publishes `channel.linked`, `channel.message_in`, `channel.message_out` events keyed by `(team_id, platform)` so the Channels UI can render live status without polling.

### 3.11 Frontend architecture (v2)

- **Next.js App Router** on Vercel. Server Components for the shell; client components for realtime-subscribed views.
- **New routes:** `/runtime/sessions`, `/runtime/usage`, `/runtime/channels`, `/runtime/scheduler`, `/runtime/logs`, `/runtime/instances`, `/system/nodes`, `/system/models`.
- **Usage page** ships a small DSL-aware input: local lexer highlights tokens, autocompletes keys, shows the grammar help popover inline.
- **Sessions page** uses virtualized table (react-virtual or equivalent) — v1 loads 120 rows by default per OpenClaw baseline; pagination beyond.
- **Team-level RPG toggle** reads from team config at app mount; hides nav group and swaps default tabs on Agents/Skills.

### 3.12 Observability
Unchanged. Two new SLOs:
- Usage DSL query p95 < 800ms at v1 scale.
- Scheduler tick jitter < 10s from expected time.

---

## 4. Scale and Reliability

### 4.1 Load estimation (v2)

| Dimension | v1 | 10x target | Notes |
|---|---|---|---|
| Teams | 50 | 500 | |
| Agents | 500 | 5k | |
| **Concurrent sessions** | ~2k | ~20k | |
| Events/day | ~10M | ~100M | |
| **Session.tokens_used events/s peak** | ~300 | ~3k | dominates usage_facts ingest |
| Missions/day | 5k | 50k | |
| **Cron jobs** | ~1k | ~10k | |
| **Channels configured** | ~100 | ~1k | |
| Avg concurrent WS | 200 | 2k | |
| Postgres size (hot) | ~80 GB | ~800 GB | adds sessions + cron_jobs |
| ClickHouse size | ~30 GB | ~300 GB | usage_facts at 5-min buckets |

### 4.2 Scaling plan (deltas vs. v1)
- **Sessions table** — monthly partitioning by `started_at` once hot row count > 5M.
- **usage_facts** — already partitioned monthly; MergeTree handles 10x without changes.
- **Scheduler workers** — stateless; advisory lock gives linear scale up to N workers with one leader at a time. Sub-second tick granularity is not a goal (10s floor).
- **Channel brokers** — scale per-platform; long-lived connections pinned to broker replicas via consistent hashing on `team_id`.

### 4.3 Failure modes (deltas)

| Failure | Behavior | Mitigation |
|---|---|---|
| Scheduler worker dies holding advisory lock | Lock releases on txn end (it's a _xact_ lock); next tick picks up | Use `pg_try_advisory_xact_lock`, not session-scope |
| Channel broker disconnects from Telegram | `connected=false` propagates via `channel.events`; UI shows red; auto-reconnect with exponential backoff | Health probe every 30s |
| ClickHouse down | Usage page serves last-cached response with a "stale since …" banner; realtime budget counters still in Redis | Circuit breaker with 30s stale TTL |
| Usage DSL parse panic | Return 400 with structured error; never 5xx from parser | Property-tested parser; 100% line coverage target |
| Provider API key leak | Envelope encryption + KMS audit log pinpoints which key/team/when; rotation tool ships in R13 | Never return plaintext; scrub from logs |

### 4.4 Multi-region / DR — unchanged from v1.

---

## 5. Trade-off Analysis (v2 additions)

| Decision | Chose | Alternative | Why |
|---|---|---|---|
| **Usage DSL parser** | Hand-rolled recursive-descent in TS | nearley / chevrotain / peggy | Tiny grammar; need per-token offsets for UI error highlighting; avoid codegen step. |
| **Usage query target** | ClickHouse `usage_facts` | Postgres with materialized views | ClickHouse wins at columnar aggregates and retention; we already had it in v1 for analytics. |
| **Scheduler engine** | Postgres + advisory locks, self-rolled | Temporal / River / pg-cron | Small team; Postgres is already central; workload is cron, not arbitrary workflows. Temporal is the right answer at 100x. |
| **Cron catch-up on missed ticks** | No catch-up (run only once at next eligible time) | Replay all missed runs | Matches operator expectations from OpenClaw; avoids storms after outages. |
| **Channel brokers** | One service per platform, common protocol | Single mega-broker | Per-platform auth/reconnect behavior differs too much; easier to pager-duty. |
| **Node policy** | Policy data in Postgres, enforcement in agent runtime | Central policy service with RPC | Enforcement must work even if HQ is unreachable; runtimes fetch + cache policy. |
| **Provider key storage** | Postgres column + KMS envelope | Dedicated secret manager (AWS SM, Vault) | Fewer moving parts; KMS envelope gets us SOC 2-ready without a secret manager. Revisit at enterprise tier. |
| **Session table identity** | `key` as primary key (agent:<slug>:<platform>:<kind>:<uuid>) | Surrogate UUID | OpenClaw parity and user familiarity; glob-friendly for the DSL. |
| **Instance dedup** | Compute `host_key` on beacon (normalize hostname, collapse to mac-address if present) | Force users to merge manually | Automatic is far better UX; false merges are low risk at the team scope. |

---

## 6. What I'd Revisit as the System Grows

(v1 items retained; v2 additions.)

1. **Event fan-out shape.** Same as v1.
2. **Postgres for events.** Same as v1.
3. **Command dispatch.** Same as v1.
4. **Multi-tenancy isolation.** Same as v1.
5. **Perks as executable policy.** Same as v1.
6. **Cost model.** Same as v1.
7. **Mission lifecycle.** Same as v1.
8. **RPG rubric.** Same as v1.
9. **(new) Usage DSL grammar.** If operators push past the current grammar (joins across dimensions, comparisons like `tokens_in > tokens_out`), swap the recursive-descent parser for a proper grammar (chevrotain) and expose an AST to support composition.
10. **(new) Scheduler.** Moving beyond pure cron — conditional triggers, DAGs, retries with backoff — is where Temporal / River actually earn their keep. Migration path: keep `cron_jobs` as the "simple" trigger table, route complex workflows to a real workflow engine.
11. **(new) Channels.** Start with 4 platforms; as the list grows, extract the broker protocol into a formal contract (gRPC or similar) so third parties can ship their own brokers.
12. **(new) Node policy.** If customers run agents in their own cloud, the node concept evolves into a "tenant-managed execution environment" with egress/ingress controls. This is a full feature, not a polish pass.

---

## 7. Assumptions Made

(v1 retained; v2 additions.)

- Customers run their own agent runtimes; we do not host models.
- Model-provider billing APIs exist and are reasonably accurate within a few minutes.
- Teams tolerate a brief (seconds) realtime outage as long as no data is lost.
- v1 does not need EU data residency.
- We have budget for managed services (~$3–5k/mo infra at v1 scale).
- English-only UI at launch.
- No real-time collaboration on shared mutable resources.
- **(new)** Existing OpenClaw users are willing to re-register agents into Agent HQ; we do not inherit `~/.openclaw/openclaw.json` automatically at v1 (see Open Q §8).
- **(new)** A 10-second scheduler tick granularity is acceptable — we do not aim for sub-second.
- **(new)** Teams accept a 60s propagation delay on RPG toggle (no requirement for instant flip).

---

## 8. Open Technical Questions

(v1 retained; v2 additions.)

- Self-hosted deployment for enterprise?
- Agent-to-agent events (parent/child relationships)?
- Mission inputs/outputs storage — metadata only, or full?
- Billing model — seat / team / usage-passthrough?
- **(new) OpenClaw migration path.** Do we ship a one-shot importer that reads `~/.openclaw/openclaw.json` and creates equivalent agents / cron_jobs / channels in Agent HQ? If yes, how do we handle drift when both tools remain in use?
- **(new) Usage DSL grammar as a public surface.** If we publish it externally, we commit to compatibility. If it stays internal, we can evolve it freely.
- **(new) Channel auth.** Telegram and WhatsApp have very different auth flows; do we build a per-platform linking UI or abstract it behind a common "connect your account" wizard? The wrong abstraction here is costly.
- **(new) Scheduler isolation semantics.** Should an isolated job fail if its previous run is still going, skip silently, or queue? OpenClaw picked skip-silently; we likely match but want to confirm with operators.
- **(new) Node policy bootstrap.** New teams start with what defaults — strict, standard, or permissive? Strict is safest but frustrating; standard is a judgment call.

---

## 9. IA Diff — OpenClaw Control → Agent Command HQ (mirrored from PRD)

See PRD §IA Diff for the per-page disposition table.

Quick implementation checklist for the engineering team, grouped by build effort:

**Low effort (reuse OpenClaw patterns 1:1):**
- Instances page (R17) — simple card list; add dedup.
- Logs page (R18) — filterable stream; reuse activity-feed rendering.

**Medium effort:**
- Sessions page (R12) — table + inline dropdowns + bulk actions; needs optimistic UI + ack reconciliation.
- Channels page (R14) — 2-column layout + platform-specific form bodies; needs the Broker service.
- Scheduler page (R15) — list + Run Now + cron expression editor; needs the Scheduler service.
- Models page (R13) — provider registry + test-connection + KMS-backed secret handling.
- Nodes page (R16) — policy editor; enforcement is in agent runtime, not HQ.

**High effort:**
- Usage page (R4 + R11) — DSL parser, ClickHouse integration, pinned queries, export CSV, time-series chart, 9 metric cards. **This is the single biggest net-new surface and should get its own sprint.**

**UX fixes applied system-wide (friction inherited from OpenClaw):**
- Consolidate per-card Refresh → one page-level Refresh.
- Dismissable global update banner.
- Truncate + copy-on-click for long identifiers.
- Grouped menus instead of 4–6 button rows.
- Every empty state ships with a CTA.
- Brand accent ≠ error red.
