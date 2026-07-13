import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly status: string;
  public readonly code: string;
  public readonly details: any;
  public readonly isOperational: boolean;

  constructor(options: { message: string; statusCode: number; code: string; details?: any }) {
    super(options.message);
    this.statusCode = options.statusCode;
    this.status = `${options.statusCode}`.startsWith("4") ? "fail" : "error";
    this.code = options.code;
    this.details = options.details || null;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Wrapper to catch async errors in Express route handlers
export const catchAsync = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};
