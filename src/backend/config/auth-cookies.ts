import type { CookieOptions, Response } from "express";
import { env } from "./env";

/** Nombres de cookies (8B.2). */
export const AUTH_COOKIE = {
  ACCESS: "tml_access",
  REFRESH: "tml_refresh",
  /** Legacy — se limpia en login/logout. */
  LEGACY: "token",
} as const;

const secure = env.NODE_ENV === "production";

const baseOptions: CookieOptions = {
  httpOnly: true,
  secure,
  sameSite: "strict",
};

export function accessCookieOptions(): CookieOptions {
  return {
    ...baseOptions,
    path: "/api",
    maxAge: env.ACCESS_COOKIE_MAX_AGE_MS,
  };
}

export function refreshCookieOptions(): CookieOptions {
  return {
    ...baseOptions,
    path: "/api/auth",
    maxAge: env.REFRESH_COOKIE_MAX_AGE_MS,
  };
}

export function legacyTokenCookieOptions(): CookieOptions {
  return {
    ...baseOptions,
    path: "/",
    maxAge: 0,
  };
}

export function setAccessCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE.ACCESS, token, accessCookieOptions());
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE.REFRESH, token, refreshCookieOptions());
}

export function clearAuthCookies(res: Response): void {
  const clears: Array<{ name: string; options: CookieOptions }> = [
    { name: AUTH_COOKIE.ACCESS, options: { ...accessCookieOptions(), maxAge: 0 } },
    { name: AUTH_COOKIE.REFRESH, options: { ...refreshCookieOptions(), maxAge: 0 } },
    {
      name: AUTH_COOKIE.LEGACY,
      options: { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 0 },
    },
  ];
  for (const { name, options } of clears) {
    res.clearCookie(name, options);
  }
}

export function readAccessTokenFromRequest(req: {
  cookies?: Record<string, string>;
}): string | undefined {
  return req.cookies?.[AUTH_COOKIE.ACCESS] ?? req.cookies?.[AUTH_COOKIE.LEGACY];
}

export function readRefreshTokenFromRequest(req: {
  cookies?: Record<string, string>;
}): string | undefined {
  return req.cookies?.[AUTH_COOKIE.REFRESH];
}
