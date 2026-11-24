-- U-04: enforcement lease on the singleton incident. A non-null lease means
-- one app instance is mid-enforcement; the reconciler reclaims it after expiry.

ALTER TABLE "WalletIncidentState" ADD COLUMN "enforcementStartedAt" TIMESTAMP(3);
