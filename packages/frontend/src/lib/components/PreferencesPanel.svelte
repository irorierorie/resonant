<script lang="ts">
  import { onMount } from 'svelte';

  interface Preferences {
    identity: { companion_name: string; user_name: string; timezone: string };
    agent: { model: string; model_autonomous: string };
    orchestrator: { enabled: boolean };
    voice: { enabled: boolean };
    discord: { enabled: boolean };
    telegram: { enabled: boolean };
    auth: { has_password: boolean };
  }

  interface AuthPrefs {
    auth_mode: 'subscription' | 'api_key';
    api_key_masked: string | null;
    api_key_set: boolean;
    preferred_model: string | null;
    preferred_model_autonomous: string | null;
    usage_tracking_enabled: boolean;
  }

  interface UsageSummary {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheCreationTokens: number;
    totalCacheReadTokens: number;
    totalCostUsd: number;
    turns: number;
    windowDays: number;
    perDay: Array<{ date: string; tokens: number; cost: number }>;
    perModel: Array<{ model: string; turns: number; tokens: number; cost: number }>;
  }

  let prefs = $state<Preferences | null>(null);
  let authPrefs = $state<AuthPrefs | null>(null);
  let usage = $state<UsageSummary | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let message = $state<string | null>(null);
  let error = $state<string | null>(null);

  // Editable drafts
  let companionName = $state('');
  let userName = $state('');
  let timezone = $state('');
  let model = $state('');
  let modelAutonomous = $state('');
  let orchestratorEnabled = $state(true);
  let voiceEnabled = $state(false);
  let discordEnabled = $state(false);
  let telegramEnabled = $state(false);
  let newPassword = $state('');

  // Auth drafts
  let authMode = $state<'subscription' | 'api_key'>('subscription');
  let apiKeyInput = $state('');
  let showApiKey = $state(false);
  let usageTrackingEnabled = $state(true);
  let testing = $state(false);
  let testResult = $state<{ ok: boolean; text: string } | null>(null);

  const MODELS_SUBSCRIPTION = [
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ];
  const MODELS_API_ONLY = [
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (API only)' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ];
  const MODELS = $derived(authMode === 'api_key' ? MODELS_API_ONLY : MODELS_SUBSCRIPTION);

  const COMMON_TIMEZONES = [
    'UTC',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
    'Australia/Sydney', 'Pacific/Auckland',
  ];

  async function loadPrefs() {
    try {
      const [prefsRes, authRes] = await Promise.all([
        fetch('/api/preferences'),
        fetch('/api/auth-preferences'),
      ]);
      if (!prefsRes.ok) throw new Error('Failed to load');
      prefs = await prefsRes.json();
      // Populate drafts
      companionName = prefs!.identity.companion_name;
      userName = prefs!.identity.user_name;
      timezone = prefs!.identity.timezone;
      orchestratorEnabled = prefs!.orchestrator.enabled;
      voiceEnabled = prefs!.voice.enabled;
      discordEnabled = prefs!.discord.enabled;
      telegramEnabled = prefs!.telegram.enabled;

      if (authRes.ok) {
        authPrefs = await authRes.json();
        authMode = authPrefs!.auth_mode;
        usageTrackingEnabled = authPrefs!.usage_tracking_enabled;
        // Model: prefer auth_preferences override, then yaml
        model = authPrefs!.preferred_model || prefs!.agent.model;
        modelAutonomous = authPrefs!.preferred_model_autonomous || prefs!.agent.model_autonomous;
      } else {
        model = prefs!.agent.model;
        modelAutonomous = prefs!.agent.model_autonomous;
      }

      if (authMode === 'api_key') {
        await loadUsage();
      }
    } catch (e) {
      error = 'Failed to load preferences';
    } finally {
      loading = false;
    }
  }

  async function loadUsage() {
    try {
      const res = await fetch('/api/auth-preferences/usage?days=30');
      if (res.ok) usage = await res.json();
    } catch {
      // Usage is non-critical — silently skip
    }
  }

  async function testConnection() {
    testing = true;
    testResult = null;
    try {
      const res = await fetch('/api/auth-preferences/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKeyInput, model: 'claude-haiku-4-5' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        testResult = { ok: true, text: `Connected — ${data.model} responded (${data.input_tokens} in / ${data.output_tokens} out)` };
      } else {
        testResult = { ok: false, text: data.error || `Failed (HTTP ${res.status})` };
      }
    } catch (e) {
      testResult = { ok: false, text: e instanceof Error ? e.message : 'Network error' };
    } finally {
      testing = false;
    }
  }

  async function resetUsage() {
    if (!confirm('Clear all usage history? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/auth-preferences/usage', { method: 'DELETE' });
      if (res.ok) await loadUsage();
    } catch {
      error = 'Failed to reset usage';
    }
  }

  function fmtTokens(n: number): string {
    if (n < 1000) return String(n);
    if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
    return `${(n / 1_000_000).toFixed(2)}M`;
  }

  function fmtUsd(n: number): string {
    if (n < 0.01) return '<$0.01';
    if (n < 1) return `$${n.toFixed(3)}`;
    return `$${n.toFixed(2)}`;
  }

  async function savePrefs() {
    saving = true;
    message = null;
    error = null;
    try {
      // YAML preferences (identity + feature toggles + password)
      const updates: Record<string, unknown> = {
        identity: { companion_name: companionName, user_name: userName, timezone },
        orchestrator: { enabled: orchestratorEnabled },
        voice: { enabled: voiceEnabled },
        discord: { enabled: discordEnabled },
        telegram: { enabled: telegramEnabled },
      };
      if (newPassword) {
        updates.auth = { password: newPassword };
      }
      const res = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        error = data.error || 'Failed to save';
        return;
      }

      // Auth preferences (DB-backed, takes effect immediately)
      const authBody: Record<string, unknown> = {
        auth_mode: authMode,
        preferred_model: model || null,
        preferred_model_autonomous: modelAutonomous || null,
        usage_tracking_enabled: usageTrackingEnabled,
      };
      // Only send api_key if user typed something new; otherwise leave stored value alone
      if (apiKeyInput.trim()) {
        authBody.api_key = apiKeyInput.trim();
      } else if (authMode === 'subscription' && authPrefs?.api_key_set) {
        // Switching to subscription doesn't auto-clear the key — user must explicitly clear
      }

      const authRes = await fetch('/api/auth-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authBody),
      });
      const authData = await authRes.json();
      if (!authRes.ok) {
        error = authData.error || 'Failed to save auth preferences';
        return;
      }

      message = authData.warning || data.message || 'Saved';
      newPassword = '';
      apiKeyInput = '';
      // Reload to refresh masked key + usage
      await loadPrefs();
    } catch {
      error = 'Failed to save preferences';
    } finally {
      saving = false;
    }
  }

  async function clearApiKey() {
    if (!confirm('Remove the stored API key? You can re-enter it later.')) return;
    try {
      const res = await fetch('/api/auth-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: null }),
      });
      if (res.ok) {
        await loadPrefs();
        message = 'API key removed';
      }
    } catch {
      error = 'Failed to remove key';
    }
  }

  async function resetSessions() {
    if (!confirm('Start fresh sessions on every thread? Existing messages stay; only the SDK session reference is cleared. Useful after switching auth to avoid paying the full-context cost of a cache miss.')) return;
    try {
      const res = await fetch('/api/auth-preferences/reset-sessions', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        message = `Sessions reset on ${data.threadsReset} thread${data.threadsReset === 1 ? '' : 's'}.`;
      } else {
        error = data.error || 'Failed to reset sessions';
      }
    } catch {
      error = 'Failed to reset sessions';
    }
  }

  // True when the form's auth_mode differs from what's stored — gives the
  // user a heads-up before they save that they're about to flip the switch.
  const authModeWillChange = $derived(!!authPrefs && authMode !== authPrefs.auth_mode);

  onMount(loadPrefs);
</script>

<div class="prefs-panel">
  {#if loading}
    <p class="loading-text">Loading preferences...</p>
  {:else if prefs}
    <!-- Identity -->
    <section class="section">
      <h3 class="section-title">Identity</h3>
      <p class="section-desc">Names and timezone used throughout the system.</p>

      <div class="field">
        <label class="field-label" for="pref-companion">Companion Name</label>
        <input id="pref-companion" type="text" class="field-input" bind:value={companionName} placeholder="Echo" />
      </div>

      <div class="field">
        <label class="field-label" for="pref-user">Your Name</label>
        <input id="pref-user" type="text" class="field-input" bind:value={userName} placeholder="Alex" />
      </div>

      <div class="field">
        <label class="field-label" for="pref-tz">Timezone</label>
        <select id="pref-tz" class="field-select" bind:value={timezone}>
          {#each COMMON_TIMEZONES as tz}
            <option value={tz}>{tz}</option>
          {/each}
          {#if !COMMON_TIMEZONES.includes(timezone)}
            <option value={timezone}>{timezone}</option>
          {/if}
        </select>
      </div>
    </section>

    <!-- Authentication -->
    <section class="section">
      <h3 class="section-title">Authentication</h3>
      <p class="section-desc">How Resonant talks to Claude. The Claude Code subscription uses your local OAuth credential; the API key path bills your Anthropic account per token.</p>

      <div class="field">
        <label class="auth-radio">
          <input type="radio" value="subscription" bind:group={authMode} />
          <span class="auth-radio-label">Claude Code subscription</span>
          <span class="auth-radio-desc">Default — uses the credential at ~/.claude/.credentials.json. No per-query cost on your Anthropic account.</span>
        </label>
        <label class="auth-radio">
          <input type="radio" value="api_key" bind:group={authMode} />
          <span class="auth-radio-label">Anthropic API key</span>
          <span class="auth-radio-desc">Use your own key. Required for API-only models. Billed per token to your Anthropic account.</span>
        </label>
      </div>

      {#if authMode === 'api_key'}
        <div class="field">
          <label class="field-label" for="pref-apikey">
            API Key
            {#if authPrefs?.api_key_set}
              <span class="key-status">stored: <code>{authPrefs.api_key_masked}</code></span>
            {/if}
          </label>
          <div class="api-key-row">
            <input
              id="pref-apikey"
              type={showApiKey ? 'text' : 'password'}
              class="field-input"
              bind:value={apiKeyInput}
              placeholder={authPrefs?.api_key_set ? 'Leave blank to keep current key' : 'sk-ant-api03-...'}
              autocomplete="off"
            />
            <button type="button" class="ghost-btn" onclick={() => showApiKey = !showApiKey}>
              {showApiKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <span class="field-hint">Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> → Settings → API Keys</span>

          <div class="api-key-actions">
            <button
              type="button"
              class="ghost-btn"
              onclick={testConnection}
              disabled={testing || !apiKeyInput.trim()}
            >
              {testing ? 'Testing...' : 'Test connection'}
            </button>
            {#if authPrefs?.api_key_set}
              <button type="button" class="ghost-btn danger" onclick={clearApiKey}>Remove stored key</button>
            {/if}
          </div>

          {#if testResult}
            <p class="test-result {testResult.ok ? 'success' : 'error'}">{testResult.text}</p>
          {/if}
        </div>

        <div class="security-note">
          <strong>Local install, your responsibility.</strong> Your key is stored in plaintext in <code>data/resonant.db</code>. Don't commit that file, don't share it casually, and back it up encrypted. See <code>docs/AUTH.md</code> for details.
        </div>

        <div class="info-note">
          <strong>Discord and Telegram bots route to your key.</strong> If you have these integrations on, every message anyone sends through them runs on your Anthropic account. Disable the integrations or stay on the subscription if that's not what you want.
        </div>

        <div class="info-note">
          <strong>Prompt cache is account-scoped.</strong> When you switch auth, the cache built up on the prior account doesn't carry over. The first turn after a switch — in any existing thread — sends the full session history as fresh input and is full-price. Use <em>Reset sessions</em> below to start clean threads and avoid paying for an invalidated cache.
        </div>
      {/if}

      {#if authModeWillChange}
        <div class="warn-note">
          <strong>You're about to switch auth from <code>{authPrefs?.auth_mode}</code> to <code>{authMode}</code>.</strong>
          {#if authMode === 'api_key'}
            On save, queries will start billing your Anthropic account. Existing thread sessions will incur a cache-miss cost on their next turn — click <em>Reset sessions</em> to avoid that.
          {:else}
            On save, queries return to your Claude Code subscription. Stored API key is preserved (use <em>Remove stored key</em> if you want it gone).
          {/if}
        </div>
      {/if}

      <div class="api-key-actions">
        <button type="button" class="ghost-btn" onclick={resetSessions}>Reset sessions on all threads</button>
      </div>
      <span class="field-hint">Clears the SDK session reference on each thread. Messages stay. Next message starts a fresh session under the active auth.</span>
    </section>

    <!-- Agent Models -->
    <section class="section">
      <h3 class="section-title">Agent Models</h3>
      <p class="section-desc">
        Claude model for interactive and autonomous messages.
        {#if authMode === 'api_key'}
          API-only models like Sonnet 4.5 require an API key (configured above).
        {:else}
          Some newer models (e.g. Sonnet 4.5) are API-only — switch auth above to access them.
        {/if}
      </p>

      <div class="field">
        <label class="field-label" for="pref-model">Interactive Model</label>
        <select id="pref-model" class="field-select" bind:value={model}>
          {#each MODELS as m}
            <option value={m.id}>{m.label}</option>
          {/each}
        </select>
        <span class="field-hint">Used when you send a message</span>
      </div>

      <div class="field">
        <label class="field-label" for="pref-model-auto">Autonomous Model</label>
        <select id="pref-model-auto" class="field-select" bind:value={modelAutonomous}>
          {#each MODELS as m}
            <option value={m.id}>{m.label}</option>
          {/each}
        </select>
        <span class="field-hint">Used for scheduled wakes and autonomous actions</span>
      </div>
    </section>

    <!-- Usage (API key mode only) -->
    {#if authMode === 'api_key'}
      <section class="section">
        <h3 class="section-title">Usage</h3>
        <p class="section-desc">Estimated cost based on Anthropic's public list prices. Actual billing comes from your Anthropic account — these numbers are guidance, not a receipt.</p>

        <label class="toggle-row">
          <input type="checkbox" bind:checked={usageTrackingEnabled} />
          <span class="toggle-label">Track usage</span>
          <span class="toggle-desc">Log per-turn tokens to the local DB for the chart below</span>
        </label>

        {#if usage}
          <div class="usage-summary">
            <div class="usage-card">
              <span class="usage-label">Last {usage.windowDays} days</span>
              <span class="usage-value">{fmtUsd(usage.totalCostUsd)}</span>
              <span class="usage-sub">{usage.turns} turns · {fmtTokens(usage.totalInputTokens + usage.totalOutputTokens + usage.totalCacheCreationTokens + usage.totalCacheReadTokens)} tokens</span>
            </div>
            <div class="usage-card">
              <span class="usage-label">Cache reads</span>
              <span class="usage-value">{fmtTokens(usage.totalCacheReadTokens)}</span>
              <span class="usage-sub">cheaper, faster</span>
            </div>
          </div>

          {#if usage.perModel.length > 0}
            <div class="usage-table">
              <div class="usage-row usage-row-head">
                <span>Model</span><span>Turns</span><span>Tokens</span><span>Cost</span>
              </div>
              {#each usage.perModel as row}
                <div class="usage-row">
                  <span class="usage-model">{row.model}</span>
                  <span>{row.turns}</span>
                  <span>{fmtTokens(row.tokens)}</span>
                  <span>{fmtUsd(row.cost)}</span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="field-hint">No usage logged yet.</p>
          {/if}

          <div class="api-key-actions">
            <button type="button" class="ghost-btn danger" onclick={resetUsage}>Reset usage history</button>
          </div>
        {/if}
      </section>
    {/if}

    <!-- Toggles -->
    <section class="section">
      <h3 class="section-title">Features</h3>
      <p class="section-desc">Enable or disable system features.</p>

      <label class="toggle-row">
        <input type="checkbox" bind:checked={orchestratorEnabled} />
        <span class="toggle-label">Orchestrator</span>
        <span class="toggle-desc">Scheduled wake-ups and autonomous actions</span>
      </label>

      <label class="toggle-row">
        <input type="checkbox" bind:checked={voiceEnabled} />
        <span class="toggle-label">Voice</span>
        <span class="toggle-desc">ElevenLabs TTS and Groq transcription</span>
      </label>
      {#if voiceEnabled}
        <div class="setup-guide">
          <p class="guide-title">Voice Setup</p>
          <ol class="guide-steps">
            <li>Get an API key from <strong>ElevenLabs</strong> — <a href="https://elevenlabs.io" target="_blank" rel="noopener">elevenlabs.io</a> → Profile → API Keys</li>
            <li>Create or choose a voice, copy the <strong>Voice ID</strong> from the voice settings</li>
            <li>For transcription, get a <strong>Groq</strong> API key — <a href="https://console.groq.com" target="_blank" rel="noopener">console.groq.com</a> → API Keys</li>
            <li>Add to your <code>.env</code> file:
              <pre class="guide-code">ELEVENLABS_API_KEY=your_key_here
ELEVENLABS_VOICE_ID=your_voice_id
GROQ_API_KEY=your_groq_key</pre>
            </li>
            <li>Restart the server</li>
          </ol>
        </div>
      {/if}

      <label class="toggle-row">
        <input type="checkbox" bind:checked={discordEnabled} />
        <span class="toggle-label">Discord</span>
        <span class="toggle-desc">Discord bot gateway integration</span>
      </label>
      {#if discordEnabled}
        <div class="setup-guide">
          <p class="guide-title">Discord Setup</p>
          <ol class="guide-steps">
            <li>Go to the <a href="https://discord.com/developers/applications" target="_blank" rel="noopener">Discord Developer Portal</a></li>
            <li>Create a <strong>New Application</strong>, then go to <strong>Bot</strong> → Reset Token → copy the token</li>
            <li>Under <strong>Privileged Gateway Intents</strong>, enable: Message Content, Server Members, Presence</li>
            <li>Go to <strong>OAuth2</strong> → URL Generator → select <code>bot</code> scope with permissions: Send Messages, Read Message History, Add Reactions, Embed Links, Attach Files</li>
            <li>Use the generated URL to invite the bot to your server</li>
            <li>Right-click your username in Discord → Copy User ID (enable Developer Mode in Discord settings first)</li>
            <li>Add to your <code>.env</code> file:
              <pre class="guide-code">DISCORD_BOT_TOKEN=your_bot_token</pre>
            </li>
            <li>Set your owner user ID in <code>resonant.yaml</code>:
              <pre class="guide-code">discord:
  enabled: true
  owner_user_id: "your_discord_user_id"</pre>
            </li>
            <li>Restart the server. Configure rules in the Discord tab in settings.</li>
          </ol>
        </div>
      {/if}

      <label class="toggle-row">
        <input type="checkbox" bind:checked={telegramEnabled} />
        <span class="toggle-label">Telegram</span>
        <span class="toggle-desc">Telegram bot integration</span>
      </label>
      {#if telegramEnabled}
        <div class="setup-guide">
          <p class="guide-title">Telegram Setup</p>
          <ol class="guide-steps">
            <li>Open Telegram, search for <strong>@BotFather</strong></li>
            <li>Send <code>/newbot</code>, follow the prompts to name your bot</li>
            <li>Copy the <strong>bot token</strong> BotFather gives you</li>
            <li>Send a message to your new bot, then visit:<br/>
              <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code><br/>
              Find your <strong>chat ID</strong> in the response JSON under <code>message.chat.id</code></li>
            <li>Add to your <code>.env</code> file:
              <pre class="guide-code">TELEGRAM_BOT_TOKEN=your_bot_token</pre>
            </li>
            <li>Set your chat ID in <code>resonant.yaml</code>:
              <pre class="guide-code">telegram:
  enabled: true
  owner_chat_id: "your_chat_id"</pre>
            </li>
            <li>Restart the server</li>
          </ol>
        </div>
      {/if}
    </section>

    <!-- Security -->
    <section class="section">
      <h3 class="section-title">Security</h3>
      <p class="section-desc">
        {#if prefs.auth.has_password}
          Password is set. Leave blank to keep current password.
        {:else}
          No password set. Access is open to anyone on the network.
        {/if}
      </p>

      <div class="field">
        <label class="field-label" for="pref-password">
          {prefs.auth.has_password ? 'Change Password' : 'Set Password'}
        </label>
        <input id="pref-password" type="password" class="field-input" bind:value={newPassword} placeholder="Leave blank to keep unchanged" />
      </div>
    </section>

    <!-- Save -->
    <div class="save-area">
      {#if message}
        <p class="save-message success">{message}</p>
      {/if}
      {#if error}
        <p class="save-message error">{error}</p>
      {/if}
      <button class="save-btn" onclick={savePrefs} disabled={saving}>
        {saving ? 'Saving...' : 'Save Preferences'}
      </button>
      <p class="save-hint">Some changes require a server restart to take effect.</p>
    </div>
  {:else}
    <p class="loading-text">{error || 'Unable to load preferences'}</p>
  {/if}
</div>

<style>
  .prefs-panel {
    max-width: 540px;
  }

  .loading-text {
    color: var(--text-muted);
    font-size: 0.875rem;
    font-style: italic;
    padding: 1rem 0;
  }

  .section {
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .section:last-of-type {
    border-bottom: none;
  }

  .section-title {
    font-family: var(--font-heading);
    font-size: 0.9375rem;
    font-weight: 400;
    color: var(--text-accent);
    letter-spacing: 0.04em;
    margin: 0 0 0.375rem;
  }

  .section-desc {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin: 0 0 1rem;
    line-height: 1.5;
  }

  .field {
    margin-bottom: 1rem;
  }

  .field-label {
    display: block;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin-bottom: 0.375rem;
    letter-spacing: 0.02em;
  }

  .field-input,
  .field-select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    font-family: inherit;
    color: var(--text-primary);
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: border-color var(--transition), box-shadow var(--transition);
  }

  .field-input:focus,
  .field-select:focus {
    outline: none;
    border-color: var(--gold-dim);
    box-shadow: 0 0 0 2px rgba(196, 168, 114, 0.08);
  }

  .field-hint {
    display: block;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
  }

  .toggle-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem 0;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
  }

  .toggle-row:last-of-type {
    border-bottom: none;
  }

  .toggle-row input[type="checkbox"] {
    margin-top: 0.125rem;
    width: 1rem;
    height: 1rem;
    accent-color: var(--gold);
    flex-shrink: 0;
  }

  .toggle-label {
    font-size: 0.875rem;
    color: var(--text-primary);
    min-width: 5rem;
    flex-shrink: 0;
  }

  .toggle-desc {
    font-size: 0.8125rem;
    color: var(--text-muted);
    flex: 1;
  }

  .save-area {
    padding-top: 0.5rem;
  }

  .save-btn {
    padding: 0.625rem 1.5rem;
    font-size: 0.875rem;
    font-family: var(--font-heading);
    letter-spacing: 0.04em;
    color: var(--bg-primary);
    background: var(--gold);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity var(--transition);
  }

  .save-btn:hover {
    opacity: 0.9;
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .save-message {
    font-size: 0.8125rem;
    padding: 0.5rem 0;
    margin: 0;
  }

  .save-message.success {
    color: var(--gold);
  }

  .save-message.error {
    color: #e05252;
  }

  .save-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.5rem;
  }

  .setup-guide {
    margin: 0.5rem 0 1rem 1.75rem;
    padding: 1rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-left: 2px solid var(--gold-dim);
    border-radius: 6px;
  }

  .guide-title {
    font-family: var(--font-heading);
    font-size: 0.8125rem;
    font-weight: 400;
    color: var(--text-accent);
    letter-spacing: 0.04em;
    margin: 0 0 0.75rem;
  }

  .guide-steps {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.7;
  }

  .guide-steps li {
    margin-bottom: 0.5rem;
  }

  .guide-steps a {
    color: var(--gold);
    text-decoration: none;
    border-bottom: 1px solid var(--gold-dim);
  }

  .guide-steps a:hover {
    border-bottom-color: var(--gold);
  }

  .guide-steps code {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 0.75rem;
    padding: 0.125rem 0.375rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--gold);
  }

  .guide-code {
    display: block;
    margin: 0.5rem 0;
    padding: 0.625rem 0.75rem;
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 0.75rem;
    line-height: 1.6;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre;
  }

  .auth-radio {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: 0.625rem;
    row-gap: 0.125rem;
    padding: 0.625rem 0;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
  }

  .auth-radio:last-of-type {
    border-bottom: none;
  }

  .auth-radio input[type="radio"] {
    grid-row: 1 / 3;
    margin-top: 0.25rem;
    accent-color: var(--gold);
  }

  .auth-radio-label {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .auth-radio-desc {
    font-size: 0.8125rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .api-key-row {
    display: flex;
    gap: 0.5rem;
  }

  .api-key-row .field-input {
    flex: 1;
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 0.8125rem;
  }

  .api-key-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
    flex-wrap: wrap;
  }

  .ghost-btn {
    padding: 0.4rem 0.875rem;
    font-size: 0.8125rem;
    font-family: inherit;
    color: var(--text-secondary);
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    transition: border-color var(--transition), color var(--transition);
  }

  .ghost-btn:hover:not(:disabled) {
    border-color: var(--gold-dim);
    color: var(--text-primary);
  }

  .ghost-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .ghost-btn.danger {
    color: #e07878;
  }

  .ghost-btn.danger:hover:not(:disabled) {
    border-color: #e07878;
    color: #e58a8a;
  }

  .key-status {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 400;
    margin-left: 0.5rem;
  }

  .key-status code {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    color: var(--gold-dim);
  }

  .test-result {
    margin: 0.75rem 0 0;
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    border-radius: 4px;
    border: 1px solid var(--border);
  }

  .test-result.success {
    color: var(--gold);
    border-color: var(--gold-dim);
    background: rgba(196, 168, 114, 0.04);
  }

  .test-result.error {
    color: #e07878;
    border-color: rgba(224, 120, 120, 0.4);
    background: rgba(224, 120, 120, 0.04);
  }

  .security-note,
  .info-note,
  .warn-note {
    margin-top: 0.75rem;
    padding: 0.75rem 0.875rem;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--text-secondary);
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-left: 2px solid var(--gold-dim);
    border-radius: 6px;
  }

  .info-note {
    border-left-color: var(--gold-dim);
  }

  .warn-note {
    border-left-color: #e0a058;
    background: rgba(224, 160, 88, 0.05);
    color: var(--text-primary);
  }

  .security-note code,
  .warn-note code {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 0.75rem;
    padding: 0.0625rem 0.25rem;
    background: var(--bg-secondary);
    border-radius: 3px;
    color: var(--gold);
  }

  .usage-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.75rem;
    margin: 1rem 0;
  }

  .usage-card {
    display: flex;
    flex-direction: column;
    padding: 0.875rem 1rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .usage-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-bottom: 0.375rem;
  }

  .usage-value {
    font-family: var(--font-heading);
    font-size: 1.5rem;
    color: var(--gold);
    line-height: 1;
  }

  .usage-sub {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.375rem;
  }

  .usage-table {
    margin: 1rem 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .usage-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: 0.75rem;
    padding: 0.5rem 0.875rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border);
  }

  .usage-row:last-child {
    border-bottom: none;
  }

  .usage-row-head {
    background: var(--bg-input);
    color: var(--text-muted);
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .usage-model {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 0.75rem;
    color: var(--text-primary);
  }
</style>
