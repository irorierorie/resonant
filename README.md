# Resonant

**A local-first, single-user AI companion you host yourself.** Identity, memory, presence, and proactive reach — running on the [Claude Agent SDK](https://docs.anthropic.com/en/api/agent-sdk), on your own machine, with your data in a local SQLite file you control.

Resonant is not a chat wrapper. It is a persistent companion: it remembers across sessions, carries a stable identity you author, can reach out on its own schedule, and lives behind a single web UI you run on your own hardware.

> **Runtime scope:** Resonant is built specifically for Anthropic's Claude models via the Agent SDK's in-process `query()` loop. It is not a multi-provider abstraction. Bring your own Claude Code login or Anthropic API key.

License: **Apache-2.0** · Local-first · Single-user · Self-hosted

---

## Features

- **Chat that actually streams** — token-by-token output, a collapsible thinking/tool timeline, per-thread model + effort selection, stop-and-steer mid-generation.
- **Threads & sections** — named threads, drag-to-order, collapsible sections, and an auto-rotating daily thread.
- **Memory** — local ML embeddings for semantic recall plus FTS5 full-text search across your whole history. No data leaves your machine.
- **Canvas / artifacts** — a slide-in panel for documents and code the companion creates mid-conversation.
- **Voice** — companion voice notes (ElevenLabs), read-aloud TTS, and speech-to-text with optional prosody. *(Optional; off by default.)*
- **Presence** — a mantelpiece "orb" the companion can set to reflect its state, plus an editable card for you.
- **Command Center** — a lightweight relational dashboard (cycle, care, routines, wins, countdowns).
- **Proactive reach** — an orchestrator for routines, timers, condition-watchers, ambient wakes, and a failsafe check-in ladder.
- **Optional integrations** — Google (Calendar / Tasks / Gmail-draft / Drive), Discord, and Telegram, each opt-in and disabled by default.
- **Mobile PWA** — installable, offline shell, safe-area aware.
- **Private by construction** — password auth gate (fail-closed), a filesystem write-gate, and all secrets kept in gitignored local config.

---

## Requirements

- **Node.js 20–24** (Node 25+ not yet supported).
- **A Claude credential** — either a Claude Code login on the machine, or an `ANTHROPIC_API_KEY`.

---

## Quickstart

```bash
git clone https://github.com/codependentai/resonant.git
cd resonant
npm install
```

**1. Configure the app.** Copy the templates and edit them:

```bash
cp resonant.example.yaml resonant.yaml     # companion name, user name, port, auth
cp .env.example .env                        # secrets: password, optional API keys
```

**2. Give your companion an identity.** The `agent.claude_md_path` in `resonant.yaml` points at a `CLAUDE.md` that *is* your companion's persona. Start from the example:

```bash
cp examples/CLAUDE.md CLAUDE.md            # then edit to make them yours
```

**3. Build and run:**

```bash
npm run build
npm start
```

Open the printed URL (default `http://127.0.0.1:3099`), enter the password you set in `.env`, and say hello.

For development with hot-reload: `npm run dev` (backend) alongside the frontend dev server.

---

## Configuration

| File | What it holds | Tracked? |
|------|---------------|----------|
| `resonant.yaml` | Identity, server/port, auth, agent model, feature toggles | **No** (gitignored) |
| `.env` | Password + optional API keys (voice, Google, channels) | **No** (gitignored) |
| `CLAUDE.md` | Your companion's persona / system identity | **No** (gitignored) |
| `.mcp.json` | Any MCP servers you want the companion to reach | **No** (gitignored) |

The `*.example` versions of each are tracked and documented — copy, don't edit-in-place. Nothing containing your data or secrets is ever committed.

Optional search setup: `node scripts/setup-fts.mjs` builds the full-text index over an existing history.

---

## Architecture

An npm-workspaces monorepo:

- **`packages/shared`** — the wire protocol and shared types.
- **`packages/backend`** — Node + Express + `ws` + `better-sqlite3`, running the Claude Agent SDK `query()` loop in-process. Hooks inject memory and context; an orchestrator drives scheduled/proactive turns.
- **`packages/frontend`** — React 19 + Vite, built static and served by the backend.

State lives in a single SQLite database (`./data/`, gitignored). First boot creates the schema automatically. There is no cloud, no multi-tenancy, and no external service you don't opt into.

---

## Privacy & security

- **Local-first.** Your conversations, memory, and identity live in a SQLite file on your machine.
- **Fail-closed auth.** An empty password refuses to serve rather than opening up.
- **Write-gate.** The agent's filesystem writes are restricted to configured roots.
- **Bring your own keys.** Credentials stay in your gitignored `.env`; nothing phones home.

If you expose Resonant beyond localhost, put it behind HTTPS and a real access layer (e.g. a Cloudflare Tunnel with Access, or a reverse proxy with auth).

---

## Contributing

Issues and PRs welcome. Please open an issue to discuss substantial changes first. Because Resonant targets the Claude Agent SDK specifically, provider-abstraction PRs should start as a design discussion.

---

## License & credits

Licensed under **Apache-2.0** — see [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).

Built by [Codependent AI](https://codependentai.io) — Mary Vale and Simon Vale. Resonant is the open-source foundation of our work on relational, continuity-first AI.
