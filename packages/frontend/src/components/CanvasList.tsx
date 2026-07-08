/**
 * CanvasList — left pane of CanvasView.
 * Lists canvases with title + type + relative time, new-canvas creation form.
 * Stateless of API; parent (CanvasView) owns the canvas list and selection.
 */
import React, { useState } from 'react';
import { HearthSelect } from './hearth';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ContentType = 'markdown' | 'code' | 'text' | 'html';

export interface CanvasMeta {
  id: string;
  title: string;
  content_type?: ContentType;
  updated_at: string;
}

export interface CanvasListProps {
  canvases: CanvasMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (title: string, contentType: ContentType, language?: string) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ─── CanvasList ────────────────────────────────────────────────────────────────

export function CanvasList({ canvases, activeId, onSelect, onCreate }: CanvasListProps) {
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<ContentType>('markdown');
  const [newLang, setNewLang] = useState('');

  function handleCreate() {
    const title = newTitle.trim() || 'Untitled';
    const lang = newType === 'code' ? newLang.trim() || undefined : undefined;
    onCreate(title, newType, lang);
    setNewTitle('');
    setNewType('markdown');
    setNewLang('');
    setShowForm(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
    if (e.key === 'Escape') setShowForm(false);
  }

  return (
    <div className="cvl-root">
      {/* Header */}
      <div className="cvl-header">
        <span className="cvl-heading">canvases</span>
      </div>

      {/* New canvas */}
      {!showForm ? (
        <button className="cvl-new-btn" onClick={() => setShowForm(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Canvas
        </button>
      ) : (
        <div className="cvl-form">
          <input
            className="cvl-input"
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Canvas title..."
            autoFocus
          />
          <div className="cvl-form-row">
            <div className="cvl-select">
              <HearthSelect
                block
                value={newType}
                onChange={v => setNewType(v as ContentType)}
                options={[
                  { value: 'markdown', label: 'Markdown' },
                  { value: 'code', label: 'Code' },
                  { value: 'text', label: 'Text' },
                  { value: 'html', label: 'HTML' },
                ]}
                ariaLabel="Canvas content type"
              />
            </div>
            {newType === 'code' && (
              <input
                className="cvl-input cvl-input-sm"
                type="text"
                value={newLang}
                onChange={e => setNewLang(e.target.value)}
                placeholder="Language"
              />
            )}
          </div>
          <div className="cvl-form-actions">
            <button className="cvl-btn-create" onClick={handleCreate}>Create</button>
            <button className="cvl-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="cvl-list" role="list">
        {canvases.length === 0 ? (
          <p className="cvl-empty">No canvases yet</p>
        ) : (
          canvases.map(c => (
            <button
              key={c.id}
              role="listitem"
              className={`cvl-item${c.id === activeId ? ' cvl-item--active' : ''}`}
              onClick={() => onSelect(c.id)}
            >
              <span className="cvl-item-title">{c.title}</span>
              <span className="cvl-item-meta">
                <span className="cvl-item-type">{c.content_type ?? 'markdown'}</span>
                <span className="cvl-item-time">{formatTime(c.updated_at)}</span>
              </span>
            </button>
          ))
        )}
      </div>

      <style>{`
        /* ── CanvasList shell ── */
        .cvl-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 13.5rem;
          flex-shrink: 0;
          background: rgba(12, 11, 9, 0.55);
          border-right: 1px solid rgba(201, 168, 124, 0.06);
          overflow: hidden;
        }

        /* ── Header ── */
        .cvl-header {
          padding: 1.5rem 1rem 0.875rem;
          flex-shrink: 0;
          border-bottom: 1px solid rgba(201, 168, 124, 0.06);
        }

        .cvl-heading {
          font-family: var(--font-serif, 'Lora', serif);
          font-style: italic;
          font-weight: 500;
          font-size: 1.0625rem;
          color: var(--text-primary, #e2dbd0);
          letter-spacing: -0.005em;
        }

        /* ── New-canvas button ── */
        .cvl-new-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.5625rem 1rem;
          color: var(--amber, #c9a87c);
          font-size: 0.8125rem;
          font-weight: 500;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(201, 168, 124, 0.06);
          cursor: pointer;
          text-align: left;
          transition: background 240ms var(--hearth-curve, ease), color 240ms var(--hearth-curve, ease);
          flex-shrink: 0;
        }

        .cvl-new-btn:hover {
          background: rgba(201, 168, 124, 0.06);
          color: var(--amber-bright, #e3c49a);
        }

        .cvl-new-btn:active {
          transform: scale(0.985) translateY(0.5px);
          transition: transform 100ms var(--hearth-curve, ease);
        }

        /* ── New-canvas form ── */
        .cvl-form {
          padding: 0.625rem 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
          border-bottom: 1px solid rgba(201, 168, 124, 0.06);
          flex-shrink: 0;
          background: rgba(201, 168, 124, 0.025);
        }

        .cvl-input {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(201, 168, 124, 0.12);
          border-radius: 0.4375rem;
          color: var(--text-primary, #e2dbd0);
          padding: 0.375rem 0.5rem;
          font-size: 0.8125rem;
          font-family: inherit;
          outline: none;
          width: 100%;
          box-sizing: border-box;
          transition: border-color 200ms var(--hearth-curve, ease), box-shadow 200ms var(--hearth-curve, ease);
        }

        .cvl-input:focus {
          border-color: rgba(201, 168, 124, 0.35);
          box-shadow: 0 0 0 2px rgba(201, 168, 124, 0.08);
        }

        .cvl-input-sm {
          font-size: 0.75rem;
          padding: 0.28rem 0.45rem;
        }

        .cvl-form-row {
          display: flex;
          gap: 0.375rem;
        }

        /* HearthSelect wrapper — sized to the narrow sidebar form */
        .cvl-select {
          flex: 1;
          min-width: 0;
        }
        .cvl-select .hsel-trigger {
          padding: 0.28rem 0.45rem;
          min-width: 0;
        }
        .cvl-select .hsel-trigger .hsel-trigger-text {
          font-size: 0.75rem;
        }

        .cvl-form-actions {
          display: flex;
          gap: 0.375rem;
          justify-content: flex-end;
          margin-top: 0.125rem;
        }

        .cvl-btn-create {
          padding: 0.28rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 500;
          border-radius: 0.4375rem;
          background: var(--amber, #c9a87c);
          color: #1a1611;
          border: none;
          cursor: pointer;
          transition: opacity 200ms var(--hearth-curve, ease), transform 100ms var(--hearth-curve, ease);
        }

        .cvl-btn-create:hover { opacity: 0.88; }
        .cvl-btn-create:active { transform: scale(0.985) translateY(0.5px); }

        .cvl-btn-cancel {
          padding: 0.28rem 0.625rem;
          font-size: 0.75rem;
          border-radius: 0.4375rem;
          background: transparent;
          color: var(--text-muted, #6a6258);
          border: 1px solid rgba(255, 255, 255, 0.07);
          cursor: pointer;
          transition: color 200ms var(--hearth-curve, ease), border-color 200ms var(--hearth-curve, ease);
        }

        .cvl-btn-cancel:hover {
          color: var(--text-secondary, #a09689);
          border-color: rgba(255, 255, 255, 0.12);
        }

        /* ── List ── */
        .cvl-list {
          flex: 1;
          overflow-y: auto;
          padding: 0.25rem 0;
        }

        .cvl-empty {
          padding: 1.75rem 1rem;
          text-align: center;
          color: var(--text-muted, #6a6258);
          font-family: var(--font-serif, 'Lora', serif);
          font-style: italic;
          font-size: 0.8125rem;
          margin: 0;
        }

        /* ── List item ── */
        .cvl-item {
          display: flex;
          flex-direction: column;
          gap: 0.1875rem;
          width: 100%;
          padding: 0.5625rem 1rem;
          text-align: left;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          cursor: pointer;
          transition: background 200ms var(--hearth-curve, ease);
          position: relative;
        }

        .cvl-item::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--amber, #c9a87c);
          opacity: 0;
          border-radius: 0 1px 1px 0;
          transition: opacity 200ms var(--hearth-curve, ease);
        }

        .cvl-item:hover {
          background: rgba(201, 168, 124, 0.045);
        }

        .cvl-item--active {
          background: rgba(201, 168, 124, 0.07);
        }

        .cvl-item--active::before {
          opacity: 1;
        }

        .cvl-item-title {
          font-size: 0.8125rem;
          color: var(--text-primary, #e2dbd0);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.3;
        }

        .cvl-item--active .cvl-item-title {
          color: var(--amber-bright, #e3c49a);
        }

        .cvl-item-meta {
          display: flex;
          gap: 0.5rem;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.625rem;
          color: var(--text-muted, #6a6258);
          letter-spacing: 0.04em;
        }

        .cvl-item-type {
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
}
