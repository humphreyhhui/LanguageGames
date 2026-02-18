# SOC2 Security Audit Test Results

**Run date:** 2026-02-18  
**Project:** Language Games (Supabase: wgdayvqaaufmwbafneek)

---

## T1: Migration Integrity (CC8.1)

| Test | Result | Detail |
|------|--------|--------|
| T1.1 Composite PK enforced | **PASS** | Duplicate (user_id, game_type) → ERROR 23505 duplicate key violates elo_ratings_pkey |
| T1.2 FK constraint preserved | **PASS** | Non-existent user_id → ERROR 23503 foreign key violation |
| T1.3 CHECK constraint preserved | **PASS** | game_type='invalid' → ERROR 23514 check constraint elo_ratings_game_type_check |
| T1.4 Trigger integrity | **PASS** | handle_new_profile trigger exists (on_profile_created) |
| T1.5 Upsert path | SKIP | Requires server + game session (updateEloAfterGame) |
| T1.6 Seeding path | SKIP | Requires server (ensureEloRow) |
| T1.7 Cascade delete | **PASS** | elo_ratings_user_id_fkey has confdeltype='c' (CASCADE) |

---

## T2: Row-Level Security — elo_ratings (CC6.1)

| Test | Result | Detail |
|------|--------|--------|
| T2.1 Unauthorized UPDATE | SKIP | Requires User A JWT + User B ID |
| T2.2 Unauthorized INSERT | SKIP | Requires User A JWT |
| T2.3 Self-UPDATE via client | **NOTE** | Production DB only has SELECT policy on elo_ratings. UPDATE/INSERT policies may have been removed by lock_down migration. No client UPDATE policy = cannot self-update Elo. |
| T2.4 DELETE attempt | **PASS** | No DELETE policy → implicit deny |
| T2.5 Public SELECT | **PASS** | Anonymous GET returns elo_ratings (no id column; composite PK schema confirmed) |

**RLS policies on elo_ratings (production):** SELECT only (`using (true)`). No UPDATE or INSERT policies in pg_policy.

---

## T3: RLS Other Tables

| Test | Result | Detail |
|------|--------|--------|
| T3.1–T3.7 | SKIP | Require authenticated Supabase client with JWT |

---

## T4: Authentication and Authorization (CC6.1)

| Test | Result | Detail |
|------|--------|--------|
| T4.1–T4.7 | **BLOCKED** | Server fails to start: `Route.post() requires a callback function but got a [object Undefined]` at games.ts:18 (llmLimiter import/circular dependency). HTTP tests cannot run. |

---

## T5: Credential and Key Management (CC6.2)

| Test | Result | Detail |
|------|--------|--------|
| T5.1 Anon key only in client | **PASS** | lib/constants.ts has SUPABASE_ANON_KEY only (eyJ...anon) |
| T5.2 Service key server-only | **PASS** | server/config.ts uses process.env.SUPABASE_SERVICE_KEY. No app/ or lib/ imports server/config. |
| T5.3 Leaked password protection | **FAIL** | Supabase advisor: "Leaked password protection is currently disabled" |
| T5.4 Hardcoded URL fallback | **WARN** | server/config.ts has SUPABASE_URL fallback. Use env in production. |

---

## T6: Input Validation (CC6.6)

| Test | Result | Detail |
|------|--------|--------|
| T6.1–T6.9 | **BLOCKED** | Server not running (same startup error as T4) |

---

## T7: Score and Elo Manipulation (CC6.6)

| Test | Result | Detail |
|------|--------|--------|
| T7.1–T7.5 | **BLOCKED** | Requires server + socket.io client |

---

## T8: Rate Limiting (A1.2)

| Test | Result | Detail |
|------|--------|--------|
| T8.1–T8.5 | **BLOCKED** | Requires server |

---

## T9: Data Exposure (CC7.1)

| Test | Result | Detail |
|------|--------|--------|
| T9.1–T9.4 | **BLOCKED** | Requires server |

---

## How to Run Remaining Tests

### 1. Fix server startup (required for T4, T6, T8, T9)

The server exits with:
```
Error: Route.post() requires a callback function but got a [object Undefined]
at games.ts:18
```

Likely cause: circular import (games imports llmLimiter from index, index imports gamesRoutes from games). Fix the import order or move llmLimiter to a separate module.

### 2. Start the server

```bash
cd server && SUPABASE_SERVICE_KEY=your_key npx ts-node index.ts
```

### 3. Run the HTTP test script

```bash
node scripts/security-audit-tests.mjs http://localhost:3001
```

For IDOR tests (T4.4, T4.5), obtain a JWT by signing in and pass it:

```bash
JWT="your-supabase-access-token" node scripts/security-audit-tests.mjs
```

### 4. RLS tests (T2.1–T2.3, T3.x) — Supabase client with JWT

Create a small script that:
1. Uses `@supabase/supabase-js` with SUPABASE_ANON_KEY
2. Calls `supabase.auth.signInWithPassword({ email, password })` for a test user
3. Uses the session's access_token for subsequent requests
4. Tests UPDATE/INSERT on elo_ratings (own vs other user)

### 5. Socket tests (T7, T8.3–T8.5)

Use a socket.io client to connect, authenticate, then emit `joinQueue`, `updateScore`, `endGame` etc. with crafted payloads.

---

## Providing Results Back

After running tests (especially with the server fixed and running):

1. **From the Node script:**
   ```bash
   node scripts/security-audit-tests.mjs http://localhost:3001 > scripts/audit-output.txt 2>&1
   ```
   Share `scripts/audit-output.txt` or paste the JSON results at the end.

2. **From manual curl tests:**
   Save the HTTP status codes and response bodies for each test.

3. **From Supabase RLS tests (T2, T3):**
   If you create a script using `@supabase/supabase-js` with a test user JWT, paste the output (which operations succeeded/failed).

---

## Summary

- **Executed:** T1.1–T1.4, T1.7, T2.4, T2.5, T5.1–T5.4
- **Passed:** All executed tests passed except T5.3 (leaked password protection disabled)
- **Blocked:** T4, T6, T7, T8, T9 — server startup failure
- **Skipped:** T1.5, T1.6, T2.1–T2.3, T3.x — require live auth or server
