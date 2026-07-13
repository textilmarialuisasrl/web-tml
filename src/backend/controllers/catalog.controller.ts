import { Request, Response } from "express";
import { prisma } from "../db/prisma";
import { catchAsync } from "../utils/errors";

const successResponse = (res: Response, data: any) => {
  res.status(200).json({
    success: true,
    data,
  });
};

export const CatalogController = {
  getProductos: catchAsync(async (req: Request, res: Response) => {
    const productos = await prisma.producto.findMany({
      where: {
        activo: true,
        deletedAt: null
      },
      include: {
        familia: true
      },
      orderBy: { nombre: "asc" }
    });
    successResponse(res, productos);
  }),

  getDepositos: catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;
    const depositos = await prisma.deposito.findMany({
      where: {
        activo: true,
        deletedAt: null
      },
      orderBy: { nombre: "asc" }
    });

    const isAdmin = user.permisos.includes("ADMIN_SISTEMA") || user.nombre === "Ariel" || user.nombre === "Leo";
    const allowedDepositos = user.allowedDepositos || [];
    const filtered = isAdmin || allowedDepositos.length === 0
      ? depositos
      : depositos.filter(d => allowedDepositos.includes(d.id));

    successResponse(res, filtered);
  }),

  getTalleres: catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;
    const talleres = await prisma.taller.findMany({
      where: {
        activo: true,
        deletedAt: null
      },
      include: {
        tarifas: true
      },
      orderBy: { nombre: "asc" }
    });

    const isAdmin = user.permisos.includes("ADMIN_SISTEMA") || user.nombre === "Ariel" || user.nombre === "Leo";
    const allowedTalleres = user.allowedTalleres || [];
    const filtered = isAdmin || allowedTalleres.length === 0
      ? talleres
      : talleres.filter(t => allowedTalleres.includes(t.id));

    const mapped = filtered.map(t => {
      const rateTrapo = t.tarifas.find(r => r.tipoTrabajo === "TRAPOS")?.precioFardo || 0;
      const rateRejilla = t.tarifas.find(r => r.tipoTrabajo === "REJILLAS")?.precioFardo || 0;
      return {
        id: t.id,
        nombre: t.nombre,
        observaciones: t.observaciones,
        depositoAsociadoId: t.depositoAsociadoId,
        precioTrapoFardo: rateTrapo,
        precioRejillaFardo: rateRejilla
      };
    });

    successResponse(res, mapped);
  }),

  getUsuarios: catchAsync(async (req: Request, res: Response) => {
    const usuarios = await prisma.usuario.findMany({
      where: {
        deletedAt: null
      },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        email: true,
        rol: true,
        area: true,
        accesoStock: true,
        tallerId: true
      },
      orderBy: { nombre: "asc" }
    });
    successResponse(res, usuarios);
  }),

  getFamilias: catchAsync(async (req: Request, res: Response) => {
    const familias = await prisma.familia.findMany({
      where: {
        deletedAt: null
      },
      orderBy: { nombre: "asc" }
    });
    successResponse(res, familias);
  })
};
