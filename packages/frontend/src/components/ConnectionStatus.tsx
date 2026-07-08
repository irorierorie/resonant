import React from 'react';
import type { ConnectionState } from '../store/chat';

interface Props {
  state: ConnectionState;
  error: { code: string; message: string } | null;
  pendingCount: number;
}

export function ConnectionStatus({ state, error, pendingCount }: Props) {
  if (state === 'connected' && !error && pendingCount === 0) return null;

  let content: React.ReactNode = null;
  let variant = '';

  if (error) {
    content = (
      <>
        <span className="conn-pip" />
        <span>{error.message}</span>
      </>
    );
    variant = 'error';
  } else if (state === 'reconnecting') {
    content = (
      <>
        <span className="conn-spinner" />
        <span>reconnecting…</span>
      </>
    );
    variant = 'reconnecting';
  } else if (state === 'disconnected') {
    content = (
      <>
        <span className="conn-pip" />
        <span>disconnected</span>
      </>
    );
    variant = 'disconnected';
  } else if (pendingCount > 0) {
    content = (
      <>
        <span className="conn-spinner" />
        <span>{pendingCount} message{pendingCount !== 1 ? 's' : ''} queued</span>
      </>
    );
    variant = 'pending';
  }

  if (!content) return null;

  return (
    <div className={`connection-banner ${variant}`} role="status" aria-live="polite">
      {content}
      <style>{`
        /* Hearth banner: warm, not alarm-red. Muted and editorial. */
        .connection-banner {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.3125rem 1.25rem;
          font-size: 0.75rem;
          font-family: var(--font-serif, 'Lora', serif);
          font-style: italic;
          flex-shrink: 0;
          animation: bannerFadeIn 0.38s var(--hearth-curve, ease) both;
          letter-spacing: 0.01em;
        }

        /* Error — warm muted rust, not screaming red */
        .connection-banner.error {
          background: rgba(192, 117, 109, 0.08);
          border-bottom: 1px solid rgba(192, 117, 109, 0.15);
          color: rgba(210, 140, 130, 0.85);
        }

        /* Reconnecting / pending — amber-warm, not yellow alarm */
        .connection-banner.reconnecting,
        .connection-banner.pending {
          background: rgba(201, 168, 124, 0.06);
          border-bottom: 1px solid rgba(201, 168, 124, 0.12);
          color: var(--text-secondary, #a09689);
        }

        /* Disconnected — very dim, doesn't shout */
        .connection-banner.disconnected {
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          color: var(--text-muted, #6a6258);
        }

        /* Status pip — small dot, same color as text */
        .conn-pip {
          display: inline-block;
          width: 0.3125rem;
          height: 0.3125rem;
          border-radius: 50%;
          background: currentColor;
          opacity: 0.7;
          flex-shrink: 0;
        }

        /* Spinner — amber-warm */
        .conn-spinner {
          width: 0.5625rem;
          height: 0.5625rem;
          border: 1.5px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.9s linear infinite;
          flex-shrink: 0;
          opacity: 0.8;
        }

        @keyframes bannerFadeIn {
          from { opacity: 0; transform: translateY(-0.25rem); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
