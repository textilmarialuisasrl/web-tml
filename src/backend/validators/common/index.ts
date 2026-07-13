import { z } from "zod";

export const cuidSchema = z.string().cuid({ message: "El identificador provisto debe ser un CUID válido" });

export const emailSchema = z
  .string({ required_error: "El correo electrónico es obligatorio" })
  .trim()
  .email({ message: "El formato de correo electrónico es inválido" });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1, "La página debe ser mayor a 0").default(1),
  limit: z.coerce.number().int().min(1, "El límite debe ser mayor a 0").max(100, "El límite máximo permitido es 100").default(20),
});
