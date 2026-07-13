import { prisma } from "../db/prisma";

export const AuditRepository = {
  async create(
    data: {
      usuarioId: string;
      accion: string;
      entidad: string;
      entidadId: string;
      movimientoId?: string | null;
      cambios: any;
      before?: any;
      after?: any;
      requestId?: string | null;
      ip?: string | null;
      userAgent?: string | null;
    },
    tx?: any
  ) {
    const client = tx || prisma;
    return client.auditoria.create({
      data: {
        usuarioId: data.usuarioId,
        accion: data.accion,
        entidad: data.entidad,
        entidadId: data.entidadId,
        movimientoId: data.movimientoId || null,
        cambios: data.cambios || {},
        before: data.before || null,
        after: data.after || null,
        requestId: data.requestId || null,
        ip: data.ip || null,
        userAgent: data.userAgent || null,
      },
    });
  },
};
