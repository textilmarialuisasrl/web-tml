import { prisma } from "../db/prisma";
import { ConfigService } from "./config.service";
import { eventBus, DOMAIN_EVENTS } from "../events/domain.events";

// In-memory throttle map: key -> timestamp (ms)
const THROTTLE_MAP = new Map<string, number>();
const THROTTLE_MS = 15 * 60 * 1000; // 15 minutes

export const StockAlertService = {
  /**
   * Evaluates if a stock level requires generating or updating a low stock alert.
   * Leverages 15-minute throttle and deduplicates DB rows.
   */
  async checkStock(
    productoId: string,
    depositoId: string | null,
    tallerId: string | null,
    currentQuantity: number
  ): Promise<void> {
    const limit = await ConfigService.getNumber("STOCK_MINIMO_ALERTA", 15);

    if (currentQuantity < limit) {
      const throttleKey = `${productoId}_${depositoId || "null"}_${tallerId || "null"}`;
      const now = Date.now();
      const lastFired = THROTTLE_MAP.get(throttleKey);

      if (lastFired && now - lastFired < THROTTLE_MS) {
        // Skip DB update/alert emission during throttle window
        return;
      }

      // Check if there is an active alert for this product and location
      const existingAlert = await prisma.alertaStock.findFirst({
        where: {
          productoId,
          depositoId,
          tallerId,
          activa: true,
        },
      });

      if (existingAlert) {
        // Update the quantity on the active alert instead of creating a new row
        await prisma.alertaStock.update({
          where: { id: existingAlert.id },
          data: {
            cantidadActual: currentQuantity,
            createdAt: new Date(),
          },
        });
      } else {
        // Create new alert row
        await prisma.alertaStock.create({
          data: {
            productoId,
            depositoId,
            tallerId,
            cantidadActual: currentQuantity,
            limiteMinimo: limit,
            activa: true,
          },
        });

        // Emit domain event
        eventBus.emit(DOMAIN_EVENTS.LOW_STOCK_DETECTED, {
          productoId,
          depositoId,
          tallerId,
          cantidadActual: currentQuantity,
          limiteMinimo: limit,
        });
      }

      // Update throttle timestamp
      THROTTLE_MAP.set(throttleKey, now);
    } else {
      // Resolve existing alert automatically if stock goes back up
      await prisma.alertaStock.updateMany({
        where: {
          productoId,
          depositoId,
          tallerId,
          activa: true,
        },
        data: {
          activa: false,
          resueltaAt: new Date(),
        },
      });
    }
  },

  /**
   * Resolves a specific alert manually
   */
  async resolveAlert(alertId: string, usuarioId: string): Promise<void> {
    await prisma.alertaStock.update({
      where: { id: alertId },
      data: {
        activa: false,
        resueltaAt: new Date(),
        resueltaPorId: usuarioId,
      },
    });
  },

  /**
   * Clears the throttle cache (useful for tests)
   */
  clearThrottleCache(): void {
    THROTTLE_MAP.clear();
  },
};

// Bind to Stock Service updates automatically
eventBus.on(DOMAIN_EVENTS.STOCK_UPDATED, async (data: {
  productoId: string;
  depositoId: string | null;
  tallerId: string | null;
  previousQty: number;
  newQty: number;
}) => {
  try {
    await StockAlertService.checkStock(
      data.productoId,
      data.depositoId,
      data.tallerId,
      data.newQty
    );
  } catch (err) {
    console.error("[StockAlertService] Error during auto-checkStock event handler:", err);
  }
});
