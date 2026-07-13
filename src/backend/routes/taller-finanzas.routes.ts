import { Router } from "express";
import { TallerFinanzasController } from "../controllers/taller-finanzas.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

// Universal auth check
router.use(requireAuth);

// Rates (Tarifas)
router.get("/tarifas", TallerFinanzasController.getTarifas);
router.post("/tarifas", TallerFinanzasController.saveTarifa);

// Payments (Pagos)
router.get("/pagos", TallerFinanzasController.getPagos);
router.get("/calcular-pago", TallerFinanzasController.calcularPago);
router.post("/pagos", TallerFinanzasController.createPago);
router.delete("/pagos/:id", TallerFinanzasController.deletePago);
router.get("/pagos/:id/pdf", TallerFinanzasController.downloadPdf);

// Financial summary / Debts
router.get("/resumen-financiero", TallerFinanzasController.getResumenFinanciero);

export default router;
