import dotenv from "dotenv";
import path from "path";
import { vi } from "vitest";

// Load .env.test before any app code executes
const envTestPath = path.resolve(__dirname, "../../.env.test");
dotenv.config({ path: envTestPath, override: true });

// Strict safety pre-flight assertions
if (process.env.NODE_ENV !== "test") {
  throw new Error(
    `[SAFETY ABORT] NODE_ENV must be 'test' during test execution. Received: '${process.env.NODE_ENV}'`,
  );
}

const dbUrl = process.env.DATABASE_URL ?? "";
if (!dbUrl.includes("test")) {
  throw new Error(
    `[SAFETY ABORT] DATABASE_URL must explicitly contain 'test'. Received: '${dbUrl}'`,
  );
}

// Mock pdf-parse to prevent its notorious debug-mode file read bug in node_modules
vi.mock("pdf-parse", () => ({
  default: vi.fn().mockResolvedValue({
    text: "Mock PDF text content for testing brochure extractions",
    numpages: 1,
    info: {},
  }),
}));
