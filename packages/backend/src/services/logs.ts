// Log tail reader — surfaces the PM2 process logs to the Settings Logs panel.
//
// PM2 (see ecosystem.config.cjs) writes stdout → data/logs/pm2-out.log and
// stderr → data/logs/pm2-err.log, each line prefixed with an ISO timestamp
// (`time: true`). This service reads a bounded tail of each file (never the whole
// thing — these grow unbounded), parses the timestamp, merges both streams in
// chronological order, and applies an optional case-insensitive filter.
//
// Read-only. The route that exposes this sits behind authMiddleware.

import { statSync, openSync, readSync, closeSync } from 'fs';
import { resolve } from 'path';
import { PROJECT_ROOT } from '../config.js';

const OUT_LOG = resolve(PROJECT_ROOT, 'data', 'logs', 'pm2-out.log');
const ERR_LOG = resolve(PROJECT_ROOT, 'data', 'logs', 'pm2-err.log');

// Read at most the last 512KB of each file — plenty for a few thousand lines,
// bounded so a multi-GB log can never blow out memory or response time.
const MAX_TAIL_BYTES = 512 * 1024;
const MAX_LINES = 5000;
const DEFAULT_LINES = 500;

export type LogSource = 'out' | 'err';
export type LogSourceFilter = LogSource | 'all';

export interface LogLine {
  ts: string | null;
  source: LogSource;
  text: string;
}

export interface ReadLogsOptions {
  lines?: number;
  q?: string;
  source?: LogSourceFilter;
}

export interface ReadLogsResult {
  lines: LogLine[];
  truncated: boolean;
  /** Whether each underlying log file was found on disk. */
  present: { out: boolean; err: boolean };
}

/** Read at most `maxBytes` from the end of a file. Missing file → empty string. */
function tailBytes(path: string, maxBytes: number): { text: string; present: boolean } {
  try {
    const { size } = statSync(path);
    const start = Math.max(0, size - maxBytes);
    const len = size - start;
    if (len <= 0) return { text: '', present: true };
    const fd = openSync(path, 'r');
    try {
      const buf = Buffer.allocUnsafe(len);
      const read = readSync(fd, buf, 0, len, start);
      return { text: buf.toString('utf8', 0, read), present: true };
    } finally {
      closeSync(fd);
    }
  } catch {
    return { text: '', present: false };
  }
}

// PM2 `time: true` prepends e.g. "2026-06-30T12:34:56: message". Tolerate fractional
// seconds and an optional timezone offset; the trailing ": " is PM2's separator.
const TS_RE = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?):\s?/;

function parseLines(raw: string, source: LogSource): LogLine[] {
  const out: LogLine[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    const m = TS_RE.exec(line);
    if (m) out.push({ ts: m[1], source, text: line.slice(m[0].length) });
    else out.push({ ts: null, source, text: line });
  }
  return out;
}

/**
 * Read the tail of the PM2 logs, merged chronologically and optionally filtered.
 * When the first read chunk begins mid-line (because we sliced into the middle of
 * the file), that partial leading line is dropped by `parseLines` naturally only if
 * empty — otherwise it shows as an unprefixed line, which is acceptable for a tail.
 */
export function readLogs(opts: ReadLogsOptions = {}): ReadLogsResult {
  const limit = Math.min(Math.max(opts.lines ?? DEFAULT_LINES, 1), MAX_LINES);
  const want: LogSourceFilter = opts.source ?? 'all';

  let all: LogLine[] = [];
  const present = { out: false, err: false };

  if (want === 'out' || want === 'all') {
    const r = tailBytes(OUT_LOG, MAX_TAIL_BYTES);
    present.out = r.present;
    all = all.concat(parseLines(r.text, 'out'));
  }
  if (want === 'err' || want === 'all') {
    const r = tailBytes(ERR_LOG, MAX_TAIL_BYTES);
    present.err = r.present;
    all = all.concat(parseLines(r.text, 'err'));
  }

  // ISO timestamps sort lexicographically == chronologically. Lines without a
  // timestamp compare equal (V8's sort is stable, so they keep file order).
  all.sort((a, b) => {
    if (a.ts && b.ts) return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0;
    return 0;
  });

  let filtered = all;
  if (opts.q && opts.q.trim()) {
    const q = opts.q.trim().toLowerCase();
    filtered = all.filter((l) => l.text.toLowerCase().includes(q));
  }

  const truncated = filtered.length > limit;
  return { lines: filtered.slice(-limit), truncated, present };
}
