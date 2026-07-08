/**
 * Runtime theme store — live CSS-variable overrides, no rebuild.
 *
 * v1 did theming at build-time (copy a CSS file, @import it, rebuild). This
 * replaces that with instant `document.documentElement.style.setProperty`
 * injection, persisted server-side (GET/PUT /api/theme, backed by the same
 * `config` key/value store every other setting uses) and cached in
 * localStorage so a reload doesn't flash back to defaults while the fetch
 * is in flight.
 *
 * The token list here is the editable subset of packages/frontend/src/index.css
 * :root (~104 tokens total) — curated to the ones components actually
 * reference by bare name, so an override genuinely cascades. Mirrored on the
 * backend (THEME_TOKEN_ALLOWLIST in packages/backend/src/routes/api.ts) —
 * keep both lists in sync if the editable set ever changes.
 */
import { create } from 'zustand';

const BASE = import.meta.env.DEV ? 'http://127.0.0.1:3099' : '';
const CACHE_KEY = 'resonant.themeOverrides';

export type ThemeTokenKind = 'color' | 'font';

export interface ThemeToken {
  key: string;
  label: string;
  hint?: string;
  kind: ThemeTokenKind;
  /** The value baked into index.css :root — what "reset" returns to. */
  fallback: string;
}

export const THEME_TOKENS: ThemeToken[] = [
  // ── Backgrounds ──
  { key: '--bg-primary', label: 'Hearth floor', hint: 'Primary background', kind: 'color', fallback: '#0c0b09' },
  { key: '--bg-secondary', label: 'Surface', hint: 'Panels, rail, cards', kind: 'color', fallback: '#131210' },
  { key: '--bg-input', label: 'Input fields', kind: 'color', fallback: '#0f0e0c' },
  // ── Text ──
  { key: '--text-primary', label: 'Text — primary', kind: 'color', fallback: '#e2dbd0' },
  { key: '--text-secondary', label: 'Text — secondary', kind: 'color', fallback: '#a09689' },
  { key: '--text-muted', label: 'Text — muted', kind: 'color', fallback: '#6a6258' },
  // ── Border ──
  { key: '--border', label: 'Border tint', kind: 'color', fallback: 'rgba(255, 255, 255, 0.06)' },
  // ── Companion accent (amber family) ──
  { key: '--amber', label: 'Companion accent', hint: 'The being’s colour', kind: 'color', fallback: '#c9a87c' },
  { key: '--amber-bright', label: 'Companion accent — bright', hint: 'Hover / emphasis', kind: 'color', fallback: '#e3c49a' },
  // ── User accent (lavender family) ──
  { key: '--lavender', label: 'Your accent', kind: 'color', fallback: '#a893c0' },
  { key: '--lavender-bright', label: 'Your accent — bright', hint: 'Hover / emphasis', kind: 'color', fallback: '#c4b5e3' },
  // ── Shared / status ──
  { key: '--gold', label: 'Shared — champagne gold', hint: 'Reserved, joint moments', kind: 'color', fallback: '#c4a872' },
  { key: '--status-active', label: 'Status — active', kind: 'color', fallback: '#6dba88' },
  // ── Fonts ──
  { key: '--font-serif', label: 'Serif', hint: 'Headings, wordmark, editorial voice', kind: 'font', fallback: "'Lora', Georgia, 'Times New Roman', serif" },
  { key: '--font-body', label: 'Body', hint: 'Everyday text', kind: 'font', fallback: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" },
  { key: '--font-mono', label: 'Monospace', hint: 'Code, meta, timestamps', kind: 'font', fallback: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace" },
];

const TOKEN_KEYS = new Set(THEME_TOKENS.map(t => t.key));

// A few safe, hand-picked stacks per font role — kept small and deliberate
// rather than a free-text field, so a save can't wedge the UI in an unreadable
// font. Each entry's value is the full CSS font-family string to inject.
export const FONT_CHOICES: Record<'--font-serif' | '--font-body' | '--font-mono', Array<{ label: string; value: string }>> = {
  '--font-serif': [
    { label: 'Lora (default)', value: "'Lora', Georgia, 'Times New Roman', serif" },
    { label: 'Playfair Display', value: "'Playfair Display', Georgia, serif" },
    { label: 'Cormorant Garamond', value: "'Cormorant Garamond', Georgia, serif" },
    { label: 'Merriweather', value: "'Merriweather', Georgia, serif" },
    { label: 'Georgia (system)', value: "Georgia, 'Times New Roman', serif" },
  ],
  '--font-body': [
    { label: 'Inter (default)', value: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" },
    { label: 'Source Sans 3', value: "'Source Sans 3', -apple-system, sans-serif" },
    { label: 'Nunito Sans', value: "'Nunito Sans', -apple-system, sans-serif" },
    { label: 'System UI', value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" },
  ],
  '--font-mono': [
    { label: 'JetBrains Mono (default)', value: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace" },
    { label: 'Fira Code', value: "'Fira Code', ui-monospace, monospace" },
    { label: 'IBM Plex Mono', value: "'IBM Plex Mono', ui-monospace, monospace" },
    { label: 'System monospace', value: "ui-monospace, Menlo, Consolas, monospace" },
  ],
};

function applyToDom(overrides: Record<string, string>): void {
  const root = document.documentElement;
  // Clear every known token first so keys absent from `overrides` genuinely
  // fall back to the index.css default rather than lingering from a prior set.
  for (const key of TOKEN_KEYS) root.style.removeProperty(key);
  for (const [key, value] of Object.entries(overrides)) {
    if (TOKEN_KEYS.has(key) && value) root.style.setProperty(key, value);
  }
}

function writeCache(overrides: Record<string, string>): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(overrides)); } catch { /* best-effort */ }
}

interface ThemeState {
  overrides: Record<string, string>;
  /** True once the server round-trip has resolved (success or failure) — the
   *  editor can wait for this before rendering so it never shows a value
   *  about to be overwritten by the fetch. */
  loaded: boolean;
  /** Apply synchronously from localStorage, before the network fetch resolves
   *  — called at module init in main.tsx to avoid a flash of default theme. */
  loadCache: () => void;
  /** GET /api/theme, then apply + re-cache. */
  fetchTheme: () => Promise<void>;
  /** Live-apply one token (editor calls this per keystroke/pick) + re-cache.
   *  Does NOT hit the network — callers debounce their own PUT via saveTheme. */
  setToken: (key: string, value: string) => void;
  /** Replace the whole override set (used by reset). */
  applyAll: (overrides: Record<string, string>) => void;
  /** PUT /api/theme. Returns whether it succeeded. */
  saveTheme: (overrides: Record<string, string>) => Promise<boolean>;
  /** Clear every override, locally and server-side. */
  resetTheme: () => Promise<boolean>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  overrides: {},
  loaded: false,

  loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        applyToDom(parsed);
        set({ overrides: parsed });
      }
    } catch { /* corrupt cache — ignore, defaults stand */ }
  },

  async fetchTheme() {
    try {
      const res = await fetch(`${BASE}/api/theme`, { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { overrides?: Record<string, string> };
        get().applyAll(data.overrides ?? {});
      }
    } catch { /* offline / not-yet-up — cached or default theme stands */ }
    set({ loaded: true });
  },

  setToken(key, value) {
    const next = { ...get().overrides, [key]: value };
    document.documentElement.style.setProperty(key, value);
    set({ overrides: next });
    writeCache(next);
  },

  applyAll(overrides) {
    applyToDom(overrides);
    set({ overrides });
    writeCache(overrides);
  },

  async saveTheme(overrides) {
    try {
      const res = await fetch(`${BASE}/api/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ overrides }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async resetTheme() {
    get().applyAll({});
    return get().saveTheme({});
  },
}));

/** rgba()/hex → 6-digit hex, for seeding a native <input type="color">, which
 *  can't represent alpha. Alpha is dropped for display only — the stored
 *  override the user picks afterward is a plain opaque hex, same as every
 *  other token. Falls back to black on anything unparseable. */
export function toHexColor(value: string): string {
  const v = (value || '').trim();
  if (v.startsWith('#')) {
    if (v.length === 4) return '#' + [1, 2, 3].map(i => v[i] + v[i]).join('');
    if (v.length >= 7) return v.slice(0, 7);
    return '#000000';
  }
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    return '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('');
  }
  return '#000000';
}
