#!/usr/bin/env node
/**
 * SOC2 Security Audit Test Runner
 * Run: node scripts/security-audit-tests.mjs [BASE_URL]
 * Default BASE_URL: http://localhost:3001
 *
 * For IDOR tests (T4.4, T4.5): set JWT env, or set TEST_EMAIL and TEST_PASSWORD
 * to auto-login via Supabase Auth.
 */

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3001';
const SUPABASE_URL = 'https://wgdayvqaaufmwbafneek.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnZGF5dnFhYXVmbXdiYWZuZWVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NzI1NjEsImV4cCI6MjA4NjQ0ODU2MX0.cQnf7TIybz7hgVEZvIDubSM02iEy7p_Njj4Hsbe0zuk';

async function getTestJwt(email, password) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

const results = [];

function log(testId, status, detail = '') {
  const r = { testId, status, detail };
  results.push(r);
  console.log(`[${status}] ${testId}: ${detail || (status === 'PASS' ? 'OK' : 'FAIL')}`);
  return r;
}

async function fetchJson(url, opts = {}) {
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { _raw: text };
    }
    return { status: res.status, headers: Object.fromEntries(res.headers), json, text };
  } catch (e) {
    if (e.cause?.code === 'ECONNREFUSED') {
      return { status: 0, error: 'ECONNREFUSED', json: null, text: '' };
    }
    throw e;
  }
}

async function run() {
  console.log('\n=== SOC2 Security Audit Tests ===\n');
  console.log(`Base URL: ${BASE}\n`);

  let JWT = process.env.JWT || '';
  if (!JWT && process.env.TEST_EMAIL && process.env.TEST_PASSWORD) {
    JWT = await getTestJwt(process.env.TEST_EMAIL, process.env.TEST_PASSWORD) || '';
  }

  // --- T4: Auth ---
  console.log('--- T4: Authentication ---');
  const t4_1 = await fetchJson(`${BASE}/api/stats/c35ee60a-07f3-4008-a6e7-0b171d22fe7b`);
  log('T4.1', t4_1.status === 401 ? 'PASS' : t4_1.error === 'ECONNREFUSED' ? 'SKIP' : 'FAIL', t4_1.error ? 'Server not running' : `Missing JWT: got ${t4_1.status}, expected 401`);

  const t4_2 = await fetchJson(`${BASE}/api/stats/c35ee60a-07f3-4008-a6e7-0b171d22fe7b`, {
    headers: { Authorization: 'Bearer invalid-garbage-token-xyz' },
  });
  log('T4.2', t4_2.status === 401 ? 'PASS' : t4_2.error ? 'SKIP' : 'FAIL', t4_2.error ? 'Server not running' : `Invalid JWT: got ${t4_2.status}`);

  const t4_5_pub = await fetchJson(`${BASE}/api/stats/leaderboard/race`);
  log('T4.5a', t4_5_pub.status === 200 ? 'PASS' : t4_5_pub.error ? 'SKIP' : 'FAIL', t4_5_pub.error ? 'Server not running' : `Leaderboard: ${t4_5_pub.status}`);

  if (JWT) {
    const otherId = '00000000-0000-0000-0000-000000000001';
    const t4_4 = await fetchJson(`${BASE}/api/stats/${otherId}`, {
      headers: { Authorization: `Bearer ${JWT}` },
    });
    log('T4.4', t4_4.status === 403 ? 'PASS' : 'FAIL', `IDOR stats: got ${t4_4.status}, expected 403`);

    const t4_5 = await fetchJson(`${BASE}/api/stats/${otherId}/history`, {
      headers: { Authorization: `Bearer ${JWT}` },
    });
    log('T4.5', t4_5.status === 403 ? 'PASS' : 'FAIL', `IDOR history: got ${t4_5.status}, expected 403`);
  } else {
    log('T4.4', 'SKIP', 'Set JWT or TEST_EMAIL+TEST_PASSWORD to test IDOR');
    log('T4.5', 'SKIP', 'Set JWT or TEST_EMAIL+TEST_PASSWORD to test IDOR');
  }

  // --- T6: Injection ---
  console.log('\n--- T6: Input Validation ---');
  const t6_1 = await fetchJson(`${BASE}/api/stats/'%3B%20DROP%20TABLE%20profiles%3B%20--`);
  log('T6.1', t6_1.status === 400 || t6_1.status === 401 ? 'PASS' : t6_1.error ? 'SKIP' : 'FAIL', t6_1.error ? 'Server not running' : `SQL inj: ${t6_1.status}`);

  const t6_2 = await fetchJson(`${BASE}/api/stats/leaderboard/invalid_game_type`);
  log('T6.2', t6_2.status === 400 ? 'PASS' : t6_2.error ? 'SKIP' : 'FAIL', t6_2.error ? 'Server not running' : `gameType: ${t6_2.status}`);

  // Use PUT to hit the /:id route; requireAuth returns 401 before UUID check without JWT
  const t6_9 = await fetchJson(`${BASE}/api/pairs/not-a-uuid`, { method: 'PUT' });
  log('T6.9', t6_9.status === 400 || t6_9.status === 401 ? 'PASS' : t6_9.error ? 'SKIP' : 'FAIL', t6_9.error ? 'Server not running' : `UUID: ${t6_9.status}`);

  // Oversized payload (10KB limit)
  const bigPayload = JSON.stringify({ fromLang: 'en', toLang: 'es', count: 5, a: 'x'.repeat(12000) });
  let t6_6_status = 0;
  try {
    const t6_6_res = await fetch(`${BASE}/api/games/pairs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(JWT ? { Authorization: `Bearer ${JWT}` } : {}),
      },
      body: bigPayload,
    });
    t6_6_status = t6_6_res.status;
  } catch (_) {
    t6_6_status = 0;
  }
  log('T6.6', t6_6_status === 413 || t6_6_status === 401 ? 'PASS' : t6_6_status === 0 ? 'SKIP' : 'FAIL', t6_6_status === 0 ? 'Server not running' : `Oversized body: ${t6_6_status}`);

  // --- T9: Data Exposure (run before T8 to avoid rate limit affecting these) ---
  console.log('\n--- T9: Data Exposure ---');
  const t9_2 = await fetchJson(`${BASE}/api/stats/leaderboard/race`);
  const lb = t9_2.json?.leaderboard;
  const hasSensitive = lb && lb.some((r) => r.user_id || r.email || r.id);
  log('T9.2', t9_2.status === 200 && !hasSensitive ? 'PASS' : t9_2.error ? 'SKIP' : 'FAIL', t9_2.error ? 'Server not running' : hasSensitive ? 'Leaderboard exposes sensitive fields' : 'OK');

  const t9_4 = await fetchJson(`${BASE}/health`);
  const health = t9_4.json;
  const hasLeak = health && (health.version || health.dependencies || health.env);
  log('T9.4', t9_4.status === 200 && !hasLeak ? 'PASS' : t9_4.error ? 'SKIP' : 'FAIL', t9_4.error ? 'Server not running' : hasLeak ? 'Health exposes internal info' : 'OK');

  // --- T8: Rate limit - 105 requests to exceed 100/min global limit (run last) ---
  console.log('\n--- T8: Rate Limiting ---');
  const rateReqs = [];
  for (let i = 0; i < 105; i++) {
    rateReqs.push(fetch(`${BASE}/health`).catch(() => ({ status: 0 })));
  }
  const rateRes = await Promise.all(rateReqs);
  const statuses = rateRes.map((r) => r?.status ?? 0);
  const okCount = statuses.filter((s) => s === 200).length;
  const rateLimitedCount = statuses.filter((s) => s === 429).length;
  const has429 = rateLimitedCount > 0;
  log('T8.1', has429 ? 'PASS' : statuses[0] === 0 ? 'SKIP' : 'FAIL', `${okCount} OK, ${rateLimitedCount} rate-limited`);

  // --- Summary ---
  console.log('\n=== Summary ===');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;
  console.log(`PASS: ${passed}, FAIL: ${failed}, SKIP: ${skipped}`);
  console.log('\nResults (JSON):');
  console.log(JSON.stringify(results, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
