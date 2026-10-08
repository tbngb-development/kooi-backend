import { buildApp } from "./app";
import { buildContainer } from "./app/container";
import { env } from "./shared/config/env";

const container = buildContainer();
const app = buildApp(container);
const logger = container.logger;

const server = app.listen(env.port, () => {
  logger.info("Server started", {
    port: env.port,
    env: env.nodeEnv,
    logLevel: env.logLevel,
  });
  logger.info("Health check available", {
    path: `http://localhost:${env.port}/api/health`,
  });

  try {
    container.wallet.schedulers.bonusExpiry.start();
    container.batches.schedulers.batchProcessing.start();
    container.bolnaApiKeys.schedulers.agentClone.start();
    container.auth.schedulers.refreshTokenCleanup.start();
    container.classifier.schedulers.classifierExtraction.start();
    logger.info("Background schedulers started");
  } catch (err) {
    logger.error("Failed to start schedulers", err);
  }
});

// ── Graceful Shutdown ────────────────────────────────────────────
function gracefulShutdown(signal: string): void {
  logger.info("Graceful shutdown initiated", { signal });
  container.wallet.schedulers.bonusExpiry.stop();
  container.batches.schedulers.batchProcessing.stop();
  container.bolnaApiKeys.schedulers.agentClone.stop();
  container.auth.schedulers.refreshTokenCleanup.stop();
  container.classifier.schedulers.classifierExtraction.stop();
  server.close(() => {
    logger.info("Process terminated");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

export default buildApp;
