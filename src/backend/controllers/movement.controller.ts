import { Request, Response } from "express";
import { MovementService } from "../services/movement.service";
import { StockService } from "../services/stock.service";
import { DashboardService } from "../services/dashboard.service";
import { PdfService } from "../services/pdf.service";
import { SyncService } from "../services/sync.service";
import { ExportService } from "../services/export.service";
import { metricsRegistry } from "../utils/metrics";
import { catchAsync } from "../utils/errors";
import { successResponse } from "../utils/response";
import { ProductRepository } from "../repositories/product.repository";
import { DepositoRepository } from "../repositories/deposito.repository";
import { TallerRepository } from "../repositories/taller.repository";

export const MovementController = {
  /**
   * Helper to build client metadata for audit logs.
   */
  getAuditMeta(req: Request) {
    return {
      requestId: req.requestId,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    };
  },

  /**
   * General movement endpoint.
   */
  createMovimiento: catchAsync(async (req: Request, res: Response) => {
    const usuarioId = req.user!.id;
    const movement = await MovementService.createMovimiento(
      { ...req.body, usuarioId },
      MovementController.getAuditMeta(req)
    );
    successResponse(res, movement, 201);
  }),

  /**
   * Delivery to workshop endpoint.
   */
  createEntregaTaller: catchAsync(async (req: Request, res: Response) => {
    const usuarioId = req.user!.id;
    const movement = await MovementService.createEntregaTaller(
      { ...req.body, usuarioId },
      MovementController.getAuditMeta(req)
    );
    successResponse(res, movement, 201);
  }),

  /**
   * Return from workshop endpoint.
   */
  createDevolucionTaller: catchAsync(async (req: Request, res: Response) => {
    const usuarioId = req.user!.id;
    const movement = await MovementService.createDevolucionTaller(
      { ...req.body, usuarioId },
      MovementController.getAuditMeta(req)
    );
    successResponse(res, movement, 201);
  }),

  /**
   * Internal warehouse transfer endpoint.
   */
  createMovimientoInterno: catchAsync(async (req: Request, res: Response) => {
    const usuarioId = req.user!.id;
    const movement = await MovementService.createMovimientoInterno(
      { ...req.body, usuarioId },
      MovementController.getAuditMeta(req)
    );
    successResponse(res, movement, 201);
  }),

  /**
   * Quality or presentation reconversion endpoint.
   */
  createReconversion: catchAsync(async (req: Request, res: Response) => {
    const usuarioId = req.user!.id;
    const movement = await MovementService.createReconversion(
      { ...req.body, usuarioId },
      MovementController.getAuditMeta(req)
    );
    successResponse(res, movement, 201);
  }),

  /**
   * Labelling of products (sin_etiqueta -> etiquetado).
   */
  createEtiquetado: catchAsync(async (req: Request, res: Response) => {
    const usuarioId = req.user!.id;
    const movement = await MovementService.createEtiquetado(
      { ...req.body, usuarioId },
      MovementController.getAuditMeta(req)
    );
    successResponse(res, movement, 201);
  }),

  /**
   * Query movements timeline with cursor pagination.
   */
  listMovements: catchAsync(async (req: Request, res: Response) => {
    const data = await MovementService.listMovements(req.query, req.user);
    successResponse(res, data.items, 200, {
      nextCursor: data.nextCursor,
    });
  }),

  /**
   * Fetch single movement by ID.
   */
  getMovement: catchAsync(async (req: Request, res: Response) => {
    const movement = await MovementService.getMovement(req.params.id);
    successResponse(res, movement);
  }),

  /**
   * Query consolidated stock balances.
   */
  listStocks: catchAsync(async (req: Request, res: Response) => {
    const stocks = await StockService.listAllStock(req.query, req.user);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const pages = Math.ceil(stocks.total / limit);

    successResponse(res, stocks.items, 200, {
      page,
      limit,
      total: stocks.total,
      pages,
    });
  }),

  /**
   * Query stock items by product ID.
   */
  getStockByProducto: catchAsync(async (req: Request, res: Response) => {
    const stocks = await StockService.getStockByProducto(req.params.id);
    successResponse(res, stocks);
  }),

  /**
   * Query stock items by deposit ID.
   */
  getStockByDeposito: catchAsync(async (req: Request, res: Response) => {
    const stocks = await StockService.getStockByDeposito(req.params.id);
    successResponse(res, stocks);
  }),

  /**
   * Fetch dashboard summary metrics.
   */
  getDashboardSummary: catchAsync(async (req: Request, res: Response) => {
    const metrics = await DashboardService.getMetrics();
    successResponse(res, metrics);
  }),

  /**
   * Streaming generation of movement PDF document.
   */
  generateMovementPdf: catchAsync(async (req: Request, res: Response) => {
    const layout = (req.query.layout as "A4" | "TICKET_80MM") || "A4";
    const pdfDoc = await PdfService.createMovementPdfDocument(req.params.id, layout);
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="remito-tml-${req.params.id}.pdf"`
    );
    pdfDoc.pipe(res);
  }),

  /**
   * Processes a batch sync request for offline movements.
   */
  syncMovements: catchAsync(async (req: Request, res: Response) => {
    const usuarioId = req.user!.id;
    const start = Date.now();
    
    metricsRegistry.incrementCounter("sync_batches_received");

    const result = await SyncService.syncMovements(
      usuarioId,
      req.body,
      MovementController.getAuditMeta(req)
    );

    const duration = Date.now() - start;
    metricsRegistry.recordSyncDuration(duration);
    metricsRegistry.recordSyncBatchSize(result.processed);
    
    metricsRegistry.incrementCounter("sync_movements_processed", result.processed);
    metricsRegistry.incrementCounter("sync_movements_synced", result.synced.length);
    metricsRegistry.incrementCounter("sync_movements_conflicts", result.conflicts.length);
    metricsRegistry.incrementCounter("sync_movements_rejected", result.rejected.length);

    successResponse(res, result, 200);
  }),

  /**
   * Streaming export of movements data in CSV format.
   */
  exportMovementsCsv: catchAsync(async (req: Request, res: Response) => {
    const start = Date.now();
    const filter = {
      tipo: req.query.tipo,
      fechaInicio: req.query.fechaInicio ? new Date(req.query.fechaInicio as string) : undefined,
      fechaFin: req.query.fechaFin ? new Date(req.query.fechaFin as string) : undefined,
    };
    
    const csvStream = ExportService.exportMovementsCSVStream(filter);
    
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="movimientos-export-${Date.now()}.csv"`
    );
    
    csvStream.pipe(res);

    csvStream.on("end", () => {
      const duration = Date.now() - start;
      metricsRegistry.recordCsvDuration(duration);
    });
  }),

  /**
   * Fetches operational sync metrics with indexing optimization.
   */
  getSyncMetrics: catchAsync(async (req: Request, res: Response) => {
    const metrics = await SyncService.getSyncMetrics();
    successResponse(res, metrics, 200);
  }),
};
