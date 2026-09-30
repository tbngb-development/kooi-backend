import { buildApp } from "./app";
import { buildContainer } from "./app/container";
import { env } from "./shared/config/env";

const container = buildContainer();
const app = buildApp(container);

const server = app.listen(env.port, () => {
  console.log(`\n🚀 Server:       http://localhost:${env.port}`);
  console.log(`❤️  Health:       GET  http://localhost:${env.port}/api/health`);

  // ── Start background schedulers ──────────────────────────────
  try {
    container.wallet.schedulers.bonusExpiry.start();
    console.log("✅ All background schedulers started\n");
  } catch (err) {
    console.error("❌ Failed to start schedulers:", err);
  }
});

// ── Graceful Shutdown ────────────────────────────────────────────

function gracefulShutdown(signal: string): void {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  container.wallet.schedulers.bonusExpiry.stop();
  server.close(() => {
    console.log("Process terminated");
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
