import express, { type Express } from "express";
import { corsMiddleware, globalRateLimiter, helmetMiddleware } from "./middlewares/security.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { usersRouter } from "./routes/users.js";
import { auditsRouter } from "./routes/audits.js";
import { evidencesRouter } from "./routes/evidences.js";
import { assetsRouter } from "./routes/assets.js";
import { scansRouter } from "./routes/scans.js";
import { reportsRouter } from "./routes/reports.js";
import { findingsRouter } from "./routes/findings.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { frameworksRouter } from "./routes/frameworks.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(globalRateLimiter);
  app.use(express.json({ limit: "1mb" }));

  app.use(healthRouter);
  app.use("/api/v1", usersRouter);
  app.use("/api/v1", auditsRouter);
  app.use("/api/v1", evidencesRouter);
  app.use("/api/v1", assetsRouter);
  app.use("/api/v1", scansRouter);
  app.use("/api/v1", reportsRouter);
  app.use("/api/v1", findingsRouter);
  app.use("/api/v1", dashboardRouter);
  app.use("/api/v1", onboardingRouter);
  app.use("/api/v1", frameworksRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
