/**
 * Preferences section — full editable resonant.yaml via GET/PUT /api/preferences.
 * Identity · Model · Server · Write-gate · Integrations · Auth
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  Group,
  Eyebrow,
  TextField,
  ToggleRow,
  SaveIndicator,
  FieldRow,
  FormGroup,
} from './primitives';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Preferences {
  identity: {
    companion_name: string;
    user_name: string;
    timezone: string;
  };
  agent: {
    model: string;
    model_autonomous: string;
  };
  /** Read-only: PM2 pins PORT in env (ecosystem.config.cjs), which overrides
   *  resonant.yaml at boot — so the UI shows live truth instead of offering a
   *  save that would silently not take effect. */
  server?: {
    port?: number;
  };
  /** Write-gate roots — yaml-backed under hooks.* (the real config keys; the
   *  old `paths.*` shape never existed server-side and every save dropped). */
  hooks?: {
    workspace_root?: string;
    vault_path?: string;
    extra_write_paths?: string[];
  };
  orchestrator: {
    enabled: boolean;
    wake_prompts_path?: string;
  };
  voice: {
    enabled: boolean;
    elevenlabs_voice_id?: string;
  };
  discord: {
    enabled: boolean;
  };
  telegram: {
    enabled: boolean;
  };
  handoff?: {
    enabled: boolean;
  };
  integrations?: {
    mind_cloud?: {
      enabled: boolean;
      mcp_url?: string;
    };
  };
  auth: {
    has_password: boolean;
  };
}

function deepMerge(target: any, source: any): any {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof out[key] === 'object' &&
      out[key] !== null
    ) {
      out[key] = { ...out[key], ...source[key] };
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PreferencesSection({ base }: { base: string }) {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [dirty, setDirty] = useState(false);

  // Raw config editor (advanced — full resonant.yaml)
  const [rawOpen, setRawOpen] = useState(false);
  const [rawContent, setRawContent] = useState('');
  const [rawDraft, setRawDraft] = useState('');
  const [rawPath, setRawPath] = useState('');
  const [rawLoading, setRawLoading] = useState(false);
  const [rawStatus, setRawStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [rawError, setRawError] = useState('');

  // System-prompt frame (separate endpoint — applies live, no restart)
  const [sysConfigured, setSysConfigured] = useState(false);
  const [sysContent, setSysContent] = useState('');
  const [sysDraft, setSysDraft] = useState('');
  const [sysPath, setSysPath] = useState('');
  const [sysStatus, setSysStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    async function loadSys() {
      try {
        const res = await fetch(`${base}/api/prompts/system`);
        if (!res.ok) return;
        const data = await res.json();
        setSysConfigured(!!data.configured);
        setSysContent(data.content ?? '');
        setSysDraft(data.content ?? '');
        setSysPath(data.path ?? '');
      } catch { /* backend not up */ }
    }
    loadSys();
  }, [base]);

  const saveSystemPrompt = useCallback(async () => {
    setSysStatus('saving');
    try {
      const res = await fetch(`${base}/api/prompts/system`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: sysDraft }),
      });
      if (res.ok) { setSysContent(sysDraft); setSysStatus('saved'); }
      else setSysStatus('error');
    } catch { setSysStatus('error'); }
    setTimeout(() => setSysStatus('idle'), 2200);
  }, [base, sysDraft]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${base}/api/preferences`);
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.identity) {
          setPrefs(data as Preferences);
          setDraft(data as Preferences);
        }
      } catch { /* backend not yet up */ }
    }
    load();
  }, [base]);

  const patchDraft = useCallback((update: any) => {
    setDraft(prev => prev ? deepMerge(prev, update) as Preferences : null);
    setDirty(true);
  }, []);

  // Immediate-save toggle for booleans (matches old behaviour)
  const patchImmediate = useCallback(async (update: Partial<Preferences>) => {
    if (!draft) return;
    const merged = deepMerge(draft, update) as Preferences;
    setDraft(merged);
    setPrefs(merged);
    setSaveStatus('saving');
    try {
      const res = await fetch(`${base}/api/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      setSaveStatus(res.ok ? 'saved' : 'error');
    } catch {
      setSaveStatus('error');
    }
    setTimeout(() => setSaveStatus('idle'), 2200);
  }, [draft, base]);

  // Load raw config when disclosure opens
  useEffect(() => {
    if (!rawOpen) return;
    setRawLoading(true);
    fetch(`${base}/api/config/raw`)
      .then(r => r.json())
      .then(data => {
        setRawContent(data.content ?? '');
        setRawDraft(data.content ?? '');
        setRawPath(data.path ?? '');
      })
      .catch(() => {})
      .finally(() => setRawLoading(false));
  }, [rawOpen, base]);

  const saveRawConfig = useCallback(async () => {
    setRawStatus('saving');
    setRawError('');
    try {
      const res = await fetch(`${base}/api/config/raw`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: rawDraft }),
      });
      const data = await res.json();
      if (res.ok) {
        setRawContent(rawDraft);
        setRawStatus('saved');
      } else {
        setRawError(data.error || 'Save failed');
        setRawStatus('error');
      }
    } catch {
      setRawError('Network error');
      setRawStatus('error');
    }
    setTimeout(() => setRawStatus('idle'), 3200);
  }, [base, rawDraft]);

  const [saveError, setSaveError] = useState<string | null>(null);

  const saveAll = async () => {
    if (!draft) return;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const res = await fetch(`${base}/api/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (res.ok) {
        setPrefs(draft);
        setDirty(false);
        setSaveStatus('saved');
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(data.error ?? `Save failed (HTTP ${res.status})`);
        setSaveStatus('error');
      }
    } catch {
      setSaveError('Network error — nothing was saved');
      setSaveStatus('error');
    }
    setTimeout(() => setSaveStatus('idle'), 2200);
  };

  if (!draft) {
    return (
      <div className="prefs-loading">
        <span className="sp-empty-text">Loading preferences…</span>
      </div>
    );
  }

  const extraPaths = draft.hooks?.extra_write_paths?.join(', ') ?? '';

  return (
    <div className="prefs-section">

      {/* ── Identity ── */}
      <Eyebrow label="identity" />
      <Group>
        <div className="prefs-form-block">
          <TextField
            label="companion name"
            value={draft.identity.companion_name}
            onChange={v => patchDraft({ identity: { ...draft.identity, companion_name: v } })}
            mono
            restartRequired
          />
          <TextField
            label="user name"
            value={draft.identity.user_name}
            onChange={v => patchDraft({ identity: { ...draft.identity, user_name: v } })}
            mono
            restartRequired
          />
          <TextField
            label="timezone"
            value={draft.identity.timezone}
            onChange={v => patchDraft({ identity: { ...draft.identity, timezone: v } })}
            mono
            hint="IANA timezone string — e.g. Europe/London"
          />
        </div>
      </Group>

      {/* ── Model ── */}
      <Eyebrow label="model" />
      <Group>
        <div className="prefs-form-block">
          <TextField
            label="interactive model"
            value={draft.agent.model}
            onChange={v => patchDraft({ agent: { ...draft.agent, model: v } })}
            mono
            restartRequired
            hint="Used for live chat sessions"
          />
          <TextField
            label="autonomous model"
            value={draft.agent.model_autonomous}
            onChange={v => patchDraft({ agent: { ...draft.agent, model_autonomous: v } })}
            mono
            restartRequired
            hint="Used for orchestrator wake cycles"
          />
        </div>
      </Group>

      {/* ── System prompt frame ── */}
      <Eyebrow label="system prompt" />
      <Card>
        <div className="prefs-form-block">
          {sysConfigured ? (
            <div className="sysprompt-block">
              <div className="sysprompt-head">
                <span className="sysprompt-hint">
                  The lean operating frame, prepended before CLAUDE.md. Replaces the
                  Claude Code preset. <strong>Applies live — no restart.</strong>
                </span>
                {sysPath && <code className="sysprompt-path">{sysPath}</code>}
              </div>
              <textarea
                className="sysprompt-textarea"
                value={sysDraft}
                onChange={e => setSysDraft(e.target.value)}
                spellCheck={false}
                rows={18}
                aria-label="System prompt frame"
              />
              <div className="sysprompt-actions">
                <SaveIndicator status={sysStatus} />
                <button
                  className="sysprompt-save"
                  onClick={saveSystemPrompt}
                  disabled={sysDraft === sysContent || sysStatus === 'saving'}
                >
                  save frame
                </button>
              </div>
            </div>
          ) : (
            <span className="sp-empty-text">
              No system_prompt_file configured. Set agent.system_prompt_file in
              resonant.yaml to edit the frame here.
            </span>
          )}
        </div>
        <style>{`
          .sysprompt-block { display: flex; flex-direction: column; gap: 0.75rem; }
          .sysprompt-head { display: flex; flex-direction: column; gap: 0.375rem; }
          .sysprompt-hint {
            font-size: 0.8125rem; line-height: 1.5;
            color: var(--text-secondary, #a09689);
          }
          .sysprompt-hint strong { color: var(--amber, #c9a87c); font-weight: 500; }
          .sysprompt-path {
            font-family: var(--font-mono, monospace);
            font-size: 0.6875rem; color: var(--text-muted, #6a6258);
            opacity: 0.8; word-break: break-all;
          }
          .sysprompt-textarea {
            width: 100%; box-sizing: border-box; resize: vertical;
            min-height: 16rem;
            background: rgba(12, 11, 9, 0.6);
            border: 1px solid rgba(201, 168, 124, 0.14);
            border-radius: 0.5rem; padding: 0.875rem 1rem;
            color: var(--text-primary, #e2dbd0);
            font-family: var(--font-mono, 'JetBrains Mono', monospace);
            font-size: 0.78125rem; line-height: 1.6;
            transition: border-color 240ms var(--hearth-curve, ease);
          }
          .sysprompt-textarea:focus {
            outline: none;
            border-color: rgba(201, 168, 124, 0.45);
            box-shadow: 0 0 0 3px rgba(201, 168, 124, 0.07);
          }
          .sysprompt-actions {
            display: flex; align-items: center; justify-content: flex-end;
            gap: 0.875rem;
          }
          .sysprompt-save {
            font-size: 0.8125rem; font-weight: 500;
            color: var(--bg-primary, #0c0b09);
            background: var(--amber, #c9a87c);
            border: none; border-radius: 0.4375rem;
            padding: 0.4375rem 0.9375rem; cursor: pointer;
            transition: opacity 200ms var(--hearth-curve, ease), transform 100ms var(--hearth-curve, ease);
          }
          .sysprompt-save:hover:not(:disabled) { opacity: 0.9; }
          .sysprompt-save:active:not(:disabled) { transform: scale(0.985); }
          .sysprompt-save:disabled { opacity: 0.4; cursor: default; }
        `}</style>
      </Card>

      {/* ── Server ── */}
      <Eyebrow label="server" />
      <Group>
        {/* Honest read-only: PM2 pins PORT in env (ecosystem.config.cjs), which
            overrides resonant.yaml at boot — a save here would claim success
            and then silently not take effect. */}
        <FieldRow
          label="port"
          value={String(draft.server?.port ?? '—')}
          hint="read-only — pinned by PM2 env (PORT in ecosystem.config.cjs); a yaml save would be overridden at boot"
          mono
        />
      </Group>

      {/* ── Write-gate roots ── */}
      <Eyebrow label="write-gate roots" />
      <Group>
        <div className="prefs-form-block">
          <TextField
            label="workspace root"
            value={draft.hooks?.workspace_root ?? ''}
            onChange={v => patchDraft({ hooks: { ...(draft.hooks ?? {}), workspace_root: v } })}
            mono
            restartRequired
            hint="Primary write-allowed directory — absolute path, saved to resonant.yaml (hooks.workspace_root)"
          />
          <TextField
            label="vault path"
            value={draft.hooks?.vault_path ?? ''}
            onChange={v => patchDraft({ hooks: { ...(draft.hooks ?? {}), vault_path: v } })}
            mono
            restartRequired
            hint="Knowledge vault — absolute path, saved to resonant.yaml (hooks.vault_path)"
          />
          <TextField
            label="extra write paths"
            value={extraPaths}
            onChange={v => patchDraft({
              hooks: {
                ...(draft.hooks ?? {}),
                extra_write_paths: v.split(',').map(s => s.trim()).filter(Boolean),
              },
            })}
            restartRequired
            hint="Comma-separated absolute paths granted write access (hooks.extra_write_paths)"
          />
        </div>
      </Group>

      {/* ── Integrations ── */}
      <Eyebrow label="integrations" />
      <Group>
        <ToggleRow
          label="orchestrator"
          checked={draft.orchestrator.enabled}
          onChange={v => patchImmediate({ orchestrator: { ...draft.orchestrator, enabled: v } })}
          hint="Scheduled wakes and autonomous cycles"
        />
        <ToggleRow
          label="voice"
          checked={draft.voice.enabled}
          onChange={v => patchImmediate({ voice: { ...draft.voice, enabled: v } })}
        />
        <ToggleRow
          label="discord"
          checked={draft.discord.enabled}
          onChange={v => patchImmediate({ discord: { enabled: v } })}
        />
        <ToggleRow
          label="telegram"
          checked={draft.telegram.enabled}
          onChange={v => patchImmediate({ telegram: { enabled: v } })}
        />
        <ToggleRow
          label="daily handoff"
          checked={draft.handoff?.enabled ?? false}
          onChange={v => patchImmediate({ handoff: { enabled: v } })}
          hint="Midnight subagent carrying yesterday's daily into today"
        />
      </Group>

      {/* ── Orchestrator config ── */}
      <Eyebrow label="orchestrator config" />
      <Group>
        <div className="prefs-form-block">
          <TextField
            label="wake prompts path"
            value={draft.orchestrator.wake_prompts_path ?? ''}
            onChange={v => patchDraft({ orchestrator: { ...draft.orchestrator, wake_prompts_path: v } })}
            mono
            hint="Directory containing .md prompt files for scheduled wakes"
          />
        </div>
      </Group>

      {/* ── Voice config ── */}
      <Eyebrow label="voice config" />
      <Group>
        <div className="prefs-form-block">
          <TextField
            label="ElevenLabs voice ID"
            value={draft.voice.elevenlabs_voice_id ?? ''}
            onChange={v => patchDraft({ voice: { ...draft.voice, elevenlabs_voice_id: v } })}
            mono
            hint="Voice ID used for TTS — set ELEVENLABS_API_KEY in .env"
          />
        </div>
      </Group>

      {/* ── Mind Cloud integration ── */}
      <Eyebrow label="mind cloud" />
      <Group>
        <ToggleRow
          label="mind cloud enabled"
          checked={draft.integrations?.mind_cloud?.enabled ?? false}
          onChange={v => patchImmediate({
            integrations: {
              ...(draft.integrations ?? {}),
              mind_cloud: { ...(draft.integrations?.mind_cloud ?? { mcp_url: '' }), enabled: v },
            },
          })}
          hint="Connect to the remote Resonant Mind MCP"
        />
        <div className="prefs-form-block">
          <TextField
            label="MCP URL"
            value={draft.integrations?.mind_cloud?.mcp_url ?? ''}
            onChange={v => patchDraft({
              integrations: {
                ...(draft.integrations ?? {}),
                mind_cloud: { ...(draft.integrations?.mind_cloud ?? { enabled: false }), mcp_url: v },
              },
            })}
            mono
            hint="wss:// or https:// endpoint for the Mind MCP server"
          />
        </div>
      </Group>

      {/* ── Auth ── */}
      <Eyebrow label="auth" />
      <Group>
        <FieldRow
          label="password"
          value={draft.auth.has_password ? 'set' : 'none'}
        />
      </Group>

      {/* ── Raw config (advanced) ── */}
      <div className="raw-cfg-disclosure">
        <button
          className="raw-cfg-toggle"
          onClick={() => setRawOpen(o => !o)}
          aria-expanded={rawOpen}
        >
          <span className="raw-cfg-toggle-label">raw config — advanced (full resonant.yaml)</span>
          <span className="raw-cfg-chevron" aria-hidden="true">{rawOpen ? '▾' : '▸'}</span>
        </button>

        {rawOpen && (
          <div className="raw-cfg-body">
            <div className="raw-cfg-warning">
              Direct edit of the full config file. All changes require a server restart.
              The current file is backed up automatically before each save.
            </div>
            {rawPath && <code className="raw-cfg-path">{rawPath}</code>}
            {rawLoading ? (
              <div className="raw-cfg-spinner-wrap"><SaveIndicator status="saving" /></div>
            ) : (
              <textarea
                className="raw-cfg-textarea"
                value={rawDraft}
                onChange={e => setRawDraft(e.target.value)}
                spellCheck={false}
                rows={28}
                aria-label="Raw YAML config"
              />
            )}
            {rawError && <div className="raw-cfg-error">{rawError}</div>}
            <div className="raw-cfg-actions">
              <SaveIndicator status={rawStatus} />
              <button
                className="sysprompt-save"
                onClick={saveRawConfig}
                disabled={rawLoading || rawDraft === rawContent || rawStatus === 'saving'}
              >
                save config
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Save bar ── */}
      <div className="prefs-save-bar">
        {saveError && <span className="prefs-save-error">{saveError}</span>}
        <SaveIndicator status={saveStatus} />
        {dirty && (
          <button className="sp-btn sp-btn-primary" onClick={saveAll} disabled={saveStatus === 'saving'}>
            {saveStatus === 'saving' ? 'saving…' : 'save changes'}
          </button>
        )}
      </div>

      <style>{`
        .prefs-section { padding-bottom: 2rem; }

        .prefs-loading {
          padding: 2rem 0;
        }

        .prefs-form-block {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 0.875rem 0;
        }

        .prefs-save-bar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.75rem;
          margin-top: 1.5rem;
        }

        .prefs-save-error {
          font-size: 0.75rem;
          font-style: italic;
          color: rgba(210, 140, 130, 0.9);
          margin-right: auto;
          line-height: 1.4;
        }

        /* ── Raw config disclosure ── */
        .raw-cfg-disclosure {
          margin-top: 2rem;
          border: 1px solid rgba(255,255,255,0.055);
          border-radius: 0.625rem;
          overflow: hidden;
        }

        .raw-cfg-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 0.75rem 1rem;
          background: rgba(255,255,255,0.015);
          border: none;
          cursor: pointer;
          transition: background 150ms var(--hearth-curve, ease);
        }
        .raw-cfg-toggle:hover { background: rgba(255,255,255,0.03); }

        .raw-cfg-toggle-label {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.6875rem;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--text-muted, #6a6258);
        }

        .raw-cfg-chevron {
          font-size: 0.75rem;
          color: var(--text-muted, #6a6258);
          transition: transform 160ms var(--hearth-curve, ease);
        }

        .raw-cfg-body {
          padding: 0.875rem 1rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          border-top: 1px solid rgba(255,255,255,0.04);
        }

        .raw-cfg-warning {
          font-size: 0.8125rem;
          line-height: 1.5;
          color: var(--text-secondary, #a09689);
          padding: 0.625rem 0.875rem;
          background: rgba(212,168,67,0.06);
          border: 1px solid rgba(212,168,67,0.16);
          border-radius: 0.4375rem;
        }

        .raw-cfg-path {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.6875rem;
          color: var(--text-muted, #6a6258);
          word-break: break-all;
        }

        .raw-cfg-textarea {
          width: 100%;
          box-sizing: border-box;
          resize: vertical;
          min-height: 20rem;
          background: rgba(12, 11, 9, 0.7);
          border: 1px solid rgba(201, 168, 124, 0.10);
          border-radius: 0.5rem;
          padding: 0.875rem 1rem;
          color: var(--text-primary, #e2dbd0);
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.75rem;
          line-height: 1.65;
          transition: border-color 240ms var(--hearth-curve, ease);
        }
        .raw-cfg-textarea:focus {
          outline: none;
          border-color: rgba(201, 168, 124, 0.35);
          box-shadow: 0 0 0 3px rgba(201, 168, 124, 0.06);
        }

        .raw-cfg-error {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.75rem;
          color: rgba(210,140,130,0.9);
          line-height: 1.45;
          padding: 0.5rem 0.75rem;
          background: rgba(210,100,90,0.07);
          border: 1px solid rgba(210,100,90,0.20);
          border-radius: 0.4375rem;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .raw-cfg-spinner-wrap {
          display: flex;
          justify-content: center;
          padding: 1.5rem 0;
        }

        .raw-cfg-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.875rem;
        }
      `}</style>
    </div>
  );
}
