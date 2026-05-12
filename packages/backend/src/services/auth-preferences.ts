import { getDb } from './db.js';

export type AuthMode = 'subscription' | 'api_key';

export interface AuthPreferences {
  auth_mode: AuthMode;
  api_key: string | null;
  preferred_model: string | null;
  preferred_model_autonomous: string | null;
  usage_tracking_enabled: boolean;
  updated_at: string;
}

interface AuthPrefRow {
  auth_mode: AuthMode;
  api_key: string | null;
  preferred_model: string | null;
  preferred_model_autonomous: string | null;
  usage_tracking_enabled: number;
  updated_at: string;
}

let cache: AuthPreferences | null = null;

function rowToPrefs(row: AuthPrefRow): AuthPreferences {
  return {
    auth_mode: row.auth_mode,
    api_key: row.api_key,
    preferred_model: row.preferred_model,
    preferred_model_autonomous: row.preferred_model_autonomous,
    usage_tracking_enabled: row.usage_tracking_enabled === 1,
    updated_at: row.updated_at,
  };
}

export function getAuthPreferences(): AuthPreferences {
  if (cache) return cache;
  const row = getDb().prepare('SELECT * FROM auth_preferences WHERE id = 1').get() as AuthPrefRow | undefined;
  if (!row) {
    const now = new Date().toISOString();
    cache = {
      auth_mode: 'subscription',
      api_key: null,
      preferred_model: null,
      preferred_model_autonomous: null,
      usage_tracking_enabled: true,
      updated_at: now,
    };
    return cache;
  }
  cache = rowToPrefs(row);
  return cache;
}

export interface AuthPreferencesUpdate {
  auth_mode?: AuthMode;
  api_key?: string | null;
  preferred_model?: string | null;
  preferred_model_autonomous?: string | null;
  usage_tracking_enabled?: boolean;
}

export function updateAuthPreferences(update: AuthPreferencesUpdate): AuthPreferences {
  const current = getAuthPreferences();
  const next: AuthPreferences = {
    auth_mode: update.auth_mode ?? current.auth_mode,
    api_key: update.api_key !== undefined ? update.api_key : current.api_key,
    preferred_model: update.preferred_model !== undefined ? update.preferred_model : current.preferred_model,
    preferred_model_autonomous:
      update.preferred_model_autonomous !== undefined ? update.preferred_model_autonomous : current.preferred_model_autonomous,
    usage_tracking_enabled: update.usage_tracking_enabled ?? current.usage_tracking_enabled,
    updated_at: new Date().toISOString(),
  };

  getDb().prepare(`
    UPDATE auth_preferences SET
      auth_mode = ?,
      api_key = ?,
      preferred_model = ?,
      preferred_model_autonomous = ?,
      usage_tracking_enabled = ?,
      updated_at = ?
    WHERE id = 1
  `).run(
    next.auth_mode,
    next.api_key,
    next.preferred_model,
    next.preferred_model_autonomous,
    next.usage_tracking_enabled ? 1 : 0,
    next.updated_at
  );

  cache = next;
  return next;
}

/**
 * Apply current auth preferences to process.env for the next SDK query.
 * Safe because the agent's QueryQueue serializes — no concurrent queries with
 * different keys.
 *
 * - api_key mode: sets ANTHROPIC_API_KEY (highest-precedence in SDK auth chain)
 * - subscription mode: clears ANTHROPIC_API_KEY plus any frozen OAuth shell
 *   tokens so the SDK falls all the way back to ~/.claude/.credentials.json,
 *   which has a working refresh path. A pre-existing CLAUDE_CODE_OAUTH_TOKEN
 *   in env (common when a process manager like PM2 inherited the launch shell)
 *   eventually 401s silently — clearing it here prevents that.
 *
 * CLAUDE_CODE_USE_BEDROCK / CLAUDE_CODE_USE_VERTEX are intentionally left
 * alone so users with multi-provider setups aren't disrupted.
 */
export function applyAuthToEnv(): void {
  const prefs = getAuthPreferences();
  if (prefs.auth_mode === 'api_key' && prefs.api_key) {
    process.env.ANTHROPIC_API_KEY = prefs.api_key;
  } else {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST;
  }
}

/**
 * Returns the effective model for a given role, with preference override
 * falling back to the YAML default.
 */
export function effectiveModel(role: 'interactive' | 'autonomous', yamlDefault: string): string {
  const prefs = getAuthPreferences();
  if (role === 'interactive') return prefs.preferred_model ?? yamlDefault;
  return prefs.preferred_model_autonomous ?? yamlDefault;
}

/**
 * Returns the API key prefix only — for display in the UI without leaking the full key.
 * e.g. 'sk-ant-api03-abc123...xyz'
 */
export function maskApiKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 16) return '***';
  return `${key.slice(0, 12)}...${key.slice(-4)}`;
}
