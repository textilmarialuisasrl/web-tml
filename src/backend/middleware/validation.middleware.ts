import { Request, Response, NextFunction } from "express";
import { AnyZodObject } from "zod";
import { catchAsync } from "../utils/errors";

/**
 * Reusable Express validation middleware for Zod schemas.
 * Validates request body, and replaces req.body with parsed/validated values.
 */
export const validate = (schema: AnyZodObject) =>
  catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const validated = await schema.parseAsync(req.body);
    req.body = validated; // Inject parsed data back with correct types
    next();
  });
