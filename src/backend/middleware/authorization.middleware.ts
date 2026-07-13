import { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth.middleware";
import { AppError } from "../utils/errors";
import { throttledSecurityLog } from "../utils/security";

/**
 * Express middleware to restrict route access by validating specific permission keys.
 * Logs denied attempts with 30s throttling.
 */
export const requirePermission = (permissionKey: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(
        new AppError({
          message: "No autorizado, sesión inválida",
          statusCode: 401,
          code: "UNAUTHORIZED",
        })
      );
    }

    if (!req.user.permisos.includes(permissionKey)) {
      throttledSecurityLog(
        "permission-denied",
        `User ${req.user.id} (${req.user.email}) denied access to permission '${permissionKey}'`
      );

      return next(
        new AppError({
          message: `Acceso denegado: se requiere el permiso '${permissionKey}'`,
          statusCode: 403,
          code: "FORBIDDEN",
          details: { requiredPermission: permissionKey },
        })
      );
    }

    next();
  };
};
