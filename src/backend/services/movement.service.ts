import { MovementRepository, MovementFilter } from "../repositories/movement.repository";
import { prisma } from "../db/prisma";
import { ProductRepository } from "../repositories/product.repository";
import { UserRepository } from "../repositories/user.repository";
import { StockService } from "./stock.service";
import { ConfigService } from "./config.service";
import { AuditService } from "./audit.service";
import { AppError } from "../utils/errors";
import {
  TipoMovimiento,
  CalidadProducto,
  PresentacionProducto,
  CanalStock,
  DireccionItem,
  SyncStatus,
} from "../../generated/prisma/client";
import { eventBus, DOMAIN_EVENTS } from "../events/domain.events";
import { throttledSecurityLog } from "../utils/security";

export interface MovementItemInput {
  productoId: string;
  cantidadUnidades: number;
  depositoOrigenId?: string | null;
  tallerOrigenId?: string | null;
  depositoDestinoId?: string | null;
  tallerDestinoId?: string | null;
  calidad: CalidadProducto;
  presentacion: PresentacionProducto;
  canal: CanalStock;
  direccion?: DireccionItem;
  observaciones?: string | null;
}

export interface CreateMovementInput {
  tipo: TipoMovimiento;
  usuarioId: string;
  tallerId?: string | null;
  observaciones?: string | null;
  deviceId?: string;
  syncStatus?: SyncStatus;
  clientGeneratedId?: string | null;
  payloadHash?: string | null;
  schemaVersion?: number;
  syncErrorMessage?: string | null;
  syncResolvedAt?: Date | null;
  lastSyncedAt?: Date | null;
  offlineCreatedAt?: Date | null;
  syncBatchId?: string | null;
  items: MovementItemInput[];
  insumos?: { descripcion: string; cantidad: number }[];
}

export const MovementService = {
  /**
   * Universal transactional movement creation.
   * Performs all validations, merges duplicates, captures snapshots, propagates stock updates,
   * registers audit trails, and emits non-blocking domain events.
   */
  async createMovimiento(
    data: CreateMovementInput,
    meta?: { requestId?: string | null; ip?: string | null; userAgent?: string | null }
  ) {
    console.log(`\n[BACKEND]\nmovementId: ${data.clientGeneratedId || "N/A"}\nvalidaciones ejecutadas: [replay_check, ownership_check, type_rules, item_rules, stock_decrement]\n`);
    try {
      const result = await this.executeCreateMovimiento(data, meta);
      console.log(`\n[BACKEND]\nmovementId: ${data.clientGeneratedId || "N/A"}\nvalidaciones ejecutadas: [replay_check, ownership_check, type_rules, item_rules, stock_decrement]\nresultado: SUCCESS\n`);
      return result;
    } catch (err: any) {
      console.log(`\n[BACKEND]\nmovementId: ${data.clientGeneratedId || "N/A"}\nvalidaciones ejecutadas: [replay_check, ownership_check, type_rules, item_rules, stock_decrement]\nresultado: FAILED (${err.code || "UNKNOWN_ERROR"}: ${err.message})\n`);
      
      let expectedStr = "N/A";
      let actualStr = "N/A";
      if (err.code === "INSUFFICIENT_STOCK") {
        expectedStr = String(err.details?.requested || "N/A");
        actualStr = String(err.details?.available || "N/A");
      }
      console.log(`\n[VALIDATION]\nmovementId: ${data.clientGeneratedId || "N/A"}\nstock esperado: ${expectedStr}\nstock actual: ${actualStr}\nmotivo del rechazo: ${err.message}\n`);
      
      throw err;
    }
  },

  async executeCreateMovimiento(
    data: CreateMovementInput,
    meta?: { requestId?: string | null; ip?: string | null; userAgent?: string | null }
  ) {
    if (!data.items || data.items.length === 0) {
      throw new AppError({
        message: "El movimiento debe contener al menos un ítem de producto",
        statusCode: 400,
        code: "MINIMUM_ITEMS_REQUIRED",
      });
    }

    // 1. Merge duplicate items within the same movement before validation/persistence
    const mergedItemsMap = new Map<string, MovementItemInput & { direccion: DireccionItem }>();
    for (const item of data.items) {
      const depOrig = item.depositoOrigenId || null;
      const talOrig = item.tallerOrigenId || null;
      const depDest = item.depositoDestinoId || null;
      const talDest = item.tallerDestinoId || null;
      const obs = item.observaciones || null;
      const calidad = item.calidad || "PERFECTO";
      const presentacion = item.presentacion || "SIN_ETIQUETA";
      const canal = item.canal || "MAYORISTA";

      // Infer direction if not supplied
      const dir = item.direccion || (
        depDest && !depOrig ? "ENTRADA" :
        depOrig && !depDest ? "SALIDA" :
        talDest ? "SALIDA" : "ENTRADA"
      );

      const key = `${item.productoId}_${depOrig}_${talOrig}_${depDest}_${talDest}_${calidad}_${presentacion}_${canal}_${dir}_${obs}`;
      
      if (mergedItemsMap.has(key)) {
        const existing = mergedItemsMap.get(key)!;
        existing.cantidadUnidades += item.cantidadUnidades;
      } else {
        mergedItemsMap.set(key, {
          ...item,
          depositoOrigenId: depOrig,
          tallerOrigenId: talOrig,
          depositoDestinoId: depDest,
          tallerDestinoId: talDest,
          calidad: calidad as any,
          presentacion: presentacion as any,
          canal: canal as any,
          observaciones: obs,
          direccion: dir as DireccionItem,
        });
      }
    }
    const mergedItems = Array.from(mergedItemsMap.values());

    // 2. Perform validations & run the entire flow inside our transaction retry loop
    return StockService.runTransactionWithRetry(async (tx) => {
      // 2.1 Fetch user name snapshot
      const user = await UserRepository.findByIdWithPermissions(data.usuarioId, tx);
      if (!user) {
        throw new AppError({
          message: "Usuario emisor no encontrado",
          statusCode: 401,
          code: "USER_NOT_FOUND",
        });
      }
      const usuarioNombreSnapshot = user.nombre;

      // 2.1.1 Replay Protection check inside transaction
      let existingRecord = null;
      if (data.clientGeneratedId) {
        existingRecord = await tx.movimiento.findFirst({
          where: {
            deviceId: data.deviceId || "SYSTEM",
            clientGeneratedId: data.clientGeneratedId,
          },
          include: {
            items: true,
            insumos: true,
          },
        });
        if (existingRecord) {
          if (existingRecord.syncStatus === "SYNCED") {
            if (existingRecord.payloadHash === data.payloadHash) {
              // Case A: Legitimate retry. Same hash - return existing movement idempotently without repeating stock mutation.
              return existingRecord;
            } else {
              // Case B: Collision! Identical ID but different payload payloadHash.
              throttledSecurityLog(
                "duplicate-operation",
                `Duplicate operation blocked for clientGeneratedId ${data.clientGeneratedId} (modified payload hash)`
              );
              throw new AppError({
                message: "Operación duplicada detectada (identificador ya procesado)",
                statusCode: 409,
                code: "DUPLICATE_OPERATION",
              });
            }
          }
          // If it is FAILED or CONFLICT, we do NOT return/throw. We let it proceed,
          // and we will update this existing record in the database instead of creating a new one.
        }
      }

      // 2.1.2 Role-Based Movement Type Verification
      const userPerms = user.permisos.map((up) => up.permiso.clave);
      const isAdmin = userPerms.includes("ADMIN_SISTEMA");
      const isSupervisorUser = userPerms.includes("MOVIMIENTOS_VER") && userPerms.includes("MOVIMIENTOS_CREAR") && !isAdmin;
      const isOperarioUser = userPerms.includes("MOVIMIENTOS_CREAR") && !userPerms.includes("MOVIMIENTOS_VER");

      if (isOperarioUser) {
        const allowedTypes = ["MOVIMIENTO_INTERNO", "INGRESO_MANUAL"];
        if (!allowedTypes.includes(data.tipo)) {
          throw new AppError({
            message: `Acceso denegado: el Operario no tiene permisos para realizar movimientos de tipo ${data.tipo}`,
            statusCode: 403,
            code: "FORBIDDEN_OPERATION",
          });
        }
        if (data.tipo === "INGRESO_MANUAL") {
          const corteDep = await tx.deposito.findFirst({
            where: { tipo: "CORTE", activo: true }
          });
          const corteId = corteDep?.id;
          for (const item of mergedItems) {
            if (item.depositoDestinoId !== corteId) {
              throw new AppError({
                message: "Acceso denegado: la producción registrada por el Operario debe tener como destino la ZONA DE CORTE",
                statusCode: 403,
                code: "FORBIDDEN_OPERATION_DESTINATION",
              });
            }
          }
        }
      } else if (isSupervisorUser) {
        if (data.tipo === "AJUSTE") {
          throw new AppError({
            message: "Acceso denegado: el Supervisor no tiene permisos para realizar ajustes administrativos",
            statusCode: 403,
            code: "FORBIDDEN_OPERATION",
          });
        }
      } else if (!isAdmin) {
        throw new AppError({
          message: "Acceso denegado: no tiene permisos para registrar movimientos",
          statusCode: 403,
          code: "FORBIDDEN",
        });
      }

      // 2.1.3 Location (Taller & Depósito) Ownership Validation
      let allowedTalleres: string[] = [];
      let allowedDepositos: string[] = [];
      const isProduction = process.env.NODE_ENV === "production";

      if (isAdmin) {
        const [allTalleres, allDepositos] = await Promise.all([
          tx.taller.findMany({ where: { activo: true }, select: { id: true } }),
          tx.deposito.findMany({ where: { activo: true }, select: { id: true } }),
        ]);
        allowedTalleres = allTalleres.map((t: { id: string }) => t.id);
        allowedDepositos = allDepositos.map((d: { id: string }) => d.id);
      } else {
        const configKey = `user_access:${user.id}`;
        let configLoaded = false;
        try {
          const config = await tx.configuracion.findUnique({
            where: { clave: configKey },
          });
          if (config?.valor) {
            const parsed = JSON.parse(config.valor);
            allowedTalleres = Array.isArray(parsed.allowedTalleres) ? parsed.allowedTalleres : [];
            allowedDepositos = Array.isArray(parsed.allowedDepositos) ? parsed.allowedDepositos : [];
            configLoaded = true;
          }
        } catch {
          // ignore
        }

        if (!configLoaded) {
          if (!isProduction) {
            const [firstTaller, firstDeposito] = await Promise.all([
              tx.taller.findFirst({ where: { activo: true }, select: { id: true } }),
              tx.deposito.findFirst({ where: { activo: true }, select: { id: true } }),
            ]);
            allowedTalleres = firstTaller ? [firstTaller.id] : [];
            allowedDepositos = firstDeposito ? [firstDeposito.id] : [];
          } else {
            allowedTalleres = [];
            allowedDepositos = [];
            throttledSecurityLog(
              "unmapped-user-access",
              `User ${user.id} (${user.email}) has no access mapping configured in production`
            );
          }
        }
      }

      // Check all item-level locations (origins and destinations)
      for (const item of mergedItems) {
        if (item.tallerOrigenId && !allowedTalleres.includes(item.tallerOrigenId)) {
          throttledSecurityLog(
            "forbidden-workshop-access",
            `User ${data.usuarioId} denied access to workshop ${item.tallerOrigenId}`
          );
          throw new AppError({
            message: "Acceso denegado a talleres o depósitos especificados",
            statusCode: 403,
            code: "FORBIDDEN_WORKSHOP_ACCESS",
          });
        }
        if (item.tallerDestinoId && !allowedTalleres.includes(item.tallerDestinoId)) {
          throttledSecurityLog(
            "forbidden-workshop-access",
            `User ${data.usuarioId} denied access to workshop ${item.tallerDestinoId}`
          );
          throw new AppError({
            message: "Acceso denegado a talleres o depósitos especificados",
            statusCode: 403,
            code: "FORBIDDEN_WORKSHOP_ACCESS",
          });
        }
        if (item.depositoOrigenId && !allowedDepositos.includes(item.depositoOrigenId)) {
          throttledSecurityLog(
            "forbidden-workshop-access",
            `User ${data.usuarioId} denied access to depósito ${item.depositoOrigenId}`
          );
          throw new AppError({
            message: "Acceso denegado a talleres o depósitos especificados",
            statusCode: 403,
            code: "FORBIDDEN_WORKSHOP_ACCESS",
          });
        }
        if (item.depositoDestinoId && !allowedDepositos.includes(item.depositoDestinoId)) {
          throttledSecurityLog(
            "forbidden-workshop-access",
            `User ${data.usuarioId} denied access to depósito ${item.depositoDestinoId}`
          );
          throw new AppError({
            message: "Acceso denegado a talleres o depósitos especificados",
            statusCode: 403,
            code: "FORBIDDEN_WORKSHOP_ACCESS",
          });
        }
      }

      // 2.2 Validate type-level rules
      if ((data.tipo === "ENTREGA_TALLER" || data.tipo === "DEVOLUCION_TALLER") && !data.tallerId) {
        throw new AppError({
          message: "Debe especificar el taller asociado al movimiento",
          statusCode: 400,
          code: "TALLER_REQUIRED",
        });
      }

      // 2.3 Fetch product snapshots and run item-level validations
      const itemsWithSnapshots = [];
      for (const item of mergedItems) {
        if (item.cantidadUnidades <= 0) {
          throw new AppError({
            message: "La cantidad de unidades en cada ítem debe ser mayor a cero",
            statusCode: 400,
            code: "INVALID_QUANTITY",
          });
        }

        const product = await ProductRepository.findById(item.productoId, tx);
        if (!product) {
          throw new AppError({
            message: `El producto con ID ${item.productoId} no existe`,
            statusCode: 400,
            code: "PRODUCT_NOT_FOUND",
          });
        }

        // Validate XOR location rules per item
        if (item.depositoOrigenId || item.tallerOrigenId) {
          StockService.assertLocation(item.depositoOrigenId || null, item.tallerOrigenId || null);
        }
        if (item.depositoDestinoId || item.tallerDestinoId) {
          StockService.assertLocation(item.depositoDestinoId || null, item.tallerDestinoId || null);
        }

        if (
          !item.depositoOrigenId &&
          !item.tallerOrigenId &&
          !item.depositoDestinoId &&
          !item.tallerDestinoId
        ) {
          throw new AppError({
            message: "Cada ítem debe poseer al menos un origen o un destino de stock",
            statusCode: 400,
            code: "LOCATION_REQUIRED",
          });
        }

        // Prevent internal movement to exact same location
        if (
          item.depositoOrigenId &&
          item.depositoDestinoId &&
          item.depositoOrigenId === item.depositoDestinoId
        ) {
          throw new AppError({
            message: "El depósito de origen y destino no pueden ser el mismo",
            statusCode: 400,
            code: "SAME_ORIGIN_DESTINATION",
          });
        }
        if (
          item.tallerOrigenId &&
          item.tallerDestinoId &&
          item.tallerOrigenId === item.tallerDestinoId
        ) {
          throw new AppError({
            message: "El taller de origen y destino no pueden ser el mismo",
            statusCode: 400,
            code: "SAME_ORIGIN_DESTINATION",
          });
        }


        // ETIQUETADO validation
        if (data.tipo === "ETIQUETADO") {
          if (item.depositoOrigenId || item.tallerOrigenId) {
            if (item.presentacion !== "SIN_ETIQUETA") {
              throw new AppError({
                message: "El stock de origen a etiquetar debe ser SIN_ETIQUETA",
                statusCode: 400,
                code: "INVALID_PRESENTATION",
              });
            }
          }
          if (item.depositoDestinoId || item.tallerDestinoId) {
            if (item.presentacion !== "ETIQUETADO") {
              throw new AppError({
                message: "El stock de destino resultante del etiquetado debe ser ETIQUETADO",
                statusCode: 400,
                code: "INVALID_PRESENTATION",
              });
            }
          }
        }

        itemsWithSnapshots.push({
          ...item,
          productoNombreSnapshot: product.nombre,
        });
      }

      // 2.4 Persist Movement Header, Items and Insumos
      let movement;
      if (existingRecord && (existingRecord.syncStatus === "FAILED" || existingRecord.syncStatus === "CONFLICT")) {
        // En lugar de crear un nuevo registro, actualizamos el fallido/en conflicto
        // Primero eliminamos los items e insumos existentes para recrearlos
        await tx.movimientoItem.deleteMany({ where: { movimientoId: existingRecord.id } });
        await tx.movimientoInsumo.deleteMany({ where: { movimientoId: existingRecord.id } });

        movement = await tx.movimiento.update({
          where: { id: existingRecord.id },
          data: {
            tipo: data.tipo,
            tallerId: data.tallerId || null,
            observaciones: data.observaciones || null,
            requestId: meta?.requestId || null,
            syncStatus: data.syncStatus || "SYNCED",
            payloadHash: data.payloadHash,
            schemaVersion: data.schemaVersion || 1,
            syncErrorMessage: data.syncErrorMessage || null,
            syncResolvedAt: data.syncResolvedAt || null,
            lastSyncedAt: data.lastSyncedAt || new Date(),
            syncBatchId: data.syncBatchId || null,
            items: {
              create: itemsWithSnapshots.map((item) => ({
                productoId: item.productoId,
                productoNombreSnapshot: item.productoNombreSnapshot,
                cantidadUnidades: item.cantidadUnidades,
                depositoOrigenId: item.depositoOrigenId || null,
                tallerOrigenId: item.tallerOrigenId || null,
                depositoDestinoId: item.depositoDestinoId || null,
                tallerDestinoId: item.tallerDestinoId || null,
                calidad: item.calidad,
                presentacion: item.presentacion,
                canal: item.canal,
                direccion: item.direccion,
                observaciones: item.observaciones || null,
              })),
            },
            insumos: data.insumos
              ? {
                  create: data.insumos.map((ins) => ({
                    descripcion: ins.descripcion,
                    cantidad: ins.cantidad,
                  })),
                }
              : undefined,
          },
          include: {
            items: true,
            insumos: true,
            taller: true,
          },
        });
      } else {
        // Creación normal
        movement = await MovementRepository.createMovimiento(
          {
            tipo: data.tipo,
            usuarioId: data.usuarioId,
            usuarioNombreSnapshot,
            tallerId: data.tallerId,
            observaciones: data.observaciones,
            requestId: meta?.requestId,
            deviceId: data.deviceId,
            syncStatus: data.syncStatus,
            clientGeneratedId: data.clientGeneratedId,
            payloadHash: data.payloadHash,
            schemaVersion: data.schemaVersion,
            syncErrorMessage: data.syncErrorMessage,
            syncResolvedAt: data.syncResolvedAt,
            lastSyncedAt: data.lastSyncedAt,
            offlineCreatedAt: data.offlineCreatedAt,
            syncBatchId: data.syncBatchId,
            items: itemsWithSnapshots,
            insumos: data.insumos,
          },
          tx
        );
      }

      // 2.5 Process Stock Updates
      for (const item of itemsWithSnapshots) {
        if (item.depositoOrigenId || item.tallerOrigenId) {
          await StockService.decrementStock(
            {
              productoId: item.productoId,
              depositoId: item.depositoOrigenId || null,
              tallerId: item.tallerOrigenId || null,
              calidad: item.calidad,
              presentacion: item.presentacion,
              canal: item.canal,
              cantidadUnidades: item.cantidadUnidades,
            },
            tx
          );
        }

        if (item.depositoDestinoId || item.tallerDestinoId) {
          await StockService.incrementStock(
            {
              productoId: item.productoId,
              depositoId: item.depositoDestinoId || null,
              tallerId: item.tallerDestinoId || null,
              calidad: item.calidad,
              presentacion: item.presentacion,
              canal: item.canal,
              cantidadUnidades: item.cantidadUnidades,
            },
            tx
          );
        }
      }

      // 2.6 Register Audit Record
      await AuditService.registerAudit(
        {
          usuarioId: data.usuarioId,
          accion: `CREAR_MOVIMIENTO_${data.tipo}`,
          entidad: "Movimiento",
          entidadId: movement.id,
          movimientoId: movement.id,
          cambios: {
            tipo: data.tipo,
            tallerId: data.tallerId,
            itemsCount: movement.items.length,
          },
          before: null,
          after: {
            id: movement.id,
            tipo: movement.tipo,
            numeroSecuencial: movement.numeroSecuencial,
            items: movement.items.map((i) => ({
              producto: i.productoNombreSnapshot,
              qty: i.cantidadUnidades,
            })),
          },
          requestId: meta?.requestId,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        },
        tx
      );

      // 2.7 Trigger event bus emission on success
      eventBus.emitSafe(DOMAIN_EVENTS.MOVEMENT_CREATED, movement);

      // 2.8 Check for low stock thresholds and emit alerts
      const alertThresholdStr = await ConfigService.getConfig("STOCK_MINIMO_ALERTA");
      const threshold = alertThresholdStr ? parseInt(alertThresholdStr) : 10;
      for (const item of itemsWithSnapshots) {
        if (item.depositoDestinoId || item.tallerDestinoId) continue; // Only check on reductions
        const currentStock = await StockService.getStock({
          productoId: item.productoId,
          depositoId: item.depositoOrigenId || null,
          tallerId: item.tallerOrigenId || null,
          calidad: item.calidad,
          presentacion: item.presentacion,
          canal: item.canal,
        });
        if (currentStock && currentStock.cantidadUnidades <= threshold) {
          eventBus.emitSafe(DOMAIN_EVENTS.LOW_STOCK_DETECTED, {
            productoId: item.productoId,
            productoNombre: item.productoNombreSnapshot,
            cantidadUnidades: currentStock.cantidadUnidades,
            depositoId: item.depositoOrigenId,
            tallerId: item.tallerOrigenId,
          });
        }
      }

      return movement;
    });
  },

  /**
   * Deliver stock to external workshop.
   */
  async createEntregaTaller(
    data: {
      usuarioId: string;
      tallerId: string;
      observaciones?: string | null;
      items: { productoId: string; cantidadUnidades: number }[];
      insumos?: { descripcion: string; cantidad: number }[];
      deviceId?: string;
      offlineCreatedAt?: Date;
      syncBatchId?: string;
    },
    meta?: { requestId?: string | null; ip?: string | null; userAgent?: string | null }
  ) {
    if (!data.tallerId) {
      throw new AppError({
        message: "Debe especificar el taller destinatario",
        statusCode: 400,
        code: "TALLER_REQUIRED",
      });
    }

    const depCorte = await prisma.deposito.findFirst({
      where: {
        nombre: { equals: "Zona de Corte", mode: "insensitive" },
        deletedAt: null,
      },
    });

    if (!depCorte) {
      throw new AppError({
        message: "El depósito 'Zona de Corte' no existe",
        statusCode: 500,
        code: "ZONA_DE_CORTE_NOT_FOUND",
      });
    }

    const items = data.items.map((item) => {
      return {
        productoId: item.productoId,
        cantidadUnidades: item.cantidadUnidades,
        depositoOrigenId: depCorte.id,
        depositoDestinoId: null,
        tallerOrigenId: null,
        tallerDestinoId: data.tallerId,
        calidad: CalidadProducto.PERFECTO,
        presentacion: PresentacionProducto.SIN_ETIQUETA,
        canal: CanalStock.MAYORISTA,
        direccion: "SALIDA" as const,
      };
    });

    return this.createMovimiento(
      {
        ...data,
        tipo: TipoMovimiento.ENTREGA_TALLER,
        items,
      },
      meta
    );
  },

  /**
   * Return stock from external workshop.
   */
  async createDevolucionTaller(
    data: {
      usuarioId: string;
      tallerId: string;
      depositoId: string;
      observaciones?: string | null;
      items: { productoId: string; cantidadUnidades?: number; cantidadFallados?: number }[];
      deviceId?: string;
      offlineCreatedAt?: Date;
      syncBatchId?: string;
    },
    meta?: { requestId?: string | null; ip?: string | null; userAgent?: string | null }
  ) {
    if (!data.tallerId) {
      throw new AppError({
        message: "Debe especificar el taller de origen",
        statusCode: 400,
        code: "TALLER_REQUIRED",
      });
    }

    if (!data.depositoId) {
      throw new AppError({
        message: "Debe especificar el depósito de destino",
        statusCode: 400,
        code: "DEPOSIT_DESTINO_REQUIRED",
      });
    }

    const items: MovementItemInput[] = [];
    for (const item of data.items) {
      const perfects = item.cantidadUnidades || 0;
      const fallados = item.cantidadFallados || 0;

      if (perfects <= 0 && fallados <= 0) {
        throw new AppError({
          message: "La cantidad devuelta debe ser mayor a cero",
          statusCode: 400,
          code: "INVALID_QUANTITY",
        });
      }

      if (perfects > 0) {
        items.push({
          productoId: item.productoId,
          cantidadUnidades: perfects,
          depositoOrigenId: null,
          depositoDestinoId: data.depositoId,
          tallerOrigenId: data.tallerId,
          tallerDestinoId: null,
          calidad: CalidadProducto.PERFECTO,
          presentacion: PresentacionProducto.SIN_ETIQUETA,
          canal: CanalStock.MAYORISTA,
          direccion: "ENTRADA" as const,
        });
      }

      if (fallados > 0) {
        items.push({
          productoId: item.productoId,
          cantidadUnidades: fallados,
          depositoOrigenId: null,
          depositoDestinoId: data.depositoId,
          tallerOrigenId: data.tallerId,
          tallerDestinoId: null,
          calidad: CalidadProducto.FALLADO,
          presentacion: PresentacionProducto.SIN_ETIQUETA,
          canal: CanalStock.MAYORISTA,
          direccion: "ENTRADA" as const,
        });
      }
    }

    return this.createMovimiento(
      {
        tipo: TipoMovimiento.DEVOLUCION_TALLER,
        usuarioId: data.usuarioId,
        tallerId: data.tallerId,
        observaciones: data.observaciones,
        items,
        deviceId: data.deviceId,
        offlineCreatedAt: data.offlineCreatedAt,
        syncBatchId: data.syncBatchId,
      },
      meta
    );
  },

  /**
   * Transfer stock between warehouses.
   */
  async createMovimientoInterno(
    data: Omit<CreateMovementInput, "tipo">,
    meta?: { requestId?: string | null; ip?: string | null; userAgent?: string | null }
  ) {
    const items = data.items.map((item) => {
      if (!item.depositoOrigenId || !item.depositoDestinoId) {
        throw new AppError({
          message: "Un movimiento interno requiere depósito de origen y de destino",
          statusCode: 400,
          code: "DEPOSITS_REQUIRED",
        });
      }
      return {
        ...item,
        tallerOrigenId: null,
        tallerDestinoId: null,
      };
    });

    return this.createMovimiento(
      {
        ...data,
        tipo: TipoMovimiento.MOVIMIENTO_INTERNO,
        items,
      },
      meta
    );
  },

  /**
   * Reconvert stock (mixed quality/presentation changes).
   */
  async createReconversion(
    data: Omit<CreateMovementInput, "tipo">,
    meta?: { requestId?: string | null; ip?: string | null; userAgent?: string | null }
  ) {
    return this.createMovimiento(
      {
        ...data,
        tipo: TipoMovimiento.RECONVERSION,
      },
      meta
    );
  },



  /**
   * Labels products.
   */
  async createEtiquetado(
    data: {
      usuarioId: string;
      productoId: string;
      depositoId: string;
      cantidadUnidades: number;
      canal: CanalStock;
      calidad: CalidadProducto;
      observaciones?: string | null;
      deviceId?: string | null;
      offlineCreatedAt?: Date | null;
      syncBatchId?: string | null;
    },
    meta?: { requestId?: string | null; ip?: string | null; userAgent?: string | null }
  ) {
    if (data.cantidadUnidades <= 0) {
      throw new AppError({
        message: "La cantidad de unidades a etiquetar debe ser mayor a cero",
        statusCode: 400,
        code: "INVALID_QTY",
      });
    }

    const items: MovementItemInput[] = [
      {
        productoId: data.productoId,
        cantidadUnidades: data.cantidadUnidades,
        depositoOrigenId: data.depositoId,
        depositoDestinoId: null,
        calidad: data.calidad,
        presentacion: PresentacionProducto.SIN_ETIQUETA,
        canal: data.canal,
      },
      {
        productoId: data.productoId,
        cantidadUnidades: data.cantidadUnidades,
        depositoOrigenId: null,
        depositoDestinoId: data.depositoId,
        calidad: data.calidad,
        presentacion: PresentacionProducto.ETIQUETADO,
        canal: data.canal,
      },
    ];

    return this.createMovimiento(
      {
        tipo: TipoMovimiento.ETIQUETADO,
        usuarioId: data.usuarioId,
        observaciones: data.observaciones || `Etiquetado manual de ${data.cantidadUnidades} unidades`,
        deviceId: data.deviceId,
        offlineCreatedAt: data.offlineCreatedAt,
        syncBatchId: data.syncBatchId,
        items,
      },
      meta
    );
  },

  /**
   * Fetch single movement by ID.
   */
  async getMovement(id: string) {
    const movement = await MovementRepository.findById(id);
    if (!movement) {
      throw new AppError({
        message: "El movimiento no existe",
        statusCode: 404,
        code: "MOVEMENT_NOT_FOUND",
      });
    }
    return movement;
  },

  /**
   * Lists movements using cursor-based timeline pagination (Stable, indexed sequence DESC).
   */
  async listMovements(query: any, user?: any) {
    const cursor = query.cursor ? parseInt(query.cursor as string) : undefined;
    const limit = parseInt(query.limit as string) || 20;
    const tipo = (query.tipo as TipoMovimiento) || undefined;
    const productoId = (query.productoId as string) || undefined;
    const usuarioId = (query.usuarioId as string) || undefined;
    const fecha = (query.fecha as string) || undefined;

    let depositoId = (query.depositoId as string) || undefined;
    let tallerId = (query.tallerId as string) || undefined;

    // Workshop read-only user access restriction
    if (user && !user.permisos.includes("ADMIN_SISTEMA") && !user.permisos.includes("MOVIMIENTOS_CREAR")) {
      const allowedTalleres = user.allowedTalleres || [];
      if (allowedTalleres.length > 0) {
        tallerId = allowedTalleres[0];
        depositoId = undefined;
      }
    }

    const items = await MovementRepository.listTimeline({
      cursor,
      limit,
      tipo,
      productoId,
      depositoId,
      tallerId,
      usuarioId,
      fecha,
    });

    const nextCursor = items.length === limit ? items[items.length - 1].numeroSecuencial : null;

    return {
      items,
      nextCursor,
    };
  },

  /**
   * Prepared placeholder for future reverse operations.
   */
  async reverseMovement(movimientoId: string, usuarioId: string, meta?: any) {
    throw new AppError({
      message: "Reversión de movimientos no implementada aún en la interfaz",
      statusCode: 501,
      code: "NOT_IMPLEMENTED",
    });
  },
};
