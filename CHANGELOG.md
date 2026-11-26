# Changelog

All notable changes to the KOOI backend are documented here.

## [Unreleased]

Post-v2.0.0 updates. See [`../Docs/POST_V2_UPDATES.md`](../Docs/POST_V2_UPDATES.md) for the shared change note, QA checklist, and deploy guide.

### Added

- Campaign and batch list responses expose `noAnswerCalls`, `scheduledCalls`, `failedCalls`, and `busyCalls`. Additive only: `failedLeads` and all existing fields are unchanged.

### Changed

- Removed the calling-window auto-close scheduler, carry-forward rules, and successor-batch creation. Bolna now reschedules pending calls at window close. Manual stop/resume, the new-dial window guard, wallet/credit stops, and the `windowPausedAt` column are preserved.

### Fixed

- Tenant recharge history excludes `CANCELLED` orders from results, counts, and pagination. Admin payment listings and the `CANCELLED` validation status are unchanged; late capture may still recover an order to `SUCCESS`.

## [2.0.0] - 2026-11-24

Coordinated platform release with `FRONTEND` v2.0.0. See [`../Docs/RELEASES/v2.0.0.md`](../Docs/RELEASES/v2.0.0.md) for the shared release note and deploy plan.

### Added

- Sarvam integration end-to-end: API key management, agent configuration APIs, cohort/batch transformers, call billing and reporting, recording retrieval to Cloudinary, webhook processing, and campaign/batch lifecycle management.
- Call goal evaluation using output variables.
- Team invitations: schema, API lifecycle, and email delivery.
- Discord notification events for payments, batch lifecycle, campaign lifecycle, and low-balance warnings; deployment environment stamped on events.
- Durable credit enforcement: `WalletIncidentState`, idempotent email outbox with retries/DLQ, single orchestrator and reconciler, provider stop adapters, and admin copy on enforcement emails.
- CSV export for filtered contacts; batch-wise call filtering with batch metadata; duration condition filter.
- Calling-window enforcement with queued lead carry-forward.
- Ordered deploy runner with migration safety preflight and fail-closed PM2 inspection.

### Changed

- Wallet low-balance threshold renamed to `creditLimit` with a separate warning threshold; positive balance is the sole batch execution gate.
- Sarvam `allowedSchedule` moved to its own immutable migration; provider field added across shared modules.
- Admin tenant provider cost surfaced in USD.
- Disposition display names used in available filters; CSV export header aligned to `Contact Number`.
- Webhook handling standardized for rescheduled, retry, and terminal events.
- `package.json` and `package-lock.json` bumped to `2.0.0`.

### Fixed

- Foreign contact numbers rejected before provider upload.
- Late events no longer reopen finalized campaigns or overwrite terminal calls.
- Duplicate-insert `P2002` log noise removed from incident claims.
- Stranded `SENDING` outbox envelopes recovered; failed provider stops retried by durable target.
- Blocked credit incidents close after balance recovery; reconciler rechecks recharges.
- Billing never debits disconnected or unknown call statuses.
- Refresh token cleanup cycle and table bloat resolved.
- Analytics counts unique leads instead of call attempts.
- Missing production migration added.

### Notes

- Keep `DISCORD_NOTIFICATIONS_ENABLED=false` in production until the Discord bot service is hosted. Leave `DISCORD_OUTBOX_ENABLED` unset or `true` so pending rows remain queued.
