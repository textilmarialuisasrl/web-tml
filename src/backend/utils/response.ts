import { Response } from "express";
import { ApiSuccess } from "../types/api-response.types";

/**
 * Standardized success response helper.
 * Enforces: { success: true, data: ..., meta?: ... }
 * Extracts requestId automatically from res.req if available.
 */
export function successResponse<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    pages?: number;
    nextCursor?: number | null;
    cache?: boolean;
    [key: string]: any;
  }
): void {
  const req = res.req as any;
  const requestId = req?.requestId;

  const responsePayload: ApiSuccess<T> = {
    success: true,
    data,
    meta: {
      ...(requestId ? { requestId } : {}),
      ...meta,
    },
  };

  res.status(statusCode).json(responsePayload);
}
