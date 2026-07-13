import { CompactMovimientoDTO, MovimientoDTO } from "./movimiento.dto";

export interface AlertaStockDTO {
  id: string;
  productoId: string;
  productoNombre: string;
  depositoId: string | null;
  depositoNombre: string | null;
  tallerId: string | null;
  tallerNombre: string | null;
  cantidadActual: number;
  limiteMinimo: number;
  activa: boolean;
  createdAt: Date;
}

export interface CompactAlertaStockDTO {
  id: string;
  productoNombre: string;
  cantidadActual: number;
  limiteMinimo: number;
}

export interface DashboardDTO {
  totalItems: number;
  totalStockUnits: number;
  lastMovements: MovimientoDTO[];
  lowStockAlerts: AlertaStockDTO[];
  _cached?: boolean;
}

export interface CompactDashboardDTO {
  totalStockUnits: number;
  lastMovements: CompactMovimientoDTO[];
  lowStockAlerts: CompactAlertaStockDTO[];
  _cached?: boolean;
}
