import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

interface LiquidationItem {
  nombre: string;
  cantidadUnidades: number;
  unidadesPorFardo: number;
  precioFardo: number;
  subtotal: number;
}

interface LiquidationData {
  tallerNombre: string;
  periodoNombre: string;
  fechaPago: string;
  montoPago: number;
  items: LiquidationItem[];
  totalValorizado: number;
  totalPagadoAnterior: number;
  saldoPendienteAntes: number;
  saldoFinal: number;
}

/**
 * Generates an industrial-style high-contrast PDF liquidation for a workshop payment.
 */
export function generateLiquidationPdf(data: LiquidationData, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Ensure directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const writeStream = fs.createWriteStream(outputPath);

      doc.pipe(writeStream);

      // --- Colors ---
      const primaryColor = "#0f172a"; // Slate 900
      const secondaryColor = "#334155"; // Slate 700
      const textColor = "#1e293b"; // Slate 800
      const lightGray = "#f1f5f9"; // Slate 100
      const darkGray = "#475569"; // Slate 600

      // --- Title / Header ---
      doc.rect(0, 0, 595, 20).fill(primaryColor); // Top dark bar

      doc.fillColor(primaryColor)
         .font("Helvetica-Bold")
         .fontSize(22)
         .text("TEXTIL MARÍA LUISA SRL", 50, 45);

      doc.fontSize(8)
         .font("Helvetica")
         .fillColor(darkGray)
         .text("PLANTA INDUSTRIAL - SISTEMA ERP", 50, 68);

      doc.fontSize(14)
         .font("Helvetica-Bold")
         .fillColor(secondaryColor)
         .text("LIQUIDACIÓN DE TALLER", 350, 47, { align: "right" });

      // Horizontal separator line
      doc.moveTo(50, 85).lineTo(545, 85).strokeColor(primaryColor).lineWidth(1.5).stroke();

      // --- Metadata Grid ---
      doc.fontSize(10).fillColor(textColor);
      
      // Left Column
      doc.font("Helvetica-Bold").text("TALLER:", 50, 105)
         .font("Helvetica").text(data.tallerNombre.toUpperCase(), 110, 105);

      doc.font("Helvetica-Bold").text("PERÍODO:", 50, 122)
         .font("Helvetica").text(data.periodoNombre.toUpperCase(), 110, 122);

      // Right Column
      doc.font("Helvetica-Bold").text("FECHA PAGO:", 350, 105)
         .font("Helvetica").text(data.fechaPago, 440, 105);

      doc.font("Helvetica-Bold").text("PAGO REGISTRADO:", 350, 122)
         .font("Helvetica").text(`$ ${data.montoPago.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 480, 122);

      // Separator
      doc.moveTo(50, 145).lineTo(545, 145).strokeColor("#cbd5e1").lineWidth(1).stroke();

      // --- Confection Items Table Header ---
      doc.fontSize(11)
         .font("Helvetica-Bold")
         .fillColor(primaryColor)
         .text("DETALLE DE PRODUCCIÓN RECIBIDA (CONFECCIÓN)", 50, 160);

      const tableTop = 180;
      doc.rect(50, tableTop, 495, 20).fill(primaryColor);

      doc.fillColor("#ffffff")
         .fontSize(9)
         .font("Helvetica-Bold")
         .text("PRODUCTO", 55, tableTop + 6)
         .text("UNIDADES", 240, tableTop + 6, { width: 60, align: "right" })
         .text("U. x FARDO", 310, tableTop + 6, { width: 60, align: "right" })
         .text("FARDOS", 380, tableTop + 6, { width: 60, align: "right" })
         .text("VALOR FARDO", 445, tableTop + 6, { width: 70, align: "right" })
         .text("SUBTOTAL", 515, tableTop + 6, { width: 80, align: "right" });

      // --- Table Row Rendering ---
      let currentY = tableTop + 20;
      doc.fillColor(textColor).font("Helvetica");

      data.items.forEach((item, index) => {
        // Alternating row background
        if (index % 2 === 0) {
          doc.rect(50, currentY, 495, 20).fill(lightGray);
        }
        
        doc.fillColor(textColor);
        const fardosCount = item.cantidadUnidades / (item.unidadesPorFardo || 60);

        doc.text(item.nombre.toUpperCase(), 55, currentY + 6)
           .text(item.cantidadUnidades.toLocaleString(), 240, currentY + 6, { width: 60, align: "right" })
           .text(item.unidadesPorFardo.toString(), 310, currentY + 6, { width: 60, align: "right" })
           .text(fardosCount.toFixed(2), 380, currentY + 6, { width: 60, align: "right" })
           .text(`$ ${item.precioFardo.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 445, currentY + 6, { width: 70, align: "right" })
           .text(`$ ${item.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 515, currentY + 6, { width: 80, align: "right" });

        currentY += 20;
      });

      // Bottom line of table
      doc.moveTo(50, currentY).lineTo(545, currentY).strokeColor("#cbd5e1").lineWidth(1).stroke();

      // --- Totals Section ---
      currentY += 15;
      const totalsX = 350;

      doc.fontSize(10).fillColor(textColor);
      
      // Total Confeccionado
      doc.font("Helvetica-Bold").text("TOTAL CONFECCIÓN:", totalsX, currentY)
         .font("Helvetica-Bold").text(`$ ${data.totalValorizado.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 480, currentY, { align: "right" });
      currentY += 16;

      // Pagado Histórico
      doc.font("Helvetica").text("COBROS ANTERIORES:", totalsX, currentY)
         .text(`$ ${data.totalPagadoAnterior.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 480, currentY, { align: "right" });
      currentY += 16;

      // Saldo anterior
      doc.font("Helvetica").text("SALDO ANTES DEL PAGO:", totalsX, currentY)
         .text(`$ ${data.saldoPendienteAntes.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 480, currentY, { align: "right" });
      currentY += 16;

      // Pago Actual (montoPago)
      doc.font("Helvetica-Bold").fillColor("#1e40af").text("PAGO ACTUAL (-) :", totalsX, currentY)
         .text(`$ ${data.montoPago.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 480, currentY, { align: "right" });
      currentY += 20;

      // Saldo Final
      doc.rect(340, currentY - 4, 205, 24).fill(primaryColor);
      doc.fillColor("#ffffff")
         .font("Helvetica-Bold")
         .fontSize(11)
         .text("SALDO PENDIENTE:", totalsX, currentY + 2)
         .text(`$ ${data.saldoFinal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 480, currentY + 2, { align: "right" });

      // --- Signatures / Footer ---
      const footerY = 740;
      doc.moveTo(50, footerY).lineTo(230, footerY).strokeColor(darkGray).lineWidth(1).stroke();
      doc.moveTo(365, footerY).lineTo(545, footerY).stroke();

      doc.fontSize(8)
         .fillColor(darkGray)
         .font("Helvetica")
         .text("FIRMA RESPONSABLE FÁBRICA", 50, footerY + 8, { width: 180, align: "center" })
         .text("FIRMA RESPONSABLE TALLER", 365, footerY + 8, { width: 180, align: "center" });

      doc.fontSize(7)
         .text("Documento de validez interna de Textil María Luisa SRL. Reservados todos los derechos.", 50, 785, { width: 495, align: "center" });

      doc.end();

      writeStream.on("finish", () => {
        resolve();
      });

      writeStream.on("error", (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}
