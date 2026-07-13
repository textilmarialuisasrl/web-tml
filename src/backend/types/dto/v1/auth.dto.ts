export interface UsuarioDTO {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  permisos: string[];
}

export interface LoginResponseDTO {
  usuario: UsuarioDTO;
  lastValidatedAt: string;
}
