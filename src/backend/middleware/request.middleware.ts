import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { logger } from "../utils/logger";

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Use existing header or generate a new unique random UUID
  req.requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
};

export const loggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(
      `${req.method} ${req.originalUrl} - status: ${res.statusCode} (${duration}ms)`,
      req.requestId
    );
  });
  next();
};
