# KOOI Testing Standards & Invariants

## 1. Toolchain & Runtime
- **Backend:** Vitest + Supertest with native TypeScript and Node 22.
- **Frontend:** Vitest + React Testing Library + Playwright for E2E tests.

## 2. Infrastructure & Isolation
- Real database integration tests must run against a dedicated local PostgreSQL database (e.g. `kooi-test`).
- Pre-flight safety guards must verify `NODE_ENV === "test"` and that the database URL specifically contains `-test` before applying schema migrations or resetting data.
- Redis and Bull queues must default to in-memory `ioredis-mock` for fast, offline, isolated tests.

## 3. External Provider Mocks
- All third-party providers (Bolna, Razorpay, Resend, Cloudinary, Google Gemini, TypeSafe JEV) must be mocked using deterministic fixtures (+919876500001..+919876500099).
- No live calls, emails, charges, or live LLM inferences during standard automated tests.

## 4. Backend Architecture Invariants
- **Response Envelope:** `sendError` outputs `{ success: false, error: string, code: string }`. Test assertions on error codes must check `res.body.code`, while `res.body.error` is the error message string.
- **404 Status:** All `NotFoundError` subclasses emit code `"NOT_FOUND"`.
- **Virtual Aggregations:** `Campaign` and `LeadBatch` metrics (`totalLeads`, `calledLeads`, `completedLeads`) are aggregated from child tables (`Lead`, `Call`), never stored on the parent record.
- **Error Mapping:** Technical-to-tenant error mapping must support case-insensitive substrings and parameterized strings.
- **Financial & Concurrency Safety:** Wallet balance debits must use pessimistic row locking (`SELECT ... FOR UPDATE`), bonus-first deduction, and ledger double-entry bookkeeping (`CALL_DEBIT`, `RECHARGE`).
