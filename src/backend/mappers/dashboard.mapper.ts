import { AlertaStock, Producto, Deposito, Taller } from "../../generated/prisma";
import { DashboardDTO, CompactDashboardDTO, AlertaStockDTO, CompactAlertaStockDTO } from "../types/dto/v1/dashboard.dto";
import { MovementMapper } from "./movement.mapper";

type ExtendedAlerta = AlertaStock & {
  producto?: Producto;
  deposito?: Deposito | null;
  taller?: Taller | null;
};

export const DashboardMapper = {
  toAlertaDTO(alerta: ExtendedAlerta): AlertaStockDTO {
    return {
      id: alerta.id,
      productoId: alerta.productoId,
      productoNombre: alerta.producto?.nombre || "Producto Desconocido",
      depositoId: alerta.depositoId,
      depositoNombre: alerta.deposito?.nombre || null,
      tallerId: alerta.tallerId,
      tallerNombre: alerta.taller?.nombre || null,
      cantidadActual: alerta.cantidadActual,
      limiteMinimo: alerta.limiteMinimo,
      activa: alerta.activa,
      createdAt: alerta.createdAt,
    };
  },

  toCompactAlertaDTO(alerta: ExtendedAlerta): CompactAlertaStockDTO {
    return {
      id: alerta.id,
      productoNombre: alerta.producto?.nombre || "Producto Desconocido",
      cantidadActual: alerta.cantidadActual,
      limiteMinimo: alerta.limiteMinimo,
    };
  },

  toDTO(data: {
    totalItems: number;
    totalStockUnits: number;
    lastMovements: any[];
    lowStockAlerts: ExtendedAlerta[];
    _cached?: boolean;
  }): DashboardDTO {
    return {
      totalItems: data.totalItems,
      totalStockUnits: data.totalStockUnits,
      lastMovements: data.lastMovements.map((m) => MovementMapper.toDTO(m)),
      lowStockAlerts: data.lowStockAlerts.map(this.toAlertaDTO),
      _cached: data._cached,
    };
  },

  toCompactDTO(data: {
    totalStockUnits: number;
    lastMovements: any[];
    lowStockAlerts: ExtendedAlerta[];
    _cached?: boolean;
  }): CompactDashboardDTO {
    return {
      totalStockUnits: data.totalStockUnits,
      lastMovements: data.lastMovements.map((m) => MovementMapper.toCompactDTO(m)),
      lowStockAlerts: data.lowStockAlerts.map(this.toCompactAlertaDTO),
      _cached: data._cached,
    };
  },
};
