import React, { Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { ChatView, ThreadSidebar } from './components/ChatView';
import { HomeView } from './components/HomeView';
import { CommandPalette } from './components/CommandPalette';
import { CommandCenterView } from './components/CommandCenterView';
import { LoginView } from './components/LoginView';
import { useChatStore } from './store/chat';
import { useAuthStore } from './store/auth';
import { useMindStore } from './store/mind';
import { useThemeStore } from './store/theme';
import { ConfirmProvider } from './components/ConfirmDialog';

// ─── Cold routes — lazy-loaded on first visit ──────────────────────────────────
// /home and /chat are the hot path and stay eager; these three only fetch their
// chunk when the route is entered. All are named exports, hence the .then shims.

const SettingsView = React.lazy(() =>
  import('./components/SettingsView').then(m => ({ default: m.SettingsView }))
);
const CanvasView = React.lazy(() =>
  import('./components/Canvas').then(m => ({ default: m.CanvasView }))
);
const FilesView = React.lazy(() =>
  import('./components/FilesView').then(m => ({ default: m.FilesView }))
);
const MindView = React.lazy(() =>
  import('./components/MindView').then(m => ({ default: m.MindView }))
);
const ObservatoryView = React.lazy(() =>
  import('./components/observatory/ObservatoryView').then(m => ({ default: m.ObservatoryView }))
);

// Suspense fallback while a lazy route chunk loads — same quiet amber pulse as
// the auth gate, held inside the app-content pane so the rail/topbar stay put.
function RouteFallback() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      background: 'var(--bg-primary, #0c0b09)',
    }}>
      <div style={{
        width: '0.375rem',
        height: '0.375rem',
        borderRadius: '50%',
        background: 'var(--amber-dim, #a08960)',
        animation: 'route-pulse 1.4s ease-in-out infinite',
      }} />
      <style>{`
        @keyframes route-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50%       { opacity: 1;   transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

// ─── Nav icons ────────────────────────────────────────────────────────────────
// Plain stroked glyphs, reused in both the desktop rail and the mobile drawer.

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.625" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.625" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}
function CommandIcon() {
  // Sliders — the operating surface. Matches the stroked-glyph set.
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.625" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}
function CanvasIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.625" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}
function MindIcon() {
  // Brain — two hemispheres, midline, one gyrus. Stroked-glyph set.
  // (Was a crescent; it read as a moon.)
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.625" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
    </svg>
  );
}
function FilesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.625" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.625" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

const NAV_ITEMS = [
  { to: '/home', label: 'Home', Icon: HomeIcon, orb: true },
  { to: '/command', label: 'Command Center', Icon: CommandIcon, orb: false },
  // /mind sits beside /command but only exists when the mind surface is
  // enabled — filtered in NavLinks (MIND-SURFACE-SPEC: clean absence, the
  // house simply doesn't have that window when the toggle is off).
  { to: '/mind', label: 'Mind', Icon: MindIcon, orb: false },
  { to: '/chat', label: 'Chat', Icon: ChatIcon, orb: false },
  { to: '/canvas', label: 'Canvas', Icon: CanvasIcon, orb: false },
  { to: '/files', label: 'Files', Icon: FilesIcon, orb: false },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon, orb: false },
];

const PRESENCE_COLOR: Record<string, string> = {
  active: '#c9a87c',
  waking: '#d4a843',
  dormant: '#5a5650',
  offline: '#3a3830',
};

// ─── Nav links — shared between desktop rail and mobile drawer ─────────────────

function NavLinks({ variant, onNavigate }: { variant: 'rail' | 'drawer'; onNavigate?: () => void }) {
  const presence = useChatStore(s => s.presence);
  const dotColor = PRESENCE_COLOR[presence] ?? '#3a3830';
  // /mind is present only when the mind surface is enabled (strictly true —
  // an unknown gate stays closed; no entry flickers in before the answer).
  const mindEnabled = useMindStore(s => s.enabled);
  const items = NAV_ITEMS.filter(item => item.to !== '/mind' || mindEnabled === true);

  return (
    <>
      {items.map(({ to, label, Icon, orb }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `navlink navlink-${variant}${isActive ? ' active' : ''}`}
          aria-label={label}
          title={label}
          onClick={onNavigate}
        >
          <span className="navlink-icon">
            {orb && (
              <span className="nav-orb-dot" style={{ background: dotColor }} aria-hidden="true" />
            )}
            <Icon />
          </span>
          {variant === 'drawer' && <span className="navlink-label">{label}</span>}
        </NavLink>
      ))}
    </>
  );
}

// ─── Desktop left rail ─────────────────────────────────────────────────────────

function NavRail() {
  return (
    <nav className="nav-rail" aria-label="Primary navigation">
      <NavLinks variant="rail" />
    </nav>
  );
}

// ─── Mobile presence dot ───────────────────────────────────────────────────────

function PresenceDot() {
  const presence = useChatStore(s => s.presence);
  const color = PRESENCE_COLOR[presence] ?? '#3a3830';
  return <span className="topbar-presence" style={{ background: color }} aria-label={`Companion: ${presence}`} />;
}

// ─── Mobile top bar — the ONE hamburger ────────────────────────────────────────

function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="mobile-topbar">
      <button className="topbar-menu" onClick={onMenu} aria-label="Open menu" type="button">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
      </button>
      <span className="topbar-wordmark">resonant</span>
      <PresenceDot />
    </header>
  );
}

// ─── Mobile drawer — nav + (on chat) the chats list ────────────────────────────

function MobileDrawer({ open, onClose, isChat }: { open: boolean; onClose: () => void; isChat: boolean }) {
  return (
    <div className={`mobile-drawer-root${open ? ' open' : ''}`} aria-hidden={!open}>
      <button className="drawer-scrim" onClick={onClose} aria-label="Close menu" tabIndex={open ? 0 : -1} />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label="Navigation and chats">
        <nav className="drawer-nav" aria-label="Primary navigation">
          <NavLinks variant="drawer" onNavigate={onClose} />
        </nav>

        {isChat && (
          <>
            <div className="drawer-divider" aria-hidden="true" />
            <div className="drawer-chats">
              <ThreadSidebar onClose={onClose} />
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

// ─── Update pill — shown when the backend has a newer build than the baked JS ──
// Appears bottom-centre on any surface. Tap reloads. Never auto-reloads while the
// user might be mid-conversation; auto-reload only fires if the page is hidden/idle.

const UPDATE_CHECK_THROTTLE_MS = 30_000; // not more than once per 30 s

function useVersionCheck(onUpdateAvailable: (buildId?: string) => void) {
  const lastCheckRef = React.useRef<number>(0);

  const check = React.useCallback(async () => {
    const now = Date.now();
    if (now - lastCheckRef.current < UPDATE_CHECK_THROTTLE_MS) return;
    lastCheckRef.current = now;
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as { buildId?: string };
      if (data.buildId && data.buildId !== 'dev' && data.buildId !== __BUILD_ID__) {
        onUpdateAvailable(data.buildId);
      }
    } catch {
      // network error — silent, we'll retry next visibility
    }
  }, [onUpdateAvailable]);

  useEffect(() => {
    // Check once on mount
    void check();

    // Re-check whenever the tab becomes visible
    function onVisibility() {
      if (document.visibilityState === 'visible') void check();
    }
    document.addEventListener('visibilitychange', onVisibility);

    // Also surface the pill when the SW signals a new worker took control
    function onSwUpdated() { onUpdateAvailable(); }
    window.addEventListener('resonant:sw-updated', onSwUpdated);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resonant:sw-updated', onSwUpdated);
    };
  }, [check, onUpdateAvailable]);
}

function UpdatePill({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="update-pill"
      role="status"
      aria-live="polite"
      onClick={() => window.location.reload()}
    >
      <span className="update-pill-text">new version — reload</span>
      <button
        type="button"
        className="update-pill-x"
        aria-label="Dismiss update notice"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
      >
        ×
      </button>
      <style>{`
        .update-pill {
          position: fixed;
          bottom: calc(env(safe-area-inset-bottom, 0px) + 5.5rem);
          left: 50%;
          transform: translateX(-50%);
          z-index: 9000;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1.125rem;
          background: rgba(15, 14, 12, 0.55);
          border: 1px solid rgba(201, 168, 124, 0.28);
          border-radius: 2rem;
          backdrop-filter: blur(16px) saturate(1.05);
          -webkit-backdrop-filter: blur(16px) saturate(1.05);
          box-shadow:
            0 4px 20px -4px rgba(0, 0, 0, 0.55),
            0 0 0 1px rgba(201, 168, 124, 0.06);
          cursor: pointer;
          white-space: nowrap;
          animation: pill-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .update-pill:hover {
          border-color: rgba(201, 168, 124, 0.45);
          box-shadow:
            0 4px 24px -4px rgba(0, 0, 0, 0.65),
            0 0 0 1px rgba(201, 168, 124, 0.12);
        }
        .update-pill:active {
          transform: translateX(-50%) scale(0.985) translateY(0.5px);
        }
        .update-pill-text {
          font-family: var(--font-serif, 'Lora', serif);
          font-style: italic;
          font-size: 0.8125rem;
          color: var(--amber, #c9a87c);
          line-height: 1;
          letter-spacing: 0.015em;
        }
        .update-pill-x {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1.125rem;
          height: 1.125rem;
          margin: -0.25rem -0.375rem -0.25rem 0;
          padding: 0;
          border: none;
          background: transparent;
          color: var(--amber, #c9a87c);
          opacity: 0.55;
          font-size: 1.05rem;
          line-height: 1;
          cursor: pointer;
          border-radius: 999px;
          transition: opacity 140ms ease, background-color 140ms ease;
        }
        .update-pill-x:hover {
          opacity: 1;
          background: rgba(201, 168, 124, 0.14);
        }
        @keyframes pill-in {
          from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.97); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  );
}

// ─── App shell — only mounts when authenticated ────────────────────────────────

function AppShell() {
  const connect = useChatStore(s => s.connect);
  const disconnect = useChatStore(s => s.disconnect);
  const location = useLocation();
  const isChat = location.pathname.startsWith('/chat');

  const [drawerOpen, setDrawerOpen] = useState(false);
  // Holds the server buildId that triggered the pill (or 'sw' for a SW signal).
  // null = hidden. Dismissing records the id so the SAME stale build can't wedge
  // the pill again after a reload — but a genuinely newer build still shows.
  const [updateBuildId, setUpdateBuildId] = useState<string | null>(null);

  const onUpdateAvailable = React.useCallback((buildId?: string) => {
    const id = buildId ?? 'sw';
    try {
      if (localStorage.getItem('resonant.dismissedBuild') === id) return;
    } catch { /* localStorage blocked — show anyway */ }
    setUpdateBuildId(id);
  }, []);
  useVersionCheck(onUpdateAvailable);

  const dismissUpdate = React.useCallback(() => {
    setUpdateBuildId((id) => {
      if (id) { try { localStorage.setItem('resonant.dismissedBuild', id); } catch { /* ignore */ } }
      return null;
    });
  }, []);

  // Connect the WS once at the shell level so all views share it
  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  // Ask the mind gate once at shell mount — the sidebar's /mind entry and
  // the Home night shelf both read this store. Settings saves re-fetch it.
  useEffect(() => {
    void useMindStore.getState().fetchSurface();
  }, []);

  // Reconcile the theme with the server's saved overrides — main.tsx already
  // applied whatever was cached in localStorage synchronously at load, this
  // just confirms/corrects it now that the session is authenticated.
  useEffect(() => {
    void useThemeStore.getState().fetchTheme();
  }, []);

  // Close the drawer whenever the route changes
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Lock body scroll + close on Escape while the drawer is open
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setDrawerOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // Global Cmd/Ctrl+K → toggle the command palette
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('resonant:command-palette'));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="app-shell">
      <NavRail />
      <MobileTopBar onMenu={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} isChat={isChat} />
      {updateBuildId && <UpdatePill onDismiss={dismissUpdate} />}
      <CommandPalette />
      <div className="app-content">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<HomeView />} />
            <Route path="/command" element={<CommandCenterView />} />
            <Route path="/mind" element={<MindView />} />
            <Route path="/mind/observatory" element={<ObservatoryView />} />
            <Route path="/chat" element={<ChatView embedded />} />
            <Route path="/canvas" element={<CanvasView />} />
            <Route path="/files" element={<FilesView />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </Suspense>
      </div>

      <style>{`
        .app-shell {
          display: flex;
          height: 100dvh;
          overflow: hidden;
          background: var(--bg-primary, #0c0b09);
        }

        .app-content {
          flex: 1;
          min-width: 0;
          height: 100%;
          overflow: hidden;
        }

        /* ─── Desktop left rail ─── */
        .nav-rail {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          padding: 0.75rem 0.375rem;
          background: var(--bg-secondary, #131210);
          border-right: 1px solid rgba(201, 168, 124, 0.07);
          flex-shrink: 0;
          width: 3.25rem;
          height: 100dvh;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        /* ─── Nav links (shared) ─── */
        .navlink {
          position: relative;
          isolation: isolate;
          color: var(--text-muted, #6a6258);
          text-decoration: none;
          transition: color 150ms var(--hearth-curve, ease), background 150ms var(--hearth-curve, ease);
        }
        .navlink-icon {
          position: relative;
          display: grid;
          place-items: center;
        }
        .navlink::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          z-index: -1;
          opacity: 0;
          background: radial-gradient(circle, rgba(201, 168, 124, 0.18), transparent 70%);
          transition: opacity 150ms var(--hearth-curve, ease);
        }
        .navlink:hover { color: var(--text-secondary, #a09689); }
        .navlink:hover::before { opacity: 1; }
        .navlink.active { color: var(--amber, #c9a87c); }
        .navlink.active::before { opacity: 0.65; }
        .navlink:active { transform: scale(0.985) translateY(0.5px); }

        /* Rail variant — icon-only squares */
        .navlink-rail {
          display: grid;
          place-items: center;
          width: 2.5rem;
          height: 2.5rem;
          border-radius: 0.625rem;
          flex-shrink: 0;
        }

        /* Drawer variant — icon + label rows */
        .navlink-drawer {
          display: flex;
          align-items: center;
          gap: 0.875rem;
          width: 100%;
          padding: 0.75rem 0.875rem;
          border-radius: 0.625rem;
          min-height: 44px;
          font-family: var(--font-body, 'Inter', sans-serif);
          font-size: 0.95rem;
        }
        .navlink-drawer.active {
          background: rgba(201, 168, 124, 0.08);
        }
        .navlink-label { line-height: 1; }

        .nav-orb-dot {
          position: absolute;
          top: -0.0625rem;
          right: -0.0625rem;
          width: 0.3125rem;
          height: 0.3125rem;
          border-radius: 50%;
          pointer-events: none;
          transition: background 420ms var(--hearth-curve, ease);
        }
        .navlink.active .nav-orb-dot {
          box-shadow: 0 0 0 1.5px rgba(12, 11, 9, 0.9), 0 0 5px 1px rgba(201, 168, 124, 0.55);
        }

        /* ─── Mobile top bar (hidden on desktop) ─── */
        .mobile-topbar { display: none; }
        .topbar-menu {
          display: grid;
          place-items: center;
          width: 2.25rem;
          height: 2.25rem;
          border-radius: 0.5rem;
          color: var(--text-secondary, #a09689);
          background: transparent;
          border: none;
          cursor: pointer;
          flex-shrink: 0;
          margin-left: -0.25rem;
        }
        .topbar-menu:active { transform: scale(0.96); }
        .topbar-wordmark {
          font-family: var(--font-serif, 'Cinzel', 'Lora', serif);
          font-size: 0.95rem;
          letter-spacing: 0.22em;
          text-transform: lowercase;
          color: var(--amber, #c9a87c);
          flex: 1;
          margin-left: 0.25rem;
        }
        .topbar-presence {
          width: 0.5rem;
          height: 0.5rem;
          border-radius: 50%;
          flex-shrink: 0;
          transition: background 420ms var(--hearth-curve, ease);
        }

        /* ─── Mobile drawer (hidden on desktop) ─── */
        .mobile-drawer-root { display: none; }
        .drawer-scrim {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: rgba(0, 0, 0, 0.5);
          border: none;
          opacity: 0;
          pointer-events: none;
          transition: opacity 240ms var(--hearth-curve, ease);
        }
        .drawer-panel {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          z-index: 201;
          width: min(86vw, 20rem);
          display: flex;
          flex-direction: column;
          background: var(--bg-secondary, #131210);
          border-right: 1px solid rgba(201, 168, 124, 0.10);
          box-shadow: 8px 0 32px rgba(0, 0, 0, 0.45);
          transform: translateX(-100%);
          transition: transform 280ms var(--hearth-curve, cubic-bezier(0.16, 1, 0.3, 1));
          will-change: transform;
          padding-top: env(safe-area-inset-top, 0px);
          overflow: hidden;
        }
        .mobile-drawer-root.open .drawer-scrim {
          opacity: 1;
          pointer-events: auto;
        }
        .mobile-drawer-root.open .drawer-panel {
          transform: translateX(0);
        }
        .drawer-nav {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
          padding: 0.75rem 0.625rem 0.5rem;
          flex-shrink: 0;
        }
        .drawer-divider {
          height: 1px;
          margin: 0.25rem 0.875rem 0.5rem;
          background: rgba(201, 168, 124, 0.10);
          flex-shrink: 0;
        }
        /* The chats list fills the rest of the drawer */
        .drawer-chats {
          flex: 1;
          min-height: 0;
          display: flex;
        }
        .drawer-chats .thread-sidebar {
          width: 100%;
          border-right: none;
        }

        /* ─── Breakpoint: swap rail → top bar + drawer ─── */
        @media (max-width: 768px) {
          .app-shell { flex-direction: column; }
          .nav-rail { display: none; }
          .mobile-topbar {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-shrink: 0;
            padding: calc(env(safe-area-inset-top, 0px) + 0.5rem) 1rem 0.5rem;
            background: rgba(19, 18, 16, 0.82);
            backdrop-filter: blur(14px) saturate(1.05);
            -webkit-backdrop-filter: blur(14px) saturate(1.05);
            border-bottom: 1px solid rgba(201, 168, 124, 0.08);
            z-index: 60;
          }
          .mobile-drawer-root { display: block; }
          .app-content {
            flex: 1 1 auto;
            min-height: 0;
            height: auto;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Auth gate — the outermost layer ──────────────────────────────────────────
// Runs the /api/auth/check on mount and holds everything behind it.
// Nothing fetches, no WS opens, until this confirms authenticated.

function AuthGate() {
  const status = useAuthStore(s => s.status);
  const checkAuth = useAuthStore(s => s.checkAuth);

  useEffect(() => {
    void checkAuth();
  }, []);

  if (status === 'checking') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100dvh',
        background: 'var(--bg-primary, #0c0b09)',
      }}>
        <div style={{
          width: '0.375rem',
          height: '0.375rem',
          borderRadius: '50%',
          background: 'var(--amber-dim, #a08960)',
          animation: 'auth-pulse 1.4s ease-in-out infinite',
        }} />
        <style>{`
          @keyframes auth-pulse {
            0%, 100% { opacity: 0.3; transform: scale(0.8); }
            50%       { opacity: 1;   transform: scale(1); }
          }
        `}</style>
      </div>
    );
  }

  if (status === 'unconfigured') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100dvh',
        background: 'var(--bg-primary, #0c0b09)',
        gap: '0.75rem',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <p style={{ color: 'var(--amber, #c9a87c)', fontFamily: 'serif', margin: 0, fontSize: '1rem' }}>
          auth isn't configured
        </p>
        <p style={{ color: 'var(--text-muted, #6a6258)', margin: 0, fontSize: '0.8125rem', maxWidth: '22rem' }}>
          Set <code style={{ color: 'var(--text-secondary, #a09689)' }}>APP_PASSWORD</code> in your environment and restart.
        </p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <LoginView />;
  }

  // authenticated — render the full app, WS connects here
  return (
    <BrowserRouter>
      <ConfirmProvider>
        <AppShell />
      </ConfirmProvider>
    </BrowserRouter>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function App() {
  return <AuthGate />;
}
