# KOOI Backend — System Architecture, APIs & Business Logic Reference (v1 Production)

> **Service:** KOOI Backend — Partner for your AI Voice Call Agents  
> **Platform Scope:** KOOI is a multi-tenant enterprise voice automation platform designed for AI-driven lead qualification, outbound campaign execution, real-time inbound telephony routing, post-call extraction analysis, and automated usage billing. Not just for qualification, it supports any industry and any purchase, conversion, or workflow conducted via autonomous voice calling.  
> **Environment:** v1 Production  
> **Base URL:** `http://localhost:5001/api` (configurable via `PORT` & `env`)  
> **Auth Architecture:** httpOnly, SameSite cookies (`access_token`, `refresh_token`) + optional Bearer fallback  
> **Content-Type:** `application/json` (except multipart file uploads & raw webhook payloads)  
> **Credentials:** `withCredentials: true` (axios) / `credentials: "include"` (fetch) required on all frontend calls

---

## 1. Executive Summary & Tech Stack

KOOI is a multi-tenant enterprise voice automation platform designed for AI-driven lead qualification, outbound campaign execution, real-time inbound telephony routing, post-call extraction analysis, and automated usage billing. Rather than being restricted strictly to lead qualification, KOOI is engineered to support any vertical and industry (Real Estate, BFSI, Healthcare, EdTech, Retail, Automotive) and any purchase, appointment, or conversion workflow executed through autonomous voice calling.

### Production Technology Stack

| Layer | Technologies & Libraries |
| :--- | :--- |
| **Runtime & Framework** | Node.js (v20+), Express 5.2.1, TypeScript 5.8+ |
| **Database & ORM** | PostgreSQL, Prisma ORM 6.19.3 |
| **In-Memory Cache & Queues** | Redis 7+ via `ioredis` (6.0.0), Bull Queue (4.16.5) |
| **AI & LLM Services** | Google Gemini (`@google/generative-ai`), TypeSafe AI SDK (`@typesafe-ai/sdk`), Vercel AI Gateway |
| **Telephony Voice Engine** | Bolna AI REST API & Webhooks |
| **Payments & Billing** | Razorpay Node SDK (2.9.8), Custom Integer Ledger |
| **Storage & Media** | Cloudinary SDK (2.10.1) |
| **Email Service** | Resend API (6.25.0) |
| **Security & Utilities** | Helmet, Cookie-Parser, CORS, Zod, Winston, Bcryptjs, JsonWebToken, Node-Cron, PDF-Parse, XLSX, CSV-Parse |

---

## 2. System Architecture

The backend is built around a **Modular Monolith** pattern following **Clean Architecture (DDD principles)** and explicit **Dependency Injection (DI)** wired inside `src/app/container.ts`.

```
                    ┌─────────────────────────────────────────────────────┐
                    │                   Incoming Traffic                  │
                    └──────────────────────────┬──────────────────────────┘
                                               │
             ┌─────────────────────────────────┴─────────────────────────────────┐
             │                                                                   │
             ▼                                                                   ▼
┌─────────────────────────┐                                         ┌─────────────────────────┐
│     Client Requests     │                                         │    External Webhooks    │
│  (Next.js App / Admin)  │                                         │   (Bolna, Razorpay)     │
└────────────┬────────────┘                                         └────────────┬────────────┘
             │                                                                   │
             ▼                                                                   ▼
┌─────────────────────────┐                                         ┌─────────────────────────┐
│   Helmet, CORS, Cookie  │                                         │ express.raw (Razorpay)  │
│   Rate Limiters, Auth   │                                         │ x-webhook-secret (Bolna)│
└────────────┬────────────┘                                         └────────────┬────────────┘
             │                                                                   │
             └─────────────────────────────────┬─────────────────────────────────┘
                                               ▼
                                  ┌─────────────────────────┐
                                  │    App Router & DI      │
                                  │ (src/app/container.ts)  │
                                  └────────────┬────────────┘
                                               │
                 ┌─────────────────────────────┼─────────────────────────────┐
                 ▼                             ▼                             ▼
   ┌───────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────┐
   │    Presentation Layer     │ │     Application Layer     │ │       Domain Layer        │
   │  Controllers, DTOs, Zod   │ │  Use Cases, Schedulers    │ │  Entities, Rules, Errors  │
   └─────────────┬─────────────┘ └─────────────┬─────────────┘ └─────────────┬─────────────┘
                 │                             │                             │
                 └─────────────────────────────┼─────────────────────────────┘
                                               ▼
                                 ┌───────────────────────────┐
                                 │   Infrastructure Layer    │
                                 │ Prisma Repos, Redis, Bull │
                                 │ External APIs (Bolna, AI) │
                                 └─────────────┬─────────────┘
                                               │
                ┌──────────────────────────────┼──────────────────────────────┐
                ▼                              ▼                              ▼
   ┌───────────────────────────┐ ┌───────────────────────────┐  ┌───────────────────────────┐
   │     PostgreSQL DB         │ │      Redis & Bull         │  │   Third-Party Providers   │
   │  (24+ Models, Row-Lock)   │ │  (Job Queues, OTPs, Token)│  │  (Bolna, Cloudinary, AI)  │
   └───────────────────────────┘ └───────────────────────────┘  └───────────────────────────┘
```

### 2.1 Architectural Pillars

1. **Strict Multi-Tenancy & Data Isolation:**
   - Every tenant resource (`Campaign`, `LeadBatch`, `Lead`, `Call`, `Wallet`, `TenantPlan`, `Assistant`) has a mandatory `tenantId`.
   - Tenant requests are verified via `AuthenticateMiddleware.tenant()`, which injects `TenantAuthContext` into `req.user`.
   - All queries filter strictly by `tenantId` and `isDeleted: false` (soft-delete).
2. **Deterministic Prepaid Ledger:**
   - All currency values are stored as **integers in the lowest denomination** (paise for INR, cents for USD).
   - Deductions follow a strict **Bonus-First** policy with lazy expiration and row-locking (`SELECT FOR UPDATE`).
   - If wallet balance drops below required thresholds, running batches are automatically halted.
3. **Asynchronous Background Processing (Bull + Redis):**
   - High-latency batch file ingestion (CSV/XLSX processing, deduplication, Bolna transformation) runs via Bull workers.
   - Post-call objective classifications run asynchronously through dedicated worker queues.
4. **Idempotency & Resilience:**
   - Webhooks and financial transactions require unique idempotency keys (`call:${callId}:${bolnaCallId}`, recharge IDs).
   - Duplicate webhooks never double-charge wallets or corrupt batch counters.
5. **Zero-Trust Administrative Boundary:**
   - Platform Admin operations are isolated under `/api/v1/admin/*`, guarded by `AuthenticateMiddleware.admin()` and `AuthorizeMiddleware.platformAdmin()`.
   - Admins can inspect tenant data in read-only mode by supplying `?tenantId=<uuid>`.

---

## 3. Core System Flows

```mermaid
sequenceDiagram
    autonumber
    actor Tenant as Tenant Admin
    participant API as KOOI API Gateway
    participant Bull as Bull Queue (Redis)
    participant Worker as Batch Worker
    participant Cloud as Cloudinary
    participant Bolna as Bolna Telephony API
    participant Webhook as Webhook Controller
    participant Wallet as Wallet Ledger
    participant JEV as Classifier (LLM)

    Note over Tenant,Bolna: 1. Campaign & Lead Batch Ingestion
    Tenant->>API: POST /v1/campaigns/:id/batches (Upload CSV/XLSX)
    API->>API: Validate Plan Caps & Concurrency Limits
    API->>Cloud: Upload Raw File Buffer
    API->>Bull: Enqueue "process-batch" Job
    API-->>Tenant: 202 Accepted (Batch Status: PROCESSING)

    Worker->>Bull: Pick up Job
    Worker->>Worker: Parse Phones (+91 Normalization) & Dedup
    Worker->>API: Save Leads to PostgreSQL
    Worker->>Bolna: Upload Transformed CSV & Register Webhook
    Worker-->>API: Batch Status: CREATED / SCHEDULED

    Note over Tenant,Bolna: 2. Outbound Execution & Webhook Call Lifecycle
    Tenant->>API: POST /v1/campaigns/:id/batches/:batchId/run
    API->>Wallet: Check Minimum Balance
    API->>Bolna: Trigger Outbound Batch Execution
    
    Bolna->>Webhook: POST /api/webhooks/bolna (Status: ringing / in-progress)
    Webhook->>API: Update Call Status: CALLING
    
    Bolna->>Webhook: POST /api/webhooks/bolna (Status: completed + transcript + extractions)
    Webhook->>API: Save Transcript & Map Dynamic Extractions
    Webhook->>Wallet: Debit Call Cost (paisa) via FOR UPDATE Lock
    Webhook->>Bull: Enqueue JEV Classifier Job
    
    Bull->>JEV: Run Objective Prompts on Transcript
    JEV-->>API: Store ClassifierCallResult
```

### Detailed Flow Descriptions

#### Flow 1: Authentication, Multi-Tenant Session & Token Lifecycle
1. **Login (`POST /v1/auth/login`):** Validates credentials using `bcrypt`.
2. **Tenant Evaluation:**
   - Single tenant membership: Automatically issues a `tenant` type access token and sets httpOnly cookies.
   - Multiple tenant memberships: Returns `requiresTenantSelection: true` with memberships array and sets a `base` access token cookie.
   - User calls `POST /v1/auth/select-tenant` with target `tenantId`, generating a `tenant` scoped access token cookie.
3. **Session Cookies:**
   - `access_token`: 15-minute validity, httpOnly, SameSite (`none` in production, `lax` in development), secure.
   - `refresh_token`: 7-day validity, opaque token with SHA-256 hash stored in DB (`RefreshToken.tokenHash`), tracked by `familyId`.
4. **Token Refresh (`POST /v1/auth/refresh`):**
   - Rotates refresh token within the same `familyId`.
   - **Replay Detection:** If an already-used token is presented, the entire family is immediately revoked, preventing token hijacking.

#### Flow 2: Campaign Variable Extraction (Gemini AI)
1. User uploads a brochure/document (`POST /v1/campaigns/extract-variables`).
2. Backend parses text via `pdf-parse`.
3. Calls Google Gemini (`gemini-2.5-flash` or `gemini-3.5-flash-lite`) with a structured schema prompt matching the assistant's `requiredVariables`.
4. Returns extracted variables and confidence score directly to frontend form.

#### Flow 3: Batch Ingestion & Dedup Engine
1. User uploads a lead sheet (`.csv` or `.xlsx`) to `POST /v1/campaigns/:id/batches`.
2. Fast-fails if plan caps are violated (`maxActiveCampaigns`, concurrent campaign conflicts at scheduled time).
3. Concurrency guard prevents >2 concurrent file uploads per tenant.
4. Stores raw file in Cloudinary, creates `LeadBatch` in `PROCESSING` status, and enqueues job to Bull.
5. Worker runs:
   - Validates Indian phone numbers (+91 standard format).
   - In-file deduplication (keeps first occurrence).
   - Cross-batch deduplication across campaign (unless `SKIP_CROSS_BATCH_DEDUP=true`).
   - Checks `maxLeadsPerBatch` plan limit.
   - Inserts valid `Lead` records in DB.
   - Transforms into Bolna-compatible CSV injecting campaign variables.
   - Posts CSV to Bolna API, receiving `bolnaBatchId`.
   - Sets batch status to `CREATED` (or `SCHEDULED` / `RUNNING`).

#### Flow 4: Telephony Webhook Ingestion & Financial Settlement
1. Bolna triggers `POST /api/webhooks/bolna` with header `x-webhook-secret`.
2. **Intermediate States (`initiated`, `ringing`, `in-progress`):**
   - Marks Call as `CALLING`, batch and campaign as `RUNNING`.
   - Checks tenant balance asynchronously.
3. **Completed State (`completed`, `ended`):**
   - Parses transcript & message turn arrays.
   - Maps Bolna `extracted_data` into `CallExtractionOverview` (objective) and `CallExtractionInsight` (subjective).
   - Calculates billable duration using plan version parameters (`billingMinimumSec`, `billingIncrementSec`, `perMinuteRate`).
   - Atomically debits tenant wallet via pessimistic lock (`FOR UPDATE`), deducting bonus credits first.
   - Enqueues call transcript to Bull queue `classifier-extraction` for independent LLM evaluation.
   - Increments campaign and batch completed/failed statistics counters.

#### Flow 5: Workspace Migration & Bolna Key Switching
1. Platform Admin requests workspace key assignment or switch (`POST /v1/admin/bolna-keys/:id/assign`).
2. Checks readiness: confirms no running campaigns/batches.
3. Sets `tenant.workspaceSwitchStatus = 'CLONING'`.
4. `assertTenantNotFrozen` blocks any tenant mutative actions with HTTP 409 Conflict.
5. `AgentCloneWorker` copies all master platform agents to the target Bolna account using the target Bolna API key.
6. Updates `Assistant` entities with new cloned Bolna agent IDs and sets `workspaceSwitchStatus = 'IDLE'`.

#### Flow 6: Real-Time Inbound Caller Matching
1. Bolna agent prompt runtime calls `GET /api/v1/public/inbound/caller-match?contact_number=...&agent_id=...&execution_id=...`.
2. Authenticated via `verifyBolnaInbound` (`Bearer BOLNA_INBOUND_AUTH_TOKEN`).
3. Matches normalized incoming phone number against existing `Lead` records in DB.
4. Returns a flat JSON context object directly to Bolna prompt context in sub-100ms.

---

## 4. Modules & Directory Structure

```
express-backend/
├── prisma/
│   └── schema.prisma                  # 24+ Data Models, Enums, Relations & Indexes
├── src/
│   ├── app/
│   │   ├── container.ts               # Dependency Injection Container (AppContainer)
│   │   ├── index.ts                   # Express App Configuration, Middleware & Security
│   │   └── routes.ts                  # Centralized Route Mounting (Tenant & Admin)
│   ├── modules/
│   │   ├── assistants/                # Tenant & Admin Assistant Management
│   │   ├── auth/                      # Authentication, JWT, Refresh Tokens, Passwords, OTP
│   │   ├── batches/                   # Lead Batches, CSV Transformation, Upload Worker
│   │   ├── bolna-api-keys/            # Multi-Key Encryption, Balance Sync, Workspace Switching
│   │   ├── calls/                     # Call History, Recordings, Transcripts, Inbound Match
│   │   ├── campaigns/                 # Outbound Campaigns, Gemini PDF Variable Extraction
│   │   ├── classifier/                # TypeSafe JEV Post-Call Classifier & LLM Evaluation
│   │   ├── dashboard/                 # Analytics, KPI Cards, Trends & Distributions
│   │   ├── extractions/               # Dynamic Extraction Taxonomies (Categories, Dispositions)
│   │   ├── industry-packs/            # Industry Verticals, Calling Hours, Compliance
│   │   ├── invites/                   # Admin Owner Invites & Workspace Invitations
│   │   ├── leads/                     # Lead Records, Phone Normalization, Deduplication
│   │   ├── payments/                  # Razorpay Orders, Signatures, Webhook Ingestion
│   │   ├── plans/                     # Plan Families, Versioning, Quotas, Pricing Calculator
│   │   ├── platform-agents/           # Master Agent Blueprints, Cloning & Bolna Sync
│   │   ├── tenants/                   # Tenant Organizations, Settings, Overrides
│   │   ├── users/                     # Global Users & Tenant Memberships (RBAC)
│   │   ├── wallet/                    # Prepaid Financial Ledger, Bonus Expiry, Balance Checks
│   │   └── webhooks/                  # Bolna Telephony Webhook Ingestion
│   ├── seeds/                         # Database Seed Scripts (Plans, Dispositions, Admin)
│   ├── server.ts                      # Server Bootstrap, Background Schedulers & Shutdown
│   └── shared/
│       ├── config/                    # Environment, Database, Redis, External Clients
│       ├── constants/                 # Cookies, Headers, HTTP Statuses, Messages
│       ├── errors/                    # Domain Error Hierarchy (AppError, ValidationError, etc.)
│       ├── logging/                   # Winston Logger Wrapper
│       ├── middleware/                # Authenticate, Authorize, EnforcePlan, Upload, RateLimit
│       ├── types/                     # Shared TypeScript Interfaces & DTO Types
│       └── utils/                     # Phone Rules, Response Envelopes, Date Helpers
```

---

## 5. Database Entities & Schema (Prisma)

The database schema (`prisma/schema.prisma`) comprises 24+ models structured into distinct functional domains:

### 5.1 Multi-Tenancy & Identity

| Model | Fields & Purpose | Key Constraints & Relations |
| :--- | :--- | :--- |
| **`Tenant`** | Multi-tenant organization account (`id`, `name`, `email`, `isActive`, `termsAccepted`, `workspaceSwitchStatus`). | Unique `email`. Relations to `Wallet`, `TenantPlan`, `Campaign`, `Assistant`, `BolnaApiKey`. |
| **`User`** | Global user identity (`id`, `email`, `password`, `name`, `isActive`). | Unique `email`. Relations to `TenantUser` (memberships), `PlatformAdmin`, `RefreshToken`. |
| **`TenantUser`** | Junction table mapping User to Tenant with RBAC role (`OWNER`, `ADMIN`, `USER`). | Unique composite `[userId, tenantId]`. Cascade delete on User/Tenant deletion. |
| **`PlatformAdmin`**| Superuser flag mapping to a `User`. Grants platform admin API rights. | Unique `userId`. |
| **`RefreshToken`** | Refresh token rotation tracker (`id`, `tokenHash`, `familyId`, `expiresAt`, `revokedAt`). | Unique `tokenHash`. Indexed by `[userId]` and `[familyId]`. |

### 5.2 Voice Agents & Campaigns

| Model | Fields & Purpose | Key Constraints & Relations |
| :--- | :--- | :--- |
| **`PlatformAgent`** | Master blueprint in Bolna (`id`, `bolnaId`, `slug`, `name`, `defaultConfig`, `systemPrompt`, `gender`). | Unique `bolnaId`, `slug`. Belongs to `BolnaApiKey` and optional `IndustryPack`. |
| **`Assistant`** | Tenant-specific clone of a PlatformAgent (`id`, `name`, `config`, `platformAgentId`, `tenantId`, `isDeleted`). | Belongs to `Tenant` and `PlatformAgent`. Soft-deleted via `isDeleted`. |
| **`Campaign`** | Outbound campaign (`id`, `name`, `status` [DRAFT, RUNNING, COMPLETED, FAILED], `variables`, `totalLeads`, counts). | Belongs to `Tenant` and `Assistant`. Has many `LeadBatch`, `Lead`, `Call`. Soft-deleted. |
| **`LeadBatch`** | Batch upload entity (`id`, `bolnaBatchId`, `status`, `rawFileUrl`, `processingStage`, `processingProgress`). | Unique `bolnaBatchId`. Status: `PROCESSING`, `CREATED`, `SCHEDULED`, `RUNNING`, `STOPPED`, `COMPLETED`, `FAILED`. |
| **`Lead`** | Individual phone contact (`id`, `name`, `phone`, `email`, `status`, `doNotCall`, `stoppedReason`). | Unique `[phone, campaignId]`. Status: `PENDING`, `CALLING`, `CALLED`, `NO_ANSWER`, `FAILED`, `STOPPED`. |

### 5.3 Calls & Analysis

| Model | Fields & Purpose | Key Constraints & Relations |
| :--- | :--- | :--- |
| **`Call`** | Individual voice call session (`id`, `bolnaCallId`, `status`, `duration`, `cost`, `platformCost`, `billableSeconds`, `transcript`, `recording`). | Unique `bolnaCallId`. Status: `PENDING`, `CALLING`, `COMPLETED`, `FAILED`, `NO_ANSWER`, `BUSY`, `STOPPED`. |
| **`CallAnalysis`** | Legacy dynamic extractions & raw outcome storage. | 1:1 relation with `Call`. |
| **`CallExtractionOverview`** | Materialized objective outcomes extracted by Bolna agent prompt. | Indexed by `[tenantId, campaignId, dispositionId]`. |
| **`CallExtractionInsight`** | Materialized subjective / free-text insights extracted by Bolna. | Stores `subjectiveValue` & `normalizedValue`. Indexed by normalized key. |
| **`ClassifierCallResult`** | Independent post-call JEV LLM classification results. | Unique `callId`. Contains token metrics, gateway cost, raw response. |

### 5.4 Plans, Wallet & Ledger

| Model | Fields & Purpose | Key Constraints & Relations |
| :--- | :--- | :--- |
| **`Plan`** | Plan family definition (`id`, `name`, `slug`, `isActive`, `displayOrder`). | Unique `slug`. Has many `PlanVersion` entries. |
| **`PlanVersion`** | Immutable plan version (`version`, `status` [DRAFT, PUBLISHED, ARCHIVED], `perMinuteRate`, `billingMinimumSec`, `billingIncrementSec`, caps). | Unique composite `[planId, version]`. PUBLISHED versions cannot be edited. |
| **`TenantPlan`** | Tenant subscription status (`status` [PENDING_PAYMENT, ACTIVE, EXPIRED, CANCELLED], overrides). | Unique `tenantId`. Has commercial rate overrides. |
| **`TenantPlanEvent`** | Immutable plan event audit log (`CREATED`, `ACTIVATED`, `PLAN_CHANGED`, `OVERRIDES_UPDATED`, etc.). | Indexed by `[tenantId, createdAt]`. |
| **`Wallet`** | Tenant prepaid financial balance (`cashBalance`, `bonusBalance`, `bonusExpiresAt`, `currency`). | Unique `tenantId`. All balances stored in integer paise. |
| **`WalletTransaction`** | Immutable financial audit ledger (`type` [CREDIT, DEBIT, BONUS, BONUS_EXPIRY, REFUND, ADJUSTMENT], deltas, balances after). | Unique composite `[walletId, idempotencyKey]`. |
| **`Recharge`** | Payment transaction record (`amount`, `purpose` [ONBOARDING, WALLET_TOPUP], `status`, `razorpayOrderId`, `razorpayPaymentId`). | Unique `razorpayOrderId` and `razorpayPaymentId`. |

### 5.5 Extraction Taxonomy & Classifier

| Model | Fields & Purpose | Key Constraints & Relations |
| :--- | :--- | :--- |
| **`IndustryPack`** | Industry vertical settings (`slug`, `allowedCallingHours`, `requiresConsent`). | Unique `slug`. Has many `PlatformAgent` & `ClassifierDisposition`. |
| **`ExtractionCategory`** | Taxonomy category for Bolna agent extractions. | Unique `slug`. Junction with `IndustryPack` and `ExtractionDisposition`. |
| **`ExtractionDisposition`** | Question/field to extract via Bolna agent prompt (`isObjective`, `isSubjective`). | Unique `slug`. Linked to Platform Agents via `AgentBolnaExtractionBinding`. |
| **`ClassifierDisposition`** | Independent LLM prompt question (`questionType` [BOOLEAN, CHOICE, MULTI_CHOICE]). | Unique `[slug, industryPackId]`. Mapped to Platform Agents via `PlatformAgentClassifier`. |

---

## 6. Complete API Reference

All requests accept and return JSON unless otherwise stated. Authentication is handled automatically via httpOnly cookies with `withCredentials: true`.

### 6.1 Standard API Response Envelope

#### Success (200, 201, 202)
```json
{
  "success": true,
  "message": "Operation completed successfully.",
  "data": { ... }
}
```

#### Error (400, 401, 403, 404, 409, 422, 429, 500)
```json
{
  "success": false,
  "error": "Human-readable error description",
  "code": "ERROR_CODE_STRING",
  "details": [
    { "field": "email", "message": "Invalid email format" }
  ]
}
```

---

### 6.2 Public Webhooks & Health

| Method | Endpoint | Auth Guard | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | System status, service name, version, and timestamp. |
| `POST` | `/webhooks/razorpay` | HMAC SHA-256 | Raw body webhook for payment events (`order.paid`, `payment.captured`, `payment.failed`). |
| `POST` | `/webhooks/bolna` | `x-webhook-secret` | Bolna call lifecycle webhook (`ringing`, `in-progress`, `completed`, `failed`, `no-answer`). |
| `POST` | `/webhooks/bolna-batch` | `x-webhook-secret` | Bolna batch lifecycle webhook (batch state transitions). |

---

### 6.3 Public Inbound Telephony

| Method | Endpoint | Auth Guard | Query Parameters | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/v1/public/inbound/caller-match` | Bearer Token (`BOLNA_INBOUND_AUTH_TOKEN`) | `contact_number`, `agent_id`, `execution_id` | Returns flat JSON matching caller details to Bolna prompt context. |

---

### 6.4 Tenant Authentication (`/v1/auth`)

| Method | Endpoint | Auth Guard | Body Payload | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/v1/auth/register/send-otp` | Public (Rate Limited) | `{ email }` | Sends 6-digit registration verification OTP via email. |
| `POST` | `/v1/auth/register` | Public (Rate Limited) | `{ email, password, name, tenantName, otp }` | Creates user, tenant, membership (`OWNER`), default wallet. Sets cookies. |
| `POST` | `/v1/auth/login` | Public (Rate Limited) | `{ email, password }` | Authenticates user. Automatically selects single tenant or prompts choice. |
| `POST` | `/v1/auth/select-tenant` | Any Authenticated | `{ tenantId }` | Selects active workspace, setting tenant-scoped `access_token` cookie. |
| `POST` | `/v1/auth/refresh` | Public / Cookie | None | Rotates refresh token in family, renewing auth cookies. |
| `POST` | `/v1/auth/logout` | Public / Cookie | None | Revokes refresh token family and clears httpOnly cookies. |
| `GET` | `/v1/auth/profile` | Any Authenticated | None | Returns user profile, active tenant, and all memberships. |
| `POST` | `/v1/auth/forgot-password` | Public (Rate Limited) | `{ email }` | Sends password reset OTP to user email. |
| `POST` | `/v1/auth/forgot-password/verify-otp` | Public (Rate Limited) | `{ email, otp }` | Verifies reset OTP, returning a short-lived `resetToken`. |
| `POST` | `/v1/auth/reset-password` | Public (Rate Limited) | `{ resetToken, newPassword }` | Resets password using verified token. |
| `POST` | `/v1/auth/change-password` | Any Authenticated | `{ currentPassword, newPassword }` | Changes password for authenticated user. |
| `POST` | `/v1/auth/revoke-all-sessions`| Any Authenticated | None | Revokes all active refresh token families for user. |
| `POST` | `/v1/auth/invites` | Tenant (`OWNER`, `ADMIN`) | `{ email, role }` | Invites team member to current workspace via email token. |
| `POST` | `/v1/auth/accept-invite` | Public | `{ token, name, password }` | Accepts invitation, registers profile, and joins workspace. |

---

### 6.5 Public Owner Invites (`/v1/auth/owner-invites`)

| Method | Endpoint | Auth Guard | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/auth/owner-invites/:token` | Public | Inspects admin-issued tenant owner invitation details (plan, discounts). |
| `POST` | `/v1/auth/owner-invites/accept` | Public | Accepts owner invite (`{ token, name, password }`), creating tenant and owner profile. |

---

### 6.6 Tenant Workspace & Team Settings

| Method | Endpoint | Auth Guard | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/tenants/current` | Tenant Member | Fetches current tenant settings, terms acceptance, and switch status. |
| `PATCH` | `/v1/tenants/current` | Tenant (`OWNER`, `ADMIN`) | Updates workspace name (`{ name }`). |
| `GET` | `/v1/tenants/current/stats` | Tenant (`OWNER`, `ADMIN`) | High-level workspace statistics (campaigns, calls, connect rates). |
| `GET` | `/v1/users` | Tenant (`OWNER`, `ADMIN`) | Lists team members in current workspace. |
| `POST` | `/v1/users` | Tenant (`OWNER`, `ADMIN`) | Directly creates a tenant team user (`{ email, name, password, role }`). |
| `PATCH` | `/v1/users/:id` | Tenant (`OWNER`, `ADMIN`) | Updates user role or details (`{ name, role }`). |
| `DELETE` | `/v1/users/:id` | Tenant (`OWNER`, `ADMIN`) | Removes user membership from tenant. |

---

### 6.7 Tenant Plans, Wallet & Payments

| Method | Endpoint | Auth Guard | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/plans/available` | Any Authenticated | Lists published subscription plans, per-minute pricing, limits, and tiers. |
| `GET` | `/v1/plans/mine` | Tenant Member | Returns tenant's active plan, effective commercials, and bonus expiry. |
| `POST` | `/v1/plans/:planId/select` | Tenant Member | Self-selects initial plan prior to onboarding payment. |
| `POST` | `/v1/plans/change` | Tenant Member | Changes plan tier (`{ targetPlanId, targetVersionId }`). |
| `GET` | `/v1/wallet` | Tenant Member | Current wallet balance (`cashBalance`, `bonusBalance`, `bonusExpiresAt`). |
| `GET` | `/v1/wallet/transactions` | Tenant Member | Paginated financial transaction ledger (`?page=&limit=`). |
| `POST` | `/v1/payments/create-order` | Tenant Member | Creates Razorpay order (`{ purpose: "ONBOARDING" \| "WALLET_TOPUP", amount }`). |
| `POST` | `/v1/payments/verify` | Tenant Member | Verifies Razorpay signature (`{ razorpayOrderId, razorpayPaymentId, razorpaySignature }`). |
| `GET` | `/v1/payments/order-status/:orderId` | Tenant Member | Polls status of a payment order. |

---

### 6.8 Tenant Assistants & Campaigns

| Method | Endpoint | Auth Guard | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/assistants` | Tenant Member | Lists voice assistants available in tenant workspace. |
| `GET` | `/v1/assistants/:id` | Tenant Member | Retrieves assistant configuration and required variable list. |
| `GET` | `/v1/campaigns` | Tenant Member | Lists campaigns (`?status=&search=&page=&limit=`). |
| `POST` | `/v1/campaigns` | Tenant Member | Creates campaign (`{ name, assistantId, variables, defaultRetryConfig }`). Enforces plan cap. |
| `POST` | `/v1/campaigns/extract-variables` | Tenant Member | Multipart upload (`file`: PDF) parsed by Gemini AI to extract assistant variables. |
| `GET` | `/v1/campaigns/:id` | Tenant Member | Retrieves campaign details. |
| `GET` | `/v1/campaigns/:id/stats` | Tenant Member | Lead counts by status for campaign (`totalLeads`, `calledLeads`, `completedLeads`). |
| `GET` | `/v1/campaigns/:id/extraction-overview` | Tenant Member | Aggregated objective extraction metrics for campaign. |
| `GET` | `/v1/campaigns/:id/extraction-insights` | Tenant Member | Aggregated subjective extraction text insights for campaign. |
| `POST` | `/v1/campaigns/:id/parse-leads` | Tenant Member | Multipart upload (`file`: CSV/XLSX) preview parsing without saving. |
| `POST` | `/v1/campaigns/:campaignId/parse-manual` | Tenant Member | Validates array of manual lead rows in JSON. |
| `PATCH` | `/v1/campaigns/:id/archive` | Tenant (`OWNER`, `ADMIN`) | Soft-deletes campaign (`isDeleted = true`). |

---

### 6.9 Tenant Batches (Nested under `/v1/campaigns/:campaignId/batches`)

| Method | Endpoint | Auth Guard | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/campaigns/:campaignId/batches` | Tenant Member | Lists batches under the campaign. |
| `POST` | `/v1/campaigns/:campaignId/batches` | Tenant Member | Multipart upload (`file`: CSV/XLSX). Enqueues async processing to Bull queue. |
| `POST` | `/v1/campaigns/:campaignId/batches/manual` | Tenant Member | Creates batch from manual JSON rows array. |
| `GET` | `/v1/campaigns/:campaignId/batches/:batchId` | Tenant Member | Batch details, `processingStage`, `processingProgress` (0-100%). |
| `GET` | `/v1/campaigns/:campaignId/batches/:batchId/stats` | Tenant Member | Real-time call outcomes for batch. |
| `POST` | `/v1/campaigns/:campaignId/batches/:batchId/run` | Tenant Member | Runs batch immediately (checks wallet balance & triggers Bolna). |
| `POST` | `/v1/campaigns/:campaignId/batches/:batchId/schedule` | Tenant Member | Schedules batch at future datetime (`{ scheduledAt }`). |
| `POST` | `/v1/campaigns/:campaignId/batches/:batchId/stop` | Tenant Member | Pauses running batch execution. |
| `POST` | `/v1/campaigns/:campaignId/batches/:batchId/resume` | Tenant Member | Resumes stopped batch. |
| `DELETE`| `/v1/campaigns/:campaignId/batches/:batchId` | Tenant (`OWNER`, `ADMIN`) | Deletes batch. |
| `PATCH` | `/v1/campaigns/:campaignId/batches/:batchId/archive` | Tenant (`OWNER`, `ADMIN`) | Soft-deletes batch. |

---

### 6.10 Tenant Leads, Calls & Dashboard

| Method | Endpoint | Auth Guard | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/leads` | Tenant Member | Filtered lead list (`?campaignId=&batchId=&status=&search=&page=&limit=`). |
| `GET` | `/v1/leads/stats` | Tenant Member | Lead counts grouped by status. |
| `GET` | `/v1/leads/:id` | Tenant Member | Lead details and historical call attempts. |
| `PATCH` | `/v1/leads/:id/archive` | Tenant (`OWNER`, `ADMIN`) | Soft-deletes lead. |
| `GET` | `/v1/calls` | Tenant Member | Filtered call records (`?campaignId=&batchId=&status=&disposition=&page=&limit=`). |
| `GET` | `/v1/calls/stats` | Tenant Member | Aggregated call stats (duration, cost, completion rate). |
| `GET` | `/v1/calls/available-filters` | Tenant Member | Dynamic filter options populated from call data. |
| `GET` | `/v1/calls/:id` | Tenant Member | Call detail with cost breakdown, recording URL, summary. |
| `GET` | `/v1/calls/:id/transcript` | Tenant Member | Formatted transcript and chronological messages array. |
| `PATCH` | `/v1/calls/:id/archive` | Tenant (`OWNER`, `ADMIN`) | Soft-deletes call record. |
| `GET` | `/v1/dashboard/overview` | Tenant Member | KPI overview cards (active campaigns, calls made, balance). |
| `GET` | `/v1/dashboard/call-trends` | Tenant Member | Time-series call volume and completion trends. |
| `GET` | `/v1/dashboard/spend-trends` | Tenant Member | Time-series wallet debit / spend trends. |
| `GET` | `/v1/dashboard/lead-funnel` | Tenant Member | Lead status conversion funnel. |
| `GET` | `/v1/classifier/results` | Tenant Member | Objective evaluation results for calls. |
| `GET` | `/v1/classifier/results/:callId` | Tenant Member | Objective evaluation result for a single call. |

---

### 6.11 Platform Admin APIs (`/v1/admin/*`)

> **All endpoints below require Platform Admin authentication:**  
> Verified via `AuthenticateMiddleware.admin()` and `AuthorizeMiddleware.platformAdmin()`.  
> Scoped queries require `?tenantId=<uuid>` where noted.

#### Admin Auth & Invites
- `POST /v1/admin/auth/login` — Admin login (sets admin httpOnly cookies)
- `POST /v1/admin/auth/forgot-password` — Admin password reset OTP request
- `POST /v1/admin/auth/forgot-password/verify-otp` — Verify reset OTP
- `POST /v1/admin/auth/reset-password` — Reset admin password
- `POST /v1/admin/auth/change-password` — Change password (authenticated)
- `POST /v1/admin/auth/logout` — Admin logout
- `POST /v1/admin/invites` — Create tenant owner onboarding invite
- `GET /v1/admin/invites` — List all owner invitations
- `POST /v1/admin/invites/:id/resend` — Resend invite email
- `POST /v1/admin/invites/:id/revoke` — Revoke invite token

#### Admin Dashboard & Tenants Management
- `GET /v1/admin/dashboard/overview` — Platform-wide KPIs (tenants, calls, revenue)
- `GET /v1/admin/dashboard/revenue-trends` — Platform revenue over time
- `GET /v1/admin/dashboard/call-volume-trends` — Call volume over time
- `GET /v1/admin/dashboard/tenant-distribution` — Tenants grouped by plan tier
- `GET /v1/admin/dashboard/top-tenants` — Top tenants by volume/spend
- `GET /v1/admin/tenants` — List all registered tenants
- `GET /v1/admin/tenants/:id` — Single tenant detail
- `GET /v1/admin/tenants/:id/stats` — Tenant performance metrics
- `PATCH /v1/admin/tenants/:id` — Update tenant status (`isActive`) or name
- `GET /v1/admin/users` — List all platform users
- `PATCH /v1/admin/users/:id/active` — Toggle user active state (deactivation kicks sessions)

#### Admin Plans & Subscriptions
- `GET /v1/admin/plans` — List plan families
- `GET /v1/admin/plans/:id` — Single plan family detail
- `POST /v1/admin/plans` — Create plan family (`{ name, slug, description, displayOrder }`)
- `PATCH /v1/admin/plans/:id` — Update plan family
- `POST /v1/admin/plans/:id/versions` — Create immutable plan version
- `POST /v1/admin/plans/versions/:versionId/publish` — Publish version (makes available for assignment)
- `POST /v1/admin/plans/versions/:versionId/archive` — Archive version (grandfathers active users)
- `PATCH /v1/admin/plans/tenants/:tenantId/overrides` — Custom pricing overrides for tenant
- `POST /v1/admin/plans/tenants/:tenantId/change-plan` — Admin migration of tenant plan
- `GET /v1/admin/plans/:planId/subscribers` — Paginated subscriber list with real-time usage vs limits

#### Admin Bolna Keys & Workspace Migration
- `GET /v1/admin/bolna-keys` — List encrypted Bolna keys, balance & concurrency
- `POST /v1/admin/bolna-keys` — Register encrypted Bolna key (`{ keyIdentifier, rawApiKey, type }`)
- `PATCH /v1/admin/bolna-keys/:id` — Update key label/type
- `POST /v1/admin/bolna-keys/:id/assign` — Assign Bolna key to tenant (triggers workspace switch)
- `POST /v1/admin/bolna-keys/:id/activate` / `deactivate` — Key lifecycle toggle
- `POST /v1/admin/bolna-keys/:id/refresh-profile` — Sync live balance from Bolna API
- `GET /v1/admin/bolna-keys/:id/tenants` — Tenants assigned to key
- `GET /v1/admin/bolna-keys/switch-readiness` — Pre-flight check (confirms no running batches)
- `GET /v1/admin/bolna-keys/tenants/:tenantId/switch-status` — Polling migration status (`IDLE` \| `CLONING` \| `FAILED`)

#### Admin Platform Agents & Blueprint Management
- `GET /v1/admin/platform-agents/discover-bolna-agents` — Discover agents in master Bolna account
- `GET /v1/admin/platform-agents/preview-bolna-agent/:bolnaId` — Preview agent configuration
- `POST /v1/admin/platform-agents/import-from-bolna` — Import agent as master platform agent
- `GET /v1/admin/platform-agents` — List platform agents
- `GET /v1/admin/platform-agents/:id` — Get blueprint details
- `POST /v1/admin/platform-agents` — Register platform agent manually
- `PATCH /v1/admin/platform-agents/:id` — Update blueprint
- `POST /v1/admin/platform-agents/:id/sync` — Sync blueprint with Bolna API
- `DELETE /v1/admin/platform-agents/:id` — Delete blueprint
- `POST /v1/admin/platform-agents/:id/sync-blueprint` — Push updates downstream to tenant assistants
- `POST /v1/admin/platform-agents/create-agent` — Create agent from scratch
- `POST /v1/admin/platform-agents/clone` — Clone agent into target workspace
- `GET /v1/admin/platform-agents/:id/assignments` — List tenants using agent
- `GET /v1/admin/platform-agents/:id/extractions` — List extraction categories/dispositions bound to agent
- `POST /v1/admin/platform-agents/:id/categories` — Assign extraction category
- `DELETE /v1/admin/platform-agents/:id/categories/:categoryId` — Remove category
- `POST /v1/admin/platform-agents/:id/dispositions` — Assign disposition
- `DELETE /v1/admin/platform-agents/:id/dispositions/:dispositionId` — Remove disposition
- `POST /v1/admin/platform-agents/:id/extractions/sync` — Sync extraction bindings to Bolna agent config
- `PATCH /v1/admin/platform-agents/:id/extraction-config` — Update prompt variables config

#### Admin Extraction Taxonomy & Industry Packs
- `GET /v1/admin/extractions/bolna/categories` & `dispositions` — Read-only preview from Bolna
- `POST /v1/admin/extractions/categories` — Create extraction category
- `GET /v1/admin/extractions/categories` (`/:id`) — List / view categories
- `PATCH /v1/admin/extractions/categories/:id` — Update category
- `DELETE /v1/admin/extractions/categories/:id` — Delete category
- `POST /v1/admin/extractions/categories/:id/industries` — Link category to industry pack
- `DELETE /v1/admin/extractions/categories/:id/industries/:industryPackId` — Unlink industry pack
- `POST /v1/admin/extractions/categories/:id/dispositions` — Link dispositions to category
- `DELETE /v1/admin/extractions/categories/:id/dispositions/:dispositionId` — Unlink disposition
- `POST /v1/admin/extractions/dispositions` — Create extraction disposition
- `GET /v1/admin/extractions/dispositions` (`/:id`) — List / view dispositions
- `PATCH /v1/admin/extractions/dispositions/:id` — Update disposition
- `DELETE /v1/admin/extractions/dispositions/:id` — Delete disposition
- `POST /v1/admin/extractions/dispositions/:id/industries` — Link disposition to industry pack
- `DELETE /v1/admin/extractions/dispositions/:id/industries/:industryPackId` — Unlink industry pack
- `POST /v1/admin/industry-packs` — Create industry pack
- `GET /v1/admin/industry-packs` (`/:id`) — List / view industry packs
- `PATCH /v1/admin/industry-packs/:id` — Update industry pack
- `DELETE /v1/admin/industry-packs/:id` — Delete industry pack
- `POST /v1/admin/industry-packs/:id/agents` — Assign platform agent to industry pack
- `DELETE /v1/admin/industry-packs/agents/:agentId` — Remove agent from industry pack

#### Admin Classifier System (TypeSafe JEV LLM)
- `POST /v1/admin/classifier/dispositions` — Create classifier question (`BOOLEAN`, `CHOICE`, `MULTI_CHOICE`)
- `PATCH /v1/admin/classifier/dispositions/:id` — Update classifier question
- `DELETE /v1/admin/classifier/dispositions/:id` — Delete classifier question
- `GET /v1/admin/classifier/dispositions` (`/:id`) — List / view questions
- `POST /v1/admin/classifier/agents/:agentId/assign` — Assign question to platform agent
- `POST /v1/admin/classifier/agents/:agentId/remove` — Remove question from agent
- `GET /v1/admin/classifier/agents/:agentId/dispositions` — List questions assigned to agent
- `POST /v1/admin/classifier/test` — Test classifier prompt against a sample transcript
- `GET /v1/admin/classifier/results` (`/:callId`) — View all call evaluation results

#### Admin Wallet & Financial Operations
- `GET /v1/admin/wallet/tenants/:tenantId` — Inspect tenant wallet balance
- `GET /v1/admin/wallet/tenants/:tenantId/transactions` — Inspect tenant financial ledger
- `POST /v1/admin/wallet/adjust` — Manual credit/debit adjustment (`{ tenantId, amount, type, description }`)
- `GET /v1/admin/payments/summary` — Financial platform totals
- `GET /v1/admin/payments` — List all payment recharges
- `POST /v1/admin/payments/activate-free` — Activate free onboarding for tenant (skips payment gateway)

#### Admin Scoped Data Inspection (Read-Only)
- `GET /v1/admin/campaigns?tenantId=<uuid>` (`/:id`, `/:id/stats`, `/:id/archive`, `/:id/restore`)
- `GET /v1/admin/batches?tenantId=<uuid>&campaignId=<uuid>` (`/:id`, `/:id/stats`, `/:id/archive`, `/:id/restore`)
- `GET /v1/admin/leads?tenantId=<uuid>` (`/stats`, `/:id`, `/:id/archive`, `/:id/restore`)
- `GET /v1/admin/calls?tenantId=<uuid>` (`/stats`, `/available-filters`, `/:id`, `/:id/transcript`, `/:id/archive`, `/:id/restore`)
- `GET /v1/admin/assistants?tenantId=<uuid>` (`/:id`, `/register`, `PATCH /:id`, `DELETE /:id`, `/:id/restore`)

---

## 7. Business Logic & Domain Rules

### 7.1 Financial Ledger & Billing Rules

1. **Integer Representation:**
   All monetary amounts are stored in **integer paise** (₹1 = 100 paise). Floating-point arithmetic is strictly banned in financial code.
2. **Deterministic Call Cost Calculation:**
   $$\text{costPaisa} = \left\lceil \frac{\text{billableSeconds}}{60} \times \text{perMinuteRate} \right\rceil$$
   - Calls lasting $\le \text{billingMinimumSec}$ (default: 30s) are billed at the minimum duration.
   - Calls exceeding the minimum are rounded up in increments of $\text{billingIncrementSec}$ (default: 15s).
3. **Bonus-First Deduction Rule:**
   - When a call is billed, the engine deducts from `bonusBalance` first.
   - Any remainder is deducted from `cashBalance`.
   - Lazy bonus expiration: If `bonusExpiresAt <= now`, the bonus balance is automatically set to 0, logged as a `BONUS_EXPIRY` transaction, and the debit proceeds against cash.
4. **Pessimistic Concurrency (`FOR UPDATE`):**
   All credits and debits execute inside a database transaction with a row-level lock on the `Wallet` record (`SELECT * FROM "Wallet" WHERE "tenantId" = ... FOR UPDATE`), preventing double-spend race conditions during concurrent call completions.
5. **Low Balance Guard & Auto-Stop:**
   If `cashBalance + bonusBalance < lowBalanceThreshold` (or balance is insufficient to continue calls), active batches are automatically paused with `LeadStopReason.LOW_BALANCE`.

### 7.2 Phone Number Normalization & Deduplication

1. **Indian Phone Validation:**
   - Must match Indian standard numbering plan: 10-digit mobile starting with 6, 7, 8, or 9.
   - Normalization converts inputs (e.g., `09876543210`, `+91 98765 43210`, `9876543210`) into standard E.164 format: `+919876543210`.
2. **In-File Deduplication:**
   First occurrence of a normalized phone in an uploaded file is kept; duplicates are dropped.
3. **Cross-Batch Deduplication:**
   Within the same `Campaign`, phones already present in existing batches are filtered out to prevent calling the same lead twice (bypassable only via `SKIP_CROSS_BATCH_DEDUP=true`).

### 7.3 Plan Versioning, Quotas & Capabilities

1. **Immutability of Published Plans:**
   Once a `PlanVersion` is set to `PUBLISHED`, its pricing, rates, and limits can never be edited. Changes require creating a new version (`version + 1`).
2. **Grandfathering:**
   Archiving a version does not affect existing tenant subscriptions on that version. New subscriptions receive the latest published version.
3. **Direction Determination:**
   Upgrade vs. downgrade transitions are determined strictly by `Plan.displayOrder` hierarchy, independent of promotional onboarding fees.
4. **Quota Guards (`EnforcePlanMiddleware`):**
   - `maxActiveCampaigns`: Checked before campaign creation and batch runs.
   - `maxLeadsPerBatch`: Enforced during file processing.
   - `maxAgents`: Limits cloned assistants per tenant.
   - `maxTeamMembers`: Limits team member invitations.
   - `retryAutomation`: Disallows automated retry configurations if plan flag is false.

---

## 8. Background Workers, Schedulers & Jobs

The system runs five persistent background schedulers initialized in `src/server.ts`:

| Scheduler | Frequency / Trigger | Worker File | Description |
| :--- | :--- | :--- | :--- |
| **`batchProcessing`** | Event-driven (Bull Queue `batch-processing`) | `batch-processing.worker.ts` | Asynchronously processes uploaded CSV/XLSX lead sheets, validates phones, deduplicates, uploads to Cloudinary, and registers with Bolna API. |
| **`classifierExtraction`** | Event-driven (Bull Queue `classifier-extraction`) | `classifier-extraction.worker.ts` | Asynchronously executes JEV LLM prompt classification on call transcripts after call webhook completion. |
| **`agentClone`** | Cron / Event-driven | `agent-clone.worker.ts` | Clones platform agents into a tenant's workspace during dedicated key assignment or workspace migration. |
| **`bonusExpiry`** | Daily Cron (`0 0 * * *`) | `bonus-expiry.scheduler.ts` | Sweeps database for wallets whose `bonusExpiresAt` has passed, setting `bonusBalance = 0` and recording `BONUS_EXPIRY` ledger entries. |
| **`refreshTokenCleanup`** | Daily Cron (`0 3 * * *`) | `refresh-token-cleanup.scheduler.ts` | Purges expired or revoked tokens from the `RefreshToken` table. |

---

## 9. Configuration & Environment Variables

All configuration is parsed and validated in `src/shared/config/env.ts`:

```bash
# Server & Environment
PORT=5001
NODE_ENV=production                  # 'development' | 'production'
LOG_LEVEL=info                       # 'debug' | 'info' | 'warn' | 'error'
CORS_ORIGINS=http://localhost:3001,https://app.kooi.ai
FRONTEND_URL=https://app.kooi.ai

# Database & Redis
DATABASE_URL=postgresql://user:pass@localhost:5432/kooi_db?schema=public
REDIS_URL=redis://localhost:6379
REDIS_PREFIX={production}

# Authentication & JWT
JWT_SECRET=super-secure-secret-key-at-least-32-chars
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
JWT_INVITE_EXPIRY=7d
JWT_PASSWORD_RESET_EXPIRY=10m

# Bolna Telephony Engine
BOLNA_API_URL=https://api.bolna.ai
BOLNA_KEY_ENCRYPTION_SECRET=32-character-secret-for-aes-256-gcm
BOLNA_INBOUND_AUTH_TOKEN=inbound-secret-bearer-token
BOLNA_TEST_INBOUND_NUMBER=+91XXXXXXXXXX

# Webhooks
WEBHOOK_BASE_URL=https://api.kooi.ai
WEBHOOK_SECRET=bolna-webhook-shared-secret-header

# Google Gemini AI (Campaign PDF Variable Extraction)
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.5-flash        # or gemini-3.5-flash-lite

# TypeSafe AI Classifier (Post-Call JEV Evaluation)
CLASSIFIER_PROVIDER=native           # 'native' | 'ai-gateway'
TYPESAFE_API_KEY=ts_live_...
TYPESAFE_BASE_URL=https://api.typesafe.ai
AI_GATEWAY_API_KEY=
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/typesafe
CLASSIFIER_MODEL=typesafe-ai/jev
CLASSIFIER_MAX_TRANSCRIPT_LENGTH=8000

# Payments (Razorpay)
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=rzp_webhook_secret_...

# Cloudinary Media Storage
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Transactional Email (Resend)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=notifications@kooi.ai

# Feature Flags
SKIP_CROSS_BATCH_DEDUP=false
```

---

## 10. Frontend Client Integration Guide

### Axios Instance Setup
Because authentication is cookie-based, the client must enable credentials:

```typescript
import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api",
  withCredentials: true, // CRITICAL: Sends and receives httpOnly session cookies
  headers: {
    "Content-Type": "application/json",
  },
});

// Automatic token refresh interceptor on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await api.post("/v1/auth/refresh");
        return api(originalRequest);
      } catch (refreshError) {
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);
```
