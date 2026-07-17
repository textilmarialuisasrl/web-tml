import { z } from "zod";
import { emailSchema } from "./common";

export const loginSchema = z.object({
  email: z.string({ required_error: "El correo electrónico es obligatorio" }).trim(),
  password: z
    .string({ required_error: "La contraseña es obligatoria" })
    .min(6, { message: "La contraseña debe tener al menos 6 caracteres" }),
});

export type LoginInput = z.infer<typeof loginSchema>;
