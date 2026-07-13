import { prisma } from "../db/prisma";
import { MovementRepository } from "../repositories/movement.repository";
import { ProductRepository } from "../repositories/product.repository";
import { UserRepository } from "../repositories/user.repository";
import { MovementService } from "./movement.service";
import { ConfigService } from "./config.service";
import { AuditService } from "./audit.service";
import { AppError } from "../utils/errors";
import { generatePayloadHash } from "../utils/canonical";
import { SyncStatus } from "../../generated/prisma/client";
import { MovementMapper } from "../mappers/movement.mapper";
import { createMovimientoSchema } from "../validators/movement.validator";
import { throttledSecurityLog } from "../utils/security";
import fs from "fs";
import path from "path";

const instanceId = `node-${process.pid}-${Date.now()}`;
const environment = process.env.NODE_ENV || "development";
let appVersion = "1.0.0";
try {
  const pkgPath = path.join(__dirname, "../../../package.json");
  if (fs.existsSync(pkgPath)) {
    const pkgContent = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(pkgContent);
    appVersion = pkg.version || "1.0.0";
  }
} catch {
  // Keep fallback
}

export interface SyncBatchResult {
  batchId: string;
  processed: number;
  synced: any[];
  conflicts: any[];
  rejected: any[];
  durationMs: number;
  receivedAt: Date;
  processedAt: Date;
}

export const SyncService = {
  /**
   * Processes a batch of offline movements.
   * Performs partial sync, chunking, replay protection, and logs detailed outcomes.
   */
  async syncMovements(
    userId: string,
    payload: {
      batchId: string;
      deviceId: string;
      schemaVersion?: number;
      movements: any[];
    },
    meta?: { ip?: string | null; userAgent?: string | null; requestId?: string | null }
  ): Promise<SyncBatchResult> {
    const receivedAt = new Date();
    const startTime = Date.now();

    const { batchId, deviceId, schemaVersion = 1, movements } = payload;

    // 1. Validations
    if (!batchId || typeof batchId !== "string") {
      throw new AppError({
        message: "El parámetro batchId es requerido y debe ser un texto",
        statusCode: 400,
        code: "INVALID_BATCH_ID",
      });
    }

    if (!deviceId || typeof deviceId !== "string") {
      throw new AppError({
        message: "El parámetro deviceId es requerido y debe ser un texto",
        statusCode: 400,
        code: "INVALID_DEVICE_ID",
      });
    }

    if (!Array.isArray(movements)) {
      throw new AppError({
        message: "El campo movements debe ser una lista de movimientos",
        statusCode: 400,
        code: "INVALID_MOVEMENTS",
      });
    }

    const MAX_BATCH_SIZE = 500;
    if (movements.length > MAX_BATCH_SIZE) {
      throw new AppError({
        message: `El tamaño del lote excede el límite máximo permitido de ${MAX_BATCH_SIZE} movimientos`,
        statusCode: 400,
        code: "BATCH_SIZE_EXCEEDED",
      });
    }

    // Fetch user for snapshotting
    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new AppError({
        message: "Usuario emisor no encontrado",
        statusCode: 401,
        code: "USER_NOT_FOUND",
      });
    }

    const synced: any[] = [];
    const conflicts: any[] = [];
    const rejected: any[] = [];

    // Get chunk size from configurations
    let chunkSize = 20;
    try {
      const configVal = await ConfigService.getValue("SYNC_CHUNK_SIZE");
      if (configVal) {
        const parsed = parseInt(configVal, 10);
        if (!isNaN(parsed) && parsed > 0) {
          chunkSize = parsed;
        }
      }
    } catch {
      // Fallback to 20
    }

    // Process movements in chunks
    for (let i = 0; i < movements.length; i += chunkSize) {
      const chunk = movements.slice(i, i + chunkSize);

      for (const m of chunk) {
        const movementStartTime = Date.now();
        try {
          const clientGeneratedId = m.clientGeneratedId;

          // Validate clientGeneratedId presence and length
          if (!clientGeneratedId || typeof clientGeneratedId !== "string") {
            rejected.push({
              clientGeneratedId: clientGeneratedId || null,
              error: "El campo clientGeneratedId es requerido en sincronización offline",
            });
            continue;
          }

          if (clientGeneratedId.length > 120) {
            rejected.push({
              clientGeneratedId,
              error: "El clientGeneratedId excede el límite máximo de 120 caracteres",
            });
            continue;
          }

          const regex = /^[a-zA-Z0-9_\-]+$/;
          if (!regex.test(clientGeneratedId)) {
            rejected.push({
              clientGeneratedId,
              error: "El clientGeneratedId contiene caracteres no permitidos",
            });
            continue;
          }

          // 1.5 Strict Zod validation BEFORE DB queries, locks, or transactions
          const validationResult = createMovimientoSchema.safeParse({
            tipo: m.tipo,
            tallerId: m.tallerId || null,
            observaciones: m.observaciones || null,
            items: m.items,
            insumos: m.insumos,
          });

          if (!validationResult.success) {
            throttledSecurityLog(
              "malformed-payload",
              `Malformed offline payload for clientGeneratedId ${clientGeneratedId}`
            );
            rejected.push({
              clientGeneratedId,
              error: `Validation failure: ${validationResult.error.errors.map((e) => e.message).join(", ")}`,
            });
            continue;
          }

          // Calculate normalized payload hash (excluding volatile / header attributes)
          const normalizedPayload = {
            tipo: m.tipo,
            tallerId: m.tallerId || null,
            observaciones: m.observaciones || null,
            items: (m.items || []).map((item: any) => ({
              productoId: item.productoId,
              cantidadUnidades: item.cantidadUnidades,
              depositoOrigenId: item.depositoOrigenId || null,
              tallerOrigenId: item.tallerOrigenId || null,
              depositoDestinoId: item.depositoDestinoId || null,
              tallerDestinoId: item.tallerDestinoId || null,
              calidad: item.calidad,
              presentacion: item.presentacion,
              canal: item.canal,
              direccion: item.direccion || null,
              observaciones: item.observaciones || null,
            })),
            insumos: (m.insumos || []).map((ins: any) => ({
              descripcion: ins.descripcion,
              cantidad: ins.cantidad,
            })),
          };

          const calculatedHash = generatePayloadHash(normalizedPayload);

          // Check if already processed (Replay Protection)
          const existing = await prisma.movimiento.findFirst({
            where: {
              deviceId,
              clientGeneratedId,
            },
            include: {
              items: true,
              insumos: true,
            },
          });

          if (existing) {
            if (existing.syncStatus === "SYNCED") {
              if (existing.payloadHash === calculatedHash) {
                // Legitimate retry / Replay. Return success idempotently.
                await AuditService.registerAudit({
                  usuarioId: userId,
                  accion: "SYNC_MOVEMENT_REPLAY",
                  entidad: "Movimiento",
                  entidadId: existing.id,
                  cambios: { clientGeneratedId, deviceId },
                  requestId: meta?.requestId || null,
                  ip: meta?.ip || null,
                  userAgent: meta?.userAgent || null,
                });
                console.log(JSON.stringify({
                  timestamp: new Date().toISOString(),
                  level: "INFO",
                  environment,
                  appVersion,
                  instanceId,
                  requestId: meta?.requestId || "N/A",
                  deviceId,
                  clientGeneratedId,
                  syncStatus: "SYNCED",
                  durationMs: Date.now() - movementStartTime,
                  error: null
                }));
                synced.push(MovementMapper.toDTO(existing));
                continue;
              } else {
                // Collision! Payload changed but ID is identical.
                const updated = await MovementRepository.updateSyncStatus(existing.id, {
                  syncStatus: "CONFLICT" as SyncStatus,
                  syncErrorMessage: "Collision detected: clientGeneratedId exists with a different payload",
                  syncResolvedAt: null,
                  lastSyncedAt: new Date(),
                });
                console.warn(JSON.stringify({
                  timestamp: new Date().toISOString(),
                  level: "WARN",
                  environment,
                  appVersion,
                  instanceId,
                  requestId: meta?.requestId || "N/A",
                  deviceId,
                  clientGeneratedId,
                  syncStatus: "CONFLICT",
                  durationMs: Date.now() - movementStartTime,
                  error: "Collision detected: clientGeneratedId exists with a different payload"
                }));
                conflicts.push(MovementMapper.toDTO({ ...existing, ...updated }));
                continue;
              }
            }
            // If existing.syncStatus is FAILED or CONFLICT, we do NOT return/continue.
            // We let it proceed to re-execute in movement service.
          }

          // Resolve product snapshots for items (to store snapshot names correctly on error)
          const itemsWithSnapshots = [];
          for (const item of (m.items || [])) {
            let prodName = "Producto Desconocido";
            if (item.productoId) {
              const product = await ProductRepository.findById(item.productoId);
              if (product) {
                prodName = product.nombre;
              }
            }
            itemsWithSnapshots.push({
              productoId: item.productoId,
              productoNombreSnapshot: prodName,
              cantidadUnidades: item.cantidadUnidades,
              depositoOrigenId: item.depositoOrigenId || null,
              tallerOrigenId: item.tallerOrigenId || null,
              depositoDestinoId: item.depositoDestinoId || null,
              tallerDestinoId: item.tallerDestinoId || null,
              calidad: item.calidad,
              presentacion: item.presentacion,
              canal: item.canal,
              direccion: item.direccion,
              observaciones: item.observaciones || null,
            });
          }

          // Try to execute the movement transactionally
          try {
            const movement = await MovementService.createMovimiento(
              {
                tipo: m.tipo,
                usuarioId: userId,
                tallerId: m.tallerId || null,
                observaciones: m.observaciones || null,
                deviceId,
                clientGeneratedId,
                payloadHash: calculatedHash,
                schemaVersion,
                syncStatus: "SYNCED" as SyncStatus,
                lastSyncedAt: new Date(),
                syncBatchId: batchId,
                offlineCreatedAt: m.offlineCreatedAt ? new Date(m.offlineCreatedAt) : null,
                items: m.items,
                insumos: m.insumos,
              },
              meta
            );
            // Check if it was a retry (if it previously existed in DB as FAILED or CONFLICT)
            const wasRetry = existing && (existing.syncStatus === "FAILED" || existing.syncStatus === "CONFLICT");
            if (wasRetry) {
              await AuditService.registerAudit({
                usuarioId: userId,
                accion: "SYNC_MOVEMENT_RETRY",
                entidad: "Movimiento",
                entidadId: movement.id,
                cambios: { clientGeneratedId, deviceId, previousStatus: existing.syncStatus },
                requestId: meta?.requestId || null,
                ip: meta?.ip || null,
                userAgent: meta?.userAgent || null,
              });
            }

            console.log(JSON.stringify({
              timestamp: new Date().toISOString(),
              level: "INFO",
              environment,
              appVersion,
              instanceId,
              requestId: meta?.requestId || "N/A",
              deviceId,
              clientGeneratedId,
              syncStatus: "SYNCED",
              durationMs: Date.now() - movementStartTime,
              error: null
            }));
            synced.push(movement);
          } catch (err: any) {
            if (err.code === "DUPLICATE_OPERATION" || err.message?.includes("DUPLICATE_OPERATION")) {
              console.error(JSON.stringify({
                timestamp: new Date().toISOString(),
                level: "ERROR",
                environment,
                appVersion,
                instanceId,
                requestId: meta?.requestId || "N/A",
                deviceId,
                clientGeneratedId,
                syncStatus: "FAILED",
                durationMs: Date.now() - movementStartTime,
                error: "Operación duplicada detectada"
              }));
              rejected.push({
                clientGeneratedId,
                error: "Operación duplicada detectada (identificador ya procesado)",
              });
              continue;
            }

            // Handle database unique constraint error under concurrent request overlap
            if (err.code === "P2002" || err.message?.includes("P2002")) {
              const concurrentRecord = await prisma.movimiento.findFirst({
                where: { deviceId, clientGeneratedId },
                include: { items: true, insumos: true }
              });
              if (concurrentRecord && concurrentRecord.syncStatus === "SYNCED") {
                if (concurrentRecord.payloadHash === calculatedHash) {
                  console.log(JSON.stringify({
                    timestamp: new Date().toISOString(),
                    level: "INFO",
                    environment,
                    appVersion,
                    instanceId,
                    requestId: meta?.requestId || "N/A",
                    deviceId,
                    clientGeneratedId,
                    syncStatus: "SYNCED",
                    durationMs: Date.now() - movementStartTime,
                    error: null
                  }));
                  synced.push(MovementMapper.toDTO(concurrentRecord));
                  continue;
                } else {
                  // Collision
                  const updated = await MovementRepository.updateSyncStatus(concurrentRecord.id, {
                    syncStatus: "CONFLICT" as SyncStatus,
                    syncErrorMessage: "Collision detected under concurrency: clientGeneratedId exists with a different payload",
                    lastSyncedAt: new Date(),
                  });
                  console.warn(JSON.stringify({
                    timestamp: new Date().toISOString(),
                    level: "WARN",
                    environment,
                    appVersion,
                    instanceId,
                    requestId: meta?.requestId || "N/A",
                    deviceId,
                    clientGeneratedId,
                    syncStatus: "CONFLICT",
                    durationMs: Date.now() - movementStartTime,
                    error: "Collision detected under concurrency"
                  }));
                  conflicts.push(MovementMapper.toDTO({ ...concurrentRecord, ...updated }));
                  continue;
                }
              }
            }

            // Save/update movement with FAILED status to provide audit trail/logs
            // Check if it already exists in database
            const existingFailed = await prisma.movimiento.findFirst({
              where: { deviceId, clientGeneratedId }
            });

            let failedMov;
            if (existingFailed) {
              if (existingFailed.syncStatus === "SYNCED") {
                // Concurrency safety guard: if it was already marked SYNCED, do not overwrite to FAILED
                if (existingFailed.payloadHash === calculatedHash) {
                  console.log(JSON.stringify({
                    timestamp: new Date().toISOString(),
                    level: "INFO",
                    environment,
                    appVersion,
                    instanceId,
                    requestId: meta?.requestId || "N/A",
                    deviceId,
                    clientGeneratedId,
                    syncStatus: "SYNCED",
                    durationMs: Date.now() - movementStartTime,
                    error: null
                  }));
                  synced.push(MovementMapper.toDTO(existingFailed));
                } else {
                  // Collision
                  const updated = await MovementRepository.updateSyncStatus(existingFailed.id, {
                    syncStatus: "CONFLICT" as SyncStatus,
                    syncErrorMessage: "Collision detected under concurrency: clientGeneratedId exists with a different payload",
                    lastSyncedAt: new Date(),
                  });
                  console.warn(JSON.stringify({
                    timestamp: new Date().toISOString(),
                    level: "WARN",
                    environment,
                    appVersion,
                    instanceId,
                    requestId: meta?.requestId || "N/A",
                    deviceId,
                    clientGeneratedId,
                    syncStatus: "CONFLICT",
                    durationMs: Date.now() - movementStartTime,
                    error: "Collision detected under concurrency: clientGeneratedId exists with a different payload"
                  }));
                  conflicts.push(MovementMapper.toDTO({ ...existingFailed, ...updated }));
                }
                continue;
              }

              // Si ya existe (rollback de reintento fallido), actualizamos sus campos y recreamos items/insumos
              // para reflejar el estado actual del payload fallido.
              await prisma.$transaction(async (tx) => {
                await tx.movimientoItem.deleteMany({ where: { movimientoId: existingFailed.id } });
                await tx.movimientoInsumo.deleteMany({ where: { movimientoId: existingFailed.id } });
                
                failedMov = await tx.movimiento.update({
                  where: { id: existingFailed.id },
                  data: {
                    tipo: m.tipo,
                    tallerId: m.tallerId || null,
                    observaciones: m.observaciones || null,
                    payloadHash: calculatedHash,
                    syncStatus: "FAILED" as SyncStatus,
                    syncErrorMessage: err.message || "Validation or transaction failure",
                    lastSyncedAt: new Date(),
                    syncBatchId: batchId,
                    items: {
                      create: itemsWithSnapshots.map((item) => ({
                        productoId: item.productoId,
                        productoNombreSnapshot: item.productoNombreSnapshot,
                        cantidadUnidades: item.cantidadUnidades,
                        depositoOrigenId: item.depositoOrigenId || null,
                        tallerOrigenId: item.tallerOrigenId || null,
                        depositoDestinoId: item.depositoDestinoId || null,
                        tallerDestinoId: item.tallerDestinoId || null,
                        calidad: item.calidad,
                        presentacion: item.presentacion,
                        canal: item.canal,
                        direccion: item.direccion,
                        observaciones: item.observaciones || null,
                      })),
                    },
                    insumos: m.insumos ? {
                      create: m.insumos.map((ins: any) => ({
                        descripcion: ins.descripcion,
                        cantidad: ins.cantidad,
                      })),
                    } : undefined,
                  },
                  include: {
                    items: true,
                    insumos: true,
                  }
                });
              });
            } else {
              // Primer intento fallido: crear
              failedMov = await MovementRepository.createMovimiento({
                tipo: m.tipo,
                usuarioId: userId,
                usuarioNombreSnapshot: user.nombre,
                tallerId: m.tallerId || null,
                observaciones: m.observaciones || null,
                deviceId,
                clientGeneratedId,
                payloadHash: calculatedHash,
                schemaVersion,
                syncStatus: "FAILED" as SyncStatus,
                syncErrorMessage: err.message || "Validation or transaction failure",
                lastSyncedAt: new Date(),
                syncBatchId: batchId,
                offlineCreatedAt: m.offlineCreatedAt ? new Date(m.offlineCreatedAt) : null,
                items: itemsWithSnapshots,
                insumos: m.insumos,
              });
            }

            // Audit the failure
            await AuditService.registerAudit({
              usuarioId: userId,
              accion: "SYNC_MOVEMENT_FAILED",
              entidad: "Movimiento",
              entidadId: failedMov.id,
              cambios: { error: err.message || "Unknown error" },
              requestId: meta?.requestId || null,
              ip: meta?.ip || null,
              userAgent: meta?.userAgent || null,
            });

            console.error(JSON.stringify({
              timestamp: new Date().toISOString(),
              level: "ERROR",
              environment,
              appVersion,
              instanceId,
              requestId: meta?.requestId || "N/A",
              deviceId,
              clientGeneratedId,
              syncStatus: "FAILED",
              durationMs: Date.now() - movementStartTime,
              error: err.message || "Validation or transaction failure"
            }));
            rejected.push(MovementMapper.toDTO(failedMov));
          }
        } catch (innerErr: any) {
          rejected.push({
            clientGeneratedId: m.clientGeneratedId || null,
            error: innerErr.message || "Internal chunk processing error",
          });
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const processedAt = new Date();

    // Log the sync result to audits
    await AuditService.registerAudit({
      usuarioId: userId,
      accion: "SYNC_BATCH_PROCESSED",
      entidad: "SyncBatch",
      entidadId: batchId,
      cambios: {
        batchId,
        deviceId,
        syncedCount: synced.length,
        conflictsCount: conflicts.length,
        rejectedCount: rejected.length,
        durationMs,
      },
      requestId: meta?.requestId || null,
      ip: meta?.ip || null,
      userAgent: meta?.userAgent || null,
    });

    // Run automatic background cleanup of movements older than 2 months (60 days)
    try {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      await prisma.movimiento.deleteMany({
        where: {
          createdAt: { lt: sixtyDaysAgo }
        }
      });
    } catch (cleanupErr) {
      console.error("Failed to run old movements cleanup:", cleanupErr);
    }

    return {
      batchId,
      processed: synced.length + conflicts.length + rejected.length,
      synced,
      conflicts,
      rejected,
      durationMs,
      receivedAt,
      processedAt,
    };
  },

  async getSyncMetrics(): Promise<any> {
    const startDb = Date.now();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Run all queries in parallel to minimize sequential round-trip network overhead
    const [
      _, // database latency check
      statusGroups,
      lastErrors,
      auditCounts24h,
      avgDurationResult
    ] = await Promise.all([
      prisma.$executeRawUnsafe("SELECT 1"),
      prisma.movimiento.groupBy({
        by: ["syncStatus"],
        _count: {
          _all: true,
        },
      }),
      prisma.movimiento.findMany({
        where: {
          syncStatus: "FAILED",
        },
        select: {
          id: true,
          clientGeneratedId: true,
          syncErrorMessage: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 10,
      }),
      prisma.$queryRawUnsafe(`
        SELECT accion, COUNT(*)::integer as count
        FROM "Auditoria"
        WHERE "createdAt" >= $1
          AND accion IN ('SYNC_MOVEMENT_RETRY', 'SYNC_MOVEMENT_REPLAY')
        GROUP BY accion
      `, oneDayAgo),
      prisma.$queryRawUnsafe(`
        SELECT COALESCE(AVG((cambios->>'durationMs')::numeric), 0) as avg
        FROM "Auditoria"
        WHERE accion = 'SYNC_BATCH_PROCESSED'
          AND "createdAt" >= $1
      `, oneDayAgo)
    ]);

    const databaseLatencyMs = Date.now() - startDb;

    const counts = {
      SYNCED: 0,
      FAILED: 0,
      CONFLICT: 0,
      PENDING: 0,
    };

    for (const group of statusGroups) {
      if (group.syncStatus in counts) {
        counts[group.syncStatus as keyof typeof counts] = group._count._all;
      }
    }

    let retries24h = 0;
    let replays24h = 0;
    for (const row of auditCounts24h) {
      if (row.accion === "SYNC_MOVEMENT_RETRY") {
        retries24h = Number(row.count);
      } else if (row.accion === "SYNC_MOVEMENT_REPLAY") {
        replays24h = Number(row.count);
      }
    }

    const avgSyncTimeMs = Math.round(Number(avgDurationResult[0]?.avg || 0));

    return {
      uptime: process.uptime(),
      buildVersion: appVersion,
      databaseLatencyMs,
      counts,
      lastErrors: lastErrors.map((e) => ({
        id: e.id,
        clientGeneratedId: e.clientGeneratedId || "N/A",
        errorMessage: e.syncErrorMessage || "Error desconocido",
        timestamp: e.updatedAt.toISOString(),
      })),
      retries24h,
      replays24h,
      avgSyncTimeMs,
    };
  },
};
