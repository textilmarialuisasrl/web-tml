import { Router } from "express";
import authRoutes from "./auth.routes";
import movementRoutes from "./movement.routes";
import systemRoutes from "./system.routes";
import tallerFinanzasRoutes from "./taller-finanzas.routes";
import adminRoutes from "./admin.routes";
import catalogRoutes from "./catalog.routes";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/authorization.middleware";

const router = Router();

// Mount modules
router.use("/auth", authRoutes);
router.use("/system", systemRoutes);
router.use("/talleres", tallerFinanzasRoutes);
router.use("/admin", adminRoutes);
router.use("/", catalogRoutes);
router.use("/", movementRoutes); // Mounted at / so that subpaths match /movements, /movimientos, /stocks, /stock, /dashboard, etc.

if (process.env.NODE_ENV !== "production") {
  router.get(
    "/test/stock-edit",
    requireAuth,
    requirePermission("STOCK_EDITAR"),
    (req, res) => {
      res.status(200).json({
        success: true,
        data: {
          message: "¡Acceso concedido! Posee el permiso dinámico STOCK_EDITAR",
          user: req.user,
        },
      });
    }
  );
}

export default router;
