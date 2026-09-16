import crypto from 'node:crypto';

export const MAX_CENT_AMOUNT = 5000000000;

const SESSION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function formatCurrency(cents: number): string {
  const value = Number(cents) / 100;
  const formatted = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
  return `${formatted} €`;
}

export function parseGermanCurrency(input: string): number {
  const raw = input.trim();
  if (!raw) {
    throw new Error('Bitte geben Sie einen Betrag ein.');
  }
  if (/e/i.test(raw) || /\+/.test(raw) || /-/.test(raw)) {
    throw new Error('Nur normale Eurobeträge ohne wissenschaftliche Schreibweise sind zulässig.');
  }
  const normalized = raw.replace(/\s+/g, '');
  if (!/^[\d.,]+$/.test(normalized)) {
    throw new Error('Nur Zahlen mit deutschem Format sind zulässig.');
  }
  if (normalized.includes(',') && normalized.includes('.')) {
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    if (lastComma > lastDot) {
      const integerPart = normalized.slice(0, lastComma).replace(/\./g, '');
      const decimalPart = normalized.slice(lastComma + 1).replace(/\./g, '');
      if (!/^\d+$/.test(integerPart) || !/^\d{1,2}$/.test(decimalPart)) {
        throw new Error('Bitte verwenden Sie das deutsche Format: 150.000,50');
      }
      const whole = Number(integerPart) * 100 + Number(decimalPart.padEnd(2, '0'));
      if (whole <= 0) throw new Error('Der Betrag muss positiv sein.');
      if (whole > MAX_CENT_AMOUNT) throw new Error('Der Betrag ist technisch nicht zulässig.');
      return whole;
    }
    throw new Error('Bitte verwenden Sie das deutsche Format: 150.000,50');
  }
  if (normalized.includes(',')) {
    const [integerPart, decimalPart] = normalized.split(',');
    if (!/^\d+$/.test(integerPart.replace(/\./g, '')) || !/^\d{1,2}$/.test(decimalPart || '')) {
      throw new Error('Bitte verwenden Sie das deutsche Format: 150000,50');
    }
    const whole = Number(integerPart.replace(/\./g, '')) * 100 + Number(decimalPart.padEnd(2, '0'));
    if (whole <= 0) throw new Error('Der Betrag muss positiv sein.');
    if (whole > MAX_CENT_AMOUNT) throw new Error('Der Betrag ist technisch nicht zulässig.');
    return whole;
  }
  if (normalized.includes('.')) {
    if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+)$/.test(normalized)) {
      throw new Error('Bitte verwenden Sie deutsche Zahlenschreibweise ohne Punkt als Dezimaltrenner.');
    }
    const clean = normalized.replace(/\./g, '');
    const amount = Number(clean) * 100;
    if (amount <= 0) throw new Error('Der Betrag muss positiv sein.');
    if (amount > MAX_CENT_AMOUNT) throw new Error('Der Betrag ist technisch nicht zulässig.');
    return amount;
  }
  const amount = Number(normalized) * 100;
  if (normalized.length === 0 || Number.isNaN(amount)) {
    throw new Error('Bitte geben Sie eine gültige Zahl ein.');
  }
  if (amount <= 0) throw new Error('Der Betrag muss positiv sein.');
  if (amount > MAX_CENT_AMOUNT) throw new Error('Der Betrag ist technisch nicht zulässig.');
  return amount;
}

export function normalizeSessionKey(input: string): string {
  const cleaned = (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return '';
  const groups: string[] = [];
  for (let i = 0; i < cleaned.length; i += 4) {
    groups.push(cleaned.slice(i, i + 4));
  }
  return groups.join('-').slice(0, 19); 
}

export function createSessionKey(): string {
  const bytes = crypto.randomBytes(12);
  let key = '';
  for (const byte of bytes) {
    key += SESSION_ALPHABET[byte % SESSION_ALPHABET.length];
  }
  return normalizeSessionKey(key);
}

export function createRandomToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function createPublicLink(sessionKey: string, baseUrl: string): string {
  const cleanKey = normalizeSessionKey(sessionKey);
  return `${baseUrl.replace(/\/$/, '')}/anzeige#session=${cleanKey}`;
}

export function buildSessionState(session: Record<string, any>): Record<string, any> {
  const now = Date.now();
  const endAtMs = session.end_at ? new Date(session.end_at).getTime() : null;
  const remainingMs = session.timer_status === 'running' && endAtMs ? Math.max(0, endAtMs - now) : 0;
  const highestBidDisplay = session.highest_bid_cents ? formatCurrency(Number(session.highest_bid_cents)) : 'Noch kein Gebot erfasst';
  return {
    id: session.id,
    sessionKey: session.session_key,
    amtsgericht: session.amtsgericht,
    sitzungsbezeichnung: session.sitzungsbezeichnung,
    status: session.status,
    highestBidCents: Number(session.highest_bid_cents ?? 0),
    highestBidDisplay,
    baseDurationMinutes: Number(session.base_duration_minutes ?? 30),
    preparedDurationMinutes: Number(session.prepared_duration_minutes ?? 30),
    timerStatus: session.timer_status,
    startedAt: session.started_at,
    endAt: session.end_at,
    expiresAt: session.expires_at,
    version: Number(session.version ?? 1),
    lastSavedAt: session.last_saved_at,
    remainingMs,
    remainingText: formatRemainingMs(remainingMs),
    publicUrl: createPublicLink(session.session_key, process.env.PUBLIC_APP_URL ?? 'http://localhost:3000')
  };
}

export function formatRemainingMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
