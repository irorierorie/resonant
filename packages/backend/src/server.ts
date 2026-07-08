// Node version guard — must run before any other imports that load native addons
const _nodeVersion = process.versions.node;
const _nodeMajor = parseInt(_nodeVersion.split('.')[0], 10);
if (_nodeMajor >= 25) {
  console.error(`[FATAL] Node.js v${_nodeVersion} is not yet supported. Resonant requires Node 20-24.`);
  console.error('See: https://github.com/simonvale/resonant/issues/2');
  process.exit(1);
}

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { loadConfig } from './config.js';
import { initDb, deleteExpiredSessions } from './services/db.js';
import { loadVectorCache } from './services/vector-cache.js';
import { createWebSocketServer, setVoiceService, setGatewayServices, registry } from './services/ws.js';
import { Orchestrator } from './services/orchestrator.js';
import { AgentService, registerAgentService } from './services/agent.js';
import { VoiceService } from './services/voice.js';
import { PushService } from './services/push.js';
import { DiscordService } from './services/discord/index.js';
import { TelegramService } from './services/telegram/index.js';
import { rateLimiter, securityHeaders } from './middleware/security.js';
import { internalOnly, internalTokenFingerprint, internalTokenSource } from './middleware/internal-token.js';
import apiRoutes, { initCcRoutes } from './routes/api.js';
import authPreferencesRoutes from './routes/auth-preferences.js';
import googleRoutes from './routes/google-routes.js';
import { startOutlookPoller, stopOutlookPoller } from './services/outlook.js';
import { startOutlookAuthor, stopOutlookAuthor } from './services/outlook-author.js';
import { startHandoffSchedule, stopHandoffSchedule } from './services/handoff.js';

// Load config FIRST — before any other initialization
const config = loadConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = config.server.port;
const HOST = config.server.host;
const DB_PATH = config.server.db_path;

// Ensure data directory exists
const dataDir = dirname(DB_PATH);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// Ensure files directory exists
const filesDir = join(dataDir, 'files');
if (!existsSync(filesDir)) {
  mkdirSync(filesDir, { recursive: true });
}

// Initialize database
console.log('Initializing database...');
const db = initDb(DB_PATH);
deleteExpiredSessions();
loadVectorCache();
console.log('Database initialized');

// Create Express app
const app = express();

// Trust proxy headers (e.g. Cloudflare tunnel, nginx)
app.set('trust proxy', 1);

// Environment-conditional origins
const IS_DEV = process.env.NODE_ENV !== 'production';
const corsOrigins: string[] = [...config.cors.origins, `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
if (IS_DEV) corsOrigins.push('http://localhost:5173');

const connectSrc: string[] = ["'self'"];
// Derive WebSocket connect sources from CORS origins
for (const origin of config.cors.origins) {
  const wsOrigin = origin.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  connectSrc.push(wsOrigin);
}
if (IS_DEV) connectSrc.push(`ws://localhost:${PORT}`);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc,
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      mediaSrc: ["'self'", "blob:"],
      fontSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      workerSrc: ["'self'"],
      upgradeInsecureRequests: null,
    }
  },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
}));

app.use(securityHeaders);
// Rate limiter only on API/MCP routes — not static assets
app.use('/api', rateLimiter);
app.use('/mcp', rateLimiter);

// CORS
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// All API routes — auth middleware is applied selectively inside the router
app.use('/api', apiRoutes);
app.use('/api', authPreferencesRoutes);
// Google connect REST (localhost-guarded internally; mounted always so the
// Settings surface can read status even when Google isn't configured yet).
app.use('/api/google', googleRoutes);

// Command Center MCP endpoint. LOOPBACK-ONLY: called only by the in-app agent's
// SDK over loopback, never by a browser. Gated by the internal shared token
// (NOT a source-IP check, which is defeated behind cloudflared). The agent
// passes the token via the `headers` block in .mcp.json (command-center entry).
if (config.command_center.enabled) {
  import('./routes/cc-mcp.js').then(m => app.use('/mcp/cc', internalOnly, m.default));
}

// Workspace (Google) MCP endpoint — ALWAYS mounted (like /api/google/*). With
// UI-driven creds the user never edits yaml, so a static config.google.enabled
// gate is the wrong lever. The MCP's tools/list is itself toggle-aware: it only
// exposes `gcal` when Google is connected AND the Calendar toggle is on, and
// returns an empty tool list otherwise. So mounting while not-yet-configured /
// disconnected is harmless — the agent simply sees no workspace tools until the
// user pastes creds, connects, and flips Calendar (no yaml edit, no restart).
// (The static config.google.enabled flag is now unused for mounting; it remains
// in config only as a legacy/override hint and can be removed in a later pass.)
// LOOPBACK-ONLY (same posture as /mcp/cc): the `google` / `google_health` tools
// are called only by the in-app agent's SDK over loopback. Gated by the internal
// shared token (the agent passes it via the `headers` block in .mcp.json,
// workspace entry) — a source-IP check would be defeated behind cloudflared.
import('./routes/workspace-mcp.js').then(m => app.use('/mcp/workspace', internalOnly, m.default));

// Serve frontend static build (works in dev too if frontend is pre-built)
const frontendPaths = [
  join(__dirname, '../../frontend/build'),         // From compiled dist/
  join(__dirname, '../../../packages/frontend/build'), // From src/ via tsx
];
const frontendBuildPath = frontendPaths.find(p => existsSync(p));

// Build-id: identifies the exact frontend bundle this server is serving. Written
// by scripts/write-build-id.mjs (build/.build-id) with the SAME value vite bakes
// into __BUILD_ID__ at compile time. The /api/version route returns this so a
// stale mobile tab can detect a newer deploy and offer to reload. Read once at
// boot — the served bundle does not change while the process is up.
{
  let buildId = process.env.BUILD_ID ?? 'dev';
  if (frontendBuildPath) {
    try {
      buildId = readFileSync(join(frontendBuildPath, '.build-id'), 'utf-8').trim() || buildId;
    } catch {
      // No .build-id (e.g. dev / pre-stamp build) — keep env/dev fallback.
    }
  }
  app.locals.buildId = buildId;
  console.log(`Frontend build id: ${buildId}`);
}

if (frontendBuildPath) {
  console.log(`Serving frontend from: ${frontendBuildPath}`);
  app.use(express.static(frontendBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(join(frontendBuildPath, 'index.html'));
  });
} else {
  console.log('No frontend build found — use Vite dev server on :5173');
}

// Global error handler — must be after all routes
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Create HTTP server
const server = createServer(app);

// Initialize agent service (shared between WebSocket and orchestrator)
const agentService = new AgentService();
registerAgentService(agentService); // busy-check for background query() callers (Hale #1)

// Initialize voice service (config-gated for logging; the service itself
// self-gates on key presence via canTranscribe / canTTS getters)
const voiceService = new VoiceService();
setVoiceService(voiceService);
if (config.voice.enabled) {
  console.log(`[Voice] Enabled — STT ${voiceService.canTranscribe ? 'ready' : 'NO KEY'}, TTS ${voiceService.canTTS ? 'ready' : 'NO KEY/VOICE_ID'}`);
} else {
  console.log('[Voice] Disabled via config.voice.enabled');
}

// Initialize push service
const pushService = new PushService(
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
  process.env.VAPID_CONTACT,
);
agentService.setPushService(pushService);

// Initialize Discord gateway (config-gated with env fallback)
import { getConfigBool } from './services/db.js';
import { hasBotToken } from './services/bot-token.js';

let discordService: DiscordService | null = null;

// Check config DB first, fall back to config file / env var for first boot
const discordEnabled = getConfigBool('discord.enabled', config.discord.enabled);
if (discordEnabled && hasBotToken('discord')) {
  discordService = new DiscordService(agentService, registry);
  discordService.start();
}

// Initialize Telegram gateway (config-gated with env fallback)
let telegramService: TelegramService | null = null;

const telegramEnabled = getConfigBool('telegram.enabled', config.telegram.enabled);
if (telegramEnabled && hasBotToken('telegram')) {
  telegramService = new TelegramService(agentService, registry, voiceService);
  telegramService.start();
}

// Initialize orchestrator (start gated by config — autonomous wakes stay off when disabled)
const orchestrator = new Orchestrator(agentService, pushService);
if (config.orchestrator.enabled) {
  orchestrator.start();
} else {
  console.log('[Orchestrator] Disabled via config.orchestrator.enabled — autonomous wakes off');
}

// Make orchestrator, agent, voice, push, and discord services available to route handlers
app.locals.orchestrator = orchestrator;
app.locals.agentService = agentService;
app.locals.voiceService = voiceService;
app.locals.pushService = pushService;
app.locals.discordService = discordService;
app.locals.telegramService = telegramService;

// Wire gateway services for status reporting
setGatewayServices({ discord: discordService, telegram: telegramService });

// Attach WebSocket server
console.log('Initializing WebSocket server...');
const wss = createWebSocketServer(server, agentService, orchestrator);
console.log('WebSocket server initialized');

// Mount Command Center routes (after config is loaded)
initCcRoutes().then(() => {
  if (config.command_center.enabled) console.log('Command Center routes mounted at /api/cc');
});

// Start the House Outlook poller — assembles the felt-state board on a rhythm
// from the live sources, caches it, and serves it at /api/outlook. Per-source
// isolated and self-rescheduling; a poll fault logs and never crashes the
// process. (timer.unref'd so it never holds the event loop open on its own.)
// The agent/orchestrator singletons are injected so houseSystems can read OUR
// vitals (MCP + organs); both degrade to empties if unwired.
startOutlookPoller({ agent: agentService, orchestrator });

// Start the House Outlook AUTHOR — the slow (3h) Sonnet-4.6 pass on the user's
// subscription where the companion authors its own hearth + the topics "we've been
// circling". Its OWN lifecycle, NOT coupled to the logistics poller's tick;
// errors back off (15m) and never crash the process (timer .unref'd). The
// poller folds the authored output (presence/topics/needsYou) into the snapshot.
startOutlookAuthor();

// Start the Daily Handoff schedule — a 12:10am croner that, when enabled, runs a
// Sonnet-4.6 subagent (the user's subscription, same guarded path as the outlook
// author) to carry yesterday's daily forward into today's. OFF BY DEFAULT (gated
// on handoff.enabled); the cron fires but no-ops when disabled. Faults are caught
// + logged and never crash the process.
startHandoffSchedule();

// Start server
server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Auth enabled: ${config.auth.password ? 'yes' : 'no'}`);
  // Boot diagnostic for the internal token (gates loopback /mcp/* and
  // /api/internal/*). DO NOT print the raw value: stdout flows to
  // data/logs/pm2-out.log, which the auth-gated Settings → Logs viewer can read.
  // The full token is read out-of-band by callers (.mcp.json headers, res CLI,
  // ~/.claude.json) directly from its source below. Fingerprint only here.
  console.log(`Internal token loaded (${internalTokenFingerprint()}) — full value at: ${internalTokenSource()}`);
  console.log(`Companion: ${config.identity.companion_name} | User: ${config.identity.user_name}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  orchestrator.stop();
  stopOutlookPoller();
  stopOutlookAuthor();
  stopHandoffSchedule();
  if (discordService) await discordService.stop();
  if (telegramService) await telegramService.stop();
  wss.clients.forEach(ws => ws.close());
  wss.close();
  server.close(() => {
    console.log('Server closed');
    db.close();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  orchestrator.stop();
  stopOutlookPoller();
  stopOutlookAuthor();
  stopHandoffSchedule();
  if (discordService) await discordService.stop();
  if (telegramService) await telegramService.stop();
  wss.clients.forEach(ws => ws.close());
  wss.close();
  server.close(() => {
    console.log('Server closed');
    db.close();
    process.exit(0);
  });
});
