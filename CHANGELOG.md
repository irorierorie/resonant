# Changelog

All notable changes to Resonant will be documented in this file.

## [Unreleased]

### Features

- **Anthropic API key auth option.** Settings → Authentication now lets users choose between the Claude Code subscription credential (default) and their own Anthropic API key. Switching is hot — the agent's QueryQueue serializes around the env switch, so no restart is needed. Built-in tools, MCP servers, hooks, and the `claude_code` system prompt preset work identically in either mode. New `auth_preferences` table (single-row, DB-backed so changes don't require a YAML reload), new `/api/auth-preferences` route with GET/PUT prefs, POST `/test` for on-demand key validation (no `@anthropic-ai/sdk` dep — uses fetch), POST `/reset-sessions` to invalidate SDK session refs after auth switch since Anthropic's prompt cache is account-scoped. PreferencesPanel gains Authentication, model-gated Models, and Usage sections; Discord/Telegram routing is disclosed in the UI for API-key mode (every external message bills the user's account). Full documentation in `docs/AUTH.md`.
- **Per-turn token usage tracking** in API-key mode. New `usage_log` table records input, output, cache-creation, and cache-read tokens per model. Settings → Usage shows a rolling 30-day cost estimate and per-model breakdown. Subscription mode skips logging — no cost attribution.
- **Subscription mode now clears `CLAUDE_CODE_OAUTH_TOKEN` and `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST`** from `process.env` before each query, so the SDK falls through to `~/.claude/.credentials.json` (which has a working refresh path) rather than a frozen OAuth token in shell env (no refresh, eventual silent 401). Fixes a long-standing PM2 gotcha.

### Bug Fixes

- **`digest.ts` now respects the active auth choice** and uses the specific model ID `claude-haiku-4-5` instead of the short `'haiku'` alias, so the Scribe runs under the same credential as the rest of the agent and resolves to a consistent model across subscription and API.

### Security

- **Dependency updates.** Direct: `uuid` 11.1.0 → 11.1.1 (CVE-2026-41907), `dompurify` 3.3.3 → 3.4.2 (CVE-2026-41238/9/40), `@anthropic-ai/claude-agent-sdk` 0.2.98 → 0.2.139. Transitive overrides: `fast-uri` ^3.1.2 (CVE-2026-6321, high), `hono` ^4.12.18 (multiple), `ip-address` ^10.1.1 (CVE-2026-42338). Vulnerability count 8 → 2 moderate (both documented as deferred with reachability rationale in [SECURITY.md](SECURITY.md)).
- **CI hardening against supply chain attacks** (response to the "mini Shai-Hulud" TanStack npm compromise, May 2026). `.github/workflows/ci.yml` now declares `permissions: { contents: read }` at workflow and job level, uses `npm ci --ignore-scripts` to block postinstall payload execution (with selective `npm rebuild better-sqlite3` for native modules we trust), and runs `npm audit --audit-level=high` as a build-blocking step. The `pull_request` trigger (not `pull_request_target`) ensures contributor PRs run in fork context with no secret access.
- **SECURITY.md extended** with supply chain hardening doc, deferred vulnerabilities table with reachability rationale, IOC verification commands for users who suspect compromise, and an explanation of what the build pipeline protects against versus what's still the operator's responsibility on a local machine.

### Documentation

- New `docs/AUTH.md` covering both auth modes, prompt cache implications when switching, security stance for local install, Discord/Telegram routing disclosure, and troubleshooting.
- README, `docs/GETTING-STARTED.md`, and `docs/CLOUD-DEPLOYMENT.md` updated to reflect the dual-credential model. README gains a Security section linking to SECURITY.md.

---

## [2.2.3] - 2026-05-08

### Bug Fixes

- **Mobile white screen on HTTP LAN origins** — Helmet's CSP defaults included `upgrade-insecure-requests`, which forced SvelteKit's dynamic module imports to upgrade to HTTPS on phones hitting the LAN IP (e.g. `192.168.x.x`). Desktop dev escaped this because `localhost` is always a secure context; phones were not, so imports rejected with no TLS available, `kit.start()` never ran, and the SPA never mounted. Opted out of `upgradeInsecureRequests` in the CSP directives — all other helmet defaults preserved. Reported by Ren & Ace.

### Repo Hygiene

- **Branch divergence resolved** — the v2.2.2 scope rollback work had been committed locally but never pushed, while a small test-fixup commit landed on origin/main in parallel. Reconciled via rebase (preserving all May 5 work), so v2.2.3 is the first tagged release on a unified history since v2.2.1.

---

## [2.2.2] - 2026-05-05

### Runtime Scope

- Restored Resonant's mainline runtime scope to the Claude Code Agent SDK implementation.
- Removed the experimental provider-neutral/OpenAI runtime layer from the default distribution. OpenAI subscription and model support will continue as a separate Resonant variant rather than adding cross-provider complexity to the Claude SDK product.
- Kept the public positioning centered on persistent relational AI, local-first companion infrastructure, and Claude Code's trusted security model.

---

## [2.1.2] - 2026-04-08

### Bug Fixes

- **Frontend stuck on loading screen with `/api/auth/check` 429 loop** (#11) — `checkAuth()` retried recursively with no max-attempts cap and re-flashed the layout spinner on every background retry. Two independent callers (layout + login page) created concurrent retry chains sharing one timeout handle. Fix: cap retries at 6 attempts then give up, only flip the spinner on the user-initiated call (not background retries), dedupe concurrent callers via an in-flight promise lock.
- **Rate limit too tight for normal frontend usage** — bumped `/api` rate limit from 120 → 600 req/min and exempted `/api/auth/check` from throttling entirely (cheap cookie lookup, never throttle).

---

## [2.1.1] - 2026-04-06

### Testing & CI

- **Testing infrastructure** — Vitest with 91 tests across 4 test files covering triggers, database, orchestrator, and hooks
- **GitHub Actions CI** — PR and push workflow with typecheck + tests on Node 20.x and 22.x
- **ESLint** — not yet, but the CI foundation is ready for it

### Bug Fixes

- **Health endpoint** — `/api/health` now reports actual WebSocket connection count instead of hardcoded 0

### Reliability

- **Database transaction safety** — `markMessagesRead`, `addReaction`, and `removeReaction` now wrapped in transactions to prevent partial writes and lost updates under concurrency
- **Node 25 guard** — startup check with clear error message for unsupported Node versions
- **Frontend error page** — SvelteKit error boundary with reload and navigation options

---

## [2.1.0] - 2026-04-01

### Scratchpad

- **Daily scratchpad** on the Command Center home page — persistent notes, tasks, and events in one unified view
- Quick-add with mode toggle (note/task/event), inline editing, task completion
- `cc_scratchpad` MCP tool with actions: `status`, `add_note`, `add_task`, `add_event`, `remove_note`, `remove_task`, `clear_notes`
- REST API endpoints under `/api/cc/scratchpad`
- New `scratchpad_notes` database table (auto-migrated on startup)

### The Scribe

- Periodic conversation digest agent running every 30 minutes on Haiku
- Produces daily markdown summaries in `data/digests/YYYY-MM-DD.md`
- Extracts: topics, key quotes, decisions, open items, ideas, events/dates, projects touched, emotional arc
- Uses configured `companion_name` and `user_name` for generalized prompts
- Toggle with `digest.enabled` config key (enabled by default)

### Other Changes

- **Skills loading** — companion agent now discovers and loads skills from `.claude/skills/` directory automatically
- **CC home scroll fix** — desktop view now scrolls past the scratchpad correctly
- **13 MCP tools** — `cc_scratchpad` added to the Command Center tool set

---

## [2.0.0] - 2026-03-30

Resonant v2 is a major evolution — from a chat companion into a full companion ecosystem with life management, an overhauled UI, and deeper agent integration.

### Command Center

A built-in life management system your companion can access and manage from chat.

- **Dashboard** (`/cc`) — Aggregate view of tasks, events, care, pets, countdowns, and daily wins
- **Planner** (`/cc/planner`) — Task management with projects, priorities, drag-and-drop reordering, and 3-day carry-forward
- **Care Tracker** (`/cc/care`) — Config-driven wellness tracking with toggles (meals, meds, movement), ratings (sleep, energy, mood), and counters (water). Categories fully customizable via `resonant.yaml`
- **Calendar** (`/cc/calendar`) — Event management with recurrence (weekly, monthly, yearly)
- **Cycle Tracker** (`/cc/cycle`) — Period tracking with phase predictions, daily logging, and history
- **Pet Care** (`/cc/pets`) — Pet profiles, medications with auto-advancing schedules, vet events
- **Lists** (`/cc/lists`) — Shopping and general lists with checkable items
- **Finances** (`/cc/finances`) — Expense tracking with category breakdown and configurable currency
- **Stats** (`/cc/stats`) — Trends dashboard for tasks, care, cycle, and expenses
- **12 MCP tools** (`cc_status`, `cc_task`, `cc_project`, `cc_care`, `cc_event`, `cc_cycle`, `cc_pet`, `cc_list`, `cc_expense`, `cc_countdown`, `cc_daily_win`, `cc_presence`) accessible via `/mcp/cc` (13 as of v2.1.0)
- **Hooks integration** — Companion context automatically includes Command Center status and mood history when enabled
- **15 new database tables** with automatic migration on startup
- Fully configurable: `command_center.enabled`, `default_person`, `currency_symbol`, `care_categories`

### Frontend Overhaul

The entire UI has been redesigned for a more polished, consistent experience.

- **Chat page** — Canvas panel drawer (replaces dropdown), new thread modal (replaces browser prompt), command result toast notifications, CC navigation link in header
- **Settings** — Redesigned as modal overlay with sidebar navigation, all existing panels preserved including Preferences
- **All components synced** — MessageBubble, MessageInput, ThreadList, Canvas, CanvasList, DiscordPanel, OrchestratorPanel, and 10 more components updated with improved styling and interactions
- **Design system** — `resonant.css` shared component library with card system, buttons, chips, forms, stat cards, date navigation, loading skeletons, empty states, and grid helpers
- **Light mode** — Full pass across all components. Replaced 43 hardcoded dark-mode-only colors with CSS variables for proper theme support
- **Design tokens** — Spacing scale, typography scale, elevation shadows, semantic colors, card radius
- **5 new shared components** — ResCheckbox, ResEmpty, ResRating, ResSkeleton, CcPageHeader

### Slash Commands

- Type `/` in chat to open the CommandPalette
- Auto-discovers installed skills
- UI commands (client-side) vs SDK passthrough (agent-side)

### TTS Read Aloud

- Play button on companion messages (appears on hover)
- Generates speech via ElevenLabs (requires `voice.elevenlabs_voice_id` config)
- Caches audio per message, handles mobile audio unlock

### Other Changes

- **Companion name** — UI uses configured `companion_name` everywhere (thanks @irorierorie — [#9](https://github.com/codependentai/resonant/pull/9))
- **Orchestrator** — Migrated from `node-cron` to `croner` for reliable timezone-aware scheduling (fixes DST edge cases)
- **Rate limiter** — Now scoped to `/api` and `/mcp` only; static assets no longer rate-limited
- **Escape key** — Closes sidebar, search, thread modal, and canvas panel in addition to stopping generation
- **Canvas protocol** — `canvas_updated` now includes optional title field for server-side renames
- **WebSocket store** — Canvas auto-focus on creation, optimistic title updates

### Upgrade Notes

- `resonant.yaml` gains a new `command_center:` section. If omitted, Command Center defaults to disabled
- Database migration runs automatically on startup (15 new tables, all `CREATE TABLE IF NOT EXISTS`)
- No breaking changes to existing configuration — all new features are additive

---

## [1.4.1] - 2026-03-28

- Autonomous alignment: routines, pulse, failsafe tools
- Session tracking, vector cache, and search filters

## [1.4.0] - 2026-03-27

- Initial public release
