# OpenClaw Control — System Design

Information architecture and functional surface of the OpenClaw Control UI,
reverse-engineered from observed screens (v2026.4.5).

> This document captures **what exists**, not what should exist. Recommendations
> are called out in a dedicated section and kept separate from the factual
> description of the system.

---

## 1. Purpose & scope

OpenClaw Control is a **local-first web console** for operating a
multi-agent runtime. It is served at `127.0.0.1` and is itself a presence
beacon on the OpenClaw gateway (it registers as the `openclaw-control-ui`
webchat client).

Its job is to answer five questions for the operator:

1. **Is my runtime healthy?** (gateway up, channels connected, crons firing)
2. **What are my agents doing right now?** (sessions, recent activity)
3. **What is it costing me?** (tokens, dollars, errors, cache hits)
4. **How do I configure an agent?** (workspace, files, tools, skills, channels, crons)
5. **How do I extend the system?** (skills, nodes, communications, automations)

It is **not** the agent chat surface in the strict sense — there is a `Chat`
entry in the nav, but most of the console is operational/observability, not
conversational.

### Operator persona

Single technical user running the stack on their own hardware (Mac Studio
gateway + additional nodes). Comfortable with:

- Config files (`~/.openclaw/openclaw.json`, `~/.openclaw/workspace/*`)
- JSON, cron expressions, UUIDs in the UI
- Raw log streams
- A DSL for filtering (`key:agent:main:cron* model:gpt-4o has:errors minTokens:2000`)

Implication: the UI can be **information-dense and jargon-tolerant**, but
should still make empty states, naming, and cross-references teachable to
someone returning after two weeks away.

---

## 2. Domain model

The entities the UI exposes, their attributes, and their relationships.
Inferred from visible fields; some names are my best guess.

### 2.1 Entities

| Entity       | Identity                          | Key attributes                                                                                                  |
| ------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Agent**    | slug (`main`, `artist`, …)        | workspace path, primary model, identity name+avatar, skills filter, tools profile, default flag                 |
| **Channel**  | platform (`telegram`, `whatsapp`) | configured, linked, running, connected, last connect/message, auth age, accounts, allow-from, capabilities      |
| **Instance** | hostname + role                   | IP, role (`gateway` / `webchat` / `backend` / `local`), OS, version, last beacon, beacon reason                 |
| **Node**     | node id (`main`, `gateway`, …)    | security mode, ask policy, ask fallback, skill auto-allow, default binding, exec approvals                      |
| **Session**  | key (`agent:chat:telegram:…`)     | label, kind (`direct` / `group` / `cron`), updated, tokens used/limit, thinking mode, fast mode                 |
| **Skill**    | slug (`1password`, `apple-notes`) | type (built-in / extension / custom), enabled, ready / needs-setup / disabled, description                      |
| **Tool**     | name (`Exec`, `Web Search`, …)    | built-in flag, profile membership, per-agent override, description                                              |
| **File**     | role (`AGENTS`, `SOUL`, `USER`…)  | path under agent workspace, missing / present, editable content                                                 |
| **Cron Job** | id                                | cron expression, timezone, enabled, isolated flag, target agent, last/next run, status, command text            |
| **Dream**    | phase (scene, diary)              | active flag, short-term count, signal count, phase hits, promoted hunches                                       |
| **Usage**    | time-bucketed                     | tokens (prompt/cached/completion), cost, sessions, messages, tool calls, cache hit rate, error rate, throughput |

### 2.2 Relationships

```
Agent ─── has many ──▶ File          (AGENTS / SOUL / TOOLS / IDENTITY / USER / HEARTBEAT / MEMORY)
Agent ─── has many ──▶ Tool override (profile + per-tool)
Agent ─── has many ──▶ Skill allow   (all-on or per-agent allowlist)
Agent ─── bound to ──▶ Channel       (via channel accounts)
Agent ─── pinned to ─▶ Node          (via exec node binding)
Agent ─── targeted ──▶ Cron Job      (per-agent schedule)

Channel ── accounts ─▶ {platform accounts}
Channel ── allow-from ─▶ {ids/handles}

Node ──── approvals ─▶ {cmd allowlist + ask policy}

Session ── joins ────▶ Agent × Channel × kind
Session ── overrides ─▶ {thinking, fast} (default inherit)

Instance ── probably maps to ─▶ Node (overlap is unclear; see §7.3)

Dream ──── consolidates ─▶ Memory (short-term → long-term)

Usage ──── rolls up ────▶ Agent / Channel / Provider / Model / Tool
```

### 2.3 Storage

| Location                             | Contents                                        |
| ------------------------------------ | ----------------------------------------------- |
| `~/.openclaw/openclaw.json`          | Primary config (agents, channels, nodes, etc.) |
| `~/.openclaw/workspace/`             | Per-agent workspaces and core files            |
| `~/.openclaw/cron/jobs.json`         | Cron definitions (seen in gateway logs)         |
| `~/.openclaw/shared/RECENT_CONTEXT.md` | Regenerated daily from conversation logs     |
| Session files                        | Local files per session, read directly by UI   |
| Gateway process                      | Runtime state, exposed via local HTTP API      |

Inferred from paths seen in the Agents cron list and backend architecture
of the reference project (`xmanrui/OpenClaw-bot-review`).

---

## 3. Information architecture

### 3.1 Current nav hierarchy

```
CONTROL / OpenClaw  [brand header + collapse toggle]

├── CHAT
│   └── Chat
│
├── CONTROL
│   ├── Overview         ← gateway dashboard
│   ├── Channels         ← per-platform channel config
│   ├── Instances        ← live presence beacons
│   ├── Sessions         ← active session list
│   ├── Usage            ← token/cost analytics
│   └── Cron Jobs        ← gateway-wide scheduled tasks
│
├── AGENT
│   ├── Agents           ← per-agent detail (6 sub-tabs)
│   ├── Skills           ← skill registry + ClawHub search
│   ├── Nodes            ← paired devices / exec approvals
│   └── Dreaming         ← memory consolidation viewer
│
├── SETTINGS
│   ├── Config
│   ├── Communications
│   ├── Appearance
│   ├── Automation
│   ├── Infrastructure
│   ├── AI & Agents       ← providers/models (naming collision with AGENT)
│   ├── Debug
│   └── Logs
│
└── [bottom]
    ├── Docs
    └── VERSION v2026.4.5  [green = healthy]
```

### 3.2 Page types

Every non-Chat screen follows one of five layouts:

| Type                       | Examples                    | Shape                                                                                    |
| -------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| **Dashboard**              | Overview, Usage             | KPI cards → grouped panels → detail feed                                                 |
| **Entity list + detail**   | Sessions, Instances, Skills | Filter bar → table or card list → (inline or side-panel detail)                          |
| **Entity detail w/ tabs**  | Agents, Channels            | Entity selector → overview/sub-tabs (6 for Agents, 1 per-channel side-by-side)           |
| **Configuration form**     | Nodes, Channel fields       | Grouped field sections with mode selectors, allowlists, policies                         |
| **Process viewer**         | Dreaming                    | Animated "scene" + structured diary + live metric counters                                |

### 3.3 Global chrome (persistent across all pages)

- **Top bar:** breadcrumb (`OpenClaw › PageName`), search (`⌘K`), theme toggle (system/light/dark)
- **Update banner:** red strip announcing available version, reappears per-route after dismiss
- **Left nav:** 4-group sidebar with section collapse carets
- **Bottom nav:** Docs link + version badge with health dot
- **Per-page:** title in red accent, italic subtitle, primary action cluster top-right

### 3.4 Primary tasks by page

| Page        | Primary tasks                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Overview    | "Is anything on fire?" — glance at cost/session/skill/cron counts, see failed jobs, scan recent sessions             |
| Channels    | Link/unlink a platform account, configure allow-lists, set streaming/chunking policies                               |
| Instances   | Verify which machines are beaconing the gateway right now                                                            |
| Sessions    | Find a session, override thinking/fast flags, audit token usage                                                      |
| Usage       | Decompose cost/tokens by agent/channel/provider/model/tool; find anomalies; export                                   |
| Cron Jobs   | (top-level) see all 25 gateway jobs; filter by status; run now                                                       |
| Agents      | Pick an agent → inspect/edit workspace files, tools, skills, channel bindings, crons                                 |
| Skills      | Enable/disable built-in skills; install from ClawHub; see needs-setup list                                           |
| Nodes       | Edit exec approvals per scope (defaults or per-agent); set security/ask modes; pin default binding                   |
| Dreaming    | Watch the memory consolidation loop; read the diary tab                                                              |
| Config      | (not observed) edit root config options                                                                              |
| Communications | (not observed) outbound notification routing?                                                                     |
| Appearance  | (not observed) theme, i18n                                                                                           |
| Automation  | (not observed) likely automation rules/triggers                                                                      |
| Infrastructure | (not observed) likely network/ports/services                                                                      |
| AI & Agents | (not observed) likely provider/model config                                                                          |
| Debug       | (not observed) likely diagnostic tools                                                                               |
| Logs        | (not observed) full log stream viewer                                                                                |

---

## 4. Functional surface — screen by screen

### 4.1 Chat

Not observed in screenshots. Nav placement as its own top-level group
(with one child) suggests it's the primary end-user entry point,
separate from operator concerns.

### 4.2 Overview

**Purpose:** single-screen daily health check.

**Components:**
- 4 KPI cards: `COST · SESSIONS · SKILLS (X/Y) · CRON (N jobs / M failed)`
- `RECENT SESSIONS` — 5 items with agent name, model, relative time
- `Attention` panel — two callouts:
  - Skills with missing dependencies (comma-list + "+N more")
  - Failed cron jobs (named list)
- Split log panels: `Event Log` (structured-ish) + `Gateway Logs` (raw JSON)

**Functionality:**
- KPI cards: display only; no click-through observed
- Recent sessions: probably click to open a session (not confirmed)
- Attention: informational; no inline resolve action
- Log panels: collapsible headers with counts (`Event Log 31`, `Gateway Logs 61`)

### 4.3 Channels

**Purpose:** configure messaging-platform bots.

**Layout:** two columns side-by-side (WhatsApp, Telegram), extensible to
more platforms.

**Per-channel status block:**
`Configured · Linked · Running · Connected · Last connect · Last message · Auth age · Mode · Last start · Last probe`

**Per-channel configuration sections:**
- Accounts (dropdown/add)
- Ack Reaction (dropdown)
- Actions (dropdown)
- Allow From (list with + Add)
- Block Streaming (toggle)
- Block Streaming Coalesce (dropdown)
- Capabilities (list with + Add)
- Chunk Mode (dropdown)
- Channel-specific: `Telegram API Root URL`, `Telegram Auto Topic Label` (JSON), etc.
- Tag chips: `network`, `channels` (purpose unclear — possibly scopes)

### 4.4 Instances

**Purpose:** live presence / heartbeat view of connected clients.

**Components:**
- Toggle: hide/show (probably offline) + Refresh
- Cards per instance:
  - Title = hostname
  - Subtitle = IP + role + version
  - Chip row: role, OS, device class, version
  - Right column: `just now / 1m ago`, `Last input …`, `Reason self/connect/disconnect/periodic`

**Observed instances in the example:**
| Name                        | Role     | Reason     |
| --------------------------- | -------- | ---------- |
| `Mikalais-Mac-Studio.local` | gateway  | self       |
| `openclaw-control-ui`       | webchat  | connect    |
| `gateway-client`            | backend  | disconnect |
| `Mikalai's Mac Studio`      | local    | periodic   |

### 4.5 Sessions

**Purpose:** list active sessions, edit per-session model flags.

**Controls:**
- `Store: (multiple)` context label
- Filters: `Active min` (unclear), `Limit` (default 120), `Global` (checkbox, on),
  `Unknown` (checkbox, off), free-text filter on key/label/kind
- Refresh button

**Table columns:**
`☐ | KEY ↕ | LABEL | KIND ↕ | UPDATED ↕ | TOKENS ↕ | THINKING | FAST`

**Per-row:**
- Key: `agent:<slug>:<channel>:<kind>:<id>` — always shown as a clickable red link
- Label: optional human label (`Cron: 🔥 Burn Rate / Loop Detector`, `heartbeat`, etc.)
- Kind: `direct` / `group`
- Updated: relative time
- Tokens: `used / limit` (e.g. `33871 / 1000000`)
- Thinking: dropdown `inherit / low / medium / high`
- Fast: dropdown `inherit / on / off`

### 4.6 Usage

**Purpose:** token/cost decomposition with filtering.

**Filter bar:**
- Presets: `Today / 7d / 30d`
- Explicit date range + timezone (`Local`)
- Unit toggle: `Tokens / Cost`
- Refresh (primary)
- Summary pills (right): `22.1M Tokens · $14.74 Cost · 323 sessions`
- `Pin` and `Export ▾` actions
- Query box (DSL, server-side): `key:agent:main:cron* model:gpt-4o has:errors minTokens:2000`
- Client-side filter box
- Dimension filter chips: `Agent · Channel · Provider · Model · Tool` (each shows `All`)

**Metric cards (9 visible, probably more below):**
`MESSAGES · THROUGHPUT · TOOL CALLS · AVG TOKENS/MSG · CACHE HIT RATE · ERROR RATE · AVG COST/MSG · SESSIONS · ERRORS`

Each card has a `?` tooltip icon. Some have semantic color (green on 100% cache
hit, amber on error rate). Footer text provides context (`20.5M cached · 20.5M prompt`).

Tip below filters: `use filters or click bars to refine days` — implies a
time-series chart below the cards (off-screen in the captured view).

### 4.7 Cron Jobs (top-level)

Not captured directly, but inferred: 25 jobs across all agents (9 failed),
shown as a flat list. Per-agent view has 4 jobs.

### 4.8 Agents (detail, 6 tabs)

**Agent selector** + `Copy ID · Default · Refresh` actions.

**Tabs:**
| Tab        | Purpose                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| Overview   | (not captured) likely high-level agent card                             |
| Files      | `AGENTS · SOUL · TOOLS · IDENTITY · USER · HEARTBEAT · MEMORY` — editable core files. Missing files show a `MISSING` badge (no inline create action). |
| Tools      | Grid of built-in tools with `Profile: messaging · Source: global default · 24/48 enabled`. Each tool card has name + description + `BUILT-IN` chip. Buttons: `Enable All · Disable All · Reload Config · Save`. |
| Skills     | Per-agent allowlist. Banner explains: "All skills are enabled. Disabling any skill will create a per-agent allowlist." Search + collapsed `BUILT-IN SKILLS 51`. Buttons: `Enable All · Disable All · Reset · Reload Config · Refresh · Save`. |
| Channels   | `Agent Context` card (duplicated from other tabs) + gateway-wide channel status snapshot (per-platform: configured, connected counts, `groupPolicy`, `dmPolicy`). |
| Cron Jobs  | Agent context card + scheduler status card (`enabled, jobs, next wake`) + list of per-agent jobs with `cron expression · tz · enabled · isolated`, job description, and `Run Now` button. |

**Observed agents:** Artist, builder, Dating Coach, Design Business, Dr. O'Body,
Film Maker, Financeer, gardener, Home, Inbox, jobsearcher, Knowledger, lifeos,
main, Meal Tracker, MyAI, selfhelp, Speaker (+ node-binding target list).

### 4.9 Skills

**Purpose:** manage skills registry; install from ClawHub.

**Components:**
- Status tabs: `All 51 · Ready 22 · Needs Setup 29 · Disabled 0`
- Filter input
- `ClawHub — Search and install skills from the registry` field
- Collapsible sections: `BUILT-IN SKILLS 51`, (extension), (custom)
- Per-skill row: status dot (green=ready, amber=needs setup), emoji icon, name, description, enable/disable toggle

### 4.10 Nodes

**Purpose:** pair devices, configure exec approvals.

**Sections:**
- `Exec approvals` — target selector (Gateway / per-node), scope selector (Defaults or per-agent chip row), fields: `Security Mode · Ask Mode · Ask fallback · Auto-allow skill CLIs` toggle
- `Exec node binding` — `Default binding` (Node dropdown), then per-agent override rows (agent → Use default / specific node)

### 4.11 Dreaming

**Purpose:** visualize the memory consolidation process.

**Sub-tabs:** `SCENE · DIARY`

**Scene view:**
- Ambient animated scene with sun, particles, mascot sleeping
- Live status chip: `DREAMING ON`
- Speech-bubble-style status: *"promoting promising hunches…"*
- `DREAMING ACTIVE` heading + `0 promoted` subhead
- Three counter tiles: `SHORT-TERM · SIGNALS · PHASE HITS`

This is the most stylized surface in the app — intentionally a
"process I watch" rather than "controls I change."

### 4.12 Settings (mostly not captured)

Inferred purposes:
- **Config** — root config knobs
- **Communications** — outbound notification routing (Feishu, email, Slack?)
- **Appearance** — theme, i18n
- **Automation** — rules / triggers
- **Infrastructure** — network, ports, local services
- **AI & Agents** — provider/model registry + keys
- **Debug** — diagnostic toggles
- **Logs** — full stream viewer

---

## 5. Cross-cutting patterns

### 5.1 Data freshness

- Every significant card has its own `Refresh` button
- Some pages mention auto-polling (Overview stat and Gateway Health poll every ~10s)
- "Last refresh: just now" labels appear on some cards

### 5.2 Filters

- `Today / 7d / 30d` chip presets + explicit date range (Usage)
- Scope chips with `All` state (`Agent All`, `Channel All`, …)
- Free-text filter on most lists
- DSL filter on Usage (`key:… model:… has:errors minTokens:…`) — no visible help link

### 5.3 Empty / missing states

Weak across the system:
- `Select a file to edit` (Files tab)
- Collapsed `BUILT-IN SKILLS 51` with no expansion hint
- `(optional)` label placeholders in Sessions
- Unconfigured channels show a wall of `No` / `n/a`
- `MISSING` file badges with no create action

### 5.4 Identifiers

Session keys, run IDs, and workspace paths are shown raw throughout.
No consistent truncation pattern — some wrap, some scroll, some clip.

### 5.5 Action density

Right-side action clusters per panel, often 2–6 buttons
(`Enable All · Disable All · Reset · Reload Config · Refresh · Save`).
No consolidation into menus for related bulk actions.

### 5.6 Semantic color

- Red accent = brand + active state
- Green = healthy (100% cache, version dot)
- Amber = warning (error rate, needs-setup skills)
- Grey = inert / n/a
- Blue = banner/info (skills allowlist explanation)

Mostly consistent, but the brand red also flags active nav items and
error states, which can blur "this is selected" vs. "this is wrong."

---

## 6. Technical architecture (inferred)

Based on the reference implementation at `xmanrui/OpenClaw-bot-review` and
observable behavior.

### 6.1 Stack

- **Framework:** Next.js App Router, React, TypeScript, Tailwind CSS
- **Runtime:** Node.js (local `next start` on port 3000)
- **No database:** state derived from config file + session files + live CLI
- **Deployment target:** localhost; the UI is itself a presence beacon on the gateway

### 6.2 Data flow

```
┌──────────────┐   reads   ┌──────────────────────┐
│  Control UI  │──────────▶│ ~/.openclaw/*.json   │
│   (this app) │           │ ~/.openclaw/workspace│
└──────┬───────┘           └──────────────────────┘
       │ HTTP / fetch
       ▼
┌──────────────┐   exec   ┌──────────────────────┐
│  API routes  │─────────▶│  openclaw CLI        │
│  /api/*      │          │  (shell, JSON out)   │
└──────┬───────┘          └──────────────────────┘
       │
       ▼
┌──────────────┐   WS/beacon   ┌──────────────────┐
│  Gateway     │──────────────▶│  Nodes/Clients   │
│  process     │               │  (Telegram, etc.)│
└──────────────┘               └──────────────────┘
```

### 6.3 Route map (inferred from reference repo)

Each nav page maps to one or more `/api/*` handlers, plus one `page.tsx`.

Representative examples:

| UI page    | Likely API endpoints                                                               |
| ---------- | ---------------------------------------------------------------------------------- |
| Overview   | `/api/agent-status`, `/api/agent-activity`, `/api/gateway-health`, `/api/alerts`   |
| Channels   | `/api/config`, `/api/test-platforms`                                               |
| Instances  | `/api/agent-status` (beacon subset)                                                |
| Sessions   | `/api/sessions`, `/api/test-sessions`, `/api/test-session`                         |
| Usage      | `/api/stats`, `/api/stats-all`, `/api/stats-models`, `/api/activity-heatmap`       |
| Skills     | `/api/skills`                                                                      |
| Nodes      | `/api/config`                                                                      |
| Dreaming   | `/api/pixel-office` (shared animation engine)                                      |

### 6.4 Security surface

- CLI wrapper shells out to `openclaw` binary — on Unix via `execFile`
  (injection-safe), on Windows via `exec` + `cmd.exe` with manual quoting
  (more fragile)
- No visible auth — binds to `127.0.0.1` and assumes local trust
- Config file read directly; any user on the box can see secrets if
  present

---

## 7. Observed friction points

Severity-tagged observations from reviewing every captured screen.
These are **descriptive**, not prescriptive; fixes are in §8.

### 7.1 Navigation

- `CONTROL` vs `SETTINGS` semantically overlap
- `SETTINGS › AI & Agents` collides with the entire `AGENT` section
- `Instances` vs `Nodes` are both "machines" with no naming cue for the
  difference
- `Channels` vs `Communications` both suggest messaging
- `Debug`, `Logs`, `Infrastructure` sit in `SETTINGS` but aren't settings
- `Cron Jobs` label appears twice with different scopes (gateway vs. per-agent)
- `CHAT` group has exactly one child

### 7.2 Page-level

- **Update banner** persists per-route after dismiss; eats ~60px on every screen
- **Agent Context card** duplicates across multiple tabs of the Agents detail
- **Tab counts are inconsistent** (`Files 7 · Skills 51 · Channels 1` but no
  count on Tools, Cron Jobs, Overview)
- **Raw JSON log blobs** occupy ~35% of Overview and teach nothing
- **Dead page when un-customized:** Skills tab shows just a banner + collapsed
  section when nothing is disabled
- **No bulk-action bar** despite checkboxes on Sessions table

### 7.3 Semantic ambiguity

- `Reason self / connect / disconnect / periodic` on Instances — jargon
- `Last input n/a` on Instances — "input" of what?
- `Active min` filter on Sessions — minimum what?
- Two search boxes on Usage (`Filter sessions …` and `Filter (client-side)`)
- `Profile: messaging · Source: global default` on Tools — composition rules unclear
- `network · channels` tag chips under some Channels fields — tags? scopes?
- Same machine appears twice on Instances (`Mikalais-Mac-Studio.local`
  vs `Mikalai's Mac Studio`) with no indication they're the same host

### 7.4 Table / list density

- Session key column (`agent:<slug>:<channel>:<kind>:<uuid>`) wraps 2 lines
- `inherit` dropdowns on 120 rows × 2 = 240 always-visible controls
- `Tokens X / 1,000,000` denominator repeats on every row
- `direct` tag shown on every row when nearly all sessions are direct

### 7.5 Empty states

Consistently under-designed:
- `Select a file to edit` (Files) — no default selection
- Unconfigured channels expose entire internal status list
- `MISSING` files have no create CTA
- Skills tab collapsed by default when empty

---

## 8. Recommended IA (distilled from review)

A reorganization that fixes every naming collision and drops the two-group-of-one
waste, while keeping the domain language operators already know.

```
Chat                              ← promoted (no wrapper group)
Overview                          ← promoted (no wrapper group)

AGENT
├── Agents
├── Skills
├── Models           ← renamed from SETTINGS › "AI & Agents"
└── Dreaming

RUNTIME             ← renamed from CONTROL
├── Channels
├── Instances        (or Deployments)
├── Sessions
├── Scheduler        ← renamed from top-level Cron Jobs
└── Usage

SYSTEM              ← new group, pulls from scattered items
├── Nodes
├── Infrastructure
└── Communications

OBSERVABILITY       ← new group
├── Logs
└── Debug

SETTINGS
├── Config
├── Appearance
└── Automation

[bottom]  Docs · v2026.4.5
```

Key moves:

1. `CONTROL` → `RUNTIME` (live/operational, vs. persisted config)
2. `AI & Agents` → `Models`, moved into `AGENT`
3. `Nodes` + `Infrastructure` + `Communications` → new `SYSTEM` group
4. `Debug` + `Logs` → new `OBSERVABILITY` group
5. `Chat` and `Overview` promoted to top-level (no group-of-one)
6. `Cron Jobs` (top-level) → `Scheduler`; kept as `Cron Jobs` tab inside Agents

Non-nav fixes (priority order):

1. Kill raw JSON log panels on Overview; replace with filtered event feed
2. Promote the Attention panel above Recent Sessions when non-empty
3. Inline-edit pattern for per-row overrides (Sessions): render as text,
   dropdown on click
4. Empty states with CTAs (unconfigured channels, missing files, skills)
5. Consolidate 4-6 button rows into grouped menus + primary action
6. Truncate long identifiers (session keys, UUIDs) with copy-on-click
7. One page-level refresh instead of N per-card refreshes
8. Agent Context card at page level, not per-tab
9. Update banner → 20px strip (or toast), dismissable globally
10. Inline help on every configuration field, not a subset

---

## 9. Open questions

Things the screenshots did not resolve:

1. **Instances vs Nodes** — is the relationship 1:1, 1:many, or independent
   beacons vs. pairing state?
2. **"AI & Agents" in Settings** — does it only store API keys, or also model
   aliases and provider-level config?
3. **Communications scope** — outbound notifications only, or shared with
   Channels?
4. **Automation** — rule engine, cron builder, or macro system?
5. **Session "Active min" filter** — what does it filter by?
6. **`Reason` labels on Instances** — what event triggers each?
7. **DSL grammar on Usage search** — documented anywhere?
8. **Chat surface** — is it the primary product, or a test console?
9. **Per-agent Core Files** — which are required vs. optional? What makes one
   `MISSING`?
10. **Dreaming phases** — what are the phase transitions and what does "phase
    hits" count?

---

## 10. Document metadata

- **Based on:** screenshots of OpenClaw Control v2026.4.5
- **Reference project:** [xmanrui/OpenClaw-bot-review](https://github.com/xmanrui/OpenClaw-bot-review)
  (architecturally similar lightweight dashboard that reads the same
  `~/.openclaw/*` state)
- **Written:** 2026-04-17
- **Scope:** IA + functional surface of the web console only; does not cover
  the OpenClaw gateway internals, agent runtime, skill/tool execution model,
  or node protocol
