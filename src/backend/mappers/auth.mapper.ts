import { Usuario } from "../../generated/prisma";
import { UsuarioDTO, LoginResponseDTO } from "../types/dto/v1/auth.dto";

export const AuthMapper = {
  toUsuarioDTO(user: Usuario & { permisos?: any[] }): UsuarioDTO {
    const permisos = user.permisos
      ? user.permisos.map((p) => p.permiso?.clave || p.permisoClave || "").filter(Boolean)
      : [];

    return {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      activo: user.activo,
      permisos,
    };
  },

  toLoginResponseDTO(user: Usuario & { permisos?: any[] }): LoginResponseDTO {
    return {
      usuario: this.toUsuarioDTO(user),
      lastValidatedAt: new Date().toISOString(),
    };
  },
};
