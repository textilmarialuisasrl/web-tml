import { z } from "zod";
import { cuidSchema } from "./common";

const calidadEnum = z.enum(["PERFECTO", "FALLADO"]);
const presentacionEnum = z.enum(["ETIQUETADO", "SIN_ETIQUETA"]);
const canalEnum = z.enum(["MAYORISTA", "MINORISTA"]);
const direccionEnum = z.enum(["ENTRADA", "SALIDA"]);
const tipoMovimientoEnum = z.enum([
  "ENTREGA_TALLER",
  "DEVOLUCION_TALLER",
  "MOVIMIENTO_INTERNO",
  "EGRESO",
  "AJUSTE",
  "RECONVERSION",
  "INGRESO_MANUAL",
  "ETIQUETADO",
]);

export const movimientoItemSchema = z.object({
  productoId: cuidSchema,
  cantidadUnidades: z.number().int().positive("La cantidad de unidades debe ser mayor a cero"),
  depositoOrigenId: cuidSchema.nullable().optional(),
  tallerOrigenId: cuidSchema.nullable().optional(),
  depositoDestinoId: cuidSchema.nullable().optional(),
  tallerDestinoId: cuidSchema.nullable().optional(),
  calidad: calidadEnum.optional(),
  presentacion: presentacionEnum.optional(),
  canal: canalEnum.optional(),
  direccion: direccionEnum.optional(),
});

export const createMovimientoSchema = z.object({
  tipo: tipoMovimientoEnum,
  tallerId: cuidSchema.nullable().optional(),
  observaciones: z.string().max(500).nullable().optional(),
  items: z.array(movimientoItemSchema).min(1, "El movimiento debe tener al menos un ítem"),
  insumos: z
    .array(
      z.object({
        descripcion: z.string().min(1, "La descripción del insumo es obligatoria"),
        cantidad: z.number().positive("La cantidad del insumo debe ser mayor a cero"),
      })
    )
    .optional(),
});

export const createEntregaTallerSchema = z.object({
  tallerId: cuidSchema,
  observaciones: z.string().max(500).nullable().optional(),
  items: z.array(
    z.object({
      productoId: cuidSchema,
      cantidadUnidades: z.number().int().positive("La cantidad de unidades debe ser mayor a cero"),
    })
  ).min(1, "El movimiento debe tener al menos un ítem"),
  insumos: z
    .array(
      z.object({
        descripcion: z.string().min(1, "La descripción del insumo es obligatoria"),
        cantidad: z.number().positive("La cantidad del insumo debe ser mayor a cero"),
      })
    )
    .optional(),
});

export const createDevolucionTallerSchema = z.object({
  tallerId: cuidSchema,
  depositoId: cuidSchema,
  observaciones: z.string().max(500).nullable().optional(),
  items: z.array(
    z.object({
      productoId: cuidSchema,
      cantidadUnidades: z.number().int().nonnegative("La cantidad de perfectos no puede ser negativa").optional(),
      cantidadFallados: z.number().int().nonnegative("La cantidad de fallados no puede ser negativa").optional(),
    })
  ).min(1, "El movimiento debe tener al menos un ítem"),
});

export const createMovimientoInternoSchema = createMovimientoSchema.omit({ tipo: true, tallerId: true });

export const createReconversionSchema = createMovimientoSchema.omit({ tipo: true, tallerId: true });

export const etiquetadoSchema = z.object({
  productoId: cuidSchema,
  depositoId: cuidSchema,
  cantidadUnidades: z.number().int().positive("La cantidad de unidades debe ser mayor a cero"),
  canal: canalEnum,
  calidad: calidadEnum,
  observaciones: z.string().max(500).nullable().optional(),
});

