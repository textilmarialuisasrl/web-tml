import { AuditRepository } from "../repositories/audit.repository";
import { logger } from "../utils/logger";
import { prisma } from "../db/prisma";

export const AuditService = {
  /**
   * Log an audit trail entry in the database.
   * Runs inside try-catch to ensure audit logging errors do not crash main business transactions.
   */
  async registerAudit(
    params: {
      usuarioId: string;
      accion: string;
      entidad: string;
      entidadId: string;
      movimientoId?: string | null;
      cambios?: any;
      before?: any;
      after?: any;
      requestId?: string | null;
      ip?: string | null;
      userAgent?: string | null;
    },
    tx?: any
  ) {
    try {
      const audit = await AuditRepository.create({
        usuarioId: params.usuarioId,
        accion: params.accion,
        entidad: params.entidad,
        entidadId: params.entidadId,
        movimientoId: params.movimientoId,
        cambios: params.cambios || {},
        before: params.before,
        after: params.after,
        requestId: params.requestId,
        ip: params.ip,
        userAgent: params.userAgent,
      }, tx);

      logger.info(
        `[Audit Logged] User ${params.usuarioId} performed "${params.accion}" on ${params.entidad}:${params.entidadId}`,
        undefined,
        params.requestId
      );

      return audit;
    } catch (err: any) {
      // Do not block main flow, just log the failure
      logger.error(
        `[Audit Log Failure] Failed to save audit log: ${err.message}`,
        err.stack,
        params.requestId
      );
      return null;
    }
  },

  /**
   * Log a system-wide audit event without blocking the current flow.
   * Prints unified structured logs [TIMESTAMP][CATEGORY][SEVERITY] event-name
   */
  async registerAuditEvent(
    params: {
      usuarioId?: string;
      accion: string; // The eventType name
      severity: "INFO" | "WARN" | "ERROR" | "CRITICAL";
      category?: string; // defaults to "SYSTEM"
      metadata?: any;
      requestId?: string | null;
      ip?: string | null;
      userAgent?: string | null;
    }
  ) {
    const category = params.category || "SYSTEM";
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}][${category}][${params.severity}] ${params.accion}`;
    
    // Print unified structured logs to console
    if (params.severity === "ERROR" || params.severity === "CRITICAL") {
      console.error(logMessage, params.metadata ? JSON.stringify(params.metadata) : "");
    } else if (params.severity === "WARN") {
      console.warn(logMessage, params.metadata ? JSON.stringify(params.metadata) : "");
    } else {
      console.log(logMessage, params.metadata ? JSON.stringify(params.metadata) : "");
    }

    try {
      let resolvedUsuarioId = params.usuarioId;
      if (!resolvedUsuarioId) {
        const firstUser = await prisma.usuario.findFirst({
          where: { activo: true },
          select: { id: true }
        });
        resolvedUsuarioId = firstUser?.id;
      }
      
      // If we don't have a valid usuarioId in the DB, we cannot insert because of foreign key constraint
      if (!resolvedUsuarioId) {
        return null;
      }

      const audit = await AuditRepository.create({
        usuarioId: resolvedUsuarioId,
        accion: params.accion,
        entidad: "AuditEvent",
        entidadId: "system",
        cambios: {
          severity: params.severity,
          category,
          metadata: params.metadata || {}
        },
        requestId: params.requestId,
        ip: params.ip,
        userAgent: params.userAgent,
      });

      return audit;
    } catch (err: any) {
      // Failsafe, fire-and-forget
      return null;
    }
  }
};

