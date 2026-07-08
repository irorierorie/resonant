/**
 * FilesView — read-only directory browser for the local machine.
 *
 * Local-first single-user surface. Scoped to the backend's safe-root allowlist
 * (the backend returns 403 outside it; we surface that gracefully, never crash).
 *
 * Layout:
 *   - Breadcrumb path along the top (clickable segments to jump up the tree).
 *   - Left/main pane: directory listing (folders first, then files), each row
 *     showing a Hearth muted-bronze icon, name, and — for files — size + mtime.
 *     Click a folder to descend; click a file to preview it.
 *   - Right pane: text preview of the selected file (or a truncation note).
 *
 * Backend contract:
 *   GET /api/files?path=<dir>        -> { path, entries: [{ name, type, size, mtime }] }
 *   GET /api/files/read?path=<file>  -> { content, truncated? }  (or raw text)
 *
 * No path arg on the first listing request lets the backend pick its default root.
 */
import React, { useCallback, useEffect, useState } from 'react';

// ─── Base URL ─────────────────────────────────────────────────────────────────

const BASE = import.meta.env.DEV ? 'http://127.0.0.1:3099' : '';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileEntry {
  name: string;
  type: 'directory' | 'file';
  size: number;
  mtime: number | string;
  path: string;
}

interface ListResponse {
  path: string | null;
  roots?: boolean;
  entries: FileEntry[];
}

interface PreviewState {
  name: string;
  content: string;
  truncated: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes == null || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(mtime: number | string): string {
  if (mtime == null) return '';
  const d = typeof mtime === 'number' ? new Date(mtime) : new Date(mtime);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Split a path into clickable breadcrumb segments. Handles both / and \ separators. */
function breadcrumbSegments(path: string): { label: string; path: string }[] {
  if (!path) return [];
  // Normalise backslashes to forward slashes for splitting; keep a leading root marker.
  const normalised = path.replace(/\\/g, '/');
  const isWinDrive = /^[A-Za-z]:/.test(normalised);
  const parts = normalised.split('/').filter(Boolean);

  const segments: { label: string; path: string }[] = [];
  let accum = '';
  parts.forEach((part, i) => {
    if (i === 0 && isWinDrive) {
      accum = part; // "C:"
    } else if (accum === '' && !isWinDrive) {
      accum = `/${part}`; // posix root-anchored first segment
    } else {
      accum = `${accum}/${part}`;
    }
    segments.push({ label: part, path: accum });
  });
  return segments;
}

// ─── Icons (Hearth muted-bronze line style) ─────────────────────────────────────

function FolderIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

// ─── Listing fetch ──────────────────────────────────────────────────────────────

/** Sort: directories first (alpha), then files (alpha). Case-insensitive. */
function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

// ─── FilesView ──────────────────────────────────────────────────────────────────

export function FilesView() {
  const [path, setPath] = useState<string>('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // ─── Load a directory ───
  const loadDir = useCallback(async (dirPath?: string) => {
    setLoading(true);
    setError(null);
    // Clear any open preview when navigating.
    setPreview(null);
    setPreviewError(null);
    setSelectedFile(null);
    try {
      const url =
        dirPath != null && dirPath !== ''
          ? `${BASE}/api/files/browse?path=${encodeURIComponent(dirPath)}`
          : `${BASE}/api/files/browse`;
      const res = await fetch(url);
      if (res.status === 403) {
        setError('That folder is outside the accessible roots.');
        setEntries([]);
        return;
      }
      if (!res.ok) {
        setError(`Could not load this folder (${res.status}).`);
        setEntries([]);
        return;
      }
      const data: ListResponse = await res.json();
      setPath(data.path ?? dirPath ?? '');
      setEntries(sortEntries(data.entries ?? []));
    } catch (err) {
      console.error('Failed to load directory:', err);
      setError('Could not reach the file service.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load — no path, let the backend pick the default root.
  useEffect(() => {
    void loadDir();
  }, [loadDir]);

  // ─── Open a file preview ───
  const openFile = useCallback(
    async (entry: FileEntry) => {
      const filePath = entry.path;
      setSelectedFile(entry.name);
      setPreviewLoading(true);
      setPreviewError(null);
      setPreview(null);
      try {
        const res = await fetch(`${BASE}/api/files/read?path=${encodeURIComponent(filePath)}`);
        if (res.status === 403) {
          setPreviewError('That file is outside the accessible roots.');
          return;
        }
        if (!res.ok) {
          setPreviewError(`Could not read this file (${res.status}).`);
          return;
        }
        // Backend may return { content, truncated } JSON, or raw text.
        const ctype = res.headers.get('content-type') ?? '';
        if (ctype.includes('application/json')) {
          const data = await res.json();
          setPreview({
            name: entry.name,
            content: typeof data.content === 'string' ? data.content : JSON.stringify(data, null, 2),
            truncated: Boolean(data.truncated),
          });
        } else {
          const text = await res.text();
          setPreview({ name: entry.name, content: text, truncated: false });
        }
      } catch (err) {
        console.error('Failed to read file:', err);
        setPreviewError('Could not read this file.');
      } finally {
        setPreviewLoading(false);
      }
    },
    [path],
  );

  const segments = breadcrumbSegments(path);

  return (
    <div className="files-view">
      {/* ─── Breadcrumb ─── */}
      <header className="files-breadcrumb" aria-label="Current path">
        <span className="files-crumb-icon" aria-hidden="true"><FolderIcon /></span>
        {segments.length === 0 ? (
          <span className="files-crumb files-crumb-current">{path || 'root'}</span>
        ) : (
          segments.map((seg, i) => {
            const isLast = i === segments.length - 1;
            return (
              <React.Fragment key={seg.path}>
                {i > 0 && <span className="files-crumb-sep" aria-hidden="true"><ChevronIcon /></span>}
                {isLast ? (
                  <span className="files-crumb files-crumb-current">{seg.label}</span>
                ) : (
                  <button
                    className="files-crumb files-crumb-link"
                    onClick={() => loadDir(seg.path)}
                  >
                    {seg.label}
                  </button>
                )}
              </React.Fragment>
            );
          })
        )}
      </header>

      {/* ─── Body: listing + preview ─── */}
      <div className="files-body">
        {/* Listing pane */}
        <div className="files-list-pane">
          {loading ? (
            <p className="files-status">Reading folder…</p>
          ) : error ? (
            <p className="files-status files-status-error">{error}</p>
          ) : entries.length === 0 ? (
            <p className="files-status">This folder is empty.</p>
          ) : (
            <div className="files-list">
              {entries.map(entry => {
                const isDir = entry.type === 'directory';
                const isSelected = !isDir && selectedFile === entry.name;
                return (
                  <button
                    key={entry.name}
                    className={`files-row${isDir ? ' is-dir' : ''}${isSelected ? ' is-selected' : ''}`}
                    onClick={() => (isDir ? loadDir(entry.path) : openFile(entry))}
                  >
                    <span className="files-row-icon" aria-hidden="true">
                      {isDir ? <FolderIcon /> : <FileIcon />}
                    </span>
                    <span className="files-row-name">{entry.name}</span>
                    {isDir ? (
                      <span className="files-row-chevron" aria-hidden="true"><ChevronIcon /></span>
                    ) : (
                      <span className="files-row-meta">
                        {formatSize(entry.size)}
                        {entry.mtime != null && formatDate(entry.mtime) ? (
                          <> · {formatDate(entry.mtime)}</>
                        ) : null}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Preview pane */}
        <div className="files-preview-pane">
          {previewLoading ? (
            <p className="files-status">Opening…</p>
          ) : previewError ? (
            <p className="files-status files-status-error">{previewError}</p>
          ) : preview ? (
            <>
              <div className="files-preview-header">
                <span className="files-preview-icon" aria-hidden="true"><FileIcon /></span>
                <span className="files-preview-name">{preview.name}</span>
                {preview.truncated && <span className="files-preview-truncated">truncated</span>}
              </div>
              <pre className="files-preview-content">{preview.content}</pre>
            </>
          ) : (
            <p className="files-status files-status-empty">Select a file to preview its contents.</p>
          )}
        </div>
      </div>

      <style>{`
        /* ─── Shell ─── */
        .files-view {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: transparent;
        }

        /* ─── Breadcrumb ─── */
        .files-breadcrumb {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.125rem;
          padding: 1.25rem 1.5rem 1rem;
          border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.06));
          flex-shrink: 0;
          font-family: var(--font-mono, monospace);
          font-size: 0.75rem;
        }
        .files-crumb-icon {
          display: inline-flex;
          color: var(--amber-dim, #a08960);
          opacity: 0.8;
          margin-right: 0.5rem;
        }
        .files-crumb {
          padding: 0.1875rem 0.375rem;
          border-radius: 0.375rem;
          letter-spacing: 0.01em;
          white-space: nowrap;
        }
        .files-crumb-link {
          color: var(--text-muted, #6a6258);
          background: transparent;
          border: none;
          cursor: pointer;
          position: relative;
          isolation: isolate;
          transition: color 240ms var(--hearth-curve, ease), background 240ms var(--hearth-curve, ease);
        }
        .files-crumb-link:hover {
          color: var(--amber, #c9a87c);
          background: var(--amber-subtle, rgba(201, 168, 124, 0.06));
        }
        .files-crumb-current {
          color: var(--text-primary, #e2dbd0);
        }
        .files-crumb-sep {
          display: inline-flex;
          align-items: center;
          color: var(--text-muted, #6a6258);
          opacity: 0.5;
        }

        /* ─── Body ─── */
        .files-body {
          flex: 1;
          min-height: 0;
          display: flex;
          overflow: hidden;
        }

        /* ─── Listing pane ─── */
        .files-list-pane {
          flex: 1;
          min-width: 0;
          overflow-y: auto;
          padding: 0.75rem 1rem 2rem;
          border-right: 1px solid var(--border, rgba(255, 255, 255, 0.06));
        }

        .files-list {
          display: flex;
          flex-direction: column;
          gap: 0.0625rem;
          max-width: 40rem;
        }

        .files-row {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          width: 100%;
          padding: 0.5rem 0.625rem;
          border-radius: 0.5rem;
          background: transparent;
          border: none;
          text-align: left;
          cursor: pointer;
          color: var(--text-secondary, #a09689);
          position: relative;
          isolation: isolate;
          transition: color 240ms var(--hearth-curve, ease), background 240ms var(--hearth-curve, ease);
        }
        .files-row::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          z-index: -1;
          opacity: 0;
          background: radial-gradient(ellipse at left, var(--amber-glow, rgba(201,168,124,0.18)), transparent 70%);
          transition: opacity 240ms var(--hearth-curve, ease);
        }
        .files-row:hover { color: var(--text-primary, #e2dbd0); }
        .files-row:hover::before { opacity: 1; }
        .files-row:active {
          transform: scale(0.992);
          transition: transform 100ms var(--hearth-curve, ease);
        }
        .files-row.is-selected {
          background: var(--amber-subtle, rgba(201, 168, 124, 0.06));
          color: var(--amber, #c9a87c);
        }

        .files-row-icon {
          display: inline-flex;
          flex-shrink: 0;
          color: var(--amber-dim, #a08960);
          opacity: 0.85;
        }
        .files-row.is-dir .files-row-icon { color: var(--amber, #c9a87c); }
        .files-row.is-selected .files-row-icon { color: var(--amber, #c9a87c); opacity: 1; }

        .files-row-name {
          flex: 1;
          min-width: 0;
          font-size: 0.875rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .files-row-meta {
          flex-shrink: 0;
          font-family: var(--font-mono, monospace);
          font-size: 0.6875rem;
          color: var(--text-muted, #6a6258);
          letter-spacing: 0.02em;
        }

        .files-row-chevron {
          display: inline-flex;
          flex-shrink: 0;
          color: var(--text-muted, #6a6258);
          opacity: 0.5;
        }
        .files-row:hover .files-row-chevron { opacity: 0.8; }

        /* ─── Preview pane ─── */
        .files-preview-pane {
          width: 42%;
          min-width: 18rem;
          max-width: 36rem;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: rgba(12, 11, 9, 0.4);
        }

        .files-preview-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 1rem 1.25rem 0.75rem;
          border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.06));
          flex-shrink: 0;
        }
        .files-preview-icon {
          display: inline-flex;
          color: var(--amber-dim, #a08960);
          opacity: 0.85;
        }
        .files-preview-name {
          flex: 1;
          min-width: 0;
          font-size: 0.875rem;
          color: var(--text-primary, #e2dbd0);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .files-preview-truncated {
          flex-shrink: 0;
          font-family: var(--font-serif, serif);
          font-style: italic;
          font-size: 0.6875rem;
          color: var(--amber, #c9a87c);
        }

        .files-preview-content {
          flex: 1;
          overflow: auto;
          margin: 0;
          padding: 1rem 1.25rem 2rem;
          font-family: var(--font-mono, monospace);
          font-size: 0.75rem;
          line-height: 1.6;
          color: var(--text-secondary, #a09689);
          white-space: pre-wrap;
          word-break: break-word;
        }

        /* ─── Status text ─── */
        .files-status {
          color: var(--text-muted, #6a6258);
          font-family: var(--font-serif, serif);
          font-style: italic;
          font-size: 0.875rem;
          padding: 2rem 0.625rem;
        }
        .files-status-error { color: var(--amber-dim, #a08960); }
        .files-status-empty {
          text-align: center;
          padding: 3rem 1.5rem;
        }

        /* ─── Responsive: stack preview below on narrow viewports ─── */
        @media (max-width: 768px) {
          .files-body { flex-direction: column; }
          .files-list-pane { border-right: none; }
          .files-preview-pane {
            width: 100%;
            max-width: none;
            min-width: 0;
            max-height: 45%;
            border-top: 1px solid var(--border, rgba(255, 255, 255, 0.06));
          }
        }
      `}</style>
    </div>
  );
}

// ─── Path join (separator-aware) ────────────────────────────────────────────────

/** Join a directory path and a child name, preserving the parent's separator style. */
function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  const usesBackslash = dir.includes('\\') && !dir.includes('/');
  const sep = usesBackslash ? '\\' : '/';
  const trimmed = dir.replace(/[\\/]+$/, '');
  return `${trimmed}${sep}${name}`;
}
