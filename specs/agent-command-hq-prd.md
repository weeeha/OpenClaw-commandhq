# Agent Command HQ — Product Requirements Document

**Status:** Draft v2 (+ OpenClaw operator surface merge)
**Author:** Product
**Last updated:** 2026-04-20
**Reference app:** https://agent-command-hq.vercel.app
**Companion docs:** `system-design/agent-command-hq.md`, `system-design/README.md` (OpenClaw Control IA)

---

## Changelog

- **v2 (2026-04-20)** — merged OpenClaw Control operator surface. Added Runtime group (Sessions, Usage, Channels, Scheduler, Logs, Instances) and System group (Nodes, Models) as new P0/P1 requirements (R11–R18). Extended R1 with operator sub-tabs, R4 with the Usage DSL + metric cards, R5 with a Skill Tree / Skill Registry mode toggle, R8 with the updated IA. New "IA Diff" section documents every OpenClaw page and its disposition. P1 list trimmed — "Mission templates" is now Scheduler (R15), "Slack/Discord relay" is now Channels (R14).
- **v1 (2026-04-19)** — initial PRD from review of the agent-command-hq.vercel.app concept.

---

## Problem Statement

Engineering leaders now run fleets of AI coding agents (Claude Code, Cursor, Copilot Workspace, in-house agents) that operate in parallel on code reviews, deployments, migrations, and documentation. These agents run in disparate terminals, CI logs, and Slack threads, so leaders cannot see at a glance which agents are idle vs. executing, whether a run is stuck or burning tokens, or which tasks are near completion. The cost of not solving this is threefold: wasted token spend on runaway jobs, missed intervention windows when agents go off-track, and low team trust in agent-led work because progress is invisible until a PR lands (or fails).

Compounding the visibility gap: teams that already run an operator console (OpenClaw Control, internal dashboards) end up with **two tools** — a per-machine operator UI for sessions/channels/usage/cron, and a separate fleet dashboard for supervision. Neither answers the full question alone.

Agent Command HQ is a unified mission-control surface — styled as an RPG cockpit — that turns fragmented agent activity into a single legible view of squad state, active operations, budget, and outcomes, **and absorbs the operator surface** so leads do not have to leave the app to configure channels, inspect sessions, drill into cost, or manage scheduled jobs.

---

## Goals

1. **Visibility in one glance.** A lead can see every agent's state (ready / deployed / cooling / critical) and every active operation's progress without opening another tool. Target: 90% of daily users open the Cockpit view at least once per working day within 30 days of launch.
2. **Catch runaway work before it burns budget.** Surface the top 3 risk signals (stalled progress, rising token burn, repeated retries) within 60 seconds of them occurring. Target: reduce over-budget agent runs by 40% in the first quarter.
3. **Drive intervention, not just observation.** From any view, a user can pause, redirect, or reassign an agent in under 2 clicks. Target: 25% of flagged operations receive a human action within 10 minutes.
4. **Make agent work feel rewarding, not anxious.** The RPG layer (levels, perks, streaks, squad success rate) reframes agent supervision as team-building, increasing repeat usage. Target: 60% week-4 retention for active users.
5. **Budget accountability.** Every user knows their team's token spend relative to budget and billing period at all times. Target: zero "surprise" overages reported in user research after 90 days.
6. **One tool, not two.** Absorb the operator surface (sessions, usage, channels, scheduler, nodes, models, logs, instances) so engineering leads and operators work in the same app. Target: 80% of operators retire the legacy console within 60 days of feature parity.

---

## Non-Goals

1. **We will not build the agents themselves.** Agent Command HQ is an observation and control plane; it integrates with existing agent runtimes (Claude Code SDK, OpenAI Agent SDK, custom webhooks) rather than executing models directly. Rationale: the agent layer is commoditizing fast and we want to stay neutral.
2. **We will not replace the IDE or PR review tool.** Users complete code review in GitHub/GitLab; Agent HQ links out. Rationale: rebuilding a diff viewer is years of work and adds no differentiation.
3. **No per-line code attribution or PR authoring in v1.** Rationale: requires deep VCS integration; defer to v2.
4. **No multi-tenant marketplace for agent skills / perks in v1.** Rationale: the perk system ships with a curated built-in set; skill installation goes through the Skill Registry (R5) with a first-party allowlist; opening it to third parties is a future platform play.
5. **No mobile-native apps at launch.** Web-responsive only. Rationale: the primary intervention workflow (redirecting an agent, reviewing code) is desktop-bound.
6. **No Dreaming / memory-consolidation screen port.** OpenClaw's Dreaming page is flavor-specific; the equivalent in Agent HQ is the RPG progression feed.
7. **No wholesale port of OpenClaw's Settings section.** `Config`, `Appearance`, `Infrastructure`, `Communications`, `Debug`, `Automation` are covered either by the Tweaks panel, by enterprise settings out of v1 scope, or explicitly deferred.

---

## Personas & User Stories

### P1: Engineering Lead / Eng Manager ("Commander")
Owns team outcomes, watches budget, intervenes when things go sideways.

- As an eng lead, I want to see every agent on my team and its current state in one view so that I know who is busy and who is free.
- As an eng lead, I want a live activity feed of agent actions so that I can spot patterns (repeated retries, alert spikes) without reading individual logs.
- As an eng lead, I want to see token-budget burn against the billing period so that I can throttle before we blow the month.
- As an eng lead, I want to pause or reassign an agent in one action so that I can stop runaway work immediately.
- As an eng lead, I want weekly squad success metrics (success rate, missions completed, incidents) so that I can report up and spot trend changes.
- **(new)** As an eng lead, I want an Attention panel on Home that surfaces failed scheduled jobs and skills with missing dependencies so that I triage blockers first thing each morning.

### P2: Individual Engineer ("Operator")
Launches and supervises their own agents; lives in the Cockpit, Sessions, and Chat views.

- As an engineer, I want to launch an agent on a mission (task) and see its progress live so that I can work on other things without losing track.
- As an engineer, I want to chat with a specific agent mid-mission so that I can nudge, correct, or ask questions without killing the run.
- As an engineer, I want my agents to level up and earn perks tied to real outcomes (merged PRs, clean reviews, green deploys) so that repeat work gets faster.
- As an engineer, I want a clear signal when an agent needs me (blocked, failed, exceeded budget) so that I do not have to poll.
- **(new)** As an operator, I want a Sessions table showing every live session's key, label, tokens used/limit, and per-session thinking/fast overrides so that I can audit and tune an agent's active work without restarting it.
- **(new)** As an operator, I want a Usage page with date-range presets, a DSL filter (`key:agent:main:cron* model:gpt-4o has:errors minTokens:2000`), dimension chips (Agent / Channel / Provider / Model / Tool), and nine core metrics (messages, throughput, tool calls, avg tokens/msg, cache hit rate, error rate, avg cost/msg, sessions, errors) so that I can decompose cost and find anomalies in under 60 seconds.
- **(new)** As an operator, I want to configure platform channels (Telegram / WhatsApp / Slack / Discord) with per-platform status (configured, linked, running, connected, last connect/message, auth age) and allow-lists so that my agents can reach external users safely.
- **(new)** As an operator, I want a Scheduler page with every recurring mission (cron expression, timezone, isolated flag, target agent, last/next run, status) and a Run Now button so that I manage scheduled work from one place.
- **(new)** As an operator, I want a Logs page with a structured stream (filterable by agent, level, category) so that I can diagnose a failing run without switching to the terminal.

### P3: Finance / Ops Stakeholder ("Quartermaster")
Does not manage agents day-to-day, cares about spend and ROI.

- As a finance partner, I want a read-only view of team-level token spend, mission volume, and success rate so that I can evaluate ROI per team.
- As an ops partner, I want exportable billing-period summaries so that I can reconcile against provider invoices.
- **(new)** As a finance partner, I want the Usage page's Export action to produce a CSV that matches the provider invoice dimensions (provider, model, period) so that I can reconcile without a spreadsheet transform.

### P4: Platform Admin ("Quartermaster-in-Chief") — **(new)**
Configures providers, node permissions, and RBAC. Often overlaps with the Commander role at small orgs.

- As a platform admin, I want a Models page to register providers, store API keys, and set per-model pricing overrides so that cost reconciliation is correct.
- As a platform admin, I want a Nodes page to configure exec approvals (security mode, ask mode, auto-allow skill CLIs) per default or per-agent so that agents cannot run arbitrary commands without policy.
- As a platform admin, I want an Instances page showing live beacons (hostname, role, version, last-seen, reason) so that I verify which machines are currently connected.

### Edge cases (all personas)
- As a user, when an agent enters a **critical** state, I want an obvious visual alert and a link straight to the failing step.
- As a user, when the activity feed is empty (new team, quiet day), I want guidance on what to launch next, not a blank page.
- As a user, when I am offline or rate-limited, I want stale-data indicators so I do not act on outdated state.
- **(new)** As a user, when the RPG layer is disabled at the team level, I want Agents / Skills / Missions to render in their operator form (sub-tabs, registry, queue) and hide Base entirely.

---

## Requirements

### Must-Have (P0) — ships in v1

**R1. Squad Roster + Agent Detail**
- Displays all registered agents with portrait, name, level, and state (Ready, Deployed, Cooling, Critical).
- Click an agent → agent detail view with **sub-tabs**: `Profile · Files · Tools · Skills · Channels · Schedule`.
  - `Profile` (RPG default) — level, XP, perks, lifetime stats.
  - `Files` — core workspace files (AGENTS / SOUL / TOOLS / IDENTITY / USER / HEARTBEAT / MEMORY). Missing files show `MISSING` badge **with inline create CTA** (OpenClaw gap fix).
  - `Tools` — built-in + custom tool grid, profile selector, Enable All / Disable All, per-tool override.
  - `Skills` — per-agent allowlist; explains "disabling any skill creates a per-agent allowlist."
  - `Channels` — per-agent channel bindings snapshot (read-only, links to R14).
  - `Schedule` — per-agent cron jobs with Run Now (links to R15).
- Real-time state updates (<5s lag from underlying agent event).
- Acceptance:
  - [ ] Given 8 registered agents, when I open the roster, then I see all 8 with correct states.
  - [ ] When an agent's state changes in the backend, the roster tile updates within 5 seconds without a page reload.
  - [ ] Critical-state agents are visually distinct (color + icon) and sort to the top.
  - [ ] Agent detail renders all 6 sub-tabs; default is `Profile` when RPG is on, `Files` when RPG is off.
  - [ ] `MISSING` file badge exposes a "Create from template" action (addresses known OpenClaw gap).

**R2. Activity Feed + Attention panel**
- Reverse-chronological stream of agent events: mission started / completed, code review posted, deployment triggered, alert raised, budget threshold crossed, scheduled-job failure.
- Each event has timestamp, agent attribution, event type icon, and — where applicable — a deep link (PR URL, deploy ID, log line, session key, cron job id).
- Filter by agent, event type, and time range.
- **Attention panel** — above the feed when non-empty; two callouts: failed scheduled jobs (named list) and skills with missing dependencies (comma-list + "+N more"). Each item links to its target page.
- Acceptance:
  - [ ] New events appear at the top within 5s of occurrence.
  - [ ] Clicking a deploy event opens the deploy in a new tab.
  - [ ] Clicking a scheduled-job event deep-links to Scheduler filtered to that job.
  - [ ] Empty Activity state renders a "Launch your first mission" CTA.
  - [ ] Attention panel hides when both callouts are empty (no "zero items" row).

**R3. Active Operations (Missions) view**
- Shows every in-flight mission with: title, assigned agent(s), % progress, elapsed time, token spend, ETA (if computable), status bar.
- Per-mission actions: Pause, Resume, Reassign, Abort.
- **Drill-down:** clicking a mission opens the underlying Session (R12) in a side panel.
- Acceptance:
  - [ ] A mission at 67% shows a progress bar filled to 67% and a numeric label.
  - [ ] Clicking Pause transitions the agent to Cooling and halts execution within 10s.
  - [ ] Abort requires a confirmation modal.
  - [ ] Opening a mission side panel loads the Session detail within 500ms p95.

**R4. Usage & Budget (merges former Budget Monitor + OpenClaw Usage)**
- **Header widget (global):** shows % of monthly budget used and days remaining in billing period.
- **Usage page** — standalone drill-down. Filter bar:
  - Presets: `Today / 7d / 30d`.
  - Explicit date range + timezone.
  - Unit toggle: Tokens / Cost.
  - Right-aligned summary pills: total tokens, total cost, total sessions.
  - Actions: Pin, Export (CSV matching provider invoice dimensions).
- **DSL query box** (server-side): `key:agent:main:cron* model:gpt-4o has:errors minTokens:2000`. Inline help opens a grammar reference. Unknown tokens return a structured error, not a silent no-results.
- **Dimension chips**: Agent · Channel · Provider · Model · Tool; each shows `All` by default.
- **Metric cards** (minimum 9): `Messages · Throughput · Tool Calls · Avg Tokens/Msg · Cache Hit Rate · Error Rate · Avg Cost/Msg · Sessions · Errors`. Each card has a `?` tooltip. Semantic color (green on 100% cache, amber on error rate).
- **Time-series chart** below the cards: click a bar to refine days.
- **Configurable thresholds** (per team): warn %, freeze-non-critical %. Crossing a threshold emits an activity-feed event.
- Acceptance:
  - [ ] Header widget shows "73% — 8 days remain" format and matches Usage drill-down total within 1%.
  - [ ] DSL query with invalid operator returns `{error: "unknown key: foobar"; hint: "try 'model:' or 'key:'"}` in under 200ms.
  - [ ] Export CSV opens in Excel/Sheets without a column mismatch.
  - [ ] Cache hit rate metric reads from the model-provider billing export reconciled view, not from realtime events.

**R5. Agent Detail & Progression (RPG layer) + Skill Registry**
- Each agent has a level, XP, active perks, achievement list.
- XP rubric is versioned, idempotent per source event, and requires verifiable outcome signals (merged PR SHA, green deploy ID) — no speculative credit.
- **Skill Tree view (RPG default)** — node-graph progression: unlocked, locked, hub nodes; clicking a node shows unlock conditions and perk description.
- **Skill Registry view (Operator mode)** — tabular: status tabs `All · Ready · Needs Setup · Disabled`, filter, per-skill row (status dot, emoji, name, description, enable/disable toggle). ClawHub-style search field for installing from the first-party skill index.
- **Mode toggle** — per user preference (cached locally), respecting team-level RPG opt-out (see R9).
- Acceptance:
  - [ ] Completing a mission awards XP per the documented rubric (no award on unverified outcomes).
  - [ ] Levels visibly advance in the roster when thresholds are crossed.
  - [ ] Locked perks show unlock conditions.
  - [ ] Mode toggle persists per user and respects team-level RPG-disabled flag (shows only Registry).

**R6. Chat with Agent** — unchanged from v1.

**R7. Squad Success Metrics** — unchanged from v1.

**R8. Navigation & Information Architecture (updated)**
- Primary top nav (always visible): `Home · Fleet · Tasks · Chat · Missions`.
- Left sidebar (collapsible) with grouped sections:
  ```
  RUNTIME        Sessions · Usage · Channels · Scheduler · Logs · Instances
  SYSTEM         Nodes · Models
  RPG            Agents · Skills · Base        (hidden if team-level RPG off)
  ```
- Bottom sidebar: Docs · Version badge with health dot (per OpenClaw pattern).
- Acceptance:
  - [ ] Every nav item is reachable in ≤1 click from any screen.
  - [ ] Active section is visually indicated.
  - [ ] Team admins can toggle RPG group visibility; the toggle hides Agents, Skills, Base for that team and defaults all surfaces to operator mode.

**R9. Auth & team membership (updated)**
- SSO login (Google, GitHub, SAML for enterprise).
- RBAC: `Admin · Operator · Viewer`.
- **Team-level RPG toggle** — Admin-controlled. Default: on. When off, hides the RPG nav group and defaults tabbed views to operator mode.
- Acceptance (all previous +):
  - [ ] Viewer role cannot issue Pause / Abort / Reassign, cannot edit Models / Nodes / Scheduler / Channels.
  - [ ] RPG toggle propagates to all logged-in users within 60s.

**R10. Agent Registration / Integrations** — unchanged from v1.

**R11. Usage deep-drill API & DSL** *(promoted from OpenClaw Usage)*
- Server-side DSL grammar documented; tokens supported at v1:
  - `key:<glob>` — session key glob match.
  - `agent:<slug>`, `channel:<platform>`, `provider:<name>`, `model:<name>`, `tool:<name>` — dimension filters.
  - `has:errors`, `has:tools`, `has:cache` — boolean predicates.
  - `minTokens:<n>`, `maxTokens:<n>`, `minCost:<n>`, `maxCost:<n>` — numeric ranges.
  - `after:<date>`, `before:<date>` — ISO or relative.
- **Pin** saves a query as a named filter surfaced on the page header.
- Acceptance:
  - [ ] Grammar reference linked from the filter box.
  - [ ] Invalid keys return structured error in <200ms.
  - [ ] Pinned filters persist per user across sessions.

**R12. Sessions** *(new from OpenClaw Sessions)*
- Table listing every active or recent session.
- Columns: `☐ · KEY ↕ · LABEL · KIND ↕ · UPDATED ↕ · TOKENS ↕ · THINKING · FAST`.
- Filters: free-text on key/label/kind, `Limit` (default 120), `Global` toggle, kind chips (direct / group / cron).
- Per-row inline editable: `Thinking` dropdown (`inherit / low / medium / high`), `Fast` dropdown (`inherit / on / off`). Edits persist optimistically with ack reconciliation.
- Session key truncates with copy-on-click (fixes OpenClaw density issue).
- Bulk actions (checkbox column): pause selected, reassign selected, export selected.
- Acceptance:
  - [ ] Per-row dropdown edit persists within 2s and survives reload.
  - [ ] Session key column never wraps to 2 lines at ≥1200px width.
  - [ ] Bulk-action bar appears only when ≥1 row is checked.

**R13. Models Registry** *(new from OpenClaw "AI & Agents")*
- Per-provider configuration: API key (encrypted at rest), base URL override, default model, rate-limit overrides.
- Per-model pricing override (cost per input token / output token / cached token). Defaults shipped per provider.
- Test-connection action per provider.
- Read-only summary: last-N calls, error rate, reconciliation delta vs. provider invoice (%).
- Acceptance:
  - [ ] Adding a provider takes ≤3 minutes from click to first successful `token.usage` event.
  - [ ] API keys are never returned in plaintext from any API; edit re-asks.
  - [ ] Reconciliation delta > 5% triggers an alert on the Usage page header.

### Nice-to-Have (P1) — fast-follow candidates

**R14. Channels** *(new from OpenClaw Channels)*
- Per-platform configuration (Telegram, WhatsApp, Slack, Discord). Two-column layout extensible to N platforms.
- Per-channel status block: `Configured · Linked · Running · Connected · Last connect · Last message · Auth age · Mode · Last start · Last probe`.
- Per-channel configuration: Accounts, Ack Reaction, Actions, Allow From, Block Streaming, Block Streaming Coalesce, Capabilities, Chunk Mode, platform-specific (Telegram API Root URL, Auto Topic Label JSON, etc.).
- **Empty-state fix (OpenClaw gap):** unconfigured channels show a first-run CTA + 3-step setup, not a wall of `No` / `n/a`.
- Acceptance:
  - [ ] Configuring a new Telegram channel end-to-end takes ≤5 minutes with inline help on every field.
  - [ ] Status block recomputes on page load and on any Refresh.

**R15. Scheduler** *(promoted from v1 "Mission templates")*
- Lists every scheduled recurring mission/cron job.
- Columns: target agent, cron expression, timezone, enabled, isolated flag, last run, next wake, status, command/description.
- Per-row actions: Run Now, Pause, Edit, Delete.
- Top-level filters: all / failed / disabled; search by expression or description.
- Acceptance:
  - [ ] Run Now produces a new mission visible in R3 within 5s.
  - [ ] Failed jobs bubble into Activity Feed (R2) and the Attention panel.
  - [ ] Cron expression validator runs client-side; invalid expressions cannot be saved.

**R16. Nodes** *(new from OpenClaw Nodes — permission model for agents)*
- Exec approvals per scope (Gateway / per-node); fields: `Security Mode · Ask Mode · Ask fallback · Auto-allow skill CLIs`.
- Per-agent exec overrides (agent → Use default / specific node).
- Default binding selector.
- Acceptance:
  - [ ] Changing the default security mode updates every non-overridden agent immediately.
  - [ ] Per-agent override is visibly distinct from "Use default" in the list.

**R17. Instances** *(new from OpenClaw Instances)*
- Live-presence card list: hostname, IP, role (`gateway / webchat / backend / local`), OS, version, last beacon, reason.
- Filter: show/hide offline, auto-refresh (default 10s, pausable).
- **Dedup fix (OpenClaw gap):** hosts that appear under multiple names are merged with a "same host" indicator.
- Acceptance:
  - [ ] Offline instances dim at 15s without a beacon; flip to hidden at 60s when "hide offline" is on.
  - [ ] Instance cards never render the same host twice.

**R18. Logs** *(new from OpenClaw Logs)*
- Structured log stream filterable by agent, level (debug / info / warn / error), category (runtime / tool / scheduler / channel / system).
- Time-range filter; tail-follow mode (default on).
- Kill the raw-JSON dump from the old Overview (OpenClaw gap fix): events here are structured with consistent fields.
- Export current view (CSV / JSONL).
- Acceptance:
  - [ ] Tail-follow holds <2s lag behind producers at 500 events/s.
  - [ ] Turning filters on does not reset the scroll position.

### P1 items retired
- ~~Mission templates~~ — superseded by **R15 Scheduler** (scheduler handles templated recurring missions natively).
- ~~Slack / Discord relay~~ — superseded by **R14 Channels** (channels as a first-class object covers inbound and outbound messaging).

### P1 items retained
- **Smart alerts / digest** — daily/weekly email summary of squad performance.
- **Compare view** — side-by-side agent performance (mean time, success rate, cost per mission).
- **Audit log** — immutable record of who-did-what for compliance.

### Future Considerations (P2) — design around, do not build

- **Skill marketplace** — third-party perks / skills installable by agents via the Skill Registry (R5).
- **Cross-team fleet view** — org-wide dashboard for directors.
- **Auto-remediation playbooks** — Automation-style rules on top of Scheduler (R15) and Activity Feed (R2).
- **Native mobile app** for on-call intervention.
- **Cost forecasting** — predicted end-of-month spend given current burn, layered on Usage (R4).
- **Dreaming-equivalent memory consolidation viewer** — only if the memory layer is user-facing.

---

## Success Metrics

### Leading indicators (30-day post-launch)
- **Daily active users / weekly active users** ≥ 0.6.
- **Cockpit view opens per DAU per day** ≥ 3.
- **Time from agent state change → feed render**: p95 < 5 seconds.
- **Intervention rate on flagged missions** ≥ 25%.
- **Agent registration completion rate** ≥ 80%.
- **(new) Usage page depth** — median user applies ≥1 filter per Usage session (measures whether the DSL/chips actually get used).
- **(new) Operator-console migration** — ≥50% of teams that had OpenClaw Control installed have enabled Runtime group pages within 60 days.

### Lagging indicators (90-day post-launch)
- **Week-4 retention** ≥ 60%.
- **Self-reported "surprise" overage incidents**: 0 in user research.
- **Reduction in over-budget mission runs** ≥ 40%.
- **NPS of engineering leads** ≥ +30.
- **(new) Tool consolidation** — ≥80% of operators report retiring a separate operator console.
- **(new) Reconciliation accuracy** — realtime cost within 5% of provider invoice for every team, every month.

### Measurement
- Product analytics: Amplitude/PostHog event stream.
- Cost data: joined against model-provider billing exports (feeds R13 reconciliation).
- Qualitative: monthly interviews with 8 engineering leads + 4 operators.
- Evaluation cadence: weekly during first 30 days, monthly thereafter.

---

## IA Diff — OpenClaw Control → Agent Command HQ

Every OpenClaw page and its disposition. See the companion doc (`system-design/README.md`) for the original OpenClaw IA.

| OpenClaw page | Disposition | Agent HQ target | Notes |
|---|---|---|---|
| **Chat** | Merged | Top-level Chat | Keep Agent HQ's chat UI; adopt OpenClaw's thread model for persistence. |
| **Overview** | Merged | Home | Fold KPI cards + Attention panel into Home (R2). Kill the raw-JSON dump. |
| **Channels** | New page | Runtime › Channels (R14) | Two-column per-platform; fix unconfigured empty state. |
| **Instances** | New page | Runtime › Instances (R17) | Dedup same-host. |
| **Sessions** | New page | Runtime › Sessions (R12) | Inline per-row dropdowns; bulk actions on checkbox column. |
| **Usage** | New page | Runtime › Usage (R4 + R11) | DSL documented; Export CSV aligns to invoices. |
| **Cron Jobs (top-level)** | Renamed | Runtime › Scheduler (R15) | "Mission templates" P1 retired in favor of this. |
| **Agents (6 sub-tabs)** | Merged | RPG › Agents (sub-tabs: Profile · Files · Tools · Skills · Channels · Schedule) | RPG Profile becomes the default tab when RPG is on; Files is default when RPG is off. Fix `MISSING` file CTA. |
| **Skills** | Merged | RPG › Skills (mode toggle: Skill Tree vs. Registry) | Operator Registry view ports OpenClaw Skills; RPG Skill Tree ports the prototype. |
| **Nodes** | New page | System › Nodes (R16) | Permission model for agent-to-machine execution. |
| **Dreaming** | **Dropped** | — | Replaced by RPG progression feed. |
| **Logs** | New page | Runtime › Logs (R18) | Structured, filterable; replaces raw-JSON dump in old Overview. |
| **AI & Agents (Settings)** | Renamed, new page | System › Models (R13) | Providers + keys + pricing overrides. |
| **Config** | **Dropped from v1** | — | Enterprise-only; out of v1 scope. |
| **Communications** | **Dropped from v1** | — | Unclear OpenClaw scope; out of v1. |
| **Appearance** | Absorbed | Tweaks panel | Already covered. |
| **Automation** | **Deferred** | — | P2 "Auto-remediation playbooks." |
| **Infrastructure** | **Dropped from v1** | — | Self-host concern, not a SaaS v1 concern. |
| **Debug** | **Dropped from v1** | — | Subset absorbed into Logs (R18). |

### New pages that did not exist in OpenClaw
- `Fleet` (cockpit dashboard with RPG-styled stat cards).
- `Missions` (mission board / launchable work cards).
- `Tasks` (kanban).
- `Base` (ship rooms — pure RPG, optional).

### OpenClaw patterns adopted globally
- **Per-card `Refresh`** → consolidated into **one page-level refresh** (fixes OpenClaw friction #7.1).
- **Update banner persists per-route** → **dismissable globally, 20px strip** (fixes OpenClaw friction #7.2).
- **Raw identifiers everywhere** → **truncate + copy-on-click** (fixes OpenClaw friction #7.4).
- **4–6 button rows** → **grouped menus + one primary action** (fixes OpenClaw friction #5.5).
- **Weak empty states** → **every empty state ships with a CTA or a 3-step setup** (fixes OpenClaw friction #7.5).
- **Brand red = active AND error** → **RPG accent = active, red reserved for error** (fixes OpenClaw friction #5.6).

---

## Open Questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| 1 | Which agent runtimes do we support at GA vs. beta? (Claude Code, OpenAI Agents SDK, custom) | Engineering | Yes |
| 2 | Is the RPG layer opt-in per team (some enterprises may want it off)? | Design + Product | No — answered yes in v2 (R9 team-level toggle) |
| 3 | Do we store mission prompts / outputs or only metadata? (privacy + storage cost) | Engineering + Legal | Yes |
| 4 | How do we compute "success rate" — user-flagged, auto-detected, or both? | Data | Yes |
| 5 | What is the pricing model — seat-based, team-based, or usage-passthrough? | Finance | No (but pre-GA) |
| 6 | SOC 2 requirements for storing agent logs? | Legal | Yes for enterprise |
| 7 | How do perks interact with the underlying agent config? | Engineering | Yes |
| 8 | **(new)** Do we ship a self-hosted variant to replace OpenClaw Control locally? | Engineering + Product | Yes for OSS / power-user segment |
| 9 | **(new)** Is the Usage DSL grammar a product surface or an internal tool? Does it need a user-facing grammar spec? | Product + Docs | No |
| 10 | **(new)** Which platforms ship in Channels (R14) at v1 — Telegram + WhatsApp (OpenClaw parity) or Slack + Discord (SaaS target)? | Product | Yes |
| 11 | **(new)** How do Nodes (R16) map when agents run in customer cloud vs. our infra? | Engineering | Yes |
| 12 | **(new)** Do we migrate existing OpenClaw configs (`~/.openclaw/openclaw.json`) on first login, or does the user re-create? | Engineering + Product | Yes (affects migration UX) |

---

## Timeline Considerations

### Phasing
- **Phase 1 (v1 GA):** R1–R13 above (13 P0s). Target: 12 weeks from kickoff (up from 10 — operator surface is substantial).
- **Phase 2 (fast-follows):** R14–R18 + retained P1s. Target: 6 weeks post-v1.
- **Phase 3 (platform):** P2 items. Scoped separately.

### Dependencies
- Agent runtime integrations require SDK hooks from each provider — Claude Code SDK available; OpenAI Agents SDK schema may still be shifting.
- SSO (enterprise SAML) depends on auth provider selection (WorkOS or Clerk).
- Billing-period reconciliation depends on model-provider cost-export APIs, which vary in maturity.
- **(new)** Usage DSL grammar depends on the query parser implementation (build vs. adopt an existing library — see system-design §5).
- **(new)** Scheduler (R15) depends on a cron engine; options are build-in-Postgres vs. adopt (Temporal, River, pg-cron) — see system-design §5.
- **(new)** OpenClaw migration path (Open Q #12) is its own dependency if we go that route.

### Hard deadlines
- None externally imposed; timeline is market-driven.

---

## Appendix — Glossary

- **Agent**: an autonomous or semi-autonomous AI worker registered with the HQ.
- **Mission**: a discrete unit of work assigned to one or more agents.
- **Squad**: the set of agents belonging to a team.
- **Perk**: an unlockable modifier that changes an agent's behavior (context size, tools, review depth).
- **Cooling**: transitional state where an agent is paused but still allocated.
- **Critical**: state indicating an agent has failed, stalled, or exceeded a guardrail and needs human attention.
- **Waiting**: state where an agent has paused itself pending human input (e.g. approval to send 18 emails). **(new)**
- **Session**: a live run of an agent on a specific channel + kind; has a unique key and token budget. **(new)**
- **Channel**: a messaging-platform binding (Telegram / WhatsApp / Slack / …) through which an agent reaches external users. **(new)**
- **Scheduler**: the recurring-work engine; evolves the OpenClaw Cron Jobs concept. **(new)**
- **Node**: an execution environment for an agent, with its own security policy and approval model. **(new)**
- **Instance**: a running beacon representing a connected client (gateway / webchat / backend / local). **(new)**
- **RPG layer**: the level/XP/perk/base/skill-tree flavor, opt-in per team. **(new)**
- **DSL (Usage)**: the server-side query language on the Usage page; grammar is documented and versioned. **(new)**
