import { prisma } from "../db/prisma";
import { CalidadProducto, CanalStock } from "../../generated/prisma/client";

export interface StockFilter {
  productoId?: string;
  depositoId?: string;
  tallerId?: string;
  calidad?: CalidadProducto;
  canal?: CanalStock;
}

export const StockRepository = {
  /**
   * Find a specific stock consolidation record.
   * Can accept a transaction client to participate in an active transaction.
   */
  async findStock(
    params: {
      productoId: string;
      depositoId: string | null;
      tallerId: string | null;
      calidad: CalidadProducto;
      canal: CanalStock;
    },
    tx?: any
  ) {
    const client = tx || prisma;
    return client.stockActual.findFirst({
      where: {
        productoId: params.productoId,
        depositoId: params.depositoId,
        tallerId: params.tallerId,
        calidad: params.calidad,
        canal: params.canal,
      },
    });
  },

  /**
   * Upsert a stock consolidation record using manual check-then-update logic.
   * Leverages optimistic locking (version increment) and soft delete on zero stock.
   */
  async upsertStock(
    params: {
      productoId: string;
      depositoId: string | null;
      tallerId: string | null;
      calidad: CalidadProducto;
      canal: CanalStock;
      cantidadUnidades: number;
    },
    tx?: any
  ) {
    const client = tx || prisma;
    const existing = await this.findStock(params, client);

    const isZero = params.cantidadUnidades === 0;

    if (existing) {
      return client.stockActual.update({
        where: { 
          id: existing.id,
          version: existing.version, // optimistic locking check
        },
        data: {
          cantidadUnidades: params.cantidadUnidades,
          version: { increment: 1 },
          deletedAt: isZero ? new Date() : null, // cleanup on zero, restore on increment
        },
      });
    } else {
      return client.stockActual.create({
        data: {
          productoId: params.productoId,
          depositoId: params.depositoId,
          tallerId: params.tallerId,
          calidad: params.calidad,
          canal: params.canal,
          cantidadUnidades: params.cantidadUnidades,
          version: 1,
          deletedAt: isZero ? new Date() : null,
        },
      });
    }
  },

  /**
   * List consolidated stocks matching filter params with pagination, search, and compact mode.
   */
  async getStockPaginated(params: {
    page: number;
    limit: number;
    search?: string;
    productoId?: string;
    depositoId?: string;
    tallerId?: string;
    calidad?: CalidadProducto;
    canal?: CanalStock;
    compact?: boolean;
  }) {
    const skip = (params.page - 1) * params.limit;
    
    const whereConditions: any = {
      deletedAt: null, // exclude zero-stock or soft deleted items
    };

    if (params.productoId) whereConditions.productoId = params.productoId;
    if (params.depositoId) whereConditions.depositoId = params.depositoId;
    if (params.tallerId) whereConditions.tallerId = params.tallerId;
    if (params.calidad) whereConditions.calidad = params.calidad;
    if (params.canal) whereConditions.canal = params.canal;

    if (params.search) {
      whereConditions.producto = {
        nombre: {
          contains: params.search,
          mode: "insensitive",
        },
      };
    }

    const selectFields = params.compact
      ? {
          id: true,
          productoId: true,
          depositoId: true,
          tallerId: true,
          calidad: true,
          canal: true,
          cantidadUnidades: true,
          version: true,
        }
      : {
          id: true,
          productoId: true,
          depositoId: true,
          tallerId: true,
          calidad: true,
          canal: true,
          cantidadUnidades: true,
          version: true,
          producto: {
            select: {
              id: true,
              nombre: true,
              tipoProducto: true,
              unidadesPorFardo: true,
            },
          },
          deposito: {
            select: {
              id: true,
              nombre: true,
              tipo: true,
            },
          },
          taller: {
            select: {
              id: true,
              nombre: true,
            },
          },
        };

    const [items, total] = await Promise.all([
      prisma.stockActual.findMany({
        where: whereConditions,
        select: selectFields as any,
        skip,
        take: params.limit,
        orderBy: {
          producto: { nombre: "asc" },
        },
      }),
      prisma.stockActual.count({
        where: whereConditions,
      }),
    ]);

    const mappedItems = items.map((item: any) => {
      if (item.producto) {
        return {
          ...item,
          producto: {
            ...item.producto,
            categoria: item.producto.tipoProducto
          }
        };
      }
      return item;
    });

    return { items: mappedItems, total };
  },

  /**
   * List consolidate stocks by specific product.
   */
  async getStockByProducto(productoId: string) {
    const stocks = await prisma.stockActual.findMany({
      where: {
        productoId,
        deletedAt: null,
      },
      include: {
        producto: true,
        deposito: true,
        taller: true,
      },
    });
    return stocks.map((item: any) => {
      if (item.producto) {
        return {
          ...item,
          producto: {
            ...item.producto,
            categoria: item.producto.tipoProducto
          }
        };
      }
      return item;
    });
  },
};
