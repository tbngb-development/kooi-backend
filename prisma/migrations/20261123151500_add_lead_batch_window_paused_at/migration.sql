-- Additive marker for batches paused at a calling-window boundary.
-- Existing BatchStatus values are unchanged.
ALTER TABLE "LeadBatch" ADD COLUMN "windowPausedAt" TIMESTAMP(3);
