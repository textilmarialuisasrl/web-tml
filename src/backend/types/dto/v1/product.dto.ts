import { UnidadVisual } from "../../../generated/prisma";

export interface ProductoDTO {
  id: string;
  nombre: string;
  descripcion: string | null;
  medida: string | null;
  unidadesPorFardo: number;
  permiteUnidad: boolean;
  activo: boolean;
  categoria: string;
  unidadPreferidaVisual: UnidadVisual;
}
