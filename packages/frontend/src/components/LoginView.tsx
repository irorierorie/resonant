/**
 * LoginView — the gate before the app.
 *
 * Hearth design language: warm obsidian, amber, Lora italic label.
 * Single password field, Enter submits, inline error, mobile-safe (no iOS zoom).
 */
import React, { useState, useRef, useEffect, FormEvent } from 'react';
import { useAuthStore } from '../store/auth';
import { Orb } from './hearth';

// ─── LoginView ────────────────────────────────────────────────────────────────

export function LoginView() {
  const login = useAuthStore(s => s.login);
  const loginError = useAuthStore(s => s.loginError);
  const loggingIn = useAuthStore(s => s.loggingIn);

  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount — after the brief fade-in settles
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 220);
    return () => clearTimeout(t);
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password.trim() || loggingIn) return;
    void login(password);
  }

  return (
    <div className="login-shell">
      <div className="login-card">

        {/* The presence shape, dimly waiting — shared hearth Orb.
            NOTE: breath cadence is the Orb's slow-drift (9s) rather than the
            old hardcoded 3.6s — slower, calmer. Flag if it reads as absent. */}
        <div className="login-orb-wrap" aria-hidden="true">
          <Orb
            size="waiting"
            color="amber"
            blend="gold"
            intensity="dull"
            motion="slow-drift"
          />
        </div>

        <h1 className="login-title">resonant</h1>
        <p className="login-sub">come home</p>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="login-field-wrap">
            <input
              ref={inputRef}
              className={`login-input${loginError ? ' login-input--error' : ''}`}
              type="password"
              autoComplete="current-password"
              placeholder="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loggingIn}
              aria-label="Password"
              aria-invalid={!!loginError}
              aria-describedby={loginError ? 'login-error' : undefined}
              // 16px prevents iOS auto-zoom
              style={{ fontSize: '16px' }}
            />
          </div>

          {loginError && (
            <p className="login-error" id="login-error" role="alert">
              {loginError}
            </p>
          )}

          <button
            type="submit"
            className="login-btn"
            disabled={loggingIn || !password}
            aria-busy={loggingIn}
          >
            {loggingIn ? (
              <span className="login-spinner" aria-hidden="true" />
            ) : (
              'enter'
            )}
          </button>
        </form>
      </div>

      <style>{`
        /* ─── Shell ─── */
        .login-shell {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100dvh;
          background: var(--bg-primary, #0c0b09);
          padding: env(safe-area-inset-top, 0) env(safe-area-inset-right, 0)
                   env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0);
          box-sizing: border-box;
        }

        /* ─── Card ─── */
        .login-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          width: min(100%, 22rem);
          padding: 2.5rem 2rem 2.5rem;
          animation: login-arrive 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes login-arrive {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ─── Orb ─── */
        .login-orb-wrap {
          display: grid;
          place-items: center;
          width: 3.5rem;
          height: 3.5rem;
          margin-bottom: 1.75rem;
        }

        /* ─── Title ─── */
        .login-title {
          margin: 0 0 0.35rem;
          font-family: 'Cinzel', 'Cormorant Garamond', serif;
          font-size: 1.375rem;
          font-weight: 400;
          letter-spacing: 0.18em;
          color: var(--amber, #c9a87c);
          text-transform: lowercase;
        }

        .login-sub {
          margin: 0 0 2.25rem;
          font-family: 'Lora', Georgia, serif;
          font-style: italic;
          font-size: 0.8125rem;
          color: var(--text-muted, #6a6258);
          letter-spacing: 0.04em;
        }

        /* ─── Form ─── */
        .login-form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
        }

        .login-field-wrap {
          width: 100%;
        }

        .login-input {
          width: 100%;
          box-sizing: border-box;
          background: var(--bg-input, #0f0e0c);
          border: 1px solid rgba(201, 168, 124, 0.16);
          border-radius: 0.5rem;
          color: var(--text-primary, #e2dbd0);
          font-family: var(--font-body, system-ui, sans-serif);
          font-size: 16px; /* prevents iOS zoom */
          padding: 0.75rem 1rem;
          outline: none;
          transition:
            border-color 160ms cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow 160ms cubic-bezier(0.16, 1, 0.3, 1);
          -webkit-appearance: none;
        }

        .login-input::placeholder {
          color: var(--text-muted, #6a6258);
          letter-spacing: 0.04em;
        }

        .login-input:focus {
          border-color: rgba(201, 168, 124, 0.45);
          box-shadow: 0 0 0 3px rgba(201, 168, 124, 0.10);
        }

        .login-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .login-input--error {
          border-color: rgba(220, 120, 100, 0.5);
        }

        /* ─── Error ─── */
        .login-error {
          margin: 0;
          font-size: 0.8rem;
          color: #c87c6a;
          text-align: center;
          font-family: var(--font-body, system-ui, sans-serif);
          animation: login-arrive 200ms ease both;
        }

        /* ─── Button ─── */
        .login-btn {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 1px solid rgba(201, 168, 124, 0.28);
          border-radius: 0.5rem;
          background: rgba(201, 168, 124, 0.08);
          color: var(--amber, #c9a87c);
          font-family: var(--font-body, system-ui, sans-serif);
          font-size: 0.875rem;
          letter-spacing: 0.08em;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 2.75rem;
          transition:
            background 160ms cubic-bezier(0.16, 1, 0.3, 1),
            border-color 160ms cubic-bezier(0.16, 1, 0.3, 1),
            transform 100ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        .login-btn:hover:not(:disabled) {
          background: rgba(201, 168, 124, 0.14);
          border-color: rgba(201, 168, 124, 0.45);
        }

        .login-btn:active:not(:disabled) {
          transform: scale(0.985) translateY(0.5px);
        }

        .login-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        /* ─── Spinner ─── */
        .login-spinner {
          display: inline-block;
          width: 1rem;
          height: 1rem;
          border: 1.5px solid rgba(201, 168, 124, 0.3);
          border-top-color: var(--amber, #c9a87c);
          border-radius: 50%;
          animation: login-spin 600ms linear infinite;
        }

        @keyframes login-spin {
          to { transform: rotate(360deg); }
        }

        /* ─── Mobile safe-area + full-width field ─── */
        @media (max-width: 600px) {
          .login-card {
            width: 100%;
            padding: 2.5rem 1.5rem
              calc(2.5rem + env(safe-area-inset-bottom, 0px));
          }
        }
      `}</style>
    </div>
  );
}
