import { StockActual, Producto } from "../../generated/prisma";
import { StockDTO, CompactStockDTO } from "../types/dto/v1/stock.dto";
import { ProductMapper } from "./product.mapper";

export const StockMapper = {
  toDTO(stock: StockActual & { producto?: Producto | null }): StockDTO {
    return {
      id: stock.id,
      productoId: stock.productoId,
      producto: stock.producto ? ProductMapper.toDTO(stock.producto) : undefined,
      depositoId: stock.depositoId,
      tallerId: stock.tallerId,
      calidad: stock.calidad,
      presentacion: stock.presentacion,
      canal: stock.canal,
      cantidadUnidades: stock.cantidadUnidades,
      version: stock.version,
    };
  },

  toCompactDTO(stock: StockActual): CompactStockDTO {
    return {
      id: stock.id,
      productoId: stock.productoId,
      depositoId: stock.depositoId,
      tallerId: stock.tallerId,
      calidad: stock.calidad,
      presentacion: stock.presentacion,
      canal: stock.canal,
      cantidadUnidades: stock.cantidadUnidades,
      version: stock.version,
    };
  },
};
