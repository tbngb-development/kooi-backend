-- Pending Discord notification envelopes only; no delivery-status records.
CREATE TABLE "DiscordEventOutbox" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "DiscordEventOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordEventOutbox_eventId_key" ON "DiscordEventOutbox"("eventId");

CREATE INDEX "DiscordEventOutbox_publishedAt_createdAt_idx" ON "DiscordEventOutbox"("publishedAt", "createdAt");
