export interface AuthUser {
  id: string;
  nombre: string;
  email: string;
  permisos: string[];
  sessionVersion: number;
}

export interface JWTPayload {
  userId: string;
  sessionVersion: number;
  typ?: "access" | "refresh";
  iat?: number;
  exp?: number;
}

export interface SessionRefreshResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}
