import { Router } from "express";
import { MovementController } from "../controllers/movement.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/authorization.middleware";
import { validate } from "../middleware/validation.middleware";
import {
  createMovimientoSchema,
  createEntregaTallerSchema,
  createDevolucionTallerSchema,
  etiquetadoSchema,
  createReconversionSchema,
} from "../validators/movement.validator";

const router = Router();

// Apply auth check universally to all movement routes
router.use(requireAuth);

// ==========================================
// 1. Spanish Routes (Native)
// ==========================================
router.post(
  "/movimientos",
  requirePermission("MOVIMIENTOS_CREAR"),
  validate(createMovimientoSchema),
  MovementController.createMovimiento
);

router.post(
  "/movimientos/entrega-taller",
  requirePermission("MOVIMIENTOS_CREAR"),
  validate(createEntregaTallerSchema),
  MovementController.createEntregaTaller
);

router.post(
  "/movimientos/devolucion-taller",
  requirePermission("MOVIMIENTOS_CREAR"),
  validate(createDevolucionTallerSchema),
  MovementController.createDevolucionTaller
);

router.post(
  "/movimientos/etiquetado",
  requirePermission("MOVIMIENTOS_CREAR"),
  validate(etiquetadoSchema),
  MovementController.createEtiquetado
);

router.post(
  "/movimientos/reconversion",
  requirePermission("MOVIMIENTOS_CREAR"),
  validate(createReconversionSchema),
  MovementController.createReconversion
);

router.get(
  "/movimientos",
  requirePermission("MOVIMIENTOS_VER"),
  MovementController.listMovements
);

router.get(
  "/movimientos/export/csv",
  requirePermission("MOVIMIENTOS_VER"),
  MovementController.exportMovementsCsv
);

router.get(
  "/movimientos/:id",
  requirePermission("MOVIMIENTOS_VER"),
  MovementController.getMovement
);

router.post(
  "/sync/movimientos",
  requirePermission("MOVIMIENTOS_CREAR"),
  MovementController.syncMovements
);

router.get(
  "/sync/metrics",
  requirePermission("ADMIN_SISTEMA"),
  MovementController.getSyncMetrics
);

router.get(
  "/stock",
  requirePermission("STOCK_VER"),
  MovementController.listStocks
);

router.get(
  "/stock/producto/:id",
  requirePermission("STOCK_VER"),
  MovementController.getStockByProducto
);

router.get(
  "/stock/deposito/:id",
  requirePermission("STOCK_VER"),
  MovementController.getStockByDeposito
);

router.get(
  "/dashboard/resumen",
  requirePermission("STOCK_VER"),
  MovementController.getDashboardSummary
);

// ==========================================
// 2. Document Streaming (PDF)
// ==========================================
router.get(
  "/documents/movement/:id/pdf",
  requirePermission("MOVIMIENTOS_VER"),
  MovementController.generateMovementPdf
);

export default router;
