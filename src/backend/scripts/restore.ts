import { prisma } from "../db/prisma";
import fs from "fs";
import path from "path";

async function runRestore() {
  const backupFile = process.argv[2];
  if (!backupFile) {
    console.error("❌ Error: Debe especificar la ruta al archivo de backup. Uso: npm run db:restore <ruta_archivo>");
    process.exit(1);
  }

  const filePath = path.resolve(backupFile);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Error: El archivo de backup no existe en la ruta: ${filePath}`);
    process.exit(1);
  }

  console.log(`🚀 Starting database restoration from: ${filePath}...`);

  try {
    const rawData = fs.readFileSync(filePath, "utf8");
    const backup = JSON.parse(rawData);

    if (!backup.metadata || !backup.data) {
      throw new Error("Formato de backup inválido. Falta metadata o data.");
    }

    console.log("🧹 Cleaning existing database records in reverse dependency order...");
    
    // Deletion transaction
    await prisma.$transaction([
      prisma.alertaStock.deleteMany(),
      prisma.auditoria.deleteMany(),
      prisma.stockActual.deleteMany(),
      prisma.movimientoInsumo.deleteMany(),
      prisma.movimientoItem.deleteMany(),
      prisma.movimiento.deleteMany(),
      prisma.usuarioPermiso.deleteMany(),
      prisma.permiso.deleteMany(),
      prisma.usuario.deleteMany(),
      prisma.taller.deleteMany(),
      prisma.deposito.deleteMany(),
      prisma.producto.deleteMany(),
      prisma.configuracion.deleteMany(),
    ]);
    console.log("✅ Database cleaned successfully.");

    const {
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
    } = backup.data;

    console.log("📥 Restoring records in dependency order...");

    // Insert each table
    if (configuraciones?.length) {
      await prisma.configuracion.createMany({ data: configuraciones });
      console.log(`   - Restored ${configuraciones.length} configuraciones`);
    }
    if (productos?.length) {
      await prisma.producto.createMany({ data: productos });
      console.log(`   - Restored ${productos.length} productos`);
    }
    if (depositos?.length) {
      await prisma.deposito.createMany({ data: depositos });
      console.log(`   - Restored ${depositos.length} depositos`);
    }
    if (talleres?.length) {
      await prisma.taller.createMany({ data: talleres });
      console.log(`   - Restored ${talleres.length} talleres`);
    }
    if (usuarios?.length) {
      await prisma.usuario.createMany({ data: usuarios });
      console.log(`   - Restored ${usuarios.length} usuarios`);
    }
    if (permisos?.length) {
      await prisma.permiso.createMany({ data: permisos });
      console.log(`   - Restored ${permisos.length} permisos`);
    }
    if (usuarioPermisos?.length) {
      await prisma.usuarioPermiso.createMany({ data: usuarioPermisos });
      console.log(`   - Restored ${usuarioPermisos.length} usuarioPermisos`);
    }
    if (movimientos?.length) {
      // prisma createMany doesn't execute autoincrement sequence sync, but we specify direct IDs
      await prisma.movimiento.createMany({ data: movimientos });
      console.log(`   - Restored ${movimientos.length} movimientos`);
    }
    if (movimientoItems?.length) {
      await prisma.movimientoItem.createMany({ data: movimientoItems });
      console.log(`   - Restored ${movimientoItems.length} movimientoItems`);
    }
    if (movimientoInsumos?.length) {
      await prisma.movimientoInsumo.createMany({ data: movimientoInsumos });
      console.log(`   - Restored ${movimientoInsumos.length} movimientoInsumos`);
    }
    if (stocksActuales?.length) {
      await prisma.stockActual.createMany({ data: stocksActuales });
      console.log(`   - Restored ${stocksActuales.length} stocksActuales`);
    }
    if (auditorias?.length) {
      await prisma.auditoria.createMany({ data: auditorias });
      console.log(`   - Restored ${auditorias.length} auditorias`);
    }
    if (alertasStock?.length) {
      await prisma.alertaStock.createMany({ data: alertasStock });
      console.log(`   - Restored ${alertasStock.length} alertasStock`);
    }

    console.log("🎉 Database restoration completed successfully!");

  } catch (err) {
    console.error("❌ Restoration failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runRestore();
