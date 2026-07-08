import { Request, Response, NextFunction } from 'express';
import { parse as parseCookie } from 'cookie';
import crypto from 'crypto';
import {
  createWebSession,
  getWebSession,
  deleteExpiredSessions,
} from '../services/db.js';
import { getResonantConfig } from '../config.js';

const COOKIE_NAME = 'resonant_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function getCookieName(): string {
  return COOKIE_NAME;
}

/** Explicit, dangerous, OFF-by-default local-dev escape hatch. When
 *  AUTH_DEV_OPEN=true AND no password is configured, protected routes pass
 *  through without a session. NEVER set this when the app is publicly reachable
 *  (e.g. behind the cloudflared tunnel) — it disables auth entirely. */
function devOpen(): boolean {
  return process.env.AUTH_DEV_OPEN === 'true';
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const config = getResonantConfig();
  if (!config.auth.password) {
    // FAIL CLOSED: an unset password must NOT mean "open". Without a configured
    // password there is no way to mint a valid session, so protected routes are
    // sealed (401) unless the explicit local-dev escape hatch is on.
    if (devOpen()) {
      next();
      return;
    }
    res.status(503).json({ error: 'Auth not configured — set APP_PASSWORD' });
    return;
  }

  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const cookies = parseCookie(cookieHeader);
  const sessionToken = cookies[COOKIE_NAME];

  if (!sessionToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const session = getWebSession(sessionToken);
  if (!session) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }

  if (new Date(session.expires_at) < new Date()) {
    res.status(401).json({ error: 'Session expired' });
    return;
  }

  next();
}

export function loginHandler(req: Request, res: Response): void {
  const config = getResonantConfig();
  if (!config.auth.password) {
    res.status(500).json({ error: 'Authentication not configured' });
    return;
  }

  const { password } = req.body;
  if (!password) {
    res.status(400).json({ error: 'Password required' });
    return;
  }

  const inputBuffer = Buffer.from(password);
  const expectedBuffer = Buffer.from(config.auth.password);

  const maxLen = Math.max(inputBuffer.length, expectedBuffer.length);
  const paddedInput = Buffer.alloc(maxLen);
  const paddedExpected = Buffer.alloc(maxLen);
  inputBuffer.copy(paddedInput);
  expectedBuffer.copy(paddedExpected);

  const isValid = crypto.timingSafeEqual(paddedInput, paddedExpected) &&
                  inputBuffer.length === expectedBuffer.length;

  if (!isValid) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  deleteExpiredSessions();

  const sessionToken = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  createWebSession({
    id: crypto.randomUUID(),
    token: sessionToken,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  // secure/sameSite must reflect the ACTUAL request transport, NOT NODE_ENV.
  // NODE_ENV=production over plain HTTP (LAN / tailnet / pm2 without TLS) would
  // set a Secure cookie the browser silently drops — login appears to succeed
  // but the session cookie never sticks and the WS upgrade dies with a 401.
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'strict' : 'lax',
    maxAge: SESSION_DURATION_MS,
    path: '/',
  });

  res.json({ success: true });
}

export function logoutHandler(req: Request, res: Response): void {
  // Mirror the transport-based attributes the cookie was SET with, or the
  // clear won't target the same cookie.
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'strict' : 'lax',
    path: '/',
  });
  res.json({ success: true });
}

export function sessionCheckHandler(req: Request, res: Response): void {
  const config = getResonantConfig();
  const authRequired = !!config.auth.password;
  if (!authRequired) {
    // No password configured. In dev-open mode the app is intentionally open
    // (auth_required:false). Otherwise we are FAIL-CLOSED: report that auth is
    // required but unconfigured so the UI can show "set APP_PASSWORD" rather
    // than falsely claiming the user is authenticated.
    if (devOpen()) {
      res.json({ authenticated: true, auth_required: false });
      return;
    }
    res.json({ authenticated: false, auth_required: true, auth_unconfigured: true });
    return;
  }

  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    res.json({ authenticated: false });
    return;
  }

  const cookies = parseCookie(cookieHeader);
  const sessionToken = cookies[COOKIE_NAME];

  if (!sessionToken) {
    res.json({ authenticated: false });
    return;
  }

  const session = getWebSession(sessionToken);
  if (!session || new Date(session.expires_at) < new Date()) {
    res.json({ authenticated: false });
    return;
  }

  res.json({ authenticated: true });
}
