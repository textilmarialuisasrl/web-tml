const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "token",
  "cookie",
  "authorization",
  "jwt",
  "secret",
  "contraseña",
  "access_token",
  "refresh_token"
]);

export const sanitize = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }

  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object") {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

export const logger = {
  info: (message: string, reqId?: string) => {
    const prefix = reqId ? `[ReqID: ${reqId}] ` : "";
    console.log(`${new Date().toISOString()} INFO: ${prefix}${message}`);
  },
  warn: (message: string, reqId?: string) => {
    const prefix = reqId ? `[ReqID: ${reqId}] ` : "";
    console.warn(`${new Date().toISOString()} WARN: ${prefix}${message}`);
  },
  error: (message: string, error?: any, reqId?: string) => {
    const prefix = reqId ? `[ReqID: ${reqId}] ` : "";
    let cleanError = error;
    if (error instanceof Error) {
      // Create a clean stack or representation if error contains sensitive info
      cleanError = error.stack;
    } else if (typeof error === "object") {
      cleanError = sanitize(error);
    }
    console.error(`${new Date().toISOString()} ERROR: ${prefix}${message}`, cleanError !== undefined ? cleanError : "");
  },
};
