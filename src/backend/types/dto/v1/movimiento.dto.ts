import { TipoMovimiento, EstadoMovimiento, SyncStatus, CalidadProducto, PresentacionProducto, CanalStock, DireccionItem } from "../../../generated/prisma";

export interface MovimientoItemDTO {
  id: string;
  productoId: string;
  productoNombreSnapshot: string;
  cantidadUnidades: number;
  depositoOrigenId: string | null;
  tallerOrigenId: string | null;
  depositoDestinoId: string | null;
  tallerDestinoId: string | null;
  calidad: CalidadProducto;
  presentacion: PresentacionProducto;
  canal: CanalStock;
  direccion: DireccionItem;
  observaciones: string | null;
}

export interface MovimientoInsumoDTO {
  id: string;
  descripcion: string;
  cantidad: number;
}

export interface MovimientoDTO {
  id: string;
  tipo: TipoMovimiento;
  usuarioId: string;
  usuarioNombreSnapshot: string;
  tallerId: string | null;
  observaciones: string | null;
  numeroSecuencial: number;
  estado: EstadoMovimiento;
  syncStatus: SyncStatus;
  deviceId: string;
  clientGeneratedId: string | null;
  payloadHash: string | null;
  schemaVersion: number;
  syncErrorMessage: string | null;
  syncResolvedAt: Date | null;
  lastSyncedAt: Date | null;
  syncBatchId: string | null;
  offlineCreatedAt: Date | null;
  items: MovimientoItemDTO[];
  insumos: MovimientoInsumoDTO[];
  createdAt: Date;
}

export interface CompactMovimientoDTO {
  id: string;
  tipo: TipoMovimiento;
  usuarioNombreSnapshot: string;
  observaciones: string | null; // truncated to max 50 chars
  numeroSecuencial: number;
  estado: EstadoMovimiento;
  syncStatus: SyncStatus;
  createdAt: Date;
}
