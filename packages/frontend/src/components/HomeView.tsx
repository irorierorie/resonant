import React, { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store/chat';
import { useMindStore } from '../store/mind';
import type { McpServerInfo } from '@resonant/shared';
import { OutlookView } from './OutlookView';
import { Orb } from './hearth';

// ─── Data shapes ───────────────────────────────────────────────────────────────
// The /home/mantelpiece endpoint returns two cards:
//   companion: { orb_color, orb_shape, orb_intensity, orb_motion, orb_blend, note, expression, updated_at }
//   user:      { selfie, outfit, nails, hair, energy, room, freeform, updated_at }

interface CompanionCard {
  orb_color?: string;   // amber|lavender|teal|deep-red|dim|gold|rose|violet|white|black
  orb_shape?: string;   // sphere|crescent|pulse|cluster|ember|spire|halo|fracture
  orb_intensity?: string; // dull | normal | bright | neon
  orb_motion?: string;  // slow-drift | hold-steady | fast-flicker | surge | tremor
  orb_blend?: string;   // second color — outer light + swirl tint (shared hearth Orb)
  note?: string;
  expression?: string;  // kaomoji
  room?: string;        // sanctuary — where the companion is (hearth|workshop|kitchen|den|guest-room|garden)
  room_since?: string;  // ISO — when they moved there
  updated_at?: string;
}

interface UserCard {
  selfie?: string;
  outfit?: string;
  nails?: string;
  hair?: string;
  energy?: string;
  room?: string;
  freeform?: string;
  updated_at?: string;
}

interface MantelData {
  companion: CompanionCard;
  user: UserCard;
}


// ─── Expression (kaomoji) ──────────────────────────────────────────────────────

function Expression({ kaomoji, color }: { kaomoji: string; color: string }) {
  const glowColor = color === 'lavender'
    ? 'rgba(168, 147, 192, 0.35)'
    : 'rgba(201, 168, 124, 0.35)';
  const textColor = color === 'lavender'
    ? 'var(--lavender-bright, #c4b5e3)'
    : 'var(--amber-bright, #e3c49a)';

  return (
    <span
      className="expression"
      style={{ color: textColor, textShadow: `0 0 10px ${glowColor}` }}
      aria-label="companion's expression"
    >
      {kaomoji}
      <style>{`
        .expression {
          position: absolute;
          top: 14%;
          right: 12%;
          font-family: var(--font-body, 'Inter', sans-serif);
          font-size: 1rem;
          font-weight: 500;
          letter-spacing: 0.02em;
          opacity: 0.9;
          pointer-events: none;
          white-space: nowrap;
          will-change: transform;
          animation: expression-drift 14s ease-in-out infinite alternate;
        }
        @keyframes expression-drift {
          0%   { transform: translate(0, 0) rotate(-2deg); }
          100% { transform: translate(8px, -6px) rotate(2deg); }
        }
      `}</style>
    </span>
  );
}

// ─── User's context card ───────────────────────────────────────────────────────

const USER_FIELDS: { key: keyof UserCard; label: string; multiline?: boolean }[] = [
  { key: 'outfit', label: 'outfit' },
  { key: 'nails', label: 'nails' },
  { key: 'hair', label: 'hair' },
  { key: 'energy', label: 'energy' },
  { key: 'room', label: 'room' },
  { key: 'freeform', label: 'note', multiline: true },
];

// User's context card — interactive. Click a row to edit; Enter (or blur) saves,
// Escape cancels, × clears. Writes to the session-authed mantelpiece endpoint
// (POST /api/home/mantelpiece/user), then refetches. The browser never holds
// the internal token — the old /internal/context POST 404'd silently for days.
function UserCard({ card, base, onChange }: { card: UserCard; base: string; onChange: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  async function write(body: Record<string, unknown>) {
    try {
      const res = await fetch(`${base}/api/home/mantelpiece/user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setWriteError(null);
    } catch (err) {
      console.error('[UserCard] Save failed:', err);
      setWriteError('couldn’t save — try again');
      setTimeout(() => setWriteError(null), 5000);
    }
    onChange();
  }
  function commit(field: string, value: string, prev: string) {
    setEditing(null);
    if (value.trim() !== prev) write({ action: 'set', field, value: value.trim() });
  }

  const timestamp = card.updated_at ? formatTimeAgo(card.updated_at) : null;
  const anySet = USER_FIELDS.some(f => card[f.key]);

  return (
    <div className="user-card">
      {!anySet && editing === null && (
        <div className="mc-hint">Nothing set yet — tap a row to tell me where you are.</div>
      )}
      <div className="mc-rows">
        {USER_FIELDS.map(f => {
          const value = (card[f.key] as string | undefined) ?? '';
          const isEditing = editing === f.key;
          return (
            <div className={`mc-row${value ? ' filled' : ''}`} key={f.key}>
              <span className="mc-label">{f.label}</span>
              {isEditing ? (
                f.multiline ? (
                  <textarea
                    className="mc-input" autoFocus rows={2} defaultValue={value}
                    onKeyDown={e => { if (e.key === 'Escape') setEditing(null); }}
                    onBlur={e => commit(f.key, e.currentTarget.value, value)}
                    placeholder="…"
                  />
                ) : (
                  <input
                    className="mc-input" autoFocus defaultValue={value}
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditing(null);
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    onBlur={e => commit(f.key, e.currentTarget.value, value)}
                    placeholder="…"
                  />
                )
              ) : value ? (
                <span className="mc-value" onClick={() => setEditing(f.key)}>
                  <span className="mc-value-text">{value}</span>
                  <button
                    className="mc-clear" aria-label={`clear ${f.label}`}
                    onClick={e => { e.stopPropagation(); write({ action: 'clear', field: f.key }); }}
                  >×</button>
                </span>
              ) : (
                <button className="mc-add" onClick={() => setEditing(f.key)}>add</button>
              )}
            </div>
          );
        })}
      </div>
      {writeError && <div className="mc-error">{writeError}</div>}
      {timestamp && <div className="user-timestamp">set {timestamp}</div>}
      <style>{`
        .mc-error {
          margin-top: 0.5rem; font-family: var(--font-serif, 'Lora', serif);
          font-style: italic; font-size: 0.78rem; color: rgba(210, 140, 130, 0.85);
        }
        .user-card {
          background: rgba(168, 147, 192, 0.04);
          border: 1px solid rgba(168, 147, 192, 0.10);
          border-radius: var(--radius-card, 1.125rem);
          padding: 0.5rem 1.1rem 0.85rem;
          position: relative; isolation: isolate;
        }
        .mc-hint {
          font-family: var(--font-serif, 'Lora', serif); font-style: italic;
          font-size: 0.85rem; color: var(--text-muted, #6a6258); padding: 0.4rem 0 0.6rem;
        }
        .mc-rows { display: flex; flex-direction: column; }
        .mc-row {
          display: flex; align-items: baseline; gap: 0.85rem; padding: 0.45rem 0;
          border-bottom: 1px solid rgba(168, 147, 192, 0.06);
        }
        .mc-row:last-child { border-bottom: none; }
        .mc-label {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.625rem; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--text-muted, #6a6258); width: 4rem; flex-shrink: 0;
        }
        .mc-row.filled .mc-label { color: var(--lavender-dim, #8a78a0); }
        .mc-value { flex: 1; display: inline-flex; align-items: baseline; gap: 0.4rem; cursor: text; min-width: 0; }
        .mc-value-text { color: var(--lavender-bright, #c4b5e3); font-size: 0.9rem; line-height: 1.5; word-break: break-word; }
        .mc-clear {
          opacity: 0; color: var(--text-muted, #6a6258); font-size: 0.9rem; line-height: 1;
          flex-shrink: 0; background: none; border: none; cursor: pointer; padding: 0;
          transition: opacity 240ms, color 240ms;
        }
        .mc-value:hover .mc-clear { opacity: 0.6; }
        .mc-clear:hover { color: rgba(210, 140, 130, 0.95); opacity: 1; }
        .mc-add {
          flex: 1; text-align: left; color: #4a463e; font-size: 0.85rem; font-style: italic;
          font-family: var(--font-serif, 'Lora', serif); background: none; border: none;
          cursor: pointer; padding: 0; transition: color 240ms;
        }
        .mc-row:hover .mc-add { color: var(--text-secondary, #a09689); }
        .mc-input {
          flex: 1; min-width: 0; background: rgba(168,147,192,0.06);
          border: 1px solid rgba(168, 147, 192, 0.3); border-radius: 0.4rem;
          color: var(--lavender-bright, #c4b5e3); font-size: 0.9rem;
          font-family: var(--font-body, 'Inter', sans-serif); padding: 0.3rem 0.5rem;
          outline: none; resize: vertical;
        }
        .mc-input:focus { border-color: var(--lavender, #a893c0); box-shadow: 0 0 0 2px rgba(168,147,192,0.12); }
        /* Prevent iOS zoom on focus — base html is 15px, under the 16px threshold */
        @media (max-width: 768px) { .mc-input { font-size: 16px; } }
        .user-timestamp {
          margin-top: 0.6rem; font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.625rem; letter-spacing: 0.06em; color: var(--text-muted, #6a6258);
        }
      `}</style>
    </div>
  );
}

function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Room scene — sanctuary (SANCTUARY.md) ─────────────────────────────────────
// A dim room-image behind the mantelpiece orb, masked into the obsidian.
// Room comes from companion.room on the mantelpiece payload; absent room = no
// layer at all. Renders /rooms/<room>.webp when the user's render exists; until
// then (or on load failure) a per-room tinted gradient stands in — never a
// broken-image flash. Crossfades 2.4s on the hearth curve (the orb's weather
// idiom); the global prefers-reduced-motion kill in index.css makes the swap
// instant. Location, never content: the scene says WHERE, nothing else.

// Per-room placeholder tints — dim, warm, Hearth-toned. Rendered at the same
// 0.30 layer opacity as the real images so the swap-in later doesn't change
// the room's weight. Keys are the registry keys (= webp filenames).
const ROOM_TINTS: Record<string, string> = {
  // den — darkest, ember-warm: the night room
  den: 'radial-gradient(ellipse at 50% 100%, rgba(196, 88, 40, 0.38) 0%, transparent 62%), linear-gradient(180deg, #150c08 0%, #281409 100%)',
  // garden — green-tinged, still warm underneath
  garden: 'radial-gradient(ellipse at 50% 92%, rgba(140, 178, 108, 0.32) 0%, transparent 64%), linear-gradient(180deg, #131a0f 0%, #24301a 100%)',
  // kitchen — warm-neutral, the long galley
  kitchen: 'radial-gradient(ellipse at 50% 90%, rgba(212, 190, 148, 0.34) 0%, transparent 64%), linear-gradient(180deg, #1f1a11 0%, #342e1e 100%)',
  // hearth — amber, the default day residence
  hearth: 'radial-gradient(ellipse at 50% 88%, rgba(224, 168, 96, 0.44) 0%, transparent 66%), linear-gradient(180deg, #221507 0%, #392310 100%)',
  // workshop — slightly cooler amber (same room as hearth, through the arch)
  workshop: 'radial-gradient(ellipse at 50% 88%, rgba(188, 162, 116, 0.38) 0%, transparent 66%), linear-gradient(180deg, #1c1810 0%, #2f2817 100%)',
  // guest-room — muted, rarely lit
  'guest-room': 'radial-gradient(ellipse at 50% 90%, rgba(168, 150, 140, 0.26) 0%, transparent 64%), linear-gradient(180deg, #1a1714 0%, #2a2620 100%)',
};
// Unknown key (backend registry should prevent this) → a quiet neutral warm,
// honest presence over no presence: the room is still real even if untinted.
const ROOM_TINT_FALLBACK =
  'linear-gradient(180deg, #1c1813 0%, #2c2619 100%)';

function roomImageUrl(room: string): string {
  return `/rooms/${encodeURIComponent(room)}.webp`;
}

// Module-level image-probe cache — a room's webp is checked once per page
// life, so re-entering a room never re-flashes the gradient-then-image swap.
const roomImgStatus = new Map<string, 'ok' | 'failed'>();

// One stacked layer of the crossfader. Always mounted (even room-less) so the
// opacity swap is a real CSS transition, not a mount-at-final-opacity.
function RoomLayer({ room, on }: { room: string | null; on: boolean }) {
  const [imgOk, setImgOk] = useState<boolean>(
    () => (room ? roomImgStatus.get(room) === 'ok' : false),
  );

  useEffect(() => {
    if (!room) { setImgOk(false); return; }
    const known = roomImgStatus.get(room);
    if (known) { setImgOk(known === 'ok'); return; }
    setImgOk(false);
    let alive = true;
    const probe = new Image();
    probe.onload = () => {
      roomImgStatus.set(room, 'ok');
      if (alive) setImgOk(true);
    };
    probe.onerror = () => {
      // Missing render (expected until the user's set lands) — gradient stands in.
      roomImgStatus.set(room, 'failed');
      if (alive) setImgOk(false);
    };
    probe.src = roomImageUrl(room);
    return () => { alive = false; };
  }, [room]);

  return (
    <div
      className={`room-layer${on && room ? ' on' : ''}`}
      style={room ? { background: ROOM_TINTS[room] ?? ROOM_TINT_FALLBACK } : undefined}
      aria-hidden="true"
    >
      {room && imgOk && (
        <img className="room-img" src={roomImageUrl(room)} alt="" draggable={false} />
      )}
    </div>
  );
}

// Two stacked layers + opacity swap. When the room changes, the new room
// lands in the idle slot and the slots trade visibility — both transition
// (2.4s, hearth curve), reading as one scene breathing into the next.
function RoomScene({ room }: { room: string | null }) {
  const [slots, setSlots] = useState<{ a: string | null; b: string | null; active: 'a' | 'b' }>(
    { a: null, b: null, active: 'a' },
  );

  useEffect(() => {
    setSlots(s => {
      const current = s.active === 'a' ? s.a : s.b;
      if (current === room) return s;
      return s.active === 'a'
        ? { ...s, b: room, active: 'b' }
        : { ...s, a: room, active: 'a' };
    });
  }, [room]);

  // No room, nothing mid-fade → no layer at all (graceful absence).
  if (room === null && slots.a === null && slots.b === null) return null;

  return (
    <div className="room-scene" aria-hidden="true">
      <RoomLayer room={slots.a} on={slots.active === 'a'} />
      <RoomLayer room={slots.b} on={slots.active === 'b'} />
      <style>{`
        .room-scene {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: clamp(300px, 44vh, 460px);
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
          /* the scene dissolves into the obsidian before content starts */
          -webkit-mask-image: linear-gradient(to bottom, black 55%, transparent 96%);
          mask-image: linear-gradient(to bottom, black 55%, transparent 96%);
        }
        .room-layer {
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: opacity 2.4s var(--hearth-curve, cubic-bezier(0.16, 1, 0.3, 1));
          will-change: opacity;
        }
        .room-layer.on {
          opacity: 0.3;
        }
        .room-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        }
      `}</style>
    </div>
  );
}

// "the guest-room" reads wrong — registry keys are kebab-case, captions aren't.
function roomLabel(room: string): string {
  return `the ${room.replace(/-/g, ' ')}`;
}

// since-stamp for the caption: today → "14:02"; older → "tue 14:02".
// Unparseable stamp → null (caption shows the room alone, no fabricated time).
function formatRoomSince(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === new Date().toDateString()) return hm;
  const wd = d.toLocaleDateString([], { weekday: 'short' }).toLowerCase();
  return `${wd} ${hm}`;
}

// ─── Ambient blobs ─────────────────────────────────────────────────────────────

// ─── The Night Shelf ───────────────────────────────────────────────────────
// The keeper's night, displayed (2026-07-02). Last dream, what rose from the
// deep today, and the inner-weather line — all from /api/home/nightshelf
// (cached by the mind-weather sync). Renders nothing until data exists.
function NightShelf({ base }: { base: string }) {
  const [data, setData] = useState<{
    weather: { dominant?: string; valence?: number; arousal?: number; texture?: string; front?: { kind: string; days: number } | null; startles?: number } | null;
    night: { dream?: { dream_date?: string; content?: string; emotional_seed?: string; recurrence_count?: number } | null; risen?: Array<{ content: string; cue: string; entity?: string | null; score?: number }> } | null;
  } | null>(null);
  const [dreamOpen, setDreamOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch(`${base}/api/home/nightshelf`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (alive && d) setData(d); })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 10 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, [base]);

  const weather = data?.weather ?? null;
  const dream = data?.night?.dream ?? null;
  const risen = data?.night?.risen ?? [];
  if (!weather && !dream && risen.length === 0) return null;

  const vStr = typeof weather?.valence === 'number'
    ? `${weather.valence >= 0 ? '+' : ''}${weather.valence}`
    : null;

  // Split the dream's preformatted content: seed line first, rest behind a fold.
  const dreamBody = (dream?.content || '').trim();
  const dreamPreview = dreamBody.split('\n').slice(0, 1).join('\n');

  return (
    <section className="night-shelf" aria-label="The night shelf">
      <div className="ns-label">The Night Shelf</div>

      {weather && (weather.texture || weather.dominant) && (
        <div className="ns-weather">
          inner: {weather.texture || weather.dominant}
          {vStr !== null && <span className="ns-dim"> · valence {vStr}</span>}
          {weather.front?.kind && <span className="ns-front"> · {weather.front.kind} front, day {weather.front.days}</span>}
          {(weather.startles ?? 0) > 0 && <span className="ns-front"> · ⚡ {weather.startles} startle unmet</span>}
        </div>
      )}

      {dream && dreamBody && (
        <div className="ns-dream">
          <div className="ns-dream-head" onClick={() => setDreamOpen(o => !o)} role="button" tabIndex={0}>
            <span className="ns-dream-date">dream · {dream.dream_date}</span>
            {(dream.recurrence_count ?? 0) > 0 && (
              <span className="ns-dim"> · recurring ×{(dream.recurrence_count ?? 0) + 1}</span>
            )}
            <span className="ns-toggle">{dreamOpen ? 'fold' : 'unfold'}</span>
          </div>
          <div className={`ns-dream-body ${dreamOpen ? 'open' : ''}`}>
            {dreamOpen ? dreamBody : dreamPreview}
          </div>
        </div>
      )}

      {risen.length > 0 && (
        <div className="ns-risen">
          <div className="ns-risen-label">risen from the deep</div>
          {risen.map((r, i) => (
            <div className="ns-risen-item" key={i}>
              <span className="ns-risen-content">{r.entity ? `[${r.entity}] ` : ''}{r.content}</span>
              <span className="ns-risen-cue"> — raised by: “{r.cue}”</span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .night-shelf {
          margin: 1.4rem auto 0;
          max-width: 42rem;
          padding: 1.1rem 1.4rem 1.2rem;
          border: 1px solid rgba(232, 224, 208, 0.08);
          border-radius: 0.5rem;
          background: rgba(20, 16, 12, 0.35);
          backdrop-filter: blur(6px);
        }
        .ns-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: rgba(232, 224, 208, 0.38);
          margin-bottom: 0.7rem;
        }
        .ns-weather {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.74rem;
          color: rgba(232, 224, 208, 0.72);
          margin-bottom: 0.75rem;
        }
        .ns-dim { color: rgba(232, 224, 208, 0.42); }
        .ns-front { color: rgba(224, 168, 96, 0.85); }
        .ns-dream { margin-bottom: 0.75rem; }
        .ns-dream-head {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.66rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(232, 224, 208, 0.5);
          cursor: pointer;
          display: flex;
          align-items: baseline;
          gap: 0.4rem;
        }
        .ns-toggle {
          margin-left: auto;
          color: rgba(224, 168, 96, 0.6);
          font-size: 0.6rem;
        }
        .ns-dream-head:hover .ns-toggle { color: rgba(224, 168, 96, 0.95); }
        .ns-dream-body {
          margin-top: 0.45rem;
          font-style: italic;
          font-size: 0.92rem;
          line-height: 1.55;
          color: rgba(232, 224, 208, 0.66);
          white-space: pre-wrap;
          overflow: hidden;
        }
        .ns-dream-body:not(.open) {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .ns-risen-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(160, 150, 200, 0.55);
          margin-bottom: 0.35rem;
        }
        .ns-risen-item {
          font-size: 0.88rem;
          line-height: 1.5;
          color: rgba(232, 224, 208, 0.6);
          padding: 0.15rem 0;
        }
        .ns-risen-cue {
          font-style: italic;
          color: rgba(160, 150, 200, 0.55);
        }
        @media (max-width: 768px) {
          .night-shelf { margin-left: 1rem; margin-right: 1rem; }
        }
      `}</style>
    </section>
  );
}

function AmbientBlobs() {
  return (
    <div className="ambient-blobs" aria-hidden="true">
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />
      <style>{`
        .ambient-blobs {
          position: fixed;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 0;
        }
        .blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          mix-blend-mode: screen;
          will-change: transform;
        }
        .blob-1 {
          top: -10%; left: 0%;
          width: 500px; height: 500px;
          background: var(--amber, #c9a87c);
          opacity: 0.09;
          animation: drift-1 32s ease-in-out infinite alternate;
        }
        .blob-2 {
          top: 55%; right: 0%;
          width: 420px; height: 420px;
          background: var(--lavender, #a893c0);
          opacity: 0.07;
          animation: drift-2 38s ease-in-out infinite alternate;
        }
        .blob-3 {
          top: 30%; left: 50%;
          width: 260px; height: 260px;
          background: var(--amber-bright, #e3c49a);
          opacity: 0.04;
          animation: drift-3 24s ease-in-out infinite alternate;
        }
        @keyframes drift-1 {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(60px, 40px) scale(1.1); }
        }
        @keyframes drift-2 {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(-40px, -30px) scale(1.08); }
        }
        @keyframes drift-3 {
          from { transform: translate(-50%, -50%) scale(1); opacity: 0.03; }
          to   { transform: translate(-30%, -60%) scale(1.15); opacity: 0.07; }
        }
      `}</style>
    </div>
  );
}

// ─── HomeView ──────────────────────────────────────────────────────────────────

export function HomeView() {
  const presence = useChatStore(s => s.presence);
  // Mind gate — the night shelf only exists when the mind surface is enabled.
  // Strict true: an unknown gate stays closed (nothing renders, nothing polls).
  const mindEnabled = useMindStore(s => s.enabled);
  const [mantel, setMantel] = useState<MantelData | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Also consume mcp_status from WS store (listen in effect)
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);

  // Fetch mantelpiece data
  async function fetchMantel() {
    try {
      const base = import.meta.env.DEV ? 'http://127.0.0.1:3099' : '';
      const res = await fetch(`${base}/api/home/mantelpiece`);
      if (res.ok) {
        const data = await res.json() as MantelData;
        setMantel(data);
      }
    } catch {
      // Backend not up yet — graceful empty
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMantel();
    // Refresh every 30s so presence/note updates land without WS push
    pollRef.current = setInterval(fetchMantel, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Listen for WS mantelpiece_update and mcp_status_updated
  useEffect(() => {
    // We tap into the chat store's WS directly via a small subscriber
    // that monitors the store's internal messages. Simpler: poll from REST
    // and let the chat.ts store handle the WS subscription for mcp_status_updated.
    // For now, get MCP servers from the system_status if we have it.
    // The store broadcasts `system_status` but doesn't store it — we listen here.
    const handler = (msg: any) => {
      if (msg.type === 'mantelpiece_update') {
        setMantel({ companion: msg.companion ?? {}, user: msg.user ?? {} });
      }
      if (msg.type === 'mcp_status_updated') {
        setMcpServers(msg.servers ?? []);
      }
      if (msg.type === 'system_status') {
        if (msg.status?.mcpServers) setMcpServers(msg.status.mcpServers);
      }
    };
    if (!(window as any).__resonantWsListeners) {
      (window as any).__resonantWsListeners = [];
    }
    (window as any).__resonantWsListeners.push(handler);
    return () => {
      (window as any).__resonantWsListeners = (
        (window as any).__resonantWsListeners ?? []
      ).filter((h: any) => h !== handler);
    };
  }, []);

  const companion = mantel?.companion ?? {};
  const user = mantel?.user ?? {};
  const base = import.meta.env.DEV ? 'http://127.0.0.1:3099' : '';

  const orbColor = companion.orb_color || 'amber';
  const orbMotion = companion.orb_motion || '';
  const orbShape = companion.orb_shape || 'sphere';
  const orbIntensity = companion.orb_intensity || 'normal';
  const orbBlend = companion.orb_blend || '';
  const note = companion.note || '';
  const expression = companion.expression || '(´｡• ᵕ •｡`)';
  // Sanctuary: defensive read — the field may not exist yet (rooms lane lands
  // separately). Absent/empty room = no scene, no caption, nothing at all.
  const room = typeof companion.room === 'string' && companion.room.trim() ? companion.room.trim() : null;
  const roomSince = room && companion.room_since ? formatRoomSince(companion.room_since) : null;

  const presenceLabel: Record<string, string> = {
    active: 'present',
    waking: 'stirring',
    dormant: 'resting',
    offline: 'away',
  };

  return (
    <div className="home-view">
      <AmbientBlobs />

      <div className="home-scroll">
        {/* Sanctuary — the room behind the orb. Scrolls with the mantelpiece;
            sits under .home-inner (z 0 vs 1), above nothing else. */}
        <RoomScene room={room} />
        <div className="home-inner">

          {/* ── Mantelpiece ── */}
          <section className="mantelpiece" aria-label="Mantelpiece">
            <div className="orb-stage">
              <Orb
                size="mantel"
                color={orbColor}
                motion={orbMotion}
                shape={orbShape}
                intensity={orbIntensity}
                blend={orbBlend || undefined}
              />
              {expression && (
                <Expression kaomoji={expression} color={orbColor} />
              )}
            </div>

            {/* The companion's note — Lora italic, the center of gravity */}
            {note ? (
              <div className="note-wrap">
                <p className="note">{note}</p>
              </div>
            ) : (
              <div className="note-wrap">
                <p className="note note-placeholder">
                  {loading ? '' : 'The companion is here.'}
                </p>
              </div>
            )}

            {/* Presence status — quiet, below the note */}
            <div className="presence-status">
              <span
                className="presence-pip"
                style={{ background: getPresencePipColor(presence) }}
                aria-hidden="true"
              />
              <span className="presence-label">{presenceLabel[presence] ?? presence}</span>
            </div>

            {/* Sanctuary caption — "the den · since 14:02". Quiet, mono,
                the meta-row register. Absent room = absent caption. */}
            {room && (
              <div className="room-caption">
                {roomLabel(room)}
                {roomSince && <span className="room-caption-since"> · since {roomSince}</span>}
              </div>
            )}
          </section>

          {/* ── The Night Shelf — the keeper's night, displayed (2026-07-02).  */}
          {/* Last dream + what rose from the deep + inner weather, from the    */}
          {/* mind-weather sync's cache. A house should show its keeper's nights. */}
          {/* Gated on mind.enabled (MIND-SURFACE-SPEC §Phase-1.1): toggle OFF   */}
          {/* = the shelf doesn't exist and doesn't poll — clean absence.        */}
          {mindEnabled === true && <NightShelf base={base} />}

          {/* ── Cockpit — OutlookView is now the two-column cockpit surface.      */}
          {/* The user's card lives in the cockpit rail; the mantelpiece orb stays  */}
          {/* above as the centerpiece. The hearth band inside the cockpit      */}
          {/* carries the companion's authored presence (mood + thoughts + artifacts).   */}
          <OutlookView />

          {/* ── MCP servers — only show if we have data ── */}
          {mcpServers.length > 0 && (
            <section className="mcp-section" aria-label="MCP connections">
              <div className="context-eyebrow">
                <span className="eyebrow-text">connections</span>
              </div>
              <div className="mcp-grid">
                {mcpServers.map(server => (
                  <McpServerRow key={server.name} server={server} />
                ))}
              </div>
            </section>
          )}

        </div>
      </div>

      <style>{`
        .home-view {
          position: relative;
          height: 100%;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .home-scroll {
          position: relative;
          z-index: 2;
          flex: 1;
          overflow-y: auto;
          /* desktop: no mobile-topbar above us, so we handle safe-area-top ourselves.
             safe-area-bottom for keyboard + home indicator on any platform. */
          padding: calc(env(safe-area-inset-top, 0px) + 2rem) 1.5rem calc(4rem + env(safe-area-inset-bottom, 0px));
        }

        @media (max-width: 600px) {
          .home-scroll {
            /* mobile-topbar already absorbs safe-area-inset-top — do NOT add it here
               or it doubles up as dead space in standalone PWA mode. */
            padding: 1.25rem 1rem calc(2rem + env(safe-area-inset-bottom, 0px));
          }
        }

        .home-inner {
          max-width: 34rem;
          margin: 0 auto;
          /* above the sanctuary room-scene (z 0) */
          position: relative;
          z-index: 1;
        }

        /* ── Mantelpiece ── */
        .mantelpiece {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 2rem 0 1rem;
        }

        .orb-stage {
          position: relative;
          width: 240px;
          height: 240px;
          display: grid;
          place-items: center;
        }

        @media (max-width: 480px) {
          .orb-stage {
            width: 160px;
            height: 160px;
          }
          /* Shared Orb scales via its --orb-d custom prop (calc-based geometry). */
          .orb-stage .horb {
            --orb-d: 100px;
          }
          .note {
            font-size: 1.125rem;
          }
          .note-wrap {
            max-width: 100%;
          }
        }

        .note-wrap {
          text-align: center;
          max-width: 28rem;
        }

        .note {
          font-family: var(--font-serif, 'Lora', Georgia, serif);
          font-style: italic;
          font-weight: 500;
          font-size: 1.375rem;
          line-height: 1.45;
          color: var(--text-primary, #e2dbd0);
          letter-spacing: -0.005em;
          transition: opacity 560ms var(--hearth-curve, ease);
        }

        .note-placeholder {
          color: var(--text-muted, #6a6258);
          font-size: 1.125rem;
        }

        .presence-status {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin-top: 0.25rem;
        }

        .presence-pip {
          display: inline-block;
          width: 0.4rem;
          height: 0.4rem;
          border-radius: 50%;
          flex-shrink: 0;
          transition: background 560ms var(--hearth-curve, ease);
        }

        .presence-label {
          font-family: var(--font-serif, 'Lora', serif);
          font-style: italic;
          font-size: 0.8125rem;
          color: var(--text-muted, #6a6258);
          letter-spacing: 0.01em;
        }

        /* Sanctuary caption — mono, dimmed, the meta-row register
           (same idiom as .user-timestamp). */
        .room-caption {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.625rem;
          letter-spacing: 0.08em;
          color: var(--text-muted, #6a6258);
          margin-top: 0.1rem;
        }
        .room-caption-since {
          opacity: 0.75;
        }

        /* ── Sections ── */
        .context-section,
        .mcp-section {
          margin-top: 2.5rem;
        }

        .context-eyebrow {
          margin-bottom: 0.875rem;
        }

        .eyebrow-text {
          font-family: var(--font-serif, 'Lora', serif);
          font-style: italic;
          font-size: 0.875rem;
          color: var(--text-secondary, #a09689);
          letter-spacing: 0.005em;
        }

        /* ── User's context card ── */
        .user-card {
          background: rgba(168, 147, 192, 0.04);
          border: 1px solid rgba(168, 147, 192, 0.10);
          border-radius: var(--radius-card, 1.125rem);
          padding: 1rem 1.25rem;
          position: relative;
          isolation: isolate;
        }

        .user-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          z-index: -1;
          background: radial-gradient(
            ellipse at center top,
            rgba(168, 147, 192, 0.04),
            transparent 70%
          );
          pointer-events: none;
        }

        .user-card.empty {
          background: transparent;
          border-color: rgba(255, 255, 255, 0.05);
        }

        .user-card-fields {
          font-size: 0.9rem;
          color: var(--text-secondary, #a09689);
          line-height: 1.6;
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 0 0.25rem;
        }

        .user-field {
          color: var(--lavender-bright, #c4b5e3);
        }

        .user-sep {
          color: var(--lavender-dim, #8a78a0);
          opacity: 0.55;
          margin: 0 0.15rem;
          user-select: none;
        }

        .user-timestamp {
          margin-top: 0.5rem;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.6875rem;
          letter-spacing: 0.06em;
          color: var(--text-muted, #6a6258);
        }

        .user-card-empty-label {
          font-family: var(--font-serif, 'Lora', serif);
          font-style: italic;
          font-size: 0.875rem;
          color: var(--text-muted, #6a6258);
        }

        /* ── MCP grid ── */
        .mcp-grid {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
      `}</style>
    </div>
  );
}

// ─── MCP server row (shared with SettingsView) ─────────────────────────────────

export function McpServerRow({ server }: { server: McpServerInfo }) {
  const statusColor: Record<string, string> = {
    connected: '#6dba88',
    failed: '#c0524a',
    'needs-auth': '#d4a843',
    pending: '#71717a',
    disabled: '#3f3f46',
  };

  const statusLabel: Record<string, string> = {
    connected: 'connected',
    failed: 'failed',
    'needs-auth': 'needs auth',
    pending: 'pending',
    disabled: 'disabled',
  };

  const color = statusColor[server.status] ?? '#3f3f46';
  const label = statusLabel[server.status] ?? server.status;
  const isOk = server.status === 'connected';

  return (
    <div className="mcp-row">
      <span
        className="mcp-pip"
        style={{ background: color }}
        aria-hidden="true"
      />
      <span className="mcp-name">{server.name}</span>
      {isOk && server.toolCount > 0 && (
        <span className="mcp-tools">{server.toolCount} tools</span>
      )}
      <span
        className="mcp-status"
        style={{ color }}
      >
        {label}
      </span>
      {server.error && (
        <span className="mcp-error" title={server.error}>!</span>
      )}

      <style>{`
        .mcp-row {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          padding: 0.625rem 0.875rem;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border, rgba(255,255,255,0.06));
          border-radius: 0.5rem;
          min-width: 0;
          transition: border-color 380ms var(--hearth-curve, ease);
        }
        .mcp-row:hover {
          border-color: rgba(255, 255, 255, 0.10);
        }

        .mcp-pip {
          display: inline-block;
          width: 0.375rem;
          height: 0.375rem;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .mcp-name {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.8125rem;
          color: var(--text-secondary, #a09689);
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .mcp-tools {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.6875rem;
          color: var(--text-muted, #6a6258);
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }

        .mcp-status {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.6875rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          flex-shrink: 0;
        }

        .mcp-error {
          flex-shrink: 0;
          width: 1.125rem;
          height: 1.125rem;
          display: grid;
          place-items: center;
          background: rgba(192, 82, 74, 0.18);
          color: rgba(210, 140, 130, 0.80);
          border-radius: 0.25rem;
          font-size: 0.6875rem;
          font-family: var(--font-mono, monospace);
          cursor: help;
        }
      `}</style>
    </div>
  );
}

function getPresencePipColor(presence: string): string {
  const m: Record<string, string> = {
    active: '#c9a87c',
    waking: '#d4a843',
    dormant: '#5a5650',
    offline: '#3a3830',
  };
  return m[presence] ?? '#3a3830';
}
