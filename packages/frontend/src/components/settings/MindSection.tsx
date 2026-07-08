/**
 * MindSection — Settings → Integrations: the Mind card (MIND-SURFACE-SPEC §Phase-1.1).
 *
 * Three fields: mind.enabled (toggle) · mind.url (base URL) · mind.api_key
 * (write-only secret). Saves through the existing DB-config endpoint
 * (PUT /api/settings { key, value }); reads through GET /api/settings.
 *
 * KEY HONESTY (load-bearing):
 *   - The key input is WRITE-ONLY. Once a key is set it renders as a
 *     fingerprint (••••last4) and the input is never pre-filled with the
 *     real value. If the backend already masks the value server-side (the
 *     Lane-A/Hale gate), a value that arrives pre-masked is shown as-is.
 *   - This component never logs, echoes, or re-renders the full key.
 *
 * After any save the mind store re-fetches, so the sidebar /mind entry and
 * the Home night shelf gate ripple live — no reload needed. (The backend's
 * own polls pick the toggle up on their next tick.)
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Group, Eyebrow, TextField, ToggleRow, SaveIndicator, Btn } from './primitives';
import { useMindStore } from '../../store/mind';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Reduce whatever the config map carries to a display fingerprint.
 *  Already-masked values (server-side masking) pass through untouched;
 *  a raw value is reduced to ••••last4 and the raw string is dropped. */
function fingerprintOf(value: string | undefined): string | null {
  if (!value) return null;
  if (value.includes('•')) return value;
  return `••••${value.slice(-4)}`;
}

export function MindSection({ base }: { base: string }) {
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const [keyFingerprint, setKeyFingerprint] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const refreshGate = useCallback(() => {
    void useMindStore.getState().fetchSurface();
  }, []);

  // ── Load current values ────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${base}/api/settings`, { credentials: 'include' });
        if (!res.ok) return;
        const { config } = (await res.json()) as { config?: Record<string, string> };
        if (!alive || !config) return;
        setEnabled(config['mind.enabled'] === 'true');
        setUrl(config['mind.url'] ?? '');
        setSavedUrl(config['mind.url'] ?? '');
        // Fingerprint only — the raw value (if the backend sent one) is
        // reduced immediately and never kept.
        setKeyFingerprint(fingerprintOf(config['mind.api_key']));
      } catch { /* backend not up — card stays empty-honest */ }
      finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [base]);

  // ── Save helper ────────────────────────────────────────────────────────
  const saveKeyValue = useCallback(async (key: string, value: string): Promise<boolean> => {
    setStatus('saving');
    setError(null);
    try {
      const res = await fetch(`${base}/api/settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setError(d.error ?? 'Could not save — try again.');
        setStatus('error');
        setTimeout(() => setStatus('idle'), 2600);
        return false;
      }
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2200);
      return true;
    } catch {
      setError('Could not reach the backend.');
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2600);
      return false;
    }
  }, [base]);

  const handleToggle = async (v: boolean) => {
    setEnabled(v); // optimistic — reverted on failure
    const ok = await saveKeyValue('mind.enabled', v ? 'true' : 'false');
    if (!ok) setEnabled(!v);
    else refreshGate();
  };

  const handleSaveUrl = async () => {
    const ok = await saveKeyValue('mind.url', url.trim());
    if (ok) { setSavedUrl(url.trim()); refreshGate(); }
  };

  const handleSaveKey = async () => {
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    const ok = await saveKeyValue('mind.api_key', trimmed);
    if (ok) {
      setKeyFingerprint(`••••${trimmed.slice(-4)}`);
      setKeyDraft('');
      setEditingKey(false);
      refreshGate();
    }
  };

  if (!loaded) {
    return (
      <div className="mind-card">
        <Eyebrow label="mind" />
        <span className="sp-empty-text">Loading…</span>
      </div>
    );
  }

  return (
    <div className="mind-card">
      <Eyebrow label="mind" sub={enabled ? 'window open' : 'off'} />

      {/* The seam, one sentence (spec §Phase-1.3) — ships with the card. */}
      <p className="mind-seam-note">
        Your mind stays wherever it lives — Resonant is the window, never the
        container; point it at a resonant-mind URL, or toggle this off and the
        house simply doesn't have that window.
      </p>

      <Group>
        <ToggleRow
          label="mind surface"
          checked={enabled}
          onChange={v => void handleToggle(v)}
          hint="Gates everything mind-shaped — the /mind room, the night shelf, the orb weather sync, the env push"
        />

        <div className="mind-fields">
          <div className="mind-url-row">
            <TextField
              label="mind URL"
              value={url}
              onChange={setUrl}
              mono
              placeholder="https://your-mind.example.dev"
              hint="Base URL of the resonant-mind API (no key in the URL)"
            />
            {url.trim() !== savedUrl && (
              <div className="mind-field-save">
                <Btn variant="primary" small onClick={() => void handleSaveUrl()} disabled={status === 'saving'}>
                  save URL
                </Btn>
              </div>
            )}
          </div>

          <div className="mind-key-block">
            <span className="sp-form-label">API key</span>
            {keyFingerprint && !editingKey ? (
              <div className="mind-key-set">
                <span className="mind-key-fingerprint">{keyFingerprint}</span>
                <button
                  type="button"
                  className="mind-key-replace"
                  onClick={() => setEditingKey(true)}
                >
                  replace key
                </button>
              </div>
            ) : (
              <div className="mind-key-entry">
                <input
                  type="password"
                  className="sp-form-input mono"
                  value={keyDraft}
                  onChange={e => setKeyDraft(e.target.value)}
                  placeholder="paste the mind API key"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Mind API key"
                />
                <Btn
                  variant="primary"
                  small
                  onClick={() => void handleSaveKey()}
                  disabled={!keyDraft.trim() || status === 'saving'}
                >
                  save key
                </Btn>
                {keyFingerprint && (
                  <Btn variant="ghost" small onClick={() => { setEditingKey(false); setKeyDraft(''); }}>
                    cancel
                  </Btn>
                )}
              </div>
            )}
            <span className="sp-form-hint">
              Write-only — stored server-side, shown here only as a fingerprint.
              The browser never holds the full key after saving.
            </span>
          </div>
        </div>
      </Group>

      <div className="mind-feedback">
        {error && <span className="mind-err" role="alert">{error}</span>}
        <SaveIndicator status={status} />
      </div>

      <style>{`
        .mind-card { margin-bottom: 1.5rem; }
        .mind-seam-note {
          font-size: 0.8125rem;
          font-style: italic;
          line-height: 1.55;
          color: var(--text-muted, #6a6258);
          margin: 0 0 0.375rem;
        }
        .mind-fields {
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
          padding: 0.875rem 0;
        }
        .mind-url-row { display: flex; flex-direction: column; gap: 0.4375rem; }
        .mind-field-save { display: flex; justify-content: flex-end; }
        .mind-key-block {
          display: flex;
          flex-direction: column;
          gap: 0.3125rem;
        }
        .mind-key-set {
          display: flex;
          align-items: center;
          gap: 0.625rem;
        }
        .mind-key-fingerprint {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.8125rem;
          letter-spacing: 0.06em;
          color: var(--amber-bright, #e3c49a);
        }
        .mind-key-replace {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 0.25rem;
          cursor: pointer;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.6875rem;
          letter-spacing: 0.04em;
          color: var(--text-muted, #6a6258);
          padding: 0.125rem 0.375rem;
          transition: color 150ms ease, border-color 150ms ease;
        }
        .mind-key-replace:hover {
          color: var(--text-secondary, #a09689);
          border-color: rgba(255,255,255,0.13);
        }
        .mind-key-entry {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .mind-key-entry .sp-form-input { flex: 1; min-width: 12rem; }
        .mind-feedback {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.75rem;
          min-height: 1.25rem;
          margin-top: 0.25rem;
        }
        .mind-err {
          font-size: 0.8125rem;
          font-style: italic;
          color: rgba(210,140,130,0.85);
          margin-right: auto;
        }
      `}</style>
    </div>
  );
}
