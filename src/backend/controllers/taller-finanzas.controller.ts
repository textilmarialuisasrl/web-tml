import { Request, Response } from "express";
import { prisma } from "../db/prisma";
import { AppError, catchAsync } from "../utils/errors";
import { generateLiquidationPdf } from "../utils/pdf-generator";
import path from "path";
import fs from "fs";

const successResponse = (res: Response, data: any, statusCode = 200, meta?: any) => {
  res.status(statusCode).json({
    success: true,
    data,
    meta,
  });
};

export const TallerFinanzasController = {
  /**
   * Get workshop rates.
   * In Textil Maria Luisa, rates are price per bale of Trapos and Rejillas.
   */
  getTarifas: catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;
    const isAdmin = user.permisos.includes("ADMIN_SISTEMA") || user.nombre === "Ariel" || user.nombre === "Leo";
    let tallerId = req.query.tallerId as string | undefined;

    if (!isAdmin) {
      const allowedTalleres = user.allowedTalleres || [];
      if (allowedTalleres.length > 0) {
        tallerId = allowedTalleres[0];
      } else {
        return successResponse(res, []);
      }
    }

    const where: any = {};
    if (tallerId) {
      where.id = tallerId;
    }

    const talleres = await prisma.taller.findMany({
      where: {
        activo: true,
        ...where
      },
      include: {
        tarifas: true
      },
      orderBy: {
        nombre: "asc"
      }
    });

    const mapped = talleres.map(t => {
      const rateTrapo = t.tarifas.find(r => r.tipoTrabajo === "TRAPOS")?.precioFardo || 0;
      const rateRejilla = t.tarifas.find(r => r.tipoTrabajo === "REJILLAS")?.precioFardo || 0;
      return {
        id: t.id,
        nombre: t.nombre,
        precioTrapoFardo: rateTrapo,
        precioRejillaFardo: rateRejilla
      };
    });

    successResponse(res, mapped);
  }),

  /**
   * Save or update workshop rates.
   * Admin only.
   */
  saveTarifa: catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;
    const isAdmin = user.permisos.includes("ADMIN_SISTEMA") || user.nombre === "Ariel" || user.nombre === "Leo";
    if (!isAdmin) {
      throw new AppError({
        message: "Acceso denegado: se requieren permisos de Administrador",
        statusCode: 403,
        code: "FORBIDDEN",
      });
    }

    const { tallerId, precioTrapoFardo, precioRejillaFardo } = req.body;
    if (!tallerId || precioTrapoFardo === undefined || precioRejillaFardo === undefined) {
      throw new AppError({
        message: "Datos de tarifas inválidos",
        statusCode: 400,
        code: "INVALID_TARIFA_DATA",
      });
    }

    await prisma.$transaction([
      prisma.tallerTarifa.upsert({
        where: {
          tallerId_tipoTrabajo: {
            tallerId,
            tipoTrabajo: "TRAPOS"
          }
        },
        create: {
          tallerId,
          tipoTrabajo: "TRAPOS",
          precioFardo: parseFloat(precioTrapoFardo)
        },
        update: {
          precioFardo: parseFloat(precioTrapoFardo)
        }
      }),
      prisma.tallerTarifa.upsert({
        where: {
          tallerId_tipoTrabajo: {
            tallerId,
            tipoTrabajo: "REJILLAS"
          }
        },
        create: {
          tallerId,
          tipoTrabajo: "REJILLAS",
          precioFardo: parseFloat(precioRejillaFardo)
        },
        update: {
          precioFardo: parseFloat(precioRejillaFardo)
        }
      })
    ]);

    const updatedTaller = await prisma.taller.findUnique({
      where: { id: tallerId },
      include: { tarifas: true }
    });

    const rateTrapo = updatedTaller?.tarifas.find(r => r.tipoTrabajo === "TRAPOS")?.precioFardo || 0;
    const rateRejilla = updatedTaller?.tarifas.find(r => r.tipoTrabajo === "REJILLAS")?.precioFardo || 0;

    successResponse(res, {
      id: updatedTaller?.id,
      nombre: updatedTaller?.nombre,
      precioTrapoFardo: rateTrapo,
      precioRejillaFardo: rateRejilla
    });
  }),

  /**
   * Get all payments or filter by tallerId.
   */
  getPagos: catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;
    const isAdmin = user.permisos.includes("ADMIN_SISTEMA") || user.nombre === "Ariel" || user.nombre === "Leo";
    let tallerId = req.query.tallerId as string | undefined;

    if (!isAdmin) {
      const allowedTalleres = user.allowedTalleres || [];
      if (allowedTalleres.length > 0) {
        tallerId = allowedTalleres[0];
      } else {
        return successResponse(res, []);
      }
    }

    const where: any = {};
    if (tallerId) {
      where.tallerId = tallerId;
    }

    const pagos = await prisma.tallerPago.findMany({
      where,
      include: {
        taller: {
          select: { id: true, nombre: true }
        }
      },
      orderBy: {
        fecha: "desc"
      }
    });

    successResponse(res, pagos);
  }),

  /**
   * Calculate workshop payment breakdown for a period.
   * Admin only.
   */
  calcularPago: catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;
    const isAdmin = user.permisos.includes("ADMIN_SISTEMA") || user.nombre === "Ariel" || user.nombre === "Leo";
    if (!isAdmin) {
      throw new AppError({
        message: "Acceso denegado: se requieren permisos de Administrador",
        statusCode: 403,
        code: "FORBIDDEN",
      });
    }

    const { tallerId, inicio, fin } = req.query;
    if (!tallerId || !inicio || !fin) {
      throw new AppError({
        message: "Faltan parámetros requeridos (tallerId, inicio, fin)",
        statusCode: 400,
        code: "MISSING_PARAMS",
      });
    }

    const dbTaller = await prisma.taller.findUnique({
      where: { id: tallerId as string }
    });
    if (!dbTaller) {
      throw new AppError({
        message: "Taller no encontrado",
        statusCode: 404,
        code: "TALLER_NOT_FOUND",
      });
    }

    const start = new Date(inicio as string);
    const end = new Date(fin as string);
    end.setHours(23, 59, 59, 999);

    // Fetch returned production in this period
    const devoluciones = await prisma.movimiento.findMany({
      where: {
        tallerId: tallerId as string,
        tipo: "DEVOLUCION_TALLER",
        estado: "CONFIRMADO",
        createdAt: { gte: start, lte: end }
      },
      include: {
        items: {
          include: { producto: true }
        }
      }
    });

    const tarifas = await prisma.tallerTarifa.findMany({
      where: { tallerId: tallerId as string }
    });
    const precioTrapo = tarifas.find(t => t.tipoTrabajo === "TRAPOS")?.precioFardo || 0;
    const precioRejilla = tarifas.find(t => t.tipoTrabajo === "REJILLAS")?.precioFardo || 0;

    let trapoUnits = 0;
    let rejillaUnits = 0;
    let trapoFardos = 0;
    let rejillaFardos = 0;

    let trapoFalladoUnits = 0;
    let rejillaFalladoUnits = 0;

    for (const m of devoluciones) {
      for (const item of m.items) {
        const tipoTrabajo = item.producto.tipoTrabajo;
        if (!tipoTrabajo) continue;

        const uPorFardo = item.producto.unidadesPorFardo || 60;

        if (item.calidad === "FALLADO" || item.producto.tipoProducto === "FALLADO") {
          if (tipoTrabajo === "TRAPOS") {
            trapoFalladoUnits += item.cantidadUnidades;
          } else if (tipoTrabajo === "REJILLAS") {
            rejillaFalladoUnits += item.cantidadUnidades;
          }
        } else {
          if (tipoTrabajo === "TRAPOS") {
            trapoUnits += item.cantidadUnidades;
            trapoFardos += item.cantidadUnidades / uPorFardo;
          } else if (tipoTrabajo === "REJILLAS") {
            rejillaUnits += item.cantidadUnidades;
            rejillaFardos += item.cantidadUnidades / uPorFardo;
          }
        }
      }
    }

    const subtotalTrapo = (trapoFardos * precioTrapo) + (trapoFalladoUnits * (precioTrapo / 60));
    const subtotalRejilla = (rejillaFardos * precioRejilla) + (rejillaFalladoUnits * (precioRejilla / 60));
    const total = subtotalTrapo + subtotalRejilla;

    successResponse(res, {
      tallerNombre: dbTaller.nombre,
      trapoFardos,
      trapoUnits,
      trapoFalladoUnits,
      precioTrapo,
      subtotalTrapo,
      rejillaFardos,
      rejillaUnits,
      rejillaFalladoUnits,
      precioRejilla,
      subtotalRejilla,
      total
    });
  }),

  /**
   * Register a new payment to a workshop, generate PDF liquidation and save it.
   * Admin only.
   */
  createPago: catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;
    const isAdmin = user.permisos.includes("ADMIN_SISTEMA") || user.nombre === "Ariel" || user.nombre === "Leo";
    if (!isAdmin) {
      throw new AppError({
        message: "Acceso denegado: se requieren permisos de Administrador",
        statusCode: 403,
        code: "FORBIDDEN",
      });
    }

    const { tallerId, monto, observaciones, fecha, periodoNombre, periodoInicio, periodoFin } = req.body;
    if (!tallerId || !monto || parseFloat(monto) <= 0) {
      throw new AppError({
        message: "Monto de pago inválido",
        statusCode: 400,
        code: "INVALID_PAYMENT_DATA",
      });
    }

    const dbTaller = await prisma.taller.findUnique({
      where: { id: tallerId }
    });
    if (!dbTaller) {
      throw new AppError({
        message: "Taller no encontrado",
        statusCode: 404,
        code: "TALLER_NOT_FOUND",
      });
    }

    const pago = await prisma.tallerPago.create({
      data: {
        tallerId,
        monto: parseFloat(monto),
        observaciones: observaciones || null,
        fecha: fecha ? new Date(fecha) : new Date(),
        periodoNombre: periodoNombre || null,
        periodoInicio: periodoInicio ? new Date(periodoInicio) : null,
        periodoFin: periodoFin ? new Date(periodoFin) : null
      }
    });

    if (periodoNombre && periodoInicio && periodoFin) {
      try {
        const start = new Date(periodoInicio);
        const end = new Date(periodoFin);
        end.setHours(23, 59, 59, 999);

        const devolucionesPeriodo = await prisma.movimiento.findMany({
          where: {
            tallerId,
            tipo: "DEVOLUCION_TALLER",
            estado: "CONFIRMADO",
            createdAt: { gte: start, lte: end }
          },
          include: {
            items: {
              include: { producto: true }
            }
          }
        });

        const tarifas = await prisma.tallerTarifa.findMany({
          where: { tallerId }
        });
        const rateTrapo = tarifas.find(t => t.tipoTrabajo === "TRAPOS")?.precioFardo || 0;
        const rateRejilla = tarifas.find(t => t.tipoTrabajo === "REJILLAS")?.precioFardo || 0;

        const itemsMap: Record<string, { nombre: string; cantidadUnidades: number; unidadesPorFardo: number; precioFardo: number; subtotal: number }> = {};
        let totalValorizadoPeriodo = 0;

        for (const m of devolucionesPeriodo) {
          for (const item of m.items) {
            const tipoTrabajo = item.producto.tipoTrabajo;
            if (!tipoTrabajo) continue;

            const prodId = item.productoId;
            const name = item.producto.nombre;
            const uPorFardo = item.producto.unidadesPorFardo || 60;
            const precioFardo = tipoTrabajo === "TRAPOS" ? rateTrapo : rateRejilla;

            let itemValue = 0;
            if (item.calidad === "FALLADO" || item.producto.tipoProducto === "FALLADO") {
              itemValue = item.cantidadUnidades * (precioFardo / 60);
            } else {
              itemValue = item.cantidadUnidades * (precioFardo / uPorFardo);
            }

            if (!itemsMap[prodId]) {
              itemsMap[prodId] = {
                nombre: name,
                cantidadUnidades: 0,
                unidadesPorFardo: uPorFardo,
                precioFardo: precioFardo,
                subtotal: 0
              };
            }
            itemsMap[prodId].cantidadUnidades += item.cantidadUnidades;
            itemsMap[prodId].subtotal += itemValue;
            totalValorizadoPeriodo += itemValue;
          }
        }

        const todasDevoluciones = await prisma.movimiento.findMany({
          where: {
            tallerId,
            tipo: "DEVOLUCION_TALLER",
            estado: "CONFIRMADO"
          },
          include: {
            items: {
              include: { producto: true }
            }
          }
        });

        let totalValorizadoHistorico = 0;
        for (const m of todasDevoluciones) {
          for (const item of m.items) {
            const tipoTrabajo = item.producto.tipoTrabajo;
            if (!tipoTrabajo) continue;

            const uPorFardo = item.producto.unidadesPorFardo || 60;
            const precioFardo = tipoTrabajo === "TRAPOS" ? rateTrapo : rateRejilla;

            if (item.calidad === "FALLADO" || item.producto.tipoProducto === "FALLADO") {
              totalValorizadoHistorico += item.cantidadUnidades * (precioFardo / 60);
            } else {
              totalValorizadoHistorico += item.cantidadUnidades * (precioFardo / uPorFardo);
            }
          }
        }

        const pagosAnteriores = await prisma.tallerPago.aggregate({
          where: {
            tallerId,
            id: { not: pago.id }
          },
          _sum: { monto: true }
        });
        const totalPagadoAnterior = pagosAnteriores._sum.monto || 0;

        const saldoPendienteAntes = totalValorizadoHistorico - totalPagadoAnterior;
        const saldoFinal = saldoPendienteAntes - parseFloat(monto);

        const pdfFilename = `pago-${pago.id}.pdf`;
        const pdfPath = path.join(process.cwd(), "data", "liquidaciones", pdfFilename);

        await generateLiquidationPdf({
          tallerNombre: dbTaller.nombre,
          periodoNombre: periodoNombre,
          fechaPago: new Date(pago.fecha).toLocaleDateString(),
          montoPago: parseFloat(monto),
          items: Object.values(itemsMap),
          totalValorizado: totalValorizadoPeriodo,
          totalPagadoAnterior,
          saldoPendienteAntes,
          saldoFinal
        }, pdfPath);

        console.log(`[PDF] Liquidation generated successfully at ${pdfPath}`);
      } catch (pdfErr) {
        console.error("Error generating liquidation PDF:", pdfErr);
      }
    }

    successResponse(res, pago, 201);
  }),

  /**
   * Delete a registered payment.
   * Admin only.
   */
  deletePago: catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;
    const isAdmin = user.permisos.includes("ADMIN_SISTEMA") || user.nombre === "Ariel" || user.nombre === "Leo";
    if (!isAdmin) {
      throw new AppError({
        message: "Acceso denegado: se requieren permisos de Administrador",
        statusCode: 403,
        code: "FORBIDDEN",
      });
    }

    const { id } = req.params;

    try {
      const pdfPath = path.join(process.cwd(), "data", "liquidaciones", `pago-${id}.pdf`);
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    } catch (err) {
      console.warn("Could not delete liquidation PDF file:", err);
    }

    await prisma.tallerPago.delete({
      where: { id }
    });

    successResponse(res, { deleted: true });
  }),

  /**
   * Stream a saved liquidation PDF.
   */
  downloadPdf: catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const pdfPath = path.join(process.cwd(), "data", "liquidaciones", `pago-${id}.pdf`);

    if (!fs.existsSync(pdfPath)) {
      throw new AppError({
        message: "El archivo de liquidación PDF no existe o no fue generado.",
        statusCode: 404,
        code: "PDF_NOT_FOUND",
      });
    }

    res.contentType("application/pdf");
    res.download(pdfPath, `liquidacion-pago-${id}.pdf`);
  }),

  /**
   * Get financial summary of workshops including total production value, payments and current debt.
   */
  getResumenFinanciero: catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;
    const isAdmin = user.permisos.includes("ADMIN_SISTEMA") || user.nombre === "Ariel" || user.nombre === "Leo";
    let filterTallerId = req.query.tallerId as string | undefined;

    if (!isAdmin) {
      const allowedTalleres = user.allowedTalleres || [];
      if (allowedTalleres.length > 0) {
        filterTallerId = allowedTalleres[0];
      } else {
        return successResponse(res, []);
      }
    }

    const talleres = await prisma.taller.findMany({
      where: {
        activo: true,
        id: filterTallerId ? filterTallerId : undefined
      },
      include: {
        tarifas: true
      }
    });

    const resumenes = [];

    for (const taller of talleres) {
      const rateTrapo = taller.tarifas.find(r => r.tipoTrabajo === "TRAPOS")?.precioFardo || 0;
      const rateRejilla = taller.tarifas.find(r => r.tipoTrabajo === "REJILLAS")?.precioFardo || 0;

      const devoluciones = await prisma.movimiento.findMany({
        where: {
          tallerId: taller.id,
          tipo: "DEVOLUCION_TALLER",
          estado: "CONFIRMADO"
        },
        include: {
          items: {
            include: { producto: true }
          }
        }
      });

      const entregas = await prisma.movimiento.findMany({
        where: {
          tallerId: taller.id,
          tipo: "ENTREGA_TALLER",
          estado: "CONFIRMADO"
        },
        include: {
          items: true
        }
      });

      let totalRecibido = 0;
      for (const e of entregas) {
        for (const item of e.items) {
          totalRecibido += item.cantidadUnidades;
        }
      }

      let totalPerfectUnits = 0;
      let totalFalladoUnits = 0;
      let totalValorizado = 0;

      const productDetails: Record<string, { nombre: string; perfect: number; fallado: number; rate: number; subtotal: number }> = {};

      for (const m of devoluciones) {
        for (const item of m.items) {
          const tipoTrabajo = item.producto.tipoTrabajo;
          if (!tipoTrabajo) continue;

          const prodId = item.productoId;
          const name = item.producto.nombre;
          const uPorFardo = item.producto.unidadesPorFardo || 60;
          const precioFardo = tipoTrabajo === "TRAPOS" ? rateTrapo : rateRejilla;
          const precioUnit = precioFardo / uPorFardo;

          if (!productDetails[prodId]) {
            productDetails[prodId] = { nombre: name, perfect: 0, fallado: 0, rate: precioFardo, subtotal: 0 };
          }

          if (item.calidad === "FALLADO" || item.producto.tipoProducto === "FALLADO") {
            totalFalladoUnits += item.cantidadUnidades;
            productDetails[prodId].fallado += item.cantidadUnidades;
            const itemValue = item.cantidadUnidades * (precioFardo / 60);
            totalValorizado += itemValue;
            productDetails[prodId].subtotal += itemValue;
          } else {
            totalPerfectUnits += item.cantidadUnidades;
            productDetails[prodId].perfect += item.cantidadUnidades;
            const itemValue = item.cantidadUnidades * precioUnit;
            totalValorizado += itemValue;
            productDetails[prodId].subtotal += itemValue;
          }
        }
      }

      const pagosAgg = await prisma.tallerPago.aggregate({
        where: { tallerId: taller.id },
        _sum: { monto: true }
      });
      const totalPagado = pagosAgg._sum.monto || 0;

      const deudaActual = totalValorizado - totalPagado;
      const totalDevuelto = totalPerfectUnits + totalFalladoUnits;
      const totalPendiente = Math.max(0, totalRecibido - totalDevuelto);

      resumenes.push({
        tallerId: taller.id,
        tallerNombre: taller.nombre,
        produccionPerfecta: totalPerfectUnits,
        produccionFallada: totalFalladoUnits,
        produccionValorizada: totalValorizado,
        totalPagado,
        deudaActual,
        totalRecibido,
        totalDevuelto,
        totalPendiente,
        precioTrapoFardo: rateTrapo,
        precioRejillaFardo: rateRejilla,
        detallesProductos: Object.values(productDetails)
      });
    }

    successResponse(res, resumenes);
  })
};
