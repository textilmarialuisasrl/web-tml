import { StockRepository, StockFilter } from "../repositories/stock.repository";
import { ProductRepository } from "../repositories/product.repository";
import { DepositoRepository } from "../repositories/deposito.repository";
import { TallerRepository } from "../repositories/taller.repository";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { prisma } from "../db/prisma";
import { CalidadProducto, PresentacionProducto, CanalStock } from "../../generated/prisma/client";
import { eventBus, DOMAIN_EVENTS } from "../events/domain.events";
import { metricsRegistry } from "../utils/metrics";

export interface StockParams {
  productoId: string;
  depositoId: string | null;
  tallerId: string | null;
  calidad: CalidadProducto;
  presentacion: PresentacionProducto;
  canal: CanalStock;
}

export const StockService = {
  /**
   * Automatic transaction retry wrapper for optimistic locking.
   * Runs the provided function in a prisma transaction, retrying up to `retries` times
   * on concurrency version conflicts (Prisma P2025/P2002 or target version mismatch).
   */
  async runTransactionWithRetry<T>(fn: (tx: any) => Promise<T>, retries = 3): Promise<T> {
    let attempt = 0;
    while (attempt < retries) {
      attempt++;
      try {
        const result = await prisma.$transaction(async (tx) => {
          return await fn(tx);
        }, {
          maxWait: 10000,
          timeout: 15000
        });
        if (attempt > 1) {
          metricsRegistry.incrementCounter("optimistic_lock_retry_success");
        }
        return result;
      } catch (err: any) {
        // Concurrency errors (P2025: Record to update not found because version changed; P2002: Unique constraint race condition)
        const isConflict = err.code === "P2025" || err.code === "P2002" || err.message?.includes("version");
        if (isConflict) {
          metricsRegistry.incrementCounter("optimistic_lock_conflicts");
          if (attempt < retries) {
            metricsRegistry.incrementCounter("optimistic_lock_retries");
            logger.warn(`[Concurrency Conflict] Attempt ${attempt}/${retries} failed. Retrying in background...`);
            // Wait small randomized backoff delay before retry
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 80 + 20));
            continue;
          }
          metricsRegistry.incrementCounter("optimistic_lock_retry_failure");
          throw new AppError({
            message: "Conflicto de concurrencia al actualizar el stock, por favor intente nuevamente.",
            statusCode: 409,
            code: "STOCK_CONFLICT",
            details: { attempts: attempt },
          });
        }
        throw err;
      }
    }
    metricsRegistry.incrementCounter("optimistic_lock_retry_failure");
    throw new AppError({
      message: "No se pudo actualizar el stock debido a excesiva concurrencia.",
      statusCode: 409,
      code: "STOCK_CONFLICT",
    });
  },

  /**
   * Validates that product, deposit, and/or workshop exist and are active.
   */
  async validateEntities(
    params: { productoId: string; depositoId?: string | null; tallerId?: string | null },
    tx?: any
  ) {
    // 1. Validate Product
    const producto = await ProductRepository.findById(params.productoId, tx);
    if (!producto) {
      throw new AppError({
        message: "El producto especificado no existe o fue eliminado",
        statusCode: 400,
        code: "PRODUCT_NOT_FOUND",
      });
    }
    if (!producto.activo) {
      throw new AppError({
        message: `El producto '${producto.nombre}' está inactivo y no permite movimientos`,
        statusCode: 400,
        code: "PRODUCT_INACTIVE",
      });
    }

    // 2. Validate Deposito (if provided)
    if (params.depositoId) {
      const deposito = await DepositoRepository.findById(params.depositoId, tx);
      if (!deposito) {
        throw new AppError({
          message: "El depósito especificado no existe",
          statusCode: 400,
          code: "DEPOSIT_NOT_FOUND",
        });
      }
      if (!deposito.activo) {
        throw new AppError({
          message: `El depósito '${deposito.nombre}' está inactivo`,
          statusCode: 400,
          code: "DEPOSIT_INACTIVE",
        });
      }
    }

    // 3. Validate Taller (if provided)
    if (params.tallerId) {
      const taller = await TallerRepository.findById(params.tallerId, tx);
      if (!taller) {
        throw new AppError({
          message: "El taller especificado no existe",
          statusCode: 400,
          code: "TALLER_NOT_FOUND",
        });
      }
      if (!taller.activo) {
        throw new AppError({
          message: `El taller '${taller.nombre}' está inactivo`,
          statusCode: 400,
          code: "TALLER_INACTIVE",
        });
      }
    }
  },

  /**
   * Helper to assert location rules: either depositoId or tallerId must be present, but not both.
   */
  assertLocation(depositoId: string | null, tallerId: string | null) {
    if (!depositoId && !tallerId) {
      throw new AppError({
        message: "Debe proveer obligatoriamente un depósito o un taller",
        statusCode: 400,
        code: "LOCATION_REQUIRED",
      });
    }
    if (depositoId && tallerId) {
      throw new AppError({
        message: "No se puede registrar stock en un depósito y taller simultáneamente",
        statusCode: 400,
        code: "INVALID_LOCATION_COMBO",
      });
    }
  },

  /**
   * Increases the stock units for a specific location.
   */
  async incrementStock(params: StockParams & { cantidadUnidades: number }, tx?: any) {
    this.assertLocation(params.depositoId, params.tallerId);
    if (params.cantidadUnidades <= 0) {
      throw new AppError({
        message: "La cantidad a incrementar debe ser mayor a cero",
        statusCode: 400,
        code: "INVALID_QUANTITY",
      });
    }

    await this.validateEntities(params, tx);

    const existingStock = await StockRepository.findStock(params, tx);
    const newQty = (existingStock?.cantidadUnidades || 0) + params.cantidadUnidades;

    const updated = await StockRepository.upsertStock(
      {
        ...params,
        cantidadUnidades: newQty,
      },
      tx
    );

    metricsRegistry.incrementCounter("stock_updates_total");

    // Emit asynchronous stock updated domain event
    eventBus.emitSafe(DOMAIN_EVENTS.STOCK_UPDATED, {
      productoId: params.productoId,
      depositoId: params.depositoId,
      tallerId: params.tallerId,
      previousQty: existingStock?.cantidadUnidades || 0,
      newQty,
    });

    return updated;
  },

  /**
   * Decreases the stock units for a specific location. Prevents negative stock.
   */
  async decrementStock(params: StockParams & { cantidadUnidades: number }, tx?: any) {
    this.assertLocation(params.depositoId, params.tallerId);
    if (params.cantidadUnidades <= 0) {
      throw new AppError({
        message: "La cantidad a descontar debe ser mayor a cero",
        statusCode: 400,
        code: "INVALID_QUANTITY",
      });
    }

    await this.validateEntities(params, tx);

    const existingStock = await StockRepository.findStock(params, tx);
    const currentQty = existingStock?.cantidadUnidades || 0;

    if (!params.tallerId && currentQty < params.cantidadUnidades) {
      throw new AppError({
        message: "Stock insuficiente para realizar esta operación",
        statusCode: 400,
        code: "INSUFFICIENT_STOCK",
        details: {
          requested: params.cantidadUnidades,
          available: currentQty,
          params: {
            productoId: params.productoId,
            depositoId: params.depositoId,
            tallerId: params.tallerId,
            calidad: params.calidad,
            presentacion: params.presentacion,
            canal: params.canal,
          },
        },
      });
    }

    const newQty = currentQty - params.cantidadUnidades;

    const updated = await StockRepository.upsertStock(
      {
        ...params,
        cantidadUnidades: newQty,
      },
      tx
    );

    metricsRegistry.incrementCounter("stock_updates_total");

    // Emit asynchronous stock updated domain event
    eventBus.emitSafe(DOMAIN_EVENTS.STOCK_UPDATED, {
      productoId: params.productoId,
      depositoId: params.depositoId,
      tallerId: params.tallerId,
      previousQty: currentQty,
      newQty,
    });

    return updated;
  },

  /**
   * Performs a stock transfer (decrements origin, increments destination) in a single transaction context.
   */
  async transferStock(
    params: {
      productoId: string;
      cantidadUnidades: number;
      calidad: CalidadProducto;
      presentacion: PresentacionProducto;
      canal: CanalStock;
      depositoOrigenId: string | null;
      tallerOrigenId: string | null;
      depositoDestinoId: string | null;
      tallerDestinoId: string | null;
    },
    tx?: any
  ) {
    // 1. Decrement origin
    await this.decrementStock(
      {
        productoId: params.productoId,
        depositoId: params.depositoOrigenId,
        tallerId: params.tallerOrigenId,
        calidad: params.calidad,
        presentacion: params.presentacion,
        canal: params.canal,
        cantidadUnidades: params.cantidadUnidades,
      },
      tx
    );

    // 2. Increment destination
    await this.incrementStock(
      {
        productoId: params.productoId,
        depositoId: params.depositoDestinoId,
        tallerId: params.tallerDestinoId,
        calidad: params.calidad,
        presentacion: params.presentacion,
        canal: params.canal,
        cantidadUnidades: params.cantidadUnidades,
      },
      tx
    );
  },

  /**
   * Validates if a user has sufficient stock for a proposed operation.
   */
  async validateStock(params: StockParams & { cantidadUnidades: number }, tx?: any) {
    this.assertLocation(params.depositoId, params.tallerId);
    if (params.tallerId) return; // Bypass for workshops
    const existingStock = await StockRepository.findStock(params, tx);
    const available = existingStock?.cantidadUnidades || 0;

    if (available < params.cantidadUnidades) {
      throw new AppError({
        message: "Stock insuficiente para realizar la operación",
        statusCode: 400,
        code: "INSUFFICIENT_STOCK",
        details: { requested: params.cantidadUnidades, available },
      });
    }
  },

  /**
   * Query details.
   */
  async getStock(params: StockParams) {
    this.assertLocation(params.depositoId, params.tallerId);
    return StockRepository.findStock(params);
  },

  async getStockByDeposito(depositoId: string) {
    return StockRepository.getStockByDeposito(depositoId);
  },

  async getStockByProducto(productoId: string) {
    return StockRepository.getStockByProducto(productoId);
  },

  /**
   * List consolidated stocks matching filter params with pagination, search, and compact mode.
   */
  async listAllStock(query: any, user?: any) {
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || 50;
    const search = (query.search as string) || undefined;
    const compact = query.compact === "true";
    const productoId = (query.productoId as string) || undefined;
    const calidad = (query.calidad as CalidadProducto) || undefined;
    const presentacion = (query.presentacion as PresentacionProducto) || undefined;
    const canal = (query.canal as CanalStock) || undefined;

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

    return StockRepository.getStockPaginated({
      page,
      limit,
      search,
      productoId,
      depositoId,
      tallerId,
      calidad,
      presentacion,
      canal,
      compact,
    });
  },
};
