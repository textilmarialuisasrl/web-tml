import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { ZodError } from "zod";
import { ApiError } from "../types/api-response.types";
import { env } from "../config/env";

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "Ha ocurrido un error interno en el servidor";
  let details: any = undefined;

  // 1. AppError mapping
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  }
  // 2. Zod validation error mapping
  else if (err instanceof ZodError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Datos de solicitud inválidos o incompletos";
    const issues = err.issues || err.errors || [];
    details = issues.map((e: any) => ({
      field: e.path.join("."),
      message: e.message,
    }));
  }
  // 3. JWT error mapping
  else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    code = "UNAUTHORIZED";
    message = "Token de autenticación inválido";
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    code = "TOKEN_EXPIRED";
    message = "Su sesión ha expirado, por favor ingrese nuevamente";
  }
  // 4. Prisma errors mapping (known request errors)
  else if (err.code && typeof err.code === "string" && err.code.startsWith("P")) {
    statusCode = 400;
    code = "DATABASE_ERROR";
    if (err.code === "P2002") {
      code = "DUPLICATE_RECORD";
      message = "Ya existe un registro con esos datos duplicados";
      details = { target: err.meta?.target };
    } else if (err.code === "P2025") {
      statusCode = 404;
      code = "RECORD_NOT_FOUND";
      message = "El registro solicitado no existe";
    } else {
      message = "Error en la operación de base de datos";
    }
  }
  // 5. Default/Generic Error
  else {
    message = err.message || message;
  }

  // Log error
  logger.error(
    `[${code}] ${message}`,
    err.stack || err,
    req.requestId
  );

  const errorPayload: ApiError = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(req.requestId ? { requestId: req.requestId } : {}),
      ...(env.NODE_ENV === "development" ? { stack: err.stack } : {}),
    } as any, // Cast to any to allow stack in development environment if needed
  };

  res.status(statusCode).json(errorPayload);
};
