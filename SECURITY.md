# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| v2.x    | Yes       |

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

DM us on [X (@codependent_ai)](https://x.com/codependent_ai) or message the [Telegram channel](https://t.me/+xSE1P_qFPgU4NDhk) with:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment (what an attacker could do)

We'll acknowledge within 48 hours and aim to patch critical issues within 7 days.

## Security model

Resonant is self-hosted software that runs on your machine:

- **No cloud backend** — your data stays local (SQLite + filesystem)
- **No telemetry** — nothing phones home
- **Auth is optional** — password protection is available but not required for local-only use
- **Agent SDK queries** go through your Claude Code subscription *or* your own Anthropic API key — we never see them
- **MCP servers** are user-configured — we don't bundle or recommend specific ones

### What to watch for

- **Exposed ports** — if you expose Resonant to the internet, set a password and use HTTPS
- **CLAUDE.md contents** — this file is sent to the AI on every query. Don't put secrets in it
- **`.env` and `resonant.yaml`** — contain credentials. Both are gitignored by default
- **Discord/Telegram tokens** — treat these as secrets. Never commit them
- **`data/resonant.db`** — when using API-key auth, your Anthropic key sits here in plaintext. Don't commit or share that file. See [docs/AUTH.md](docs/AUTH.md) for the full discussion.
- **LAN deployments without TLS** — if you run Resonant on a LAN IP without HTTPS, your API key transits in plaintext when first saved. Stay on localhost or use a TLS-terminating reverse proxy.

## Defensive measures in the codebase

- **Helmet + CSP** on all HTTP responses (`frameAncestors 'none'`, narrow `connectSrc`, no eval).
- **CORS** allowlist constrained to configured origins.
- **Rate limiting** on `/api` (600/min) and stricter on `/login` (5 per 15 min, skips on success).
- **Timing-safe password comparison** using `crypto.timingSafeEqual` on a length-padded buffer.
- **Cryptographic session tokens** (32 random bytes) in `httpOnly` cookies, `sameSite: strict` in production.
- **Parameterized SQL** throughout. Dynamic UPDATE builders use hardcoded column-name allowlists; no user input ever reaches a column or table name.
- **No request-body logging** anywhere — API keys and passwords do not appear in logs.

## Supply chain hardening

Resonant's CI workflow (`.github/workflows/ci.yml`) is hardened against npm supply chain attacks (e.g. the "mini Shai-Hulud" TanStack compromise, May 2026):

- **`pull_request` trigger** (not `pull_request_target`). Workflows running on contributor PRs execute in fork context with **no access to repository secrets**.
- **Minimum `permissions`** declared at workflow and job level. The default is `contents: read` everywhere; no `id-token: write`, no `packages: write`.
- **`npm ci --ignore-scripts`** disables postinstall payload execution during dependency install. Native modules we depend on are then rebuilt selectively via `npm rebuild better-sqlite3`.
- **`npm audit --audit-level=high` as a build-blocking step** — any new high or critical CVE entering the dep graph fails the build immediately.

The maintainer manually vets every dependency update against Socket.dev provenance, publish timing, and registry signatures before installing locally.

### What this gets you, and what it doesn't

**No cross-run caching.** Our CI doesn't enable `actions/setup-node`'s `cache: 'npm'` or `actions/cache`. Every run is a fresh runner with an empty npm cache. The cache-poisoning vector used by the Shai-Hulud family — poison a build cache, next run inherits the payload — doesn't apply to us. The trade-off is slower CI; we think the trade is correct.

**Silent ingestion is blocked at the easy point, not the hard one.** `--ignore-scripts` prevents `postinstall` hooks from firing during install — the most common payload trigger and the one used by the TanStack attack's `router_init.js`. What it doesn't (and can't) prevent: package files still land on disk, and if a compromised package made it into our lockfile, that code would still execute when `npm run check` or `npm test` imports it. The defenses against *that* are:

1. **`npm ci` fails on lockfile drift.** An attacker can't silently swap a transitive version in a PR — the diff would show in `package-lock.json` and the install would fail if the lock and the package manifest disagreed.
2. **`pull_request` workflows run with no secrets.** Even if malicious code did execute during a PR run, the runner has no `GITHUB_TOKEN` write, no npm tokens, no `id-token`. It can burn fork compute but can't exfiltrate from your CI.
3. **The audit gate catches *known* CVEs.** A zero-day won't be in the GitHub Advisory database yet, so the gate isn't a panic button — but anything publicly disclosed will fail the build before it merges.

**Your local machine is the place where install discipline still matters.** Locally, your shell has whatever secrets you've set up — credentials.json, npm tokens, AWS keys, browser session cookies. A compromised dep installed via a casual `npm install <thing>` would run with all of those in scope. The CI hardening doesn't help here. Before any local install of a new or updated dependency, check Socket.dev for the specific version, look at publish timing, and prefer pinned exact versions over caret ranges for anything you're suspicious of.

## Current deferred vulnerabilities

The following are tracked but not yet patched. Each has a rationale.

| Issue | Severity | Status | Why deferred |
|---|---|---|---|
| `@anthropic-ai/sdk` (memory tool path escape, file perms) | Moderate | Pinned by `@anthropic-ai/claude-agent-sdk@^0.81.0` | Resonant does not use the memory tool. The CVE is unreachable in our codepath. Will pick up the fix when `@anthropic-ai/claude-agent-sdk` widens its constraint. |
| `protobufjs <7.5.5` (CVE-2026-41242, arbitrary code exec, CVSS 9.4) | Critical | Transitive via `@huggingface/transformers` → `onnxruntime-web` | Marked "Unused" by reachability scanners — pulled in but never invoked in our load path. Awaiting upstream fix. |
| `postcss <8.5.10` (CVE-2026-41305) | Moderate | Transitive, dev-only, unused | Build-tool transitive, not in production runtime. |

## How to verify your install isn't compromised

If you suspect compromise (or want to sanity-check after a major dep update):

```bash
# Should return nothing — known IOC author for the Shai-Hulud family
git log --all --pretty=format:'%h %ae' --author='claude@users.noreply.github.com'

# Should return nothing — known malicious package families
grep -rE '"@tanstack|@opensearch|mistralai|guardrails-ai' package.json packages/*/package.json

# Should return nothing — known IOC strings in installed packages
grep -rE 'filev2.getsession.org|tanstack_runner|router_init.js' node_modules 2>/dev/null
```

If any of those return hits, treat the install as compromised: rotate every credential the machine could access, wipe `node_modules` and `~/.npm/_cacache`, and reinstall from a known-good lockfile commit.
