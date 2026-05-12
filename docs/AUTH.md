# Authentication

Resonant supports two ways of talking to Claude. You choose in **Settings → Preferences → Authentication**.

## The two modes

### 1. Claude Code subscription (default)

Uses the OAuth credential at `~/.claude/.credentials.json` — the same one the Claude Code CLI uses. If you're logged into Claude Code on this machine, this just works. No per-query cost on your Anthropic account; usage counts against your subscription.

This is what you want if:
- You have a Claude Max or Team subscription
- You're using stock models (Opus, Sonnet 4.6, Haiku)
- You don't want to think about token cost

### 2. Anthropic API key

You supply your own API key from [console.anthropic.com](https://console.anthropic.com/settings/keys). Every turn is billed to your Anthropic account per token.

This is what you want if:
- You need a model that isn't available on the subscription (e.g. Sonnet 4.5, which is API-only)
- You want fine-grained cost visibility
- You're running Resonant somewhere your Claude Code OAuth isn't

## How the switch actually works

Resonant uses the `@anthropic-ai/claude-agent-sdk`, which is auth-method-agnostic. When you choose API key mode, Resonant sets `ANTHROPIC_API_KEY` on the process environment before each query. When you switch back to subscription, Resonant also clears `CLAUDE_CODE_OAUTH_TOKEN` and `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST` from env — this matters if you launched Resonant from a shell that had a frozen Claude Code OAuth token in env (common under PM2). Without that clear-out, the SDK would prefer the frozen env token over `~/.claude/.credentials.json` and eventually return silent 401s as the frozen token expired.

`CLAUDE_CODE_USE_BEDROCK` and `CLAUDE_CODE_USE_VERTEX` are intentionally left alone — if you've set those up, Resonant doesn't interfere.

Everything else — built-in tools (Read, Write, Edit, Bash, Glob, Grep, WebFetch), MCP servers, hooks, plugins, the `claude_code` system prompt preset — works identically in both modes. Switching auth doesn't change what Claude can do, only who pays.

## Model IDs

Resonant uses specific model IDs (`claude-sonnet-4-6`, `claude-opus-4-7`, `claude-haiku-4-5`) rather than short aliases (`sonnet`, `haiku`). Anthropic maps these consistently across subscription and API endpoints, so a model selection survives an auth switch without silently resolving to a different version.

If a new model lands and you want to use it before Resonant adds it to the dropdown, edit `MODELS_API_ONLY` in `packages/frontend/src/lib/components/PreferencesPanel.svelte` — or wait for the next release.

## Discord, Telegram, and other integrations

**If you flip to API-key mode, every external message routes through your key.** Resonant's Discord and Telegram bots — and any other client that sends messages through the agent — share the same auth choice. There's no per-platform auth split.

Concretely: if you have the Discord bot enabled and you switch to API key mode, every Discord user who messages your companion costs your Anthropic account. The same applies to Telegram. The system has no way to refuse a message based on who sent it once the bot is on.

Options if this isn't what you want:
- Stay on the Claude Code subscription (covers all platforms by default).
- Disable the Discord/Telegram integrations in Settings → Preferences → Features while you're on API-key mode.
- Only enable bots for trusted users — the routing rules are configured in the Discord tab in settings.

## Switching auth without paying for cache misses

Anthropic's prompt cache is account-scoped. A conversation cached under your subscription account gets no cache hit when the next turn runs under your API key — the SDK sends the full session history as fresh input, and you pay the full input price for it.

For long-running threads, this can be a sharp first turn after a switch. Two ways to handle it:

1. **Reset sessions before sending the next message.** Settings → Authentication → *Reset sessions on all threads*. This nulls the `current_session_id` on every thread. Your messages stay; only the SDK session reference is cleared. Next message in each thread starts fresh, so there's no large history to re-send. You'll lose the SDK's in-session memory, but Resonant's own message history and memory tools survive.
2. **Just absorb the first turn.** If a thread is short or the convenience of continuity matters more than the one-off cost, do nothing. Subsequent turns will rebuild the cache on the new account.

The warning banner in the Authentication section flags this when you change auth mode in the form, before you save.

## Security

**Resonant is a local-personal install. The API key sits in plaintext in `data/resonant.db`.**

This is a deliberate choice: encrypting the key with a master key we'd then have to store somewhere in your config just moves the problem. OS keychain integration would add a native dep and break "clone and run." Plaintext in your local DB, with this warning, matches the `.env` convention everyone already accepts.

Your responsibilities:
- **Don't commit `data/resonant.db`** — it should already be in `.gitignore`; verify.
- **Don't share that file casually** — it contains your key, conversation history, and embeddings.
- **Encrypt your backups** — if you back up your home folder or sync `data/` somewhere, make sure it's encrypted at rest.
- **Rotate if exposed** — if you suspect the file leaked, revoke the key in the [Anthropic console](https://console.anthropic.com/settings/keys) and issue a new one. Resonant has no way to phone home; rotation is yours.

If you want stronger storage, the cleanest path is to override `ANTHROPIC_API_KEY` from your shell environment (or `.env`) and leave Resonant on subscription mode — the env var takes precedence over the OAuth credential and Resonant won't store anything.

## Costs

Resonant displays an estimated rolling 30-day cost in **Settings → Preferences → Usage** when you're in API-key mode. The estimate is based on Anthropic's public list prices for input, output, cache writes, and cache reads.

**Important caveats:**
- This is an estimate, not a receipt. The number from Anthropic's billing is authoritative.
- Cache hits dramatically reduce cost. The Claude Code system prompt is large but cached aggressively after the first turn of a session.
- The `claude_code` preset injects a substantial system prompt every query. With caching, the marginal cost per turn is mostly your message + the model's response.

To get a sense of what you'd spend before committing, send a few messages on a cheap model (Haiku) and watch the counter.

## Models

Subscription mode supports current stock models — Opus 4.7, Opus 4.6, Sonnet 4.6, Haiku 4.5.

API-key mode adds API-only models (e.g. Sonnet 4.5) and any future models Anthropic releases on the API before they hit the subscription. The model dropdown updates based on your auth mode.

If you pick a model your tier can't access, you'll get an HTTP error back from Anthropic on the first query. Switch model, or upgrade your tier in the console.

## Switching modes

You can switch any time from the Settings UI. Effect is immediate — no restart needed. The QueryQueue inside Resonant serializes queries, so there's no race between in-flight queries and the env switch.

Switching from `api_key` → `subscription` does **not** automatically clear your stored API key. Use the "Remove stored key" button if you want it gone from the DB.

## Troubleshooting

**"queries fail silently after switching to API key"** — open the server logs. Most likely your key is invalid or your account doesn't have access to the configured model. Use the **Test connection** button to validate.

**"I'm in subscription mode but it's hitting my API account"** — check whether `ANTHROPIC_API_KEY` is set in your shell environment. The SDK reads env first; Resonant only clears it during a query if you've explicitly chosen subscription mode in the UI.

**"My subscription model returns a 403"** — check whether Anthropic moved that model to API-only. Switch to API-key mode (with a paid key) or pick a different model.
