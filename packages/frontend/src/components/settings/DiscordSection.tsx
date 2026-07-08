/**
 * Discord gateway section — status, pairings, rules, settings.
 * Translated from the reference app's PreferencesPanel/DiscordPanel to React/Hearth.
 * Graceful disabled state when gateway is off or endpoint missing.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  Group,
  Eyebrow,
  ToggleRow,
  Btn,
  Pill,
  EmptyState,
  Spinner,
  SubDivider,
  StatCard,
} from './primitives';
import { useConfirm } from '../ConfirmDialog';

// ─── Types (match DiscordPanel.svelte shape) ──────────────────────────────────

interface DiscordStatus {
  enabled: boolean;
  configEnabled: boolean;
  hasToken: boolean;
  connected: boolean;
  username: string | null;
  guilds: number;
  messagesReceived: number;
  messagesProcessed: number;
  deferred: number;
  deferredPending: number;
  errors: number;
}

interface PairingEntry {
  code: string;
  userId: string;
  username: string | null;
  channelId: string;
  createdAt: string;
  expiresAt: string;
  approvedAt?: string;
  approvedBy?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DiscordSection({ base }: { base: string }) {
  const confirm = useConfirm();
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [pending, setPending] = useState<PairingEntry[]>([]);
  const [approved, setApproved] = useState<PairingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);

  function flash(text: string, isErr = false) {
    if (isErr) setErr(text);
    else setMsg(text);
    setTimeout(() => { setMsg(null); setErr(null); }, 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.all([
        fetch(`${base}/api/discord/status`),
        fetch(`${base}/api/discord/pairings`),
      ]);
      if (sRes.status === 404) { setNotAvailable(true); setLoading(false); return; }
      if (sRes.ok) setStatus(await sRes.json());
      if (pRes.ok) {
        const d = await pRes.json();
        setPending(d.pending ?? []);
        setApproved(d.approved ?? []);
      }
    } catch { setNotAvailable(true); }
    setLoading(false);
  }, [base]);

  useEffect(() => { load(); }, [load]);

  const toggleGateway = async () => {
    if (!status) return;
    setToggling(true);
    const want = !status.enabled;
    try {
      const res = await fetch(`${base}/api/discord/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: want }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Toggle failed');
      flash(want ? 'Discord gateway starting…' : 'Discord gateway stopped');
      if (want) await new Promise(r => setTimeout(r, 1500));
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Toggle failed', true);
    }
    setToggling(false);
  };

  const approvePairing = async (code: string) => {
    setActionId(`approve-${code}`);
    try {
      const res = await fetch(`${base}/api/discord/pairings/${code}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Approve failed');
      flash('Pairing approved');
      await load();
    } catch (e) { flash(e instanceof Error ? e.message : 'Failed', true); }
    setActionId(null);
  };

  const denyPairing = async (code: string) => {
    setActionId(`deny-${code}`);
    try {
      const res = await fetch(`${base}/api/discord/pairings/${code}/deny`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Deny failed');
      flash('Pairing denied');
      await load();
    } catch (e) { flash(e instanceof Error ? e.message : 'Failed', true); }
    setActionId(null);
  };

  const revokePairing = async (userId: string, username: string | null) => {
    const ok = await confirm({
      title: `Revoke access for ${username ?? userId}?`,
      body: 'They will no longer be able to talk to the bot until they pair again and are re-approved.',
      confirmLabel: 'Revoke',
      cancelLabel: 'Keep',
      destructive: true,
    });
    if (!ok) return;
    setActionId(`revoke-${userId}`);
    try {
      const res = await fetch(`${base}/api/discord/pairings/${userId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Revoke failed');
      flash('Access revoked');
      await load();
    } catch (e) { flash(e instanceof Error ? e.message : 'Failed', true); }
    setActionId(null);
  };

  if (loading) {
    return <div className="discord-loading"><Spinner /></div>;
  }

  if (notAvailable) {
    return (
      <EmptyState message="Discord gateway endpoint unavailable — enable discord in Preferences first, or check your backend is running." />
    );
  }

  const isEnabled = status?.enabled ?? false;
  const isConnected = status?.connected ?? false;

  return (
    <div className="discord-section">

      {/* ── Token warning ── */}
      {!status?.hasToken && (
        <div className="discord-warn">
          <span className="discord-warn-text">
            No bot token configured. Add <code>DISCORD_BOT_TOKEN</code> to .env and restart.
          </span>
        </div>
      )}

      {/* ── Gateway toggle ── */}
      <Eyebrow label="gateway" />
      <Group>
        <ToggleRow
          label={isEnabled ? 'gateway active' : 'gateway off'}
          checked={isEnabled}
          onChange={toggleGateway}
          disabled={toggling || !status?.hasToken}
          hint="Connect to Discord and receive messages"
        />
      </Group>

      {/* ── Connection status (when enabled) ── */}
      {isEnabled && (
        <>
          <Eyebrow label="connection" />
          <Group>
            <div className="discord-status-row">
              <span
                className="discord-status-pip"
                style={{ background: isConnected ? '#6dba88' : '#71717a' }}
                aria-hidden="true"
              />
              {isConnected ? (
                <span className="discord-status-text connected">
                  online as <strong>{status?.username ?? '—'}</strong>
                </span>
              ) : (
                <span className="discord-status-text">connecting…</span>
              )}
            </div>

            {isConnected && status && (
              <div className="discord-stats">
                <div className="sp-stat-grid">
                  <StatCard label="guilds" value={status.guilds} />
                  <StatCard label="received" value={status.messagesReceived} />
                  <StatCard label="processed" value={status.messagesProcessed} />
                  <StatCard label="deferred" value={status.deferred ?? 0} />
                  <StatCard label="errors" value={status.errors} warn={status.errors > 0} />
                </div>
                {(status.deferredPending ?? 0) > 0 && (
                  <p className="discord-deferred-notice">
                    {status.deferredPending} message{status.deferredPending !== 1 ? 's' : ''} held — waiting for conversation gap
                  </p>
                )}
              </div>
            )}
          </Group>
        </>
      )}

      {/* ── Pending pairings ── */}
      {pending.length > 0 && (
        <>
          <Eyebrow label="pending pairings" sub={`${pending.length}`} />
          <div className="discord-pairing-list">
            {pending.map(p => (
              <div key={p.code} className="discord-pairing-card">
                <div className="discord-pairing-info">
                  <span className="discord-pairing-user">{p.username ?? p.userId}</span>
                  <span className="discord-pairing-meta">
                    code <code>{p.code}</code> · expires {new Date(p.expiresAt).toLocaleString()}
                  </span>
                </div>
                <div className="discord-pairing-actions">
                  <Btn
                    variant="primary"
                    small
                    onClick={() => approvePairing(p.code)}
                    disabled={actionId === `approve-${p.code}` || actionId === `deny-${p.code}`}
                  >
                    {actionId === `approve-${p.code}` ? <Spinner /> : 'approve'}
                  </Btn>
                  <Btn
                    variant="danger"
                    small
                    onClick={() => denyPairing(p.code)}
                    disabled={actionId === `deny-${p.code}` || actionId === `approve-${p.code}`}
                  >
                    {actionId === `deny-${p.code}` ? <Spinner /> : 'deny'}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Approved users ── */}
      {approved.length > 0 && (
        <>
          <Eyebrow label="approved users" sub={`${approved.length}`} />
          <div className="discord-pairing-list">
            {approved.map(p => (
              <div key={p.userId} className="discord-pairing-card">
                <div className="discord-pairing-info">
                  <span className="discord-pairing-user">{p.username ?? p.userId}</span>
                  <span className="discord-pairing-meta">
                    approved {p.approvedAt ? new Date(p.approvedAt).toLocaleDateString() : '—'}
                  </span>
                </div>
                <Btn
                  variant="danger"
                  small
                  onClick={() => revokePairing(p.userId, p.username)}
                  disabled={actionId === `revoke-${p.userId}`}
                >
                  {actionId === `revoke-${p.userId}` ? <Spinner /> : 'revoke'}
                </Btn>
              </div>
            ))}
          </div>
        </>
      )}

      {approved.length === 0 && pending.length === 0 && (
        <>
          <Eyebrow label="pairings" />
          <EmptyState message="No pairing requests yet. Users send /pair to the bot to initiate." />
        </>
      )}

      {/* ── Feedback ── */}
      {msg && <p className="discord-msg">{msg}</p>}
      {err && <p className="discord-err">{err}</p>}

      <style>{`
        .discord-section { padding-bottom: 2rem; }

        .discord-loading {
          display: flex;
          justify-content: center;
          padding: 2rem 0;
        }

        .discord-warn {
          padding: 0.75rem 1rem;
          background: rgba(212,168,67,0.08);
          border: 1px solid rgba(212,168,67,0.20);
          border-radius: 0.625rem;
          margin-bottom: 1rem;
        }
        .discord-warn-text {
          font-size: 0.8125rem;
          color: #d4a843;
        }
        .discord-warn-text code {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.75rem;
          background: rgba(212,168,67,0.12);
          padding: 0.0625rem 0.25rem;
          border-radius: 0.25rem;
        }

        .discord-status-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 0 0.5rem;
        }
        .discord-status-pip {
          width: 0.5rem;
          height: 0.5rem;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .discord-status-text {
          font-size: 0.875rem;
          color: var(--text-secondary, #a09689);
        }
        .discord-status-text.connected {
          color: #6dba88;
        }
        .discord-status-text strong {
          color: var(--text-primary, #e2dbd0);
          font-weight: 500;
        }

        .discord-stats {
          padding-bottom: 0.75rem;
        }

        .discord-deferred-notice {
          font-size: 0.75rem;
          color: #d4a843;
          margin-top: 0.5rem;
          font-style: italic;
        }

        .discord-pairing-list {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .discord-pairing-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 0.875rem;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 0.625rem;
        }
        .discord-pairing-info {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
          min-width: 0;
        }
        .discord-pairing-actions {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          flex-shrink: 0;
        }
        .discord-pairing-user {
          font-size: 0.875rem;
          color: var(--text-primary, #e2dbd0);
        }
        .discord-pairing-meta {
          font-size: 0.75rem;
          color: var(--text-muted, #6a6258);
        }
        .discord-pairing-meta code {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.6875rem;
          background: rgba(255,255,255,0.05);
          padding: 0.0625rem 0.25rem;
          border-radius: 0.25rem;
        }

        .discord-msg {
          font-size: 0.8125rem;
          color: #6dba88;
          margin-top: 0.875rem;
          font-style: italic;
        }
        .discord-err {
          font-size: 0.8125rem;
          color: rgba(210,140,130,0.85);
          margin-top: 0.875rem;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
