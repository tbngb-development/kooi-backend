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

  // ── Start background schedulers ──────────────────────────────
  try {
    container.wallet.schedulers.bonusExpiry.start();
    logger.info("Background schedulers started");
  } catch (err) {
    logger.error("Failed to start schedulers", err);
  }
});

// ── Graceful Shutdown ────────────────────────────────────────────

function gracefulShutdown(signal: string): void {
  logger.info("Graceful shutdown initiated", { signal });
  container.wallet.schedulers.bonusExpiry.stop();
  server.close(() => {
    logger.info("Process terminated");
    process.exit(0);
  });

  setTimeout(() => {
    // Intentionally retained: the logger pipeline may already be
    // flushed/closed at this point during a forced kill.
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

export default buildApp;
