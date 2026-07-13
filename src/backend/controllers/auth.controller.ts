import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";
import { AppError, catchAsync } from "../utils/errors";
import { successResponse } from "../utils/response";
import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  clearAuthCookies,
  readRefreshTokenFromRequest,
  setAccessCookie,
  setRefreshCookie,
} from "../config/auth-cookies";

import { computeSnapshotHmac } from "../utils/security";

export const AuthController = {
  login: catchAsync(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const session = await AuthService.login(email, password);

    clearAuthCookies(res);
    setAccessCookie(res, session.accessToken);
    setRefreshCookie(res, session.refreshToken);

    const snapshotSignature = computeSnapshotHmac(
      session.user.id,
      session.user.permisos,
      session.user.sessionVersion
    );

    successResponse(res, {
      user: session.user,
      lastValidatedAt: new Date().toISOString(),
      snapshotSignature,
    });
  }),

  refresh: catchAsync(async (req: Request, res: Response) => {
    const refreshToken = readRefreshTokenFromRequest(req);
    if (!refreshToken) {
      throw new AppError({
        message: "Refresh de sesión ausente",
        statusCode: 401,
        code: "REFRESH_MISSING",
      });
    }

    const start = Date.now();
    try {
      const session = await AuthService.refreshFromCookie(refreshToken);

      setAccessCookie(res, session.accessToken);
      setRefreshCookie(res, session.refreshToken);

      const snapshotSignature = computeSnapshotHmac(
        session.user.id,
        session.user.permisos,
        session.user.sessionVersion
      );

      successResponse(res, {
        user: session.user,
        lastValidatedAt: new Date().toISOString(),
        refreshDurationMs: Date.now() - start,
        snapshotSignature,
      });
    } catch (err: unknown) {
      clearAuthCookies(res);
      throw err;
    }
  }),

  logout: catchAsync(async (req: Request, res: Response) => {
    clearAuthCookies(res);
    successResponse(res, {
      message: "Sesión cerrada correctamente",
    });
  }),

  me: catchAsync(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;

    const snapshotSignature = computeSnapshotHmac(
      user.id,
      user.permisos,
      user.sessionVersion
    );

    successResponse(res, {
      user,
      lastValidatedAt: new Date().toISOString(),
      snapshotSignature,
    });
  }),
};
