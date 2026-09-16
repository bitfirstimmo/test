import express from 'express';
import QRCode from 'qrcode';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createPublicLink, createRandomToken, createSessionKey, formatCurrency, parseGermanCurrency, normalizeSessionKey } from './core.js';
import { addSessionBidder, cleanupExpiredSessions, createSessionRecord, findSessionByAdminToken, findSessionById, findSessionByKey, getSessionEvents, listSessionBidders, saveEvent, updateSession } from './db.js';

const app = express();
const adminCookieName = 'auction_admin';
const port = config.port;
const sessionSubscribers = new Map<string, Set<any>>();
const publicDir = fileURLToPath(new URL('../public', import.meta.url));

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.static(publicDir));

function getAdminToken(req: express.Request): string | null {
  const cookie = req.headers.cookie ?? '';
  const match = cookie.match(new RegExp(`${adminCookieName}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function requireAdminSession(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = getAdminToken(req);
  if (!token) {
    res.status(401).json({ error: 'Keine Berechtigung für diese Sitzung.' });
    return;
  }
  const session = findSessionByAdminToken(token);
  if (!session || session.status !== 'active') {
    res.clearCookie(adminCookieName);
    res.status(401).json({ error: 'Die Berechtigung ist ungültig oder abgelaufen.' });
    return;
  }
  (req as any).session = session;
  next();
}

function getSessionState(session: Record<string, any>) {
  const isRunning = session.timer_status === 'running';
  const now = Date.now();
  const endAtMs = session.end_at ? new Date(session.end_at).getTime() : null;
  const preparedMs = Number(session.prepared_duration_minutes ?? 30) * 60 * 1000;
  const remainingMs = isRunning && endAtMs ? Math.max(0, endAtMs - now) : preparedMs;
  return {
    id: session.id,
    sessionKey: session.session_key,
    amtsgericht: session.amtsgericht,
    sitzungsbezeichnung: session.sitzungsbezeichnung,
    status: session.status,
    highestBidCents: Number(session.highest_bid_cents ?? 0),
    highestBidText: session.highest_bid_cents ? formatCurrency(Number(session.highest_bid_cents)) : 'Noch kein Gebot erfasst',
    highestBidderName: session.highest_bidder_name ?? null,
    bidders: listSessionBidders(session.id).map((bidder) => bidder.name),
    baseDurationMinutes: Number(session.base_duration_minutes ?? 30),
    preparedDurationMinutes: Number(session.prepared_duration_minutes ?? 30),
    timerStatus: session.timer_status,
    startedAt: session.started_at,
    endAt: session.end_at,
    remainingMs,
    remainingText: formatRemainingMs(remainingMs),
    expiresAt: session.expires_at,
    lastSavedAt: session.last_saved_at,
    version: Number(session.version ?? 1),
    publicUrl: createPublicLink(session.session_key, config.publicAppUrl),
    qrUrl: `${config.publicAppUrl}/api/session/${session.id}/qr`
  };
}

function formatRemainingMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function sendEvent(sessionId: string, message: Record<string, any>) {
  const targets = sessionSubscribers.get(sessionId) ?? new Set();
  const payload = `data: ${JSON.stringify(message)}\n\n`;
  for (const res of targets) {
    try {
      res.write(payload);
    } catch {
      // ignore
    }
  }
}

function broadcastSession(sessionId: string) {
  const session = findSessionById(sessionId);
  if (!session) return;
  sendEvent(sessionId, getSessionState(session));
}

app.get('/api/config', (_req, res) => {
  res.json({ publicAppUrl: config.publicAppUrl, licenseEmail: config.licenseEmail, licenseVersion: config.licenseVersion });
});

app.post('/api/session', (req, res) => {
  const { amtsgericht, sitzungsbezeichnung, confirmedLicense, licenseVersion } = req.body ?? {};
  if (confirmedLicense !== true) {
    res.status(400).json({ error: 'Bitte bestätigen Sie die Lizenzvorlage, bevor Sie eine Sitzung erstellen.' });
    return;
  }
  const sessionKey = createSessionKey();
  const adminToken = createRandomToken();
  const created = createSessionRecord({
    amtsgericht: String(amtsgericht ?? '').trim() || undefined,
    title: String(sitzungsbezeichnung ?? '').trim() || undefined,
    licenseVersion: String(licenseVersion ?? config.licenseVersion),
    licenseConfirmedAt: new Date().toISOString(),
    sessionKey,
    adminToken,
  });
  if (!created) {
    res.status(500).json({ error: 'Die Sitzung konnte nicht erstellt werden.' });
    return;
  }
  saveEvent(created.id, 'session_created', { sessionKey: created.session_key });
  res.cookie(adminCookieName, adminToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 24,
  });
  const info = getSessionState(created);
  res.status(201).json({
    ...info,
    sessionKey,
    sessionKeyDisplay: sessionKey,
    publicUrl: createPublicLink(sessionKey, config.publicAppUrl),
    adminToken: undefined,
    message: 'Die Steuerung ist an diesen Browser gebunden. Verwenden Sie für diese Sitzung weiterhin diesen Browser.'
  });
});

app.get('/api/session/current', requireAdminSession, (req, res) => {
  const session = (req as any).session as Record<string, any>;
  res.json(getSessionState(session));
});

app.post('/api/session/current/bidders', requireAdminSession, (req, res) => {
  const session = (req as any).session as Record<string, any>;
  const name = String(req.body?.name ?? '').trim();
  if (!name || name.length > 120) {
    res.status(400).json({ error: 'Bitte geben Sie einen gültigen Namen ein.' });
    return;
  }
  addSessionBidder(session.id, name);
  broadcastSession(session.id);
  res.json(getSessionState(findSessionById(session.id)!));
});

app.get('/api/session/:sessionId/qr', requireAdminSession, async (req, res) => {
  const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const session = findSessionById(sessionId);
  if (!session || session.status !== 'active') {
    res.status(404).json({ error: 'Keine gültige Sitzung gefunden.' });
    return;
  }
  const target = createPublicLink(session.session_key, config.publicAppUrl);
  const qr = await QRCode.toDataURL(target, { margin: 1, errorCorrectionLevel: 'M', width: 260 });
  const data = qr.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(data, 'base64');
  res.type('image/png').send(buffer);
});

app.post('/api/session/current/bid', requireAdminSession, (req, res) => {
  const session = (req as any).session as Record<string, any>;
  const amountText = String(req.body?.amount ?? '').trim();
  const bidderName = String(req.body?.bidderName ?? '').trim();
  if (!amountText) {
    res.status(400).json({ error: 'Bitte geben Sie einen gültigen Betrag ein.' });
    return;
  }
  try {
    const amountCents = parseGermanCurrency(amountText);
    const currentBid = Number(session.highest_bid_cents ?? 0);
    if (amountCents === currentBid) {
      res.json(getSessionState(session));
      return;
    }
    if (amountCents < currentBid && req.body?.confirmLower !== true) {
      res.status(409).json({
        error: 'Der eingegebene Betrag liegt unter dem aktuellen Höchstgebot. Möchten Sie das Höchstgebot korrigieren?',
        currentBid: currentBid,
        newBid: amountCents,
        requiresConfirmation: true
      });
      return;
    }
    const updated = updateSession(session.id, { highest_bid_cents: amountCents, highest_bidder_name: bidderName || null, version: Number(session.version) + 1, timer_status: session.timer_status || 'not_started' });
    if (!updated) {
      res.status(500).json({ error: 'Die Gebotsänderung konnte nicht gespeichert werden.' });
      return;
    }
    if (bidderName) {
      addSessionBidder(session.id, bidderName);
    }
    saveEvent(session.id, 'bid_updated', { amountCents, bidderName: bidderName || null, previousBid: currentBid });
    broadcastSession(session.id);
    res.json(getSessionState(updated));
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post('/api/session/current/bid/reset', requireAdminSession, (req, res) => {
  const session = (req as any).session as Record<string, any>;
  const updated = updateSession(session.id, { highest_bid_cents: null, highest_bidder_name: null, version: Number(session.version) + 1 });
  if (!updated) {
    res.status(500).json({ error: 'Das Gebot konnte nicht zurückgesetzt werden.' });
    return;
  }
  saveEvent(session.id, 'bid_reset', { previousBid: session.highest_bid_cents });
  broadcastSession(session.id);
  res.json(getSessionState(updated));
});

app.post('/api/session/current/time/start', requireAdminSession, (req, res) => {
  const session = (req as any).session as Record<string, any>;
  const baseDuration = Number(session.base_duration_minutes ?? config.defaultSessionMinutes);
  const endAt = new Date(Date.now() + baseDuration * 60 * 1000).toISOString();
  const updated = updateSession(session.id, {
    timer_status: 'running',
    started_at: new Date().toISOString(),
    end_at: endAt,
    prepared_duration_minutes: baseDuration,
    base_duration_minutes: baseDuration,
    version: Number(session.version) + 1,
  });
  if (!updated) {
    res.status(500).json({ error: 'Der Timer konnte nicht gestartet werden.' });
    return;
  }
  saveEvent(session.id, 'timer_started', { durationMinutes: baseDuration, endAt });
  broadcastSession(session.id);
  res.json(getSessionState(updated));
});

app.post('/api/session/current/time/extend', requireAdminSession, (req, res) => {
  const session = (req as any).session as Record<string, any>;
  const minutes = Number(req.body?.minutes ?? 0);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    res.status(400).json({ error: 'Bitte geben Sie eine gültige Anzahl an Minuten ein.' });
    return;
  }
  const currentStatus = String(session.timer_status ?? 'not_started');
  const baseMinutes = Number(session.base_duration_minutes ?? config.defaultSessionMinutes);
  const newPrepared = baseMinutes + minutes;
  if (currentStatus === 'running') {
    const currentEnd = session.end_at ? new Date(session.end_at).getTime() : Date.now();
    const nextEnd = currentEnd + minutes * 60 * 1000;
    const updated = updateSession(session.id, { end_at: new Date(nextEnd).toISOString(), prepared_duration_minutes: newPrepared, version: Number(session.version) + 1 });
    if (!updated) {
      res.status(500).json({ error: 'Die Zeitverlängerung konnte nicht gespeichert werden.' });
      return;
    }
    saveEvent(session.id, 'timer_extended', { minutes, newEndAt: updated.end_at });
    broadcastSession(session.id);
    res.json(getSessionState(updated));
    return;
  }
  const updated = updateSession(session.id, { base_duration_minutes: newPrepared, prepared_duration_minutes: newPrepared, version: Number(session.version) + 1 });
  if (!updated) {
    res.status(500).json({ error: 'Die vorbereitete Zeit konnte nicht gespeichert werden.' });
    return;
  }
  saveEvent(session.id, 'timer_prepared', { minutes, preparedDuration: newPrepared });
  broadcastSession(session.id);
  res.json(getSessionState(updated));
});

app.post('/api/session/current/time/reset', requireAdminSession, (req, res) => {
  const session = (req as any).session as Record<string, any>;
  const updated = updateSession(session.id, {
    timer_status: 'not_started',
    started_at: null,
    end_at: null,
    prepared_duration_minutes: Number(session.base_duration_minutes ?? config.defaultSessionMinutes),
    version: Number(session.version) + 1,
  });
  if (!updated) {
    res.status(500).json({ error: 'Der Timer konnte nicht zurückgesetzt werden.' });
    return;
  }
  saveEvent(session.id, 'timer_reset', { baseDurationMinutes: updated.base_duration_minutes });
  broadcastSession(session.id);
  res.json(getSessionState(updated));
});

app.post('/api/session/current/end', requireAdminSession, (req, res) => {
  const session = (req as any).session as Record<string, any>;
  const updated = updateSession(session.id, {
    status: 'ended',
    timer_status: 'not_started',
    ended_at: new Date().toISOString(),
    expires_at: new Date().toISOString(),
    version: Number(session.version) + 1,
  });
  if (!updated) {
    res.status(500).json({ error: 'Die Sitzung konnte nicht beendet werden.' });
    return;
  }
  saveEvent(session.id, 'session_ended', { endedAt: updated.ended_at });
  res.clearCookie(adminCookieName);
  broadcastSession(session.id);
  res.json({ status: 'ended', session: getSessionState(updated) });
});

app.post('/api/anzeige/connect', (req, res) => {
  const sessionKey = String(req.body?.sessionKey ?? '').trim();
  if (!sessionKey) {
    res.status(400).json({ error: 'Bitte geben Sie einen gültigen Sitzungsschlüssel ein.' });
    return;
  }
  const normalized = normalizeSessionKey(sessionKey);
  if (!normalized) {
    res.status(400).json({ error: 'Der angegebene Sitzungsschlüssel ist ungültig.' });
    return;
  }
  const session = findSessionByKey(normalized);
  if (!session || session.status !== 'active') {
    res.status(404).json({ error: 'Die Sitzung ist nicht aktiv oder der Schlüssel ist ungültig.' });
    return;
  }
  res.json(getSessionState(session));
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sessionKey = String(req.query.sessionKey ?? '');
  const adminToken = getAdminToken(req);
  let session: Record<string, any> | null = null;

  if (sessionKey) {
    session = findSessionByKey(String(sessionKey));
  } else if (adminToken) {
    session = findSessionByAdminToken(adminToken);
  }

  if (!session) {
    res.status(404).end();
    return;
  }

  const subscribers = sessionSubscribers.get(session.id) ?? new Set();
  subscribers.add(res);
  sessionSubscribers.set(session.id, subscribers);
  res.write(`data: ${JSON.stringify(getSessionState(session))}\n\n`);

  req.on('close', () => {
    const list = sessionSubscribers.get(session!.id) ?? new Set();
    list.delete(res);
    if (list.size === 0) sessionSubscribers.delete(session!.id);
  });
});

app.get('/steuerung', (_req, res) => {
  res.sendFile(path.join(publicDir, 'steuerung.html'));
});

app.get('/anzeige', (_req, res) => {
  res.sendFile(path.join(publicDir, 'anzeige.html'));
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/', (_req, res) => {
  res.redirect('/steuerung');
});

cleanupExpiredSessions();

app.listen(port, () => {
  console.log(`Server läuft auf http://localhost:${port}`);
});
