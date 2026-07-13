import { prisma } from "../db/prisma";
import fs from "fs";
import path from "path";

async function runBackup() {
  console.log("🚀 Starting database logical backup...");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  
  // Create local backups folder if it doesn't exist
  const localDir = path.join(__dirname, "../../../backups");
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  
  const externalDir = process.env.BACKUP_EXTERNAL_DIR || "C:/Users/pc22/.gemini/antigravity/scratch/external_backups";
  if (!fs.existsSync(externalDir)) {
    fs.mkdirSync(externalDir, { recursive: true });
  }

  try {
    const [
      configuraciones,
      productos,
      depositos,
      talleres,
      usuarios,
      permisos,
      usuarioPermisos,
      movimientos,
      movimientoItems,
      movimientoInsumos,
      stocksActuales,
      auditorias,
      alertasStock
    ] = await Promise.all([
      prisma.configuracion.findMany(),
      prisma.producto.findMany(),
      prisma.deposito.findMany(),
      prisma.taller.findMany(),
      prisma.usuario.findMany(),
      prisma.permiso.findMany(),
      prisma.usuarioPermiso.findMany(),
      prisma.movimiento.findMany(),
      prisma.movimientoItem.findMany(),
      prisma.movimientoInsumo.findMany(),
      prisma.stockActual.findMany(),
      prisma.auditoria.findMany(),
      prisma.alertaStock.findMany()
    ]);

    const backupData = {
      metadata: {
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        counts: {
          configuraciones: configuraciones.length,
          productos: productos.length,
          depositos: depositos.length,
          talleres: talleres.length,
          usuarios: usuarios.length,
          permisos: permisos.length,
          usuarioPermisos: usuarioPermisos.length,
          movimientos: movimientos.length,
          movimientoItems: movimientoItems.length,
          movimientoInsumos: movimientoInsumos.length,
          stocksActuales: stocksActuales.length,
          auditorias: auditorias.length,
          alertasStock: alertasStock.length
        }
      },
      data: {
        configuraciones,
        productos,
        depositos,
        talleres,
        usuarios,
        permisos,
        usuarioPermisos,
        movimientos,
        movimientoItems,
        movimientoInsumos,
        stocksActuales,
        auditorias,
        alertasStock
      }
    };

    const fileName = `backup-${timestamp}.json`;
    const localPath = path.join(localDir, fileName);
    const externalPath = path.join(externalDir, fileName);

    const serialized = JSON.stringify(backupData, null, 2);
    fs.writeFileSync(localPath, serialized, "utf8");
    console.log(`✅ Local backup saved to: ${localPath} (${serialized.length} bytes)`);

    // Copy to external directory
    fs.writeFileSync(externalPath, serialized, "utf8");
    console.log(`✅ External backup copied to: ${externalPath}`);

    console.log("📊 Backup Summary:");
    console.table(backupData.metadata.counts);

  } catch (err) {
    console.error("❌ Backup failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runBackup();
