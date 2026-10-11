import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";

/**
 * Wall-clock budget for this serverless function. Vercel's default on Hobby is
 * 10s, which is not enough to generate two concepts (kie.ai Nano Banana /
 * Gemini 2.5 Flash Image needs ~10-25s for a pair). 60s is the maximum a Hobby
 * project may request; Pro allows more.
 *
 * NOTE: this project uses the legacy `builds` pipeline in vercel.json, where the
 * platform ignores this export — the authoritative value lives in
 * builds[].config.maxDuration there. Kept here so the intent is visible from the
 * function itself (and so it still applies if the config is modernised).
 */
export const maxDuration = 60;

const app = express();

// Logging middleware
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  console.log("REQ", req.method, req.url);
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson: any) {
    capturedJsonResponse = bodyJson;
    return originalResJson.call(res, bodyJson);
  };

  const originalEnd = res.end;
  res.end = function (chunk?: any, encoding?: any, cb?: any) {
    const duration = Date.now() - start;
    console.log("RES", req.method, req.url, res.statusCode, res.getHeader("content-type") || "");
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
    return originalEnd.call(res, chunk, encoding, cb);
  };

  next();
});

// Register routes
registerRoutes(null as any, app);

// Error handling middleware
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  console.error("Internal Server Error:", err);
  if (res.headersSent) {
    return next(err);
  }
  return res.status(status).json({ message });
});

export default app;