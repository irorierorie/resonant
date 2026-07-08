/**
 * Appearance section — runtime theme editor.
 *
 * Every row here is a bare CSS custom property from packages/frontend/src/index.css
 * :root. Changing a swatch or a font choice applies instantly across the whole
 * app (document.documentElement.style.setProperty — see ../../store/theme.ts)
 * and is saved (debounced) to GET/PUT /api/theme so it survives reload. No
 * rebuild, unlike v1's build-time "copy a CSS file + @import + rebuild" theming.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Group, Eyebrow, Btn, SaveIndicator } from './primitives';
import { useThemeStore, THEME_TOKENS, FONT_CHOICES, toHexColor, type ThemeToken } from '../../store/theme';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const COLOR_GROUPS: Array<{ label: string; sub?: string; keys: string[] }> = [
  { label: 'backgrounds', keys: ['--bg-primary', '--bg-secondary', '--bg-input'] },
  { label: 'text', keys: ['--text-primary', '--text-secondary', '--text-muted'] },
  { label: 'border', keys: ['--border'] },
  { label: 'companion', sub: 'amber', keys: ['--amber', '--amber-bright'] },
  { label: 'you', sub: 'lavender', keys: ['--lavender', '--lavender-bright'] },
  { label: 'shared & status', keys: ['--gold', '--status-active'] },
];

const FONT_KEYS = ['--font-serif', '--font-body', '--font-mono'] as const;

function tokenByKey(key: string): ThemeToken {
  return THEME_TOKENS.find(t => t.key === key) as ThemeToken;
}

const SAVE_DEBOUNCE_MS = 500;
const STATUS_HOLD_MS = 2200;

export function AppearanceSection() {
  const overrides = useThemeStore(s => s.overrides);
  const setToken = useThemeStore(s => s.setToken);
  const saveTheme = useThemeStore(s => s.saveTheme);
  const resetTheme = useThemeStore(s => s.resetTheme);

  const [status, setStatus] = useState<SaveStatus>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const holdStatus = useCallback((ok: boolean) => {
    setStatus(ok ? 'saved' : 'error');
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatus('idle'), STATUS_HOLD_MS);
  }, []);

  // Debounced persistence — every keystroke/pick applies live immediately
  // (via setToken below), but the network PUT waits for a pause so dragging a
  // colour picker doesn't fire a save per frame.
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setStatus('saving');
      const ok = await saveTheme(useThemeStore.getState().overrides);
      holdStatus(ok);
    }, SAVE_DEBOUNCE_MS);
  }, [saveTheme, holdStatus]);

  const effectiveValue = (key: string): string => overrides[key] ?? tokenByKey(key).fallback;

  const handleColorChange = (key: string, hex: string) => {
    setToken(key, hex);
    scheduleSave();
  };

  const handleFontChange = (key: string, value: string) => {
    setToken(key, value);
    scheduleSave();
  };

  const handleReset = async () => {
    clearTimers();
    setStatus('saving');
    const ok = await resetTheme();
    holdStatus(ok);
  };

  return (
    <div className="appearance-section">
      <Eyebrow label="appearance" sub="live — no rebuild" />
      <Group>
        <p className="appearance-lead">
          Colours and fonts here write straight into the hearth's own palette
          the instant you change them, and follow you on reload.
        </p>
      </Group>

      {COLOR_GROUPS.map(group => (
        <React.Fragment key={group.label}>
          <Eyebrow label={group.label} sub={group.sub} />
          <Group>
            {group.keys.map(key => {
              const token = tokenByKey(key);
              const value = effectiveValue(key);
              return (
                <div className="theme-row" key={key}>
                  <div className="theme-row-left">
                    <span className="theme-row-label">{token.label}</span>
                    {token.hint && <span className="theme-row-hint">{token.hint}</span>}
                  </div>
                  <div className="theme-row-control">
                    <span className="theme-row-value">{value}</span>
                    <input
                      type="color"
                      className="theme-color-input"
                      value={toHexColor(value)}
                      onChange={e => handleColorChange(key, e.target.value)}
                      aria-label={token.label}
                    />
                  </div>
                </div>
              );
            })}
          </Group>
        </React.Fragment>
      ))}

      <Eyebrow label="fonts" />
      <Group>
        {FONT_KEYS.map(key => {
          const token = tokenByKey(key);
          const value = effectiveValue(key);
          const choices = FONT_CHOICES[key];
          return (
            <div className="theme-row theme-row-font" key={key}>
              <div className="theme-row-left">
                <span className="theme-row-label" style={{ fontFamily: value }}>{token.label}</span>
                {token.hint && <span className="theme-row-hint">{token.hint}</span>}
              </div>
              <select
                className="sp-form-input theme-font-select"
                value={value}
                onChange={e => handleFontChange(key, e.target.value)}
                aria-label={token.label}
              >
                {choices.map(opt => (
                  <option key={opt.value} value={opt.value} style={{ fontFamily: opt.value }}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </Group>

      <div className="theme-actions">
        <SaveIndicator status={status} />
        <Btn variant="muted" small onClick={handleReset} disabled={status === 'saving'}>
          reset to defaults
        </Btn>
      </div>

      <style>{`
        .appearance-section { padding-bottom: 2rem; }

        .appearance-lead {
          font-family: var(--font-serif, 'Lora', serif);
          font-style: italic;
          font-size: 0.9rem;
          color: var(--text-secondary, #a09689);
          line-height: 1.6;
          padding: 0.875rem 0;
        }

        .theme-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.625rem 0;
          border-bottom: 1px solid rgba(255,255,255,0.055);
          flex-wrap: wrap;
        }
        .theme-row:last-child { border-bottom: none; }

        .theme-row-left {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
          min-width: 0;
        }
        .theme-row-label {
          font-size: 0.875rem;
          color: var(--text-secondary, #a09689);
        }
        .theme-row-hint {
          font-size: 0.6875rem;
          color: var(--text-muted, #6a6258);
          font-style: italic;
        }

        .theme-row-control {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          flex-shrink: 0;
        }
        .theme-row-value {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.6875rem;
          color: var(--text-muted, #6a6258);
          letter-spacing: 0.02em;
          min-width: 6.5rem;
          text-align: right;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .theme-color-input {
          appearance: none;
          -webkit-appearance: none;
          width: 2rem;
          height: 2rem;
          padding: 0;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 0.5rem;
          background: none;
          cursor: pointer;
          flex-shrink: 0;
          transition: transform 160ms var(--hearth-curve, ease), border-color 160ms var(--hearth-curve, ease);
        }
        .theme-color-input:hover { transform: scale(1.08); border-color: rgba(201,168,124,0.35); }
        .theme-color-input:active { transform: scale(0.94); }
        .theme-color-input::-webkit-color-swatch-wrapper { padding: 0; border-radius: 0.4375rem; }
        .theme-color-input::-webkit-color-swatch { border: none; border-radius: 0.4375rem; }
        .theme-color-input::-moz-color-swatch { border: none; border-radius: 0.4375rem; }

        .theme-row-font { align-items: flex-start; }
        .theme-font-select { max-width: 15rem; width: auto; }

        .theme-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.875rem;
          margin-top: 1.5rem;
        }
      `}</style>
    </div>
  );
}
