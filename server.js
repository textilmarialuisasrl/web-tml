const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { sendQuotationEmail } = require("./services/mailService");
require("dotenv").config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.set("trust proxy", true);
app.disable("x-powered-by");

const cotizacionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { mensaje: "Demasiadas solicitudes. Intente nuevamente más tarde." },
});

app.use("/api/cotizacion", cotizacionLimiter);

function sanitizeText(input, maxLength = 120) {
  const value = String(input ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);

  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// =========================
// PRODUCTOS
// =========================
app.get("/api/productos", (req, res) => {
  const filePath = path.resolve(__dirname, "data/productos.json");

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error leyendo productos:", err);
      return res.status(500).json({ error: "Error al obtener productos" });
    }

    try {
      const productos = JSON.parse(data);
      res.json(productos);
    } catch (parseError) {
      console.error("Error parseando JSON:", parseError);
      res.status(500).json({ error: "Error en formato JSON" });
    }
  });
});

// =========================
// COTIZACIÓN
// =========================
app.post("/api/cotizacion", async (req, res) => {
  try {
    const { nombre, email, mensaje, provincia, localidad, items } = req.body;
    const fecha = new Date().toLocaleString("es-AR");
    const ipCliente = req.ip;

    if (
      !nombre ||
      !email ||
      !provincia ||
      !localidad ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({ mensaje: "Datos incompletos" });
    }

    if (items.length > 100) {
      return res.status(400).json({ mensaje: "Demasiados ítems en la solicitud" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ mensaje: "Email inválido" });
    }

    const nombreSanitizado = sanitizeText(nombre, 80);
    const emailSanitizado = sanitizeText(email, 120);
    const provinciaSanitizada = sanitizeText(provincia, 60);
    const localidadSanitizada = sanitizeText(localidad, 60);
    const mensajeSanitizado = mensaje
      ? sanitizeText(mensaje, 1000)
      : "Sin mensaje adicional";

    if (!nombreSanitizado || !provinciaSanitizada || !localidadSanitizada) {
      return res.status(400).json({ mensaje: "Datos incompletos" });
    }

    const unidadesPermitidas = new Set(["Unidad", "Docena", "Fardo"]);

    const itemsSanitizados = items
      .map((item) => ({
        producto: sanitizeText(item.producto, 120),
        unidad: sanitizeText(item.unidad, 20),
        cantidad: parseInt(item.cantidad, 10) || 1,
        presentacion: sanitizeText(item.presentacion || "", 140),
        unidadesPorFardo: parseInt(item.unidadesPorFardo, 10) || 0,
      }))
      .filter(
        (item) =>
          item.producto &&
          unidadesPermitidas.has(item.unidad) &&
          item.cantidad > 0 &&
          item.cantidad <= 99999
      );

    if (!itemsSanitizados.length) {
      return res.status(400).json({ mensaje: "No hay ítems válidos en el pedido" });
    }

    const htmlProductos = itemsSanitizados
      .map(
        (item) => `
          <tr>
            <td style="padding:8px;border:1px solid #ddd;">${item.producto}</td>
            <td style="padding:8px;border:1px solid #ddd;">${item.unidad}</td>
            <td style="padding:8px;border:1px solid #ddd;">${item.cantidad}</td>
          </tr>
        `
      )
      .join("");

    let totalGeneral = 0;
    itemsSanitizados.forEach((item) => {
      if (item.unidad === "Unidad") {
        totalGeneral += item.cantidad;
      } else if (item.unidad === "Docena") {
        totalGeneral += item.cantidad * 12;
      } else if (item.unidad === "Fardo") {
        totalGeneral += item.cantidad * item.unidadesPorFardo;
      }
    });

    const mailOptions = {
      subject: "Nueva Cotización - Textil María Luisa",
      html: `
    <div style="font-family:Arial;padding:20px;">
      <h2 style="color:#000;">Nueva solicitud de cotización</h2>

      <p><strong>Fecha:</strong> ${fecha}</p>

      <hr/>

      <p><strong>Razón Social:</strong> ${nombreSanitizado}</p>
      <p><strong>Email:</strong> ${emailSanitizado}</p>
      <p><strong>Provincia:</strong> ${provinciaSanitizada}</p>
      <p><strong>Localidad:</strong> ${localidadSanitizada}</p>
      <p><strong>IP cliente:</strong> ${sanitizeText(ipCliente || "N/D", 80)}</p>

      <p><strong>Mensaje:</strong> ${mensajeSanitizado}</p>

      <h3>Productos solicitados</h3>

      <table style="border-collapse:collapse;width:100%;margin-top:10px;">
        <thead>
          <tr style="background:#f2f2f2;">
            <th style="padding:8px;border:1px solid #ddd;">Producto</th>
            <th style="padding:8px;border:1px solid #ddd;">Unidad</th>
            <th style="padding:8px;border:1px solid #ddd;">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          ${htmlProductos}
        </tbody>
      </table>

      <h3 style="margin-top:20px;">Total general: ${totalGeneral} unidades</h3>

      <p style="margin-top:30px;font-size:12px;color:#666;">
        Sistema automático de cotizaciones - Textil María Luisa
      </p>
    </div>
  `,
    };

    await sendQuotationEmail(mailOptions);
    res.json({ mensaje: "Cotización enviada correctamente ✅" });
  } catch (error) {
    console.error("Error enviando email:", error);
    res
      .status(500)
      .json({ mensaje: "No se pudo enviar la cotización en este momento" });
  }
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});