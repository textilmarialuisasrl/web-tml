import { Producto } from "../../generated/prisma";
import { ProductoDTO } from "../types/dto/v1/product.dto";

export const ProductMapper = {
  toDTO(product: Producto): ProductoDTO {
    return {
      id: product.id,
      nombre: product.nombre,
      descripcion: product.descripcion,
      medida: product.medida,
      unidadesPorFardo: product.unidadesPorFardo,
      permiteUnidad: product.permiteUnidad,
      activo: product.activo,
      categoria: product.categoria,
      unidadPreferidaVisual: product.unidadPreferidaVisual,
    };
  },
};
