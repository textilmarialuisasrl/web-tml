import { Movimiento, MovimientoItem, MovimientoInsumo } from "../../generated/prisma";
import { MovimientoDTO, CompactMovimientoDTO, MovimientoItemDTO, MovimientoInsumoDTO } from "../types/dto/v1/movimiento.dto";

export const MovementMapper = {
  toItemDTO(item: MovimientoItem): MovimientoItemDTO {
    return {
      id: item.id,
      productoId: item.productoId,
      productoNombreSnapshot: item.productoNombreSnapshot,
      cantidadUnidades: item.cantidadUnidades,
      depositoOrigenId: item.depositoOrigenId,
      tallerOrigenId: item.tallerOrigenId,
      depositoDestinoId: item.depositoDestinoId,
      tallerDestinoId: item.tallerDestinoId,
      calidad: item.calidad,
      presentacion: item.presentacion,
      canal: item.canal,
      direccion: item.direccion,
      observaciones: item.observaciones,
    };
  },

  toInsumoDTO(insumo: MovimientoInsumo): MovimientoInsumoDTO {
    return {
      id: insumo.id,
      descripcion: insumo.descripcion,
      cantidad: insumo.cantidad,
    };
  },

  toDTO(
    mov: Movimiento & {
      items?: MovimientoItem[];
      insumos?: MovimientoInsumo[];
    }
  ): MovimientoDTO {
    return {
      id: mov.id,
      tipo: mov.tipo,
      usuarioId: mov.usuarioId,
      usuarioNombreSnapshot: mov.usuarioNombreSnapshot,
      tallerId: mov.tallerId,
      observaciones: mov.observaciones,
      numeroSecuencial: mov.numeroSecuencial,
      estado: mov.estado,
      syncStatus: mov.syncStatus,
      deviceId: mov.deviceId,
      clientGeneratedId: mov.clientGeneratedId,
      payloadHash: mov.payloadHash,
      schemaVersion: mov.schemaVersion,
      syncErrorMessage: mov.syncErrorMessage,
      syncResolvedAt: mov.syncResolvedAt,
      lastSyncedAt: mov.lastSyncedAt,
      syncBatchId: mov.syncBatchId,
      offlineCreatedAt: mov.offlineCreatedAt,
      createdAt: mov.createdAt,
      items: mov.items ? mov.items.map(this.toItemDTO) : [],
      insumos: mov.insumos ? mov.insumos.map(this.toInsumoDTO) : [],
    };
  },

  toCompactDTO(mov: Movimiento): CompactMovimientoDTO {
    let obs = mov.observaciones;
    if (obs && obs.length > 50) {
      obs = obs.substring(0, 47) + "...";
    }
    return {
      id: mov.id,
      tipo: mov.tipo,
      usuarioNombreSnapshot: mov.usuarioNombreSnapshot,
      observaciones: obs,
      numeroSecuencial: mov.numeroSecuencial,
      estado: mov.estado,
      syncStatus: mov.syncStatus,
      createdAt: mov.createdAt,
    };
  },
};
