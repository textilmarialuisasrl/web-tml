import { prisma } from "../db/prisma";
import { TipoMovimiento, CalidadProducto, PresentacionProducto, CanalStock, DireccionItem, EstadoMovimiento, SyncStatus } from "../../generated/prisma/client";

export interface MovementFilter {
  tipo?: TipoMovimiento;
  productoId?: string;
  depositoId?: string;
  tallerId?: string;
  usuarioId?: string;
  fecha?: string; // YYYY-MM-DD
}

export const MovementRepository = {
  /**
   * Creates a Movimiento along with its items and insumos.
   */
  async createMovimiento(
    data: {
      tipo: TipoMovimiento;
      usuarioId: string;
      usuarioNombreSnapshot: string;
      tallerId?: string | null;
      observaciones?: string | null;
      requestId?: string | null;
      deviceId?: string;
      syncStatus?: SyncStatus;
      clientGeneratedId?: string | null;
      payloadHash?: string | null;
      schemaVersion?: number;
      syncErrorMessage?: string | null;
      syncResolvedAt?: Date | null;
      lastSyncedAt?: Date | null;
      syncBatchId?: string | null;
      offlineCreatedAt?: Date | null;
      items: {
        productoId: string;
        productoNombreSnapshot: string;
        cantidadUnidades: number;
        depositoOrigenId?: string | null;
        tallerOrigenId?: string | null;
        depositoDestinoId?: string | null;
        tallerDestinoId?: string | null;
        calidad: CalidadProducto;
        presentacion: PresentacionProducto;
        canal: CanalStock;
        direccion: DireccionItem;
        observaciones?: string | null;
      }[];
      insumos?: {
        descripcion: string;
        cantidad: number;
      }[];
    },
    tx?: any
  ) {
    const client = tx || prisma;

    console.log("=== DB PERSISTENCE DEBUG LOGS ===");
    console.log("usuarioId:", data.usuarioId);
    console.log("tallerId:", data.tallerId);
    console.log("items:", JSON.stringify(data.items, null, 2));

    const userExists = await client.usuario.findUnique({ where: { id: data.usuarioId } });
    console.log(`- Usuario (${data.usuarioId}) existe:`, !!userExists);

    if (data.tallerId) {
      const tallerExists = await client.taller.findUnique({ where: { id: data.tallerId } });
      console.log(`- Taller (${data.tallerId}) existe:`, !!tallerExists);
    }

    for (let idx = 0; idx < data.items.length; idx++) {
      const item = data.items[idx];
      console.log(`- Item [${idx}]:`);
      const prodExists = await client.producto.findUnique({ where: { id: item.productoId } });
      console.log(`  - Producto (${item.productoId}) existe:`, !!prodExists);

      if (item.depositoOrigenId) {
        const depOrigExists = await client.deposito.findUnique({ where: { id: item.depositoOrigenId } });
        console.log(`  - Deposito Origen (${item.depositoOrigenId}) existe:`, !!depOrigExists);
      }
      if (item.depositoDestinoId) {
        const depDestExists = await client.deposito.findUnique({ where: { id: item.depositoDestinoId } });
        console.log(`  - Deposito Destino (${item.depositoDestinoId}) existe:`, !!depDestExists);
      }
      if (item.tallerOrigenId) {
        const talOrigExists = await client.taller.findUnique({ where: { id: item.tallerOrigenId } });
        console.log(`  - Taller Origen (${item.tallerOrigenId}) existe:`, !!talOrigExists);
      }
      if (item.tallerDestinoId) {
        const talDestExists = await client.taller.findUnique({ where: { id: item.tallerDestinoId } });
        console.log(`  - Taller Destino (${item.tallerDestinoId}) existe:`, !!talDestExists);
      }
    }
    console.log("=================================");

    return client.movimiento.create({
      data: {
        tipo: data.tipo,
        usuarioId: data.usuarioId,
        usuarioNombreSnapshot: data.usuarioNombreSnapshot,
        tallerId: data.tallerId || null,
        observaciones: data.observaciones || null,
        requestId: data.requestId || null,
        deviceId: data.deviceId || "SYSTEM",
        syncStatus: data.syncStatus || "SYNCED",
        clientGeneratedId: data.clientGeneratedId || null,
        payloadHash: data.payloadHash || null,
        schemaVersion: data.schemaVersion || 1,
        syncErrorMessage: data.syncErrorMessage || null,
        syncResolvedAt: data.syncResolvedAt || null,
        lastSyncedAt: data.lastSyncedAt || null,
        syncBatchId: data.syncBatchId || null,
        offlineCreatedAt: data.offlineCreatedAt || null,
        items: {
          create: data.items.map((item) => ({
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
  },

  /**
   * Update status fields (e.g. for sync conflicts, failed states)
   */
  async updateSyncStatus(
    id: string,
    update: {
      syncStatus: SyncStatus;
      syncErrorMessage?: string | null;
      syncResolvedAt?: Date | null;
      lastSyncedAt?: Date | null;
    },
    tx?: any
  ) {
    const client = tx || prisma;
    return client.movimiento.update({
      where: { id },
      data: update,
    });
  },

  /**
   * Fetches a single Movimiento by ID with all details.
   */
  async findById(id: string) {
    return prisma.movimiento.findFirst({
      where: { id },
      include: {
        items: true,
        insumos: true,
        taller: true,
      },
    });
  },

  /**
   * Lists movements using cursor-based timeline pagination (stable, sequential index DESC).
   */
  async listTimeline(params: {
    cursor?: number; // numeroSecuencial
    limit: number;
    tipo?: TipoMovimiento;
    productoId?: string;
    depositoId?: string;
    tallerId?: string;
    usuarioId?: string;
    fecha?: string; // YYYY-MM-DD
  }) {
    const whereConditions: any = {};

    if (params.cursor) {
      whereConditions.numeroSecuencial = { lt: params.cursor };
    }

    if (params.tipo) {
      whereConditions.tipo = params.tipo;
    }

    if (params.usuarioId) {
      whereConditions.usuarioId = params.usuarioId;
    }

    if (params.tallerId) {
      whereConditions.tallerId = params.tallerId;
    }

    if (params.fecha) {
      const start = new Date(`${params.fecha}T00:00:00.000Z`);
      const end = new Date(`${params.fecha}T23:59:59.999Z`);
      whereConditions.createdAt = {
        gte: start,
        lte: end,
      };
    }

    if (params.productoId || params.depositoId) {
      whereConditions.items = {
        some: {},
      };
      if (params.productoId) {
        whereConditions.items.some.productoId = params.productoId;
      }
      if (params.depositoId) {
        whereConditions.items.some.OR = [
          { depositoOrigenId: params.depositoId },
          { depositoDestinoId: params.depositoId },
        ];
      }
    }

    return prisma.movimiento.findMany({
      where: whereConditions,
      include: {
        items: true,
        insumos: true,
        taller: true,
      },
      orderBy: {
        numeroSecuencial: "desc",
      },
      take: params.limit,
    });
  },
};
