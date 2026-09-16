import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGermanCurrency, formatCurrency, normalizeSessionKey, createSessionKey, createPublicLink, buildSessionState } from './core.js';

test('parseGermanCurrency supports common valid formats', () => {
  assert.equal(parseGermanCurrency('150000'), 15000000);
  assert.equal(parseGermanCurrency('150000,50'), 15000050);
  assert.equal(parseGermanCurrency('150.000'), 15000000);
  assert.equal(parseGermanCurrency('150.000,50'), 15000050);
});

test('parseGermanCurrency rejects invalid input', () => {
  assert.throws(() => parseGermanCurrency(''), /Betrag/i);
  assert.throws(() => parseGermanCurrency('150000.50'), /deutsche|Zahl/i);
  assert.throws(() => parseGermanCurrency('-1'), /zulässig|wissenschaft|Betrag/i);
  assert.throws(() => parseGermanCurrency('1e5'), /wissenschaft|zulässig/i);
});

test('formatCurrency formats euro values in German format', () => {
  assert.equal(formatCurrency(15000050), '150.000,50 €');
  assert.equal(formatCurrency(0), '0,00 €');
});

test('normalizeSessionKey accepts whitespace and dashes and ignores case', () => {
  assert.equal(normalizeSessionKey(' abcd-efgh-jklm '), 'ABCD-EFGH-JKLM');
  assert.equal(normalizeSessionKey('abcd efgh jklm'), 'ABCD-EFGH-JKLM');
});

test('createSessionKey creates a valid random key', () => {
  const key = createSessionKey();
  assert.match(key, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4,5}$/);
});

test('createPublicLink and buildSessionState agree on the same identifier', () => {
  const link = createPublicLink('ABCD-EFGH-JKLM', 'http://localhost:3000');
  assert.equal(link.includes('#session=ABCD-EFGH-JKLM'), true);
  const state = buildSessionState({
    id: '1',
    session_key: 'ABCD-EFGH-JKLM',
    amtsgericht: 'Testgericht',
    sitzungsbezeichnung: 'Test',
    status: 'active',
    highest_bid_cents: 15000050,
    base_duration_minutes: 30,
    prepared_duration_minutes: 30,
    timer_status: 'not_started',
    started_at: null,
    end_at: null,
    expires_at: new Date().toISOString(),
    version: 1,
    last_saved_at: new Date().toISOString()
  });
  assert.equal(state.sessionKey, 'ABCD-EFGH-JKLM');
  assert.equal(state.publicUrl, link);
});
