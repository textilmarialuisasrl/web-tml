import { Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { UserRepository } from "../repositories/user.repository";
import { AppError, catchAsync } from "../utils/errors";
import { Request } from "express";
import { authCache } from "../utils/cache";
import { readAccessTokenFromRequest } from "../config/auth-cookies";
import type { JWTPayload } from "../types/auth.types";
import { prisma } from "../db/prisma";
import { computeSnapshotHmac, throttledSecurityLog } from "../utils/security";
import jwt from "jsonwebtoken";

export type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    nombre: string;
    email: string;
    permisos: string[];
    sessionVersion: number;
    allowedTalleres: string[];
    allowedDepositos: string[];
  };
  authPayload?: JWTPayload;
};

// In-memory cache for user allowed locations (memoization) to prevent DB load on every request
interface LocationCacheEntry {
  allowedTalleres: string[];
  allowedDepositos: string[];
  expiresAt: number;
}
const userLocationCache: Record<string, LocationCacheEntry> = {};

/**
 * Loads allowed workshops and warehouses for a given user.
 * Includes in-memory caching for 30 seconds to optimize performance.
 * Supports legacy dev fallback, and production strict failsafe mode.
 */
async function loadUserAllowedLocations(
  userId: string,
  email: string,
  permisos: string[]
): Promise<{ allowedTalleres: string[]; allowedDepositos: string[] }> {
  const now = Date.now();
  const cached = userLocationCache[userId];
  if (cached && cached.expiresAt > now) {
    return {
      allowedTalleres: cached.allowedTalleres,
      allowedDepositos: cached.allowedDepositos,
    };
  }

  let allowedTalleres: string[] = [];
  let allowedDepositos: string[] = [];
  const isProduction = process.env.NODE_ENV === "production";

  if (permisos.includes("ADMIN_SISTEMA")) {
    const [allTalleres, allDepositos] = await Promise.all([
      prisma.taller.findMany({ where: { activo: true }, select: { id: true } }),
      prisma.deposito.findMany({ where: { activo: true }, select: { id: true } }),
    ]);
    allowedTalleres = allTalleres.map((t) => t.id);
    allowedDepositos = allDepositos.map((d) => d.id);
  } else {
    // Look up user-specific mapping in Configuracion using user_access:<userId>
    const configKey = `user_access:${userId}`;
    let configLoaded = false;
    try {
      const config = await prisma.configuracion.findUnique({
        where: { clave: configKey },
      });
      if (config?.valor) {
        const parsed = JSON.parse(config.valor);
        allowedTalleres = Array.isArray(parsed.allowedTalleres) ? parsed.allowedTalleres : [];
        allowedDepositos = Array.isArray(parsed.allowedDepositos) ? parsed.allowedDepositos : [];
        configLoaded = true;
      }
    } catch {
      // Ignore and fallback
    }

    if (!configLoaded) {
      if (!isProduction) {
        // Fallback default mapping in DEV/TEST ONLY: return first active taller and deposito
        const [firstTaller, firstDeposito] = await Promise.all([
          prisma.taller.findFirst({ where: { activo: true }, select: { id: true } }),
          prisma.deposito.findFirst({ where: { activo: true }, select: { id: true } }),
        ]);
        allowedTalleres = firstTaller ? [firstTaller.id] : [];
        allowedDepositos = firstDeposito ? [firstDeposito.id] : [];
      } else {
        // In production, unmapped users get empty arrays
        allowedTalleres = [];
        allowedDepositos = [];
        throttledSecurityLog(
          "unmapped-user-access",
          `User ${userId} (${email}) has no access mapping configured in production`
        );
      }
    }
  }

  // Cache results with a 30s TTL
  userLocationCache[userId] = {
    allowedTalleres,
    allowedDepositos,
    expiresAt: now + 30_000,
  };

  return { allowedTalleres, allowedDepositos };
}

export const requireAuth = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const authorizationHeader = req.headers.authorization;
  let token = readAccessTokenFromRequest(req);
  const tokenSource = token ? "cookie" : (authorizationHeader?.startsWith("Bearer ") ? "bearer_header" : "none");

  if (!token && authorizationHeader?.startsWith("Bearer ")) {
    token = authorizationHeader.split(" ")[1];
  }

  // Diagnostic log of incoming token details
  console.log(`[BACKEND AUTH] requireAuth check for path ${req.originalUrl}`, {
    tokenSource,
    hasToken: !!token,
    tokenPreview: token ? `${token.substring(0, 15)}...` : "none",
    authorizationHeader: authorizationHeader || "none",
    cookies: req.cookies ? Object.keys(req.cookies) : []
  });

  try {
    if (!token) {
      throw new AppError({
        message: "No autorizado, sesión ausente o expirada",
        statusCode: 401,
        code: "UNAUTHORIZED",
      });
    }

    const decoded = AuthService.verifyAccessToken(token);
    const authReq = req as AuthenticatedRequest;
    authReq.authPayload = decoded;

    const cacheKey = `auth:user:${decoded.userId}:${decoded.sessionVersion}`;
    const cachedUser = await authCache.get(cacheKey);

    if (cachedUser) {
      authReq.user = {
        ...cachedUser,
        sessionVersion: decoded.sessionVersion,
        allowedTalleres: cachedUser.allowedTalleres || [],
        allowedDepositos: cachedUser.allowedDepositos || [],
      };
    } else {
      const user = await UserRepository.findByIdWithPermissions(decoded.userId);

      if (!user) {
        throw new AppError({
          message: "El usuario asociado a esta sesión no existe o fue eliminado",
          statusCode: 401,
          code: "USER_NOT_FOUND",
        });
      }

      if (!user.activo) {
        throw new AppError({
          message: "Esta cuenta de usuario ha sido desactivada",
          statusCode: 403,
          code: "ACCOUNT_DISABLED",
        });
      }

      if (user.sessionVersion !== decoded.sessionVersion) {
        throw new AppError({
          message: "La sesión ya no es válida debido a un cambio de credenciales",
          statusCode: 401,
          code: "SESSION_INVALIDATED",
        });
      }

      const userPerms = user.permisos.map((up) => up.permiso.clave);
      const { allowedTalleres, allowedDepositos } = await loadUserAllowedLocations(
        user.id,
        user.email,
        userPerms
      );

      const mappedUser = {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        permisos: userPerms,
        sessionVersion: user.sessionVersion,
        allowedTalleres,
        allowedDepositos,
      };

      await authCache.set(cacheKey, mappedUser, 30);
      authReq.user = mappedUser;
    }

    // Snapshot signature verification
    const userObj = authReq.user!;
    const clientSignature = req.headers["x-snapshot-signature"] as string | undefined;

    if (clientSignature) {
      const expectedSignature = computeSnapshotHmac(
        userObj.id,
        userObj.permisos,
        userObj.sessionVersion
      );
      if (expectedSignature !== clientSignature) {
        throttledSecurityLog(
          "snapshot-mismatch",
          `Snapshot signature mismatch for user ${userObj.id}`
        );
        throw new AppError({
          message: "Firma de sesión inválida (tampering detectado)",
          statusCode: 401,
          code: "SNAPSHOT_SIGNATURE_MISMATCH",
        });
      }
    } else {
      throttledSecurityLog(
        "unsigned-legacy-snapshot",
        `Legacy unsigned snapshot detected for user ${userObj.id}`
      );
    }

    console.log(`[BACKEND AUTH] requireAuth SUCCESS for user ${authReq.user.id} (${authReq.user.email})`);
    next();
  } catch (err: any) {
    const errCode = err.code || "UNAUTHORIZED";
    const errMsg = err.message || "Unknown auth error";
    let claimedUserId = "none";
    try {
      if (token) {
        const decodedClaimed = jwt.decode(token) as any;
        if (decodedClaimed?.userId) claimedUserId = decodedClaimed.userId;
      }
    } catch {}
    console.error(`[BACKEND AUTH] requireAuth FAILURE for path ${req.originalUrl}. Claimed User: ${claimedUserId}. Code: ${errCode}, Message: ${errMsg}`);
    throw err;
  }
});

// Re-export requirePermission for compatibility
export { requirePermission } from "./authorization.middleware";
