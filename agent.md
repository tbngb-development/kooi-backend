# `agent.md`

````markdown
# Lead Qualification API — Frontend Integration Guide

> **Base URL:** `http://localhost:5000/api`
> **Auth:** httpOnly cookies (automatic). Do NOT read tokens from response body.
> **Content-Type:** `application/json` (unless noted)
> **Credentials:** `withCredentials: true` required on all fetch/axios calls

---

## ⚠️ PHASE A — BREAKING CHANGES (Existing APIs Modified)

### 1. Token Delivery Changed (CRITICAL)

**Before (MVP):**

```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "abc...",
      "expiresIn": 900,
      "refreshExpiresIn": 604800
    },
    "user": { ... }
  }
}
```
````

**After (v1):**

```json
{
  "success": true,
  "data": {
    "user": { ... },
    "membership": { ... }
  }
}
```

**What changed:**

- `tokens` field **removed** from ALL auth response bodies
- Tokens are now delivered **exclusively via httpOnly cookies** (`access_token`, `refresh_token`)
- Cookies are set automatically by the browser — no JS access needed
- Frontend must use `withCredentials: true` (axios) or `credentials: "include"` (fetch)

**Affected endpoints:**

| Endpoint                      | Old Response Had `tokens`                | New Response |
| ----------------------------- | ---------------------------------------- | ------------ |
| `POST /v1/auth/register`      | ✅ Yes                                   | ❌ Removed   |
| `POST /v1/auth/login`         | ✅ Yes (when no tenant selection needed) | ❌ Removed   |
| `POST /v1/auth/select-tenant` | ✅ Yes                                   | ❌ Removed   |
| `POST /v1/auth/refresh`       | ✅ Yes                                   | ❌ Removed   |
| `POST /v1/auth/accept-invite` | ✅ Yes                                   | ❌ Removed   |
| `POST /v1/admin/auth/login`   | ✅ Yes                                   | ❌ Removed   |

**Frontend migration steps:**

1. Remove all code that reads `response.data.tokens.accessToken`
2. Remove all code that manually sets `Authorization: Bearer ...` header
3. Remove all localStorage/sessionStorage token storage
4. Ensure axios instance has `withCredentials: true`
5. Ensure fetch calls use `credentials: "include"`
6. For refresh: just call `POST /v1/auth/refresh` — cookies rotate automatically

---

### 2. Auth Response Shape Changes

#### `POST /v1/auth/register`

```json
// NEW response (201)
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "email": "string", "name": "string" },
    "tenant": { "id": "uuid", "name": "string" },
    "membership": { "id": "uuid", "role": "OWNER" }
  }
}
```

#### `POST /v1/auth/login`

```json
// NEW response (200) — single tenant (auto-selected)
{
  "success": true,
  "data": {
    "requiresTenantSelection": false,
    "user": { "id": "uuid", "email": "string", "name": "string", "isPlatformAdmin": false },
    "memberships": [
      { "membershipId": "uuid", "tenantId": "uuid", "tenantName": "string", "role": "OWNER" }
    ]
  }
}

// NEW response (200) — multiple tenants (selection required)
{
  "success": true,
  "data": {
    "requiresTenantSelection": true,
    "user": { "id": "uuid", "email": "string", "name": "string", "isPlatformAdmin": false },
    "memberships": [ ... ]
  }
}
```

#### `POST /v1/auth/select-tenant`

```json
// NEW response (200)
{
  "success": true,
  "data": {
    "membership": {
      "id": "uuid",
      "tenantId": "uuid",
      "tenantName": "string",
      "role": "OWNER"
    }
  }
}
```

#### `POST /v1/auth/refresh`

```json
// NEW response (200)
{
  "success": true,
  "data": {
    "refreshed": true
  }
}
```

#### `POST /v1/auth/accept-invite`

```json
// NEW response (201)
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "email": "string", "name": "string" },
    "membership": {
      "id": "uuid",
      "tenantId": "uuid",
      "tenantName": "string",
      "role": "USER"
    }
  }
}
```

---

### 3. No Route Path Changes for Tenant APIs

All existing tenant API paths remain **unchanged**:

| Method | Path                                                  | Status                |
| ------ | ----------------------------------------------------- | --------------------- |
| GET    | `/v1/campaigns`                                       | ✅ Unchanged          |
| POST   | `/v1/campaigns`                                       | ✅ Unchanged          |
| GET    | `/v1/campaigns/:id`                                   | ✅ Unchanged          |
| GET    | `/v1/campaigns/:id/stats`                             | ✅ Unchanged          |
| GET    | `/v1/campaigns/:id/performance`                       | ✅ Unchanged          |
| POST   | `/v1/campaigns/:id/parse-leads`                       | ✅ Unchanged          |
| GET    | `/v1/campaigns/:campaignId/batches`                   | ✅ Unchanged (nested) |
| POST   | `/v1/campaigns/:campaignId/batches`                   | ✅ Unchanged (nested) |
| GET    | `/v1/campaigns/:campaignId/batches/:batchId`          | ✅ Unchanged          |
| POST   | `/v1/campaigns/:campaignId/batches/:batchId/run`      | ✅ Unchanged          |
| POST   | `/v1/campaigns/:campaignId/batches/:batchId/schedule` | ✅ Unchanged          |
| POST   | `/v1/campaigns/:campaignId/batches/:batchId/stop`     | ✅ Unchanged          |
| POST   | `/v1/campaigns/:campaignId/batches/:batchId/resume`   | ✅ Unchanged          |
| DELETE | `/v1/campaigns/:campaignId/batches/:batchId`          | ✅ Unchanged          |
| GET    | `/v1/campaigns/:campaignId/batches/:batchId/stats`    | ✅ Unchanged          |
| GET    | `/v1/leads`                                           | ✅ Unchanged          |
| GET    | `/v1/leads/stats`                                     | ✅ Unchanged          |
| GET    | `/v1/leads/:id`                                       | ✅ Unchanged          |
| GET    | `/v1/calls`                                           | ✅ Unchanged          |
| GET    | `/v1/calls/stats`                                     | ✅ Unchanged          |
| GET    | `/v1/calls/:id`                                       | ✅ Unchanged          |
| GET    | `/v1/calls/:id/transcript`                            | ✅ Unchanged          |
| GET    | `/v1/dashboard/overview`                              | ✅ Unchanged          |
| GET    | `/v1/dashboard/activity`                              | ✅ Unchanged          |
| GET    | `/v1/dashboard/campaigns`                             | ✅ Unchanged          |
| GET    | `/v1/assistants`                                      | ✅ Unchanged          |
| GET    | `/v1/assistants/:id`                                  | ✅ Unchanged          |
| GET    | `/v1/brochures`                                       | ✅ Unchanged          |
| GET    | `/v1/brochures/:id`                                   | ✅ Unchanged          |
| POST   | `/v1/brochures/extract`                               | ✅ Unchanged          |
| POST   | `/v1/brochures/save`                                  | ✅ Unchanged          |
| PATCH  | `/v1/brochures/:id`                                   | ✅ Unchanged          |
| DELETE | `/v1/brochures/:id`                                   | ✅ Unchanged          |
| GET    | `/v1/users`                                           | ✅ Unchanged          |
| POST   | `/v1/users`                                           | ✅ Unchanged          |
| PATCH  | `/v1/users/:id`                                       | ✅ Unchanged          |
| DELETE | `/v1/users/:id`                                       | ✅ Unchanged          |
| GET    | `/v1/tenants/current`                                 | ✅ Unchanged          |
| PATCH  | `/v1/tenants/current`                                 | ✅ Unchanged          |
| GET    | `/v1/tenants/current/stats`                           | ✅ Unchanged          |

---

## 🆕 PHASE B — NEW ADMIN APIs

> All admin endpoints require **platform admin** authentication.
> Tenant-scoped data is accessed via `?tenantId=<uuid>` query parameter.
> All admin endpoints are **read-only** except tenant and assistant management.

### Auth Headers for Admin

```
Cookie: access_token=<admin-jwt>; refresh_token=<refresh-jwt>
```

No `Authorization` header needed. Cookies are sent automatically with `withCredentials: true`.

---

### Admin Auth

#### `POST /v1/admin/auth/login`

```json
// Request
{ "email": "admin@example.com", "password": "string" }

// Response (200)
{
  "success": true,
  "data": {
    "requiresTenantSelection": false,
    "user": { "id": "uuid", "email": "string", "name": "string", "isPlatformAdmin": true },
    "memberships": []
  }
}
```

---

### Admin Dashboard (NEW)

#### `GET /v1/admin/dashboard/overview`

```json
// Response (200)
{
  "success": true,
  "data": {
    "totalTenants": 12,
    "activeTenants": 10,
    "totalCampaigns": 45,
    "totalCalls": 12840,
    "totalDurationMinutes": 6420
  }
}
```

#### `GET /v1/admin/dashboard/tenants-health`

```json
// Response (200)
{
  "success": true,
  "data": [
    {
      "tenantId": "uuid",
      "tenantName": "Acme Realty",
      "isActive": true,
      "totalCampaigns": 5,
      "totalCalls": 1200,
      "completedCalls": 980,
      "failedCalls": 45
    }
  ]
}
```

#### `GET /v1/admin/dashboard/activity?limit=20`

```json
// Response (200)
{
  "success": true,
  "data": [
    {
      "id": "camp-uuid-timestamp",
      "tenantId": "uuid",
      "tenantName": "Acme Realty",
      "type": "CAMPAIGN_STARTED",
      "message": "Campaign \"Q1 Outreach\" has started running.",
      "timestamp": "2025-01-15T10:30:00.000Z"
    }
  ]
}
// type enum: "CAMPAIGN_STARTED" | "BATCH_COMPLETED" | "CALL_COMPLETED" | "CALL_FAILED"
```

---

### Admin Tenants (Existing, now isolated)

#### `GET /v1/admin/tenants`

```json
// Response (200)
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "email": "string",
      "isActive": true,
      "createdAt": "ISO"
    }
  ]
}
```

#### `GET /v1/admin/tenants/:id`

```json
// Response (200)
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "string",
    "email": "string",
    "isActive": true
  }
}
```

#### `GET /v1/admin/tenants/:id/stats`

```json
// Response (200)
{
  "success": true,
  "data": {/* tenant-specific stats object */}
}
```

#### `PATCH /v1/admin/tenants/:id`

```json
// Request
{ "name": "New Name", "isActive": false }

// Response (200)
{
  "success": true,
  "data": { "id": "uuid", "name": "New Name", "isActive": false }
}
```

---

### Admin Campaigns (NEW — Read-Only)

> All endpoints require `?tenantId=<uuid>` query parameter.

#### `GET /v1/admin/campaigns?tenantId=<uuid>`

```json
// Response (200)
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "status": "RUNNING",
      "totalLeads": 500,
      "calledLeads": 320,
      "completedLeads": 280,
      "failedLeads": 15,
      "createdAt": "ISO"
    }
  ]
}
```

#### `GET /v1/admin/campaigns/:id?tenantId=<uuid>`

```json
// Response (200) — full campaign detail
{
  "success": true,
  "data": {/* campaign object with relations */}
}
```

#### `GET /v1/admin/campaigns/:id/stats?tenantId=<uuid>`

```json
// Response (200)
{
  "success": true,
  "data": {/* stats object */}
}
```

#### `GET /v1/admin/campaigns/:id/performance?tenantId=<uuid>`

```json
// Response (200)
{
  "success": true,
  "data": {/* performance object */}
}
```

---

### Admin Batches (NEW — Read-Only)

> All endpoints require `?tenantId=<uuid>` AND `?campaignId=<uuid>` query parameters.

#### `GET /v1/admin/batches?tenantId=<uuid>&campaignId=<uuid>`

```json
// Response (200)
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "status": "COMPLETED",
      "fileName": "leads.csv",
      "totalLeads": 100,
      "calledLeads": 100,
      "completedLeads": 85,
      "failedLeads": 5
    }
  ]
}
```

#### `GET /v1/admin/batches/:id?tenantId=<uuid>&campaignId=<uuid>`

```json
// Response (200)
{
  "success": true,
  "data": {/* batch detail object */}
}
```

#### `GET /v1/admin/batches/:id/stats?tenantId=<uuid>&campaignId=<uuid>`

```json
// Response (200)
{
  "success": true,
  "data": {/* stats object */}
}
```

---

### Admin Leads (NEW — Read-Only)

> All endpoints require `?tenantId=<uuid>` query parameter.

#### `GET /v1/admin/leads?tenantId=<uuid>&campaignId=<uuid>&status=CALLED&page=1&limit=20`

```json
// Query params (all optional except tenantId):
//   tenantId    — required
//   campaignId  — optional filter
//   status      — optional: PENDING | CALLING | CALLED | QUALIFIED | NOT_QUALIFIED | NO_ANSWER | FAILED
//   search      — optional: name/phone/email search
//   dateFrom    — optional: ISO datetime
//   dateTo      — optional: ISO datetime
//   sortBy      — optional: createdAt | name | updatedAt
//   sortOrder   — optional: asc | desc
//   page        — optional: positive integer
//   limit       — optional: positive integer

// Response (200)
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "phone": "string",
      "status": "QUALIFIED",
      "campaignId": "uuid",
      "createdAt": "ISO"
    }
  ]
}
```

#### `GET /v1/admin/leads/stats?tenantId=<uuid>&campaignId=<uuid>`

```json
// Response (200)
{
  "success": true,
  "data": {/* lead stats object */}
}
```

#### `GET /v1/admin/leads/:id?tenantId=<uuid>`

```json
// Response (200)
{
  "success": true,
  "data": {/* lead detail with call history */}
}
```

---

### Admin Calls (NEW — Read-Only)

> All endpoints require `?tenantId=<uuid>` query parameter.

#### `GET /v1/admin/calls?tenantId=<uuid>&campaignId=<uuid>&status=COMPLETED`

```json
// Query params (all optional except tenantId):
//   tenantId        — required
//   campaignId      — optional
//   leadId          — optional
//   status          — optional: PENDING | CALLING | COMPLETED | FAILED | NO_ANSWER | BUSY
//   disposition     — optional
//   leadTemperature — optional: HOT | WARM | NURTURE | COLD
//   locationMatch   — optional: MATCH | MISMATCH
//   search          — optional
//   dateFrom        — optional: ISO datetime
//   dateTo          — optional: ISO datetime
//   sortBy          — optional: startedAt | duration | cost | createdAt
//   sortOrder       — optional: asc | desc
//   page            — optional
//   limit           — optional

// Response (200)
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "bolnaCallId": "string",
      "status": "COMPLETED",
      "duration": 180,
      "cost": 0.12,
      "startedAt": "ISO",
      "endedAt": "ISO"
    }
  ]
}
```

#### `GET /v1/admin/calls/stats?tenantId=<uuid>&campaignId=<uuid>&leadId=<uuid>`

```json
// Response (200)
{
  "success": true,
  "data": {/* call stats object */}
}
```

#### `GET /v1/admin/calls/:id?tenantId=<uuid>`

```json
// Response (200)
{
  "success": true,
  "data": {/* call detail with analysis */}
}
```

#### `GET /v1/admin/calls/:id/transcript?tenantId=<uuid>`

```json
// Response (200)
{
  "success": true,
  "data": {
    "transcript": "string",
    "transcriptMessages": [
      { "role": "assistant", "message": "Hello...", "time": "ISO" },
      { "role": "user", "message": "Hi...", "time": "ISO" }
    ]
  }
}
```

---

### Admin Brochures (NEW — Read-Only)

> All endpoints require `?tenantId=<uuid>` query parameter.

#### `GET /v1/admin/brochures?tenantId=<uuid>`

```json
// Response (200)
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "originalFileName": "brochure.pdf",
      "projectName": "Sunrise Towers",
      "city": "Mumbai",
      "isConfirmed": true,
      "createdAt": "ISO"
    }
  ]
}
```

#### `GET /v1/admin/brochures/:id?tenantId=<uuid>`

```json
// Response (200)
{
  "success": true,
  "data": {/* full brochure detail with all extracted fields */}
}
```

---

### Admin Assistants (Existing, now isolated)

> All endpoints require `?tenantId=<uuid>` query parameter (except bolna-agents).

#### `GET /v1/admin/assistants/bolna-agents`

```json
// Response (200) — list of available Bolna agents
{
  "success": true,
  "data": [/* bolna agent objects */]
}
```

#### `GET /v1/admin/assistants?tenantId=<uuid>`

#### `GET /v1/admin/assistants/:id?tenantId=<uuid>`

#### `POST /v1/admin/assistants/register` (body: `{ tenantId, name, bolnaId }`)

#### `PATCH /v1/admin/assistants/:id` (body: `{ tenantId, name }`)

#### `POST /v1/admin/assistants/:id/sync?tenantId=<uuid>`

#### `DELETE /v1/admin/assistants/:id?tenantId=<uuid>`

---

## 🔐 Webhook Security (NEW)

Webhook endpoints now require a shared secret header.

| Header             | Value                                         |
| ------------------ | --------------------------------------------- |
| `x-webhook-secret` | Must match `WEBHOOK_SECRET` env var on server |

**Endpoints:**

| Method | Path                    | Auth                      |
| ------ | ----------------------- | ------------------------- |
| POST   | `/webhooks/bolna`       | `x-webhook-secret` header |
| POST   | `/webhooks/bolna-batch` | `x-webhook-secret` header |

**Bolna dashboard configuration:**
Add custom header `x-webhook-secret` with your secret value to the webhook URL configuration in Bolna.

---

## 📋 Error Response Format (Unchanged)

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": [{ "field": "email", "message": "Invalid email format" }]
}
```

---

## 🧪 Axios Instance Setup (Frontend)

```typescript
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000/api",
  withCredentials: true, // ← CRITICAL: sends httpOnly cookies
  headers: {
    "Content-Type": "application/json",
  },
});

// NO interceptor needed for Authorization header.
// Cookies are sent automatically by the browser.

// Optional: handle 401 for redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;
```

---

## 📊 Complete API Route Map

```
Public (no auth):
  POST /webhooks/bolna              (x-webhook-secret required)
  POST /webhooks/bolna-batch        (x-webhook-secret required)

Tenant Auth:
  POST /v1/auth/register
  POST /v1/auth/login
  POST /v1/auth/refresh
  POST /v1/auth/logout
  POST /v1/auth/select-tenant
  GET  /v1/auth/profile
  POST /v1/auth/invites
  POST /v1/auth/accept-invite

Tenant Workspace:
  GET    /v1/tenants/current
  PATCH  /v1/tenants/current
  GET    /v1/tenants/current/stats
  GET    /v1/users
  POST   /v1/users
  PATCH  /v1/users/:id
  DELETE /v1/users/:id

Tenant Data:
  GET    /v1/assistants
  GET    /v1/assistants/:id
  GET    /v1/campaigns
  POST   /v1/campaigns
  GET    /v1/campaigns/:id
  GET    /v1/campaigns/:id/stats
  GET    /v1/campaigns/:id/performance
  POST   /v1/campaigns/:id/parse-leads
  GET    /v1/campaigns/:campaignId/batches
  POST   /v1/campaigns/:campaignId/batches
  GET    /v1/campaigns/:campaignId/batches/:batchId
  GET    /v1/campaigns/:campaignId/batches/:batchId/stats
  POST   /v1/campaigns/:campaignId/batches/:batchId/run
  POST   /v1/campaigns/:campaignId/batches/:batchId/schedule
  POST   /v1/campaigns/:campaignId/batches/:batchId/stop
  POST   /v1/campaigns/:campaignId/batches/:batchId/resume
  DELETE /v1/campaigns/:campaignId/batches/:batchId
  GET    /v1/leads
  GET    /v1/leads/stats
  GET    /v1/leads/:id
  GET    /v1/calls
  GET    /v1/calls/stats
  GET    /v1/calls/:id
  GET    /v1/calls/:id/transcript
  GET    /v1/dashboard/overview
  GET    /v1/dashboard/activity
  GET    /v1/dashboard/campaigns
  GET    /v1/brochures
  GET    /v1/brochures/:id
  POST   /v1/brochures/extract
  POST   /v1/brochures/save
  PATCH  /v1/brochures/:id
  DELETE /v1/brochures/:id

Admin Auth:
  POST /v1/admin/auth/login

Admin Platform:
  GET    /v1/admin/dashboard/overview
  GET    /v1/admin/dashboard/tenants-health
  GET    /v1/admin/dashboard/activity
  GET    /v1/admin/tenants
  GET    /v1/admin/tenants/:id
  GET    /v1/admin/tenants/:id/stats
  PATCH  /v1/admin/tenants/:id
  GET    /v1/admin/assistants/bolna-agents
  GET    /v1/admin/assistants
  GET    /v1/admin/assistants/:id
  POST   /v1/admin/assistants/register
  PATCH  /v1/admin/assistants/:id
  POST   /v1/admin/assistants/:id/sync
  DELETE /v1/admin/assistants/:id
  GET    /v1/admin/campaigns
  GET    /v1/admin/campaigns/:id
  GET    /v1/admin/campaigns/:id/stats
  GET    /v1/admin/campaigns/:id/performance
  GET    /v1/admin/batches
  GET    /v1/admin/batches/:id
  GET    /v1/admin/batches/:id/stats
  GET    /v1/admin/leads
  GET    /v1/admin/leads/stats
  GET    /v1/admin/leads/:id
  GET    /v1/admin/calls
  GET    /v1/admin/calls/stats
  GET    /v1/admin/calls/:id
  GET    /v1/admin/calls/:id/transcript
  GET    /v1/admin/brochures
  GET    /v1/admin/brochures/:id
```
