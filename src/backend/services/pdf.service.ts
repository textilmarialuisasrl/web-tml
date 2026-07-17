import PDFDocument from "pdfkit";
import { MovementRepository } from "../repositories/movement.repository";
import { AppError } from "../utils/errors";
import { eventBus, DOMAIN_EVENTS } from "../events/domain.events";

export const PdfService = {
  /**
   * Generates a PDFKit.PDFDocument in streaming mode.
   * Does NOT block response streams and is fully decoupled from Express HTTP.
   */
  async createMovementPdfDocument(
    movementId: string,
    layout: "A4" | "TICKET_80MM" = "A4"
  ): Promise<PDFKit.PDFDocument> {
    const movement = await MovementRepository.findById(movementId);
    if (!movement) {
      throw new AppError({
        message: "El movimiento especificado para el PDF no existe",
        statusCode: 404,
        code: "MOVEMENT_NOT_FOUND",
      });
    }

    const isTicket = layout === "TICKET_80MM";
    // Standard 80mm roll printer width is ~226 points. Roll height can be fixed to 800 or dynamic.
    const options = isTicket
      ? { size: [226, 800] as [number, number], margin: 10 }
      : { size: "A4" as any, margin: 40 };

    const doc = new PDFDocument(options);

    // Call builder steps modularly
    this.buildHeader(doc, movement, layout);
    this.buildItemsTable(doc, movement, layout);
    this.buildFooter(doc, movement, layout);

    // Finalize the PDF stream
    doc.end();

    // Publish the PDF Generated domain event asynchronously
    eventBus.emitSafe(DOMAIN_EVENTS.PDF_GENERATED, { movementId, layout });

    return doc;
  },

  buildHeader(doc: PDFKit.PDFDocument, movement: any, layout: "A4" | "TICKET_80MM") {
    const isTicket = layout === "TICKET_80MM";

    if (isTicket) {
      doc.fontSize(10).font("Helvetica-Bold").text("TEXTIL MARIA LUISA SRL", { align: "center" });
      doc.fontSize(7).font("Helvetica").text("Comprobante de Operación", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(7).text(`Comprobante: TML-${String(movement.numeroSecuencial).padStart(8, "0")}`);
      doc.text(`Fecha: ${new Date(movement.createdAt).toLocaleDateString()}`);
      doc.text(`Operador: ${movement.usuarioNombreSnapshot}`);
      if (movement.taller) {
        doc.text(`Taller: ${movement.taller.nombre}`);
      }
      doc.text(`Tipo: ${movement.tipo}`);
      doc.text(`Estado: ${movement.estado}`);
      doc.moveDown(0.5);
      doc.moveTo(10, doc.y).lineTo(216, doc.y).stroke();
      doc.moveDown(0.5);
    } else {
      doc.fontSize(18).font("Helvetica-Bold").text("TEXTIL MARIA LUISA SRL", { align: "left" });
      doc.fontSize(9).font("Helvetica").text("Soporte Administrativo Operativo", { align: "left" });
      doc.moveDown();
      
      doc.fontSize(11).font("Helvetica-Bold").text(`REMITO DE MOVIMIENTO: TML-${String(movement.numeroSecuencial).padStart(8, "0")}`, { align: "right" });
      doc.fontSize(9).font("Helvetica").text(`Fecha Registro: ${new Date(movement.createdAt).toLocaleString()}`, { align: "right" });
      doc.text(`Registrado Por: ${movement.usuarioNombreSnapshot}`, { align: "right" });
      doc.moveDown();

      doc.fontSize(11).font("Helvetica-Bold").text("Resumen de Operación:");
      doc.fontSize(9).font("Helvetica").text(`Tipo: ${movement.tipo}`);
      doc.text(`Estado: ${movement.estado}`);
      if (movement.taller) {
        doc.text(`Taller: ${movement.taller.nombre}`);
      }
      if (movement.observaciones) {
        doc.text(`Observaciones: ${movement.observaciones}`);
      }
      doc.moveDown();
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown();
    }
  },

  buildItemsTable(doc: PDFKit.PDFDocument, movement: any, layout: "A4" | "TICKET_80MM") {
    const isTicket = layout === "TICKET_80MM";

    if (isTicket) {
      doc.fontSize(7).font("Helvetica-Bold");
      doc.text("Producto", 10, doc.y, { width: 90, continued: true });
      doc.text("Cant", 110, doc.y, { width: 30, continued: true });
      doc.text("Dir", 145, doc.y, { width: 25, continued: true });
      doc.text("Detalle", 175, doc.y, { width: 40 });
      doc.moveDown(0.3);
      doc.moveTo(10, doc.y).lineTo(216, doc.y).stroke();
      doc.moveDown(0.3);

      doc.font("Helvetica").fontSize(6.5);
      for (const item of movement.items) {
        const prod = item.productoNombreSnapshot.substring(0, 16);
        const qty = String(item.cantidadUnidades);
        const dir = item.direccion;
        const det = `${item.calidad.charAt(0)}/${item.presentacion.charAt(0)}`;

        doc.text(prod, 10, doc.y, { width: 90, continued: true });
        doc.text(qty, 110, doc.y, { width: 30, continued: true });
        doc.text(dir, 145, doc.y, { width: 25, continued: true });
        doc.text(det, 175, doc.y, { width: 40 });
        doc.moveDown(0.2);
      }
      doc.moveDown(0.5);
    } else {
      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("Producto", 40, doc.y, { width: 170, continued: true });
      doc.text("Origen", 220, doc.y, { width: 90, continued: true });
      doc.text("Destino", 320, doc.y, { width: 90, continued: true });
      doc.text("Dirección", 420, doc.y, { width: 50, continued: true });
      doc.text("Calidad/Pres", 480, doc.y, { width: 70, continued: true });
      doc.text("Unidades", 515, doc.y, { width: 40, align: "right" });
      doc.moveDown(0.5);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);

      doc.font("Helvetica").fontSize(8.5);
      for (const item of movement.items) {
        const orig = item.depositoOrigen?.nombre || item.tallerOrigen?.nombre || "N/A";
        const dest = item.depositoDestino?.nombre || item.tallerDestino?.nombre || "N/A";
        const details = `${item.calidad}/${item.presentacion}`;
        
        doc.text(item.productoNombreSnapshot, 40, doc.y, { width: 170, continued: true });
        doc.text(orig, 220, doc.y, { width: 90, continued: true });
        doc.text(dest, 320, doc.y, { width: 90, continued: true });
        doc.text(item.direccion, 420, doc.y, { width: 50, continued: true });
        doc.text(details, 480, doc.y, { width: 70, continued: true });
        doc.text(String(item.cantidadUnidades), 515, doc.y, { width: 40, align: "right" });
        doc.moveDown();
      }
      doc.moveDown();
    }
  },

  buildFooter(doc: PDFKit.PDFDocument, movement: any, layout: "A4" | "TICKET_80MM") {
    const isTicket = layout === "TICKET_80MM";

    if (isTicket) {
      doc.moveTo(10, doc.y).lineTo(216, doc.y).stroke();
      doc.moveDown(0.5);
      doc.fontSize(7).font("Helvetica-Bold").text("Documento Interno de Control", { align: "center" });
      doc.fontSize(6).font("Helvetica").text("Textil Maria Luisa ERP", { align: "center" });
    } else {
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown();
      doc.fontSize(8).font("Helvetica").text("Este remito certifica la trazabilidad física de los productos registrados en el ERP.", { align: "center" });
      doc.text("Textil María Luisa SRL - Documentación Operativa de Distribución.", { align: "center" });
    }
  },
};
