import { Readable } from "stream";
import { prisma } from "../db/prisma";
import { ConfigService } from "./config.service";

function escapeCSVField(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export const ExportService = {
  /**
   * Generates a streaming CSV of movement items using cursor-based keyset pagination.
   * Prevents memory spikes and supports Excel UTF-8 encoding.
   */
  exportMovementsCSVStream(filter: {
    tipo?: any;
    fechaInicio?: Date;
    fechaFin?: Date;
  } = {}): Readable {
    let lastId: string | undefined = undefined;
    let hasMore = true;

    const stream = new Readable({
      read() {},
    });

    // Write UTF-8 BOM to prevent Excel encoding issues
    stream.push("\uFEFF");

    // Write header
    const header = [
      "Numero Secuencial",
      "ID Movimiento",
      "Tipo Movimiento",
      "Estado",
      "Usuario",
      "Taller Asoc.",
      "Observaciones",
      "Fecha Creacion",
      "Producto",
      "Cantidad Unidades",
      "Origen",
      "Destino",
      "Calidad",
      "Presentacion",
      "Canal",
    ].map(escapeCSVField).join(",") + "\n";
    stream.push(header);

    // Async worker IIFE
    (async () => {
      try {
        let chunkSize = 500;
        try {
          const configVal = await ConfigService.getValue("EXPORT_CHUNK_SIZE");
          if (configVal) {
            const parsed = parseInt(configVal, 10);
            if (!isNaN(parsed) && parsed > 0) {
              chunkSize = parsed;
            }
          }
        } catch {
          // Fallback to 500
        }

        // Build base filters for movement
        const movFilter: any = {};
        if (filter.tipo) {
          movFilter.tipo = filter.tipo;
        }
        if (filter.fechaInicio || filter.fechaFin) {
          movFilter.createdAt = {};
          if (filter.fechaInicio) {
            movFilter.createdAt.gte = filter.fechaInicio;
          }
          if (filter.fechaFin) {
            movFilter.createdAt.lte = filter.fechaFin;
          }
        }

        while (hasMore) {
          const items = await prisma.movimientoItem.findMany({
            where: {
              movimiento: movFilter,
            },
            take: chunkSize,
            skip: lastId ? 1 : 0,
            cursor: lastId ? { id: lastId } : undefined,
            include: {
              movimiento: {
                include: {
                  taller: true,
                },
              },
              producto: true,
              depositoOrigen: true,
              depositoDestino: true,
              tallerOrigen: true,
              tallerDestino: true,
            },
            orderBy: {
              id: "asc",
            },
          });

          if (items.length === 0) {
            hasMore = false;
            stream.push(null);
            break;
          }

          lastId = items[items.length - 1].id;

          for (const item of items) {
            const origName = item.depositoOrigen?.nombre || item.tallerOrigen?.nombre || "-";
            const destName = item.depositoDestino?.nombre || item.tallerDestino?.nombre || "-";

            const row = [
              item.movimiento.numeroSecuencial,
              item.movimiento.id,
              item.movimiento.tipo,
              item.movimiento.estado,
              item.movimiento.usuarioNombreSnapshot,
              item.movimiento.taller?.nombre || "-",
              item.movimiento.observaciones || "",
              item.movimiento.createdAt.toISOString(),
              item.productoNombreSnapshot || item.producto.nombre,
              item.cantidadUnidades,
              origName,
              destName,
              item.calidad,
              item.presentacion,
              item.canal,
            ].map(escapeCSVField).join(",") + "\n";

            stream.push(row);
          }

          if (items.length < chunkSize) {
            hasMore = false;
            stream.push(null);
            break;
          }
        }
      } catch (err) {
        stream.destroy(err as Error);
      }
    })();

    return stream;
  },
};
