const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const helmet = require("helmet");
require("dotenv").config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("trust proxy", true);
app.disable("x-powered-by");
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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ mensaje: "Email inválido" });
    }

    const sanitize = (text) =>
      String(text).replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const itemsSanitizados = items
      .slice(0, 100)
      .map((item) => ({
        producto: sanitize(item.producto),
        unidad: sanitize(item.unidad),
        cantidad: parseInt(item.cantidad) || 1,
        presentacion: sanitize(item.presentacion || ""),
        unidadesPorFardo: parseInt(item.unidadesPorFardo) || 0,
      }))
      .filter((item) => item.cantidad > 0);

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
      from: process.env.EMAIL_USER,
      to: "textilmarialuisa.srl@gmail.com",
      subject: "Nueva Cotización - Textil María Luisa",
      html: `
    <div style="font-family:Arial;padding:20px;">
      <h2 style="color:#000;">Nueva solicitud de cotización</h2>

      <p><strong>Fecha:</strong> ${fecha}</p>

      <hr/>

      <p><strong>Razón Social:</strong> ${sanitize(nombre)}</p>
      <p><strong>Email:</strong> ${sanitize(email)}</p>
      <p><strong>Provincia:</strong> ${sanitize(provincia)}</p>
      <p><strong>Localidad:</strong> ${sanitize(localidad)}</p>
      <p><strong>IP cliente:</strong> ${sanitize(ipCliente || "N/D")}</p>

      <p><strong>Mensaje:</strong> ${
        mensaje ? sanitize(mensaje) : "Sin mensaje adicional"
      }</p>

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

    await transporter.sendMail(mailOptions);

    res.json({ mensaje: "Cotización enviada correctamente ✅" });
  } catch (error) {
    console.error("Error enviando email:", error);
    res.status(500).json({ mensaje: "Error al enviar la cotización" });
  }
});

// =========================
// MAIL CONFIG
// =========================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

const rateLimit = require("express-rate-limit");

const cotizacionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  message: "Demasiadas solicitudes. Intente nuevamente más tarde."
});

app.use("/api/cotizacion", cotizacionLimiter);