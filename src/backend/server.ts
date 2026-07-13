import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import { rateLimit } from "express-rate-limit";

// Environment validation (fails fast if incorrect envs)
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { requestIdMiddleware, loggingMiddleware } from "./middleware/request.middleware";
import apiRoutes from "./routes";
import { errorHandler } from "./middleware/error.middleware";

const app = express();

// 1. Basic security headers
app.use(helmet());

// 2. Response payload compression
app.use(compression());

// 3. Request trace-id injection
app.use(requestIdMiddleware);

// 4. Console log trace on request end
app.use(loggingMiddleware);

// 5. Strict CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman) in development
      if (!origin && env.NODE_ENV === "development") {
        return callback(null, true);
      }
      
      // If the origin is in our parsed array of allowed origins, permit it
      if (origin && env.ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      // Allow during development from local client/server
      if (env.NODE_ENV === "development" && origin?.match(/^http:\/\/localhost(:\d+)?$/)) {
        return callback(null, true);
      }

      callback(new Error(`Origen ${origin} no permitido por CORS`));
    },
    credentials: true,
  })
);

// 6. Request parsers
app.use(express.json());
app.use(cookieParser());

// 6.5 Serve static assets from public folder with Cache-Control, ETag and Vary headers
if (env.NODE_ENV !== "development") {
  app.use(
    express.static(path.join(__dirname, "../../public"), {
      etag: true,
      setHeaders: (res) => {
        res.setHeader("Cache-Control", "private, max-age=30");
        res.setHeader("Vary", "Accept-Encoding");
      },
    })
  );
}


// 7. Base healthcheck
app.use("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: "online",
      message: "TML ERP API funcionando correctamente",
      timestamp: new Date(),
    },
  });
});

import { throttledSecurityLog } from "./utils/security";

// 7.5 Trust proxy setting for rate limiting (essential behind reverse proxies)
app.set("trust proxy", 1);

// Global API limiter: 300 requests / 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Demasiadas peticiones desde esta IP, por favor intente de nuevo en 15 minutos."
  },
  handler: (req, res, next, options) => {
    throttledSecurityLog("rate-limit-hit", `Global API rate limit triggered (IP: ${req.ip})`);
    res.status(options.statusCode).json(options.message);
  }
});

// Strict auth limiter: 15 attempts / 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Demasiados intentos de autenticación, por favor intente de nuevo en 15 minutos."
  },
  handler: (req, res, next, options) => {
    throttledSecurityLog("rate-limit-hit", `Auth rate limit triggered (IP: ${req.ip}, path: ${req.originalUrl})`);
    res.status(options.statusCode).json(options.message);
  }
});

// Apply rate limiters
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/refresh", authLimiter);
app.use("/api", apiLimiter);

// 8. Mount all primary API routes
app.use("/api", apiRoutes);

// 8.5 SPA fallback for frontend React routing
if (env.NODE_ENV !== "development") {
  app.get("/app/{*splat}", (req, res) => {
    res.sendFile(path.join(__dirname, "../../public/app/index.html"));
  });
}

// 9. Centralized Error Handler (must be registered at the end)
app.use(errorHandler);

import { DriftMonitorService } from "./services/drift-monitor.service";

// Start low-priority background stock drift monitoring service
DriftMonitorService.startMonitor();

const PORT = env.PORT;

app.listen(PORT, () => {
  logger.info(`TML ERP Server listening on port ${PORT} in [${env.NODE_ENV}] mode`);
});