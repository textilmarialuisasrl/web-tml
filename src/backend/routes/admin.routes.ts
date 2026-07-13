import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth.middleware";
import { AppError } from "../utils/errors";
import bcrypt from "bcrypt";

const router = Router();
router.use(requireAuth);

// Middleware to check if user is Admin (Ariel, Leo, or ADMIN_SISTEMA permission)
const requireAdmin = (req: any, res: any, next: any) => {
  const user = req.user;
  const isAdmin = user.permisos.includes("ADMIN_SISTEMA") || user.nombre === "Ariel" || user.nombre === "Leo";
  if (isAdmin) {
    return next();
  }
  next(new AppError({ message: "Acceso denegado: se requieren permisos de Administrador", statusCode: 403, code: "FORBIDDEN" }));
};

// Middleware to check if user is Admin OR Supervisor (for products only)
const requireAdminOrSupervisor = (req: any, res: any, next: any) => {
  const user = req.user;
  const isAdmin = user.permisos.includes("ADMIN_SISTEMA") || user.nombre === "Ariel" || user.nombre === "Leo";
  const isSupervisor = user.permisos.includes("MOVIMIENTOS_CREAR") && user.permisos.includes("MOVIMIENTOS_VER");
  if (isAdmin || isSupervisor) {
    return next();
  }
  next(new AppError({ message: "Acceso denegado: se requieren permisos de Supervisor o Administrador", statusCode: 403, code: "FORBIDDEN" }));
};

const successResponse = (res: any, data: any, statusCode = 200) => {
  res.status(statusCode).json({ success: true, data });
};

async function generateProductCodigo(tipoProducto: string): Promise<string> {
  const prefix = tipoProducto === "BASE" ? "PB" :
                 tipoProducto === "COMERCIAL" ? "PF" :
                 tipoProducto === "FALLADO" ? "FL" :
                 tipoProducto === "INSUMO" ? "INS" : "RET";
                 
  const lastProduct = await prisma.producto.findFirst({
    where: { codigo: { startsWith: prefix } },
    orderBy: { codigo: "desc" }
  });
  
  let nextNum = 1;
  if (lastProduct) {
    const match = lastProduct.codigo.match(/\d+/);
    if (match) {
      nextNum = parseInt(match[0], 10) + 1;
    }
  }
  
  return `${prefix}${String(nextNum).padStart(3, "0")}`;
}

// ==========================================
// 1. PRODUCTOS (Admins & Supervisors)
// ==========================================
router.get("/productos", requireAdminOrSupervisor, async (req, res, next) => {
  try {
    const prods = await prisma.producto.findMany({
      where: { deletedAt: null },
      orderBy: { nombre: "asc" }
    });
    successResponse(res, prods);
  } catch (err) {
    next(err);
  }
});

router.post("/productos", requireAdminOrSupervisor, async (req, res, next) => {
  try {
    const { nombre, descripcion, medida, color, unidadesPorFardo, categoria, stockMinimo } = req.body;
    if (!nombre || !categoria || unidadesPorFardo === undefined) {
      return next(new AppError({ message: "Nombre, categoría y unidades por fardo requeridos", statusCode: 400, code: "BAD_REQUEST" }));
    }

    const tipoProducto = (categoria === "TERMINADO" ? "COMERCIAL" : (categoria === "INTERMEDIO" || categoria === "TELA" ? "BASE" : categoria)) as any;
    const codigo = await generateProductCodigo(tipoProducto);

    const prod = await prisma.producto.create({
      data: {
        codigo,
        nombre,
        descripcion: descripcion || null,
        medida: medida || null,
        color: color || null,
        unidadesPorFardo: parseInt(unidadesPorFardo, 10),
        tipoProducto,
        stockMinimo: stockMinimo !== undefined ? parseInt(stockMinimo, 10) : 0,
        permiteUnidad: true,
        activo: true
      }
    });
    successResponse(res, prod, 201);
  } catch (err) {
    next(err);
  }
});

router.put("/productos/:id", requireAdminOrSupervisor, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, medida, color, unidadesPorFardo, categoria, activo, stockMinimo } = req.body;

    const tipoProducto = categoria ? (categoria === "TERMINADO" ? "COMERCIAL" : (categoria === "INTERMEDIO" || categoria === "TELA" ? "BASE" : categoria)) : undefined;

    const prod = await prisma.producto.update({
      where: { id },
      data: {
        nombre,
        descripcion: descripcion !== undefined ? descripcion : undefined,
        medida: medida !== undefined ? medida : undefined,
        color: color !== undefined ? color : undefined,
        unidadesPorFardo: unidadesPorFardo !== undefined ? parseInt(unidadesPorFardo, 10) : undefined,
        tipoProducto: tipoProducto as any,
        stockMinimo: stockMinimo !== undefined ? parseInt(stockMinimo, 10) : undefined,
        activo: activo !== undefined ? !!activo : undefined
      }
    });
    successResponse(res, prod);
  } catch (err) {
    next(err);
  }
});

router.delete("/productos/:id", requireAdminOrSupervisor, async (req, res, next) => {
  try {
    const { id } = req.params;
    const prod = await prisma.producto.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false }
    });
    successResponse(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});


// ==========================================
// 2. USUARIOS & ROLES (Admin Only)
// ==========================================
router.get("/usuarios", requireAdmin, async (req, res, next) => {
  try {
    const users = await prisma.usuario.findMany({
      where: { deletedAt: null },
      include: {
        permisos: {
          include: { permiso: true }
        }
      },
      orderBy: { nombre: "asc" }
    });
    successResponse(res, users);
  } catch (err) {
    next(err);
  }
});

router.post("/usuarios", requireAdmin, async (req, res, next) => {
  try {
    const { nombre, email, password, permisos } = req.body; // permisos is an array of permission keys
    if (!nombre || !email || !password) {
      return next(new AppError({ message: "Faltan datos requeridos (nombre, email, contraseña)", statusCode: 400, code: "BAD_REQUEST" }));
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = await prisma.usuario.create({
      data: {
        nombre,
        email,
        passwordHash,
        activo: true
      }
    });

    if (permisos && Array.isArray(permisos)) {
      for (const key of permisos) {
        const dbPerm = await prisma.permiso.findUnique({ where: { clave: key } });
        if (dbPerm) {
          await prisma.usuarioPermiso.create({
            data: { usuarioId: user.id, permisoId: dbPerm.id }
          });
        }
      }
    }

    successResponse(res, user, 201);
  } catch (err) {
    next(err);
  }
});

router.put("/usuarios/:id", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nombre, email, password, permisos, activo } = req.body;

    const data: any = {};
    if (nombre) data.nombre = nombre;
    if (email) data.email = email;
    if (activo !== undefined) data.activo = !!activo;
    if (password) {
      const saltRounds = 10;
      data.passwordHash = await bcrypt.hash(password, saltRounds);
    }

    const user = await prisma.usuario.update({
      where: { id },
      data
    });

    if (permisos && Array.isArray(permisos)) {
      // Re-assign permissions
      await prisma.usuarioPermiso.deleteMany({ where: { usuarioId: id } });
      for (const key of permisos) {
        const dbPerm = await prisma.permiso.findUnique({ where: { clave: key } });
        if (dbPerm) {
          await prisma.usuarioPermiso.create({
            data: { usuarioId: id, permisoId: dbPerm.id }
          });
        }
      }
    }

    successResponse(res, user);
  } catch (err) {
    next(err);
  }
});

router.delete("/usuarios/:id", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.usuario.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false }
    });
    successResponse(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});


// ==========================================
// 3. TALLERES (Admin Only)
// ==========================================
router.get("/talleres", requireAdmin, async (req, res, next) => {
  try {
    const ts = await prisma.taller.findMany({
      where: { deletedAt: null },
      orderBy: { nombre: "asc" }
    });
    successResponse(res, ts);
  } catch (err) {
    next(err);
  }
});

router.post("/talleres", requireAdmin, async (req, res, next) => {
  try {
    const { nombre, observaciones, precioTrapoFardo, precioRejillaFardo } = req.body;
    if (!nombre) {
      return next(new AppError({ message: "Nombre del taller requerido", statusCode: 400, code: "BAD_REQUEST" }));
    }

    const t = await prisma.taller.create({
      data: {
        nombre,
        observaciones: observaciones || null,
        activo: true
      }
    });

    const pTrapo = precioTrapoFardo !== undefined ? parseFloat(precioTrapoFardo) : 0;
    const pRejilla = precioRejillaFardo !== undefined ? parseFloat(precioRejillaFardo) : 0;

    await prisma.tallerTarifa.create({
      data: { tallerId: t.id, tipoTrabajo: "TRAPOS", precioFardo: pTrapo }
    });
    await prisma.tallerTarifa.create({
      data: { tallerId: t.id, tipoTrabajo: "REJILLAS", precioFardo: pRejilla }
    });

    successResponse(res, {
      ...t,
      precioTrapoFardo: pTrapo,
      precioRejillaFardo: pRejilla
    }, 201);
  } catch (err) {
    next(err);
  }
});

router.put("/talleres/:id", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nombre, observaciones, precioTrapoFardo, precioRejillaFardo, activo } = req.body;

    const t = await prisma.taller.update({
      where: { id },
      data: {
        nombre,
        observaciones: observaciones !== undefined ? observaciones : undefined,
        activo: activo !== undefined ? !!activo : undefined
      }
    });

    if (precioTrapoFardo !== undefined) {
      await prisma.tallerTarifa.upsert({
        where: { tallerId_tipoTrabajo: { tallerId: id, tipoTrabajo: "TRAPOS" } },
        create: { tallerId: id, tipoTrabajo: "TRAPOS", precioFardo: parseFloat(precioTrapoFardo) },
        update: { precioFardo: parseFloat(precioTrapoFardo) }
      });
    }

    if (precioRejillaFardo !== undefined) {
      await prisma.tallerTarifa.upsert({
        where: { tallerId_tipoTrabajo: { tallerId: id, tipoTrabajo: "REJILLAS" } },
        create: { tallerId: id, tipoTrabajo: "REJILLAS", precioFardo: parseFloat(precioRejillaFardo) },
        update: { precioFardo: parseFloat(precioRejillaFardo) }
      });
    }

    const tarifas = await prisma.tallerTarifa.findMany({ where: { tallerId: id } });
    const rateTrapo = tarifas.find(r => r.tipoTrabajo === "TRAPOS")?.precioFardo || 0;
    const rateRejilla = tarifas.find(r => r.tipoTrabajo === "REJILLAS")?.precioFardo || 0;

    successResponse(res, {
      ...t,
      precioTrapoFardo: rateTrapo,
      precioRejillaFardo: rateRejilla
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/talleres/:id", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.taller.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false }
    });
    successResponse(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});


// ==========================================
// 4. DEPÓSITOS (Admin Only)
// ==========================================
router.get("/depositos", requireAdmin, async (req, res, next) => {
  try {
    const deps = await prisma.deposito.findMany({
      where: { deletedAt: null },
      orderBy: { nombre: "asc" }
    });
    successResponse(res, deps);
  } catch (err) {
    next(err);
  }
});

router.post("/depositos", requireAdmin, async (req, res, next) => {
  try {
    const { nombre, descripcion, tipo } = req.body;
    if (!nombre || !tipo) {
      return next(new AppError({ message: "Nombre y tipo de depósito requeridos", statusCode: 400, code: "BAD_REQUEST" }));
    }

    const tipoDepositoMap = (t: string) => {
      if (t === "CORTE" || t === "PRODUCCION") return "PRODUCCION";
      if (t === "TALLER") return "TALLER";
      return "STOCK";
    };

    const dep = await prisma.deposito.create({
      data: {
        nombre,
        descripcion: descripcion || null,
        tipo: tipoDepositoMap(tipo) as any,
        activo: true
      }
    });
    successResponse(res, dep, 201);
  } catch (err) {
    next(err);
  }
});

router.put("/depositos/:id", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, tipo, activo } = req.body;

    const tipoDepositoMap = (t: string) => {
      if (t === "CORTE" || t === "PRODUCCION") return "PRODUCCION";
      if (t === "TALLER") return "TALLER";
      return "STOCK";
    };

    const dep = await prisma.deposito.update({
      where: { id },
      data: {
        nombre,
        descripcion: descripcion !== undefined ? descripcion : undefined,
        tipo: tipo ? (tipoDepositoMap(tipo) as any) : undefined,
        activo: activo !== undefined ? !!activo : undefined
      }
    });
    successResponse(res, dep);
  } catch (err) {
    next(err);
  }
});

router.delete("/depositos/:id", requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.deposito.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false }
    });
    successResponse(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 5. PERMISOS (Read-only)
// ==========================================
router.get("/permisos", requireAdmin, async (req, res, next) => {
  try {
    const perms = await prisma.permiso.findMany({
      orderBy: { clave: "asc" }
    });
    successResponse(res, perms);
  } catch (err) {
    next(err);
  }
});

export default router;
