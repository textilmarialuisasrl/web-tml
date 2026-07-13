import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { UserRepository } from "../repositories/user.repository";
import { AppError } from "../utils/errors";
import { env } from "../config/env";
import { AuthUser, JWTPayload, SessionRefreshResult } from "../types/auth.types";

type UserWithPerms = NonNullable<Awaited<ReturnType<typeof UserRepository.findByEmail>>>;

function mapAuthUser(user: UserWithPerms): AuthUser {
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    permisos: user.permisos.map((up) => up.permiso.clave),
    sessionVersion: user.sessionVersion,
  };
}

async function loadActiveUser(userId: string): Promise<UserWithPerms> {
  const user = await UserRepository.findByIdWithPermissions(userId);
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
  return user as UserWithPerms;
}

function signAccessToken(userId: string, sessionVersion: number): string {
  const payload: JWTPayload = {
    userId,
    sessionVersion,
    typ: "access",
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_EXPIRES as jwt.SignOptions["expiresIn"],
  });
}

function signRefreshToken(userId: string, sessionVersion: number): string {
  const payload: JWTPayload = {
    userId,
    sessionVersion,
    typ: "refresh",
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.REFRESH_TOKEN_EXPIRES as jwt.SignOptions["expiresIn"],
  });
}

function verifyToken(token: string, expectedTyp?: JWTPayload["typ"]): JWTPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    if (expectedTyp && decoded.typ != null && decoded.typ !== expectedTyp) {
      throw new AppError({
        message: "Token de autenticación inválido",
        statusCode: 401,
        code: "UNAUTHORIZED",
      });
    }
    return decoded;
  } catch (err: unknown) {
    const e = err as { name?: string };
    if (e.name === "TokenExpiredError") {
      throw new AppError({
        message: "Su sesión ha expirado, por favor ingrese nuevamente",
        statusCode: 401,
        code: "TOKEN_EXPIRED",
      });
    }
    if (err instanceof AppError) throw err;
    throw new AppError({
      message: "Token de autenticación inválido",
      statusCode: 401,
      code: "UNAUTHORIZED",
    });
  }
}

async function assertSessionVersion(user: UserWithPerms, decoded: JWTPayload): Promise<void> {
  if (user.sessionVersion !== decoded.sessionVersion) {
    throw new AppError({
      message: "La sesión ya no es válida debido a un cambio de credenciales",
      statusCode: 401,
      code: "SESSION_INVALIDATED",
    });
  }
}

export const AuthService = {
  async login(email: string, password: string): Promise<SessionRefreshResult> {
    const user = await UserRepository.findByEmail(email);

    if (!user) {
      throw new AppError({
        message: "Las credenciales ingresadas son incorrectas",
        statusCode: 401,
        code: "UNAUTHORIZED",
      });
    }

    if (!user.activo) {
      throw new AppError({
        message: "Esta cuenta de usuario ha sido desactivada. Comuníquese con soporte.",
        statusCode: 403,
        code: "ACCOUNT_DISABLED",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError({
        message: "Las credenciales ingresadas son incorrectas",
        statusCode: 401,
        code: "UNAUTHORIZED",
      });
    }

    await UserRepository.updateLastLogin(user.id);

    const authUser = mapAuthUser(user);
    const accessToken = signAccessToken(user.id, user.sessionVersion);
    const refreshToken = signRefreshToken(user.id, user.sessionVersion);

    return { user: authUser, accessToken, refreshToken };
  },

  async refreshFromCookie(refreshToken: string): Promise<SessionRefreshResult> {
    const decoded = verifyToken(refreshToken, "refresh");
    const user = await loadActiveUser(decoded.userId);
    await assertSessionVersion(user, decoded);

    const authUser = mapAuthUser(user);
    const accessToken = signAccessToken(user.id, user.sessionVersion);
    const newRefreshToken = signRefreshToken(user.id, user.sessionVersion);

    return {
      user: authUser,
      accessToken,
      refreshToken: newRefreshToken,
    };
  },

  verifyAccessToken(token: string): JWTPayload {
    return verifyToken(token, "access");
  },

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, env.BCRYPT_ROUNDS);
  },
};
