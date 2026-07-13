import dotenv from "dotenv";
import { z } from "zod";

// Load standard .env file
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url("DATABASE_URL debe ser una URL válida"),
  JWT_SECRET: z.string().min(8, "JWT_SECRET debe tener al menos 8 caracteres"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((str) => str.split(",").map((origin) => origin.trim())),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(31).default(10),
  COOKIE_MAX_AGE: z.coerce.number().int().positive().default(604800000),
  /** Access JWT — corto (30 min por defecto). */
  ACCESS_TOKEN_EXPIRES: z.string().default("30m"),
  /** Max-Age cookie access (ms) — alinear con JWT ~30m. */
  ACCESS_COOKIE_MAX_AGE_MS: z.coerce.number().int().positive().default(30 * 60 * 1000),
  /** Refresh cookie — largo (7 días por defecto). */
  REFRESH_COOKIE_MAX_AGE_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60 * 1000),
  REFRESH_TOKEN_EXPIRES: z.string().default("7d"),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("❌ Error de validación en las variables de entorno:");
  console.error(JSON.stringify(result.error.format(), null, 2));
  process.exit(1);
}

export const env = Object.freeze(result.data);
