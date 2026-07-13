import { prisma } from "../db/prisma";
import { AuditService } from "./audit.service";

export interface StockDriftDetail {
  productoId: string;
  depositoId: string | null;
  tallerId: string | null;
  calidad: string;
  presentacion: string;
  canal: string;
  expected: number;
  actual: number;
  drift: number;
}

export const DriftMonitorService = {
  /**
   * Scans the database to compare expected stock aggregates calculated from confirmed movements
   * against the actual stock cache (StockActual) and registers any drift.
   * NEVER alters or corrects the database.
   */
  async checkStockDrift(): Promise<{ hasDrift: boolean; drifts: StockDriftDetail[] }> {
    try {
      // 1. Fetch all confirmed movements and their items
      const movements = await prisma.movimiento.findMany({
        where: {
          estado: "CONFIRMADO",
        },
        include: {
          items: true,
        },
      });

      // 2. Aggregate expected stocks in memory
      const expectedMap: Record<string, number> = {};

      for (const mov of movements) {
        for (const item of mov.items) {
          // If there is an origin location, it's a reduction
          if (item.depositoOrigenId || item.tallerOrigenId) {
            const depId = item.depositoOrigenId || "";
            const talId = item.tallerOrigenId || "";
            const key = `${item.productoId}|${depId}|${talId}|${item.calidad}|${item.presentacion}|${item.canal}`;
            expectedMap[key] = (expectedMap[key] || 0) - item.cantidadUnidades;
          }

          // If there is a destination location, it's an addition
          if (item.depositoDestinoId || item.tallerDestinoId) {
            const depId = item.depositoDestinoId || "";
            const talId = item.tallerDestinoId || "";
            const key = `${item.productoId}|${depId}|${talId}|${item.calidad}|${item.presentacion}|${item.canal}`;
            expectedMap[key] = (expectedMap[key] || 0) + item.cantidadUnidades;
          }
        }
      }

      // 3. Fetch all active actual stocks
      const actualStocks = await prisma.stockActual.findMany({
        where: {
          deletedAt: null,
        },
      });

      const actualMap: Record<string, number> = {};
      for (const stock of actualStocks) {
        const depId = stock.depositoId || "";
        const talId = stock.tallerId || "";
        const key = `${stock.productoId}|${depId}|${talId}|${stock.calidad}|${stock.presentacion}|${stock.canal}`;
        actualMap[key] = stock.cantidadUnidades;
      }

      // 4. Compare maps
      const allKeys = new Set([...Object.keys(expectedMap), ...Object.keys(actualMap)]);
      const drifts: StockDriftDetail[] = [];

      for (const key of allKeys) {
        const expected = expectedMap[key] || 0;
        const actual = actualMap[key] || 0;

        if (expected !== actual) {
          const [productoId, depId, talId, calidad, presentacion, canal] = key.split("|");
          drifts.push({
            productoId,
            depositoId: depId || null,
            tallerId: talId || null,
            calidad,
            presentacion,
            canal,
            expected,
            actual,
            drift: actual - expected,
          });
        }
      }

      const hasDrift = drifts.length > 0;
      if (hasDrift) {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}][SYSTEM][CRITICAL] stock-drift-detected - Detected ${drifts.length} stock inconsistencies between movement history and stock cache!`);

        // Log drift details as background fire-and-forget audit event
        await AuditService.registerAuditEvent({
          accion: "STOCK_DRIFT_DETECTED",
          severity: "CRITICAL",
          category: "SYSTEM",
          metadata: {
            message: `Detected ${drifts.length} stock inconsistencies between movement history and stock cache`,
            totalInconsistencies: drifts.length,
            drifts,
          },
        });
      } else {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}][SYSTEM][INFO] stock-drift-check-passed - Stock integrity verified. Zero drift detected.`);
      }

      return { hasDrift, drifts };
    } catch (err: any) {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}][SYSTEM][ERROR] stock-drift-check-failed - Error executing stock drift monitoring: ${err.message}`, err.stack);
      return { hasDrift: false, drifts: [] };
    }
  },

  /**
   * Starts the periodic stock drift monitor background timer.
   * Runs as a low-priority process every 10 minutes.
   */
  startMonitor(intervalMs = 10 * 60 * 1000) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}][SYSTEM][INFO] stock-drift-monitor-started - Initializing low-priority stock drift background thread (Interval: ${intervalMs / 1000}s).`);
    
    // Execute immediately on start in background
    setTimeout(() => {
      this.checkStockDrift().catch(() => {});
    }, 5000);

    const timer = setInterval(() => {
      this.checkStockDrift().catch(() => {});
    }, intervalMs);

    // Return function to stop it if needed (useful for tests/cleanups)
    return () => {
      clearInterval(timer);
      const stopTimestamp = new Date().toISOString();
      console.log(`[${stopTimestamp}][SYSTEM][INFO] stock-drift-monitor-stopped - Stock drift background monitor stopped.`);
    };
  },
};
