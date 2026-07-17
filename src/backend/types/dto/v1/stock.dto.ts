import { CalidadProducto, CanalStock } from "../../../generated/prisma";
import { ProductoDTO } from "./product.dto";

export interface StockDTO {
  id: string;
  productoId: string;
  producto?: ProductoDTO;
  depositoId: string | null;
  tallerId: string | null;
  calidad: CalidadProducto;
  canal: CanalStock;
  cantidadUnidades: number;
  version: number;
}

export interface CompactStockDTO {
  id: string;
  productoId: string;
  depositoId: string | null;
  tallerId: string | null;
  calidad: CalidadProducto;
  canal: CanalStock;
  cantidadUnidades: number;
  version: number;
}
