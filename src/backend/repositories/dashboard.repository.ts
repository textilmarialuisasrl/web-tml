import { prisma } from "../db/prisma";

export const DashboardRepository = {
  async getMetricsSummary() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Run queries in parallel for high performance
    const [
      stockTotalAgg,
      stockFalladoAgg,
      stockMinoristaAgg,
      stockTalleresAgg,
      movimientosDiaCount,
      ultimasEntregas,
      ultimasDevoluciones,
    ] = await Promise.all([
      // 1. Stock Total in active PRODUCCION / STOCK warehouses
      prisma.stockActual.aggregate({
        where: {
          deletedAt: null,
          deposito: {
            tipo: { in: ["PRODUCCION", "STOCK"] },
          },
        },
        _sum: { cantidadUnidades: true },
      }),

      // 2. Stock Fallado
      prisma.stockActual.aggregate({
        where: {
          deletedAt: null,
          calidad: "FALLADO",
        },
        _sum: { cantidadUnidades: true },
      }),

      // 3. Stock Minorista
      prisma.stockActual.aggregate({
        where: {
          deletedAt: null,
          canal: "MINORISTA",
        },
        _sum: { cantidadUnidades: true },
      }),

      // 4. Stock in external workshops
      prisma.stockActual.aggregate({
        where: {
          deletedAt: null,
          tallerId: { not: null },
        },
        _sum: { cantidadUnidades: true },
      }),

      // 5. Total movements count for the current day
      prisma.movimiento.count({
        where: {
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      }),

      // 6. Last 5 workshop deliveries
      prisma.movimiento.findMany({
        where: {
          tipo: "ENTREGA_TALLER",
        },
        orderBy: {
          numeroSecuencial: "desc",
        },
        take: 5,
        select: {
          id: true,
          numeroSecuencial: true,
          tipo: true,
          createdAt: true,
          observaciones: true,
          usuarioNombreSnapshot: true,
          taller: { select: { nombre: true } },
        },
      }),

      // 7. Last 5 workshop returns
      prisma.movimiento.findMany({
        where: {
          tipo: "DEVOLUCION_TALLER",
        },
        orderBy: {
          numeroSecuencial: "desc",
        },
        take: 5,
        select: {
          id: true,
          numeroSecuencial: true,
          tipo: true,
          createdAt: true,
          observaciones: true,
          usuarioNombreSnapshot: true,
          taller: { select: { nombre: true } },
        },
      }),
    ]);

    return {
      stockTotal: stockTotalAgg._sum.cantidadUnidades || 0,
      stockFallado: stockFalladoAgg._sum.cantidadUnidades || 0,
      stockMinorista: stockMinoristaAgg._sum.cantidadUnidades || 0,
      stockTalleres: stockTalleresAgg._sum.cantidadUnidades || 0,
      movimientosDelDia: movimientosDiaCount,
      ultimasEntregas,
      ultimasDevoluciones,
    };
  },
};
