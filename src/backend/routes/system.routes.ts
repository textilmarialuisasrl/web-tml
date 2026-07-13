import { Router } from "express";
import { ConfigRepository } from "../repositories/config.repository";
import { successResponse } from "../utils/response";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/authorization.middleware";
import { metricsRegistry } from "../utils/metrics";
import fs from "fs";
import path from "path";

const router = Router();

let pkgVersion = "1.0.0";
try {
  const pkgPath = path.join(__dirname, "../../../package.json");
  if (fs.existsSync(pkgPath)) {
    const pkgContent = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(pkgContent);
    pkgVersion = pkg.version || "1.0.0";
  }
} catch {
  // Keep fallback
}

// GET /api/system/health
router.get("/health", async (req, res, next) => {
  try {
    const dbHealthy = await ConfigRepository.checkDatabaseHealth();
    const data = {
      status: dbHealthy ? "healthy" : "unhealthy",
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      dbConnected: dbHealthy,
      env: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    };
    successResponse(res, data, dbHealthy ? 200 : 503);
  } catch (err) {
    next(err);
  }
});

// GET /api/system/version
router.get("/version", (req, res) => {
  const data = {
    version: pkgVersion,
    buildTimestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || "development",
  };
  successResponse(res, data);
});

// GET /api/system/metrics
router.get(
  "/metrics",
  requireAuth,
  requirePermission("ADMIN_SISTEMA"),
  async (req, res, next) => {
    try {
      const snapshot = await metricsRegistry.getSnapshot();
      successResponse(res, snapshot);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
