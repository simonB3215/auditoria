import express, { type Express } from "express";
import { corsMiddleware, globalRateLimiter, helmetMiddleware } from "./middlewares/security.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { usersRouter } from "./routes/users.js";
import { auditsRouter } from "./routes/audits.js";
import { evidencesRouter } from "./routes/evidences.js";

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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
