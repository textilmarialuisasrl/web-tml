import { Router } from "express";
import { CatalogController } from "../controllers/catalog.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

// Require authentication for catalog sync
router.use(requireAuth);

router.get("/productos", CatalogController.getProductos);
router.get("/depositos", CatalogController.getDepositos);
router.get("/talleres", CatalogController.getTalleres);
router.get("/usuarios", CatalogController.getUsuarios);
router.get("/familias", CatalogController.getFamilias);

export default router;
