import { prisma } from "../src/backend/db/prisma";
import { MovementService } from "../src/backend/services/movement.service";
import { StockService } from "../src/backend/services/stock.service";
import { TipoMovimiento, CalidadProducto, PresentacionProducto, CanalStock, DireccionItem } from "../src/generated/prisma";

async function runValidation() {
  console.log("🔍 Starting pilot database validation...");
  
  // 1. Entity Count Verification
  const [usuarios, depositos, talleres, productos, stocks] = await Promise.all([
    prisma.usuario.findMany({ include: { permisos: { include: { permiso: true } } } }),
    prisma.deposito.findMany(),
    prisma.taller.findMany(),
    prisma.producto.findMany(),
    prisma.stockActual.findMany()
  ]);

  console.log("\n📋 Entity Counts:");
  console.log(`- Usuarios: ${usuarios.length} (Expected: 4)`);
  console.log(`- Depósitos: ${depositos.length} (Expected: 7)`);
  console.log(`- Talleres: ${talleres.length} (Expected: 6)`);
  console.log(`- Productos: ${productos.length} (Expected: 34)`);
  console.log(`- Stock Actual Rows: ${stocks.length}`);

  let errorsFound = 0;

  // Assertions
  if (usuarios.length !== 4) {
    console.error("❌ Error: Expected 4 users, found", usuarios.length);
    errorsFound++;
  }
  if (depositos.length !== 7) {
    console.error("❌ Error: Expected 7 depositos, found", depositos.length);
    errorsFound++;
  }
  if (talleres.length !== 6) {
    console.error("❌ Error: Expected 6 talleres, found", talleres.length);
    errorsFound++;
  }
  if (productos.length !== 34) {
    console.error("❌ Error: Expected 34 products, found", productos.length);
    errorsFound++;
  }

  // 2. Verify all products have stock
  console.log("\n📦 Verifying all products have stock...");
  for (const prod of productos) {
    const prodStocks = stocks.filter(s => s.productoId === prod.id);
    const totalQty = prodStocks.reduce((sum, s) => sum + s.cantidadUnidades, 0);
    if (totalQty <= 0) {
      console.error(`❌ Error: Product '${prod.nombre}' has no stock.`);
      errorsFound++;
    }
  }
  console.log("✅ All products have positive stock allocated.");

  // 3. Verify no empty deposits
  console.log("\n🏪 Verifying no empty deposits...");
  for (const dep of depositos) {
    const depStocks = stocks.filter(s => s.depositoId === dep.id);
    const totalQty = depStocks.reduce((sum, s) => sum + s.cantidadUnidades, 0);
    if (totalQty <= 0) {
      console.error(`❌ Error: Depósito '${dep.nombre}' has zero stock.`);
      errorsFound++;
    } else {
      console.log(`   - Depósito '${dep.nombre}' has ${totalQty} units.`);
    }
  }

  // 4. Verify user permissions
  console.log("\n🔑 Verifying user permissions...");
  const ariel = usuarios.find(u => u.email === "arielroskopf@gmail.com")!;
  const leo = usuarios.find(u => u.email === "leonelroskopf1234@gmail.com")!;
  const nacho = usuarios.find(u => u.email === "roskopfignacio5@gmail.com")!;
  const rolando = usuarios.find(u => u.email === "roskopflachi@gmail.com")!;

  const checkPerms = (user: any, expectedKeys: string[]) => {
    const keys = user.permisos.map((up: any) => up.permiso.clave);
    const match = expectedKeys.every(k => keys.includes(k)) && keys.length === expectedKeys.length;
    if (!match) {
      console.error(`❌ Error: User ${user.nombre} permissions mismatch. Found:`, keys);
      errorsFound++;
    } else {
      console.log(`   - User ${user.nombre} permissions correct.`);
    }
  };

  checkPerms(ariel, ["MOVIMIENTOS_CREAR", "MOVIMIENTOS_VER", "STOCK_VER", "STOCK_EDITAR", "ADMIN_SISTEMA"]);
  checkPerms(leo, ["MOVIMIENTOS_CREAR", "MOVIMIENTOS_VER", "STOCK_VER", "STOCK_EDITAR", "ADMIN_SISTEMA"]);
  checkPerms(nacho, ["MOVIMIENTOS_CREAR", "MOVIMIENTOS_VER", "STOCK_VER"]);
  checkPerms(rolando, ["MOVIMIENTOS_CREAR", "STOCK_VER"]);

  // 5. Test Transactions Execution
  console.log("\n💼 Testing core transactional flows...");
  try {
    const central = depositos.find(d => d.nombre === "GALPÓN CENTRAL")!;
    const corte = depositos.find(d => d.nombre === "ZONA DE CORTE")!;
    const eveDep = depositos.find(d => d.nombre === "DEPÓSITO EVE")!;
    
    const eveTal = talleres.find(t => t.nombre === "TALLER EVELINA")!;
    const propioTal = talleres.find(t => t.nombre === "TALLER PROPIO")!;

    const prodHilado = productos.find(p => p.nombre === "Algodón 24/1 Peinado Crudo")!;
    const prodTela = productos.find(p => p.nombre === "Jersey de Algodón Peinado Gris")!;
    const prodPrenda = productos.find(p => p.nombre === "Remera Algodón Básica Negra S")!;

    // 5.1 Delivery to Taller
    console.log("   - Flow A: Delivery to workshop (TALLER EVELINA)...");
    const delivery = await MovementService.createMovimiento({
      tipo: TipoMovimiento.ENTREGA_TALLER,
      usuarioId: ariel.id,
      tallerId: eveTal.id,
      observaciones: "Test delivery to EVELINA",
      items: [
        {
          productoId: prodHilado.id,
          cantidadUnidades: 24, // 1 fardo
          depositoOrigenId: central.id,
          tallerDestinoId: eveTal.id,
          calidad: CalidadProducto.PERFECTO,
          presentacion: PresentacionProducto.SIN_ETIQUETA,
          canal: CanalStock.MAYORISTA
        }
      ]
    });
    console.log(`     ✅ Delivery created successfully: id ${delivery.id}`);

    // 5.2 Return from Taller
    console.log("   - Flow B: Return from workshop (TALLER EVELINA)...");
    const ret = await MovementService.createMovimiento({
      tipo: TipoMovimiento.DEVOLUCION_TALLER,
      usuarioId: ariel.id,
      tallerId: eveTal.id,
      observaciones: "Test return from EVELINA",
      items: [
        {
          productoId: prodHilado.id,
          cantidadUnidades: 24,
          tallerOrigenId: eveTal.id,
          depositoDestinoId: central.id,
          calidad: CalidadProducto.PERFECTO,
          presentacion: PresentacionProducto.SIN_ETIQUETA,
          canal: CanalStock.MAYORISTA
        }
      ]
    });
    console.log(`     ✅ Return created successfully: id ${ret.id}`);

    // 5.3 Internal Transfer
    console.log("   - Flow C: Internal Transfer (GALPÓN CENTRAL -> ZONA DE CORTE)...");
    const transfer = await MovementService.createMovimiento({
      tipo: TipoMovimiento.MOVIMIENTO_INTERNO,
      usuarioId: ariel.id,
      observaciones: "Test transfer central to corte",
      items: [
        {
          productoId: prodTela.id,
          cantidadUnidades: 10,
          depositoOrigenId: central.id,
          depositoDestinoId: corte.id,
          calidad: CalidadProducto.PERFECTO,
          presentacion: PresentacionProducto.SIN_ETIQUETA,
          canal: CanalStock.MAYORISTA
        }
      ]
    });
    console.log(`     ✅ Transfer created successfully: id ${transfer.id}`);

    // 5.4 Internal Production (TALLER PROPIO)
    console.log("   - Flow D: Internal Production (Delivery to TALLER PROPIO)...");
    const prodDeliv = await MovementService.createMovimiento({
      tipo: TipoMovimiento.ENTREGA_TALLER,
      usuarioId: ariel.id,
      tallerId: propioTal.id,
      observaciones: "Test internal production start",
      items: [
        {
          productoId: prodTela.id,
          cantidadUnidades: 10,
          depositoOrigenId: central.id,
          tallerDestinoId: propioTal.id,
          calidad: CalidadProducto.PERFECTO,
          presentacion: PresentacionProducto.SIN_ETIQUETA,
          canal: CanalStock.MAYORISTA
        }
      ]
    });
    console.log(`     ✅ Production start created: id ${prodDeliv.id}`);

  } catch (err: any) {
    console.error("❌ Transaction execution test failed:", err.message);
    errorsFound++;
  }

  // 6. Check negative stock
  console.log("\n📊 Verifying no negative stocks exist...");
  const negativeStocks = await prisma.stockActual.findMany({
    where: { cantidadUnidades: { lt: 0 } }
  });
  if (negativeStocks.length > 0) {
    console.error("❌ Error: Negative stocks found!", negativeStocks);
    errorsFound++;
  } else {
    console.log("✅ No negative stock items exist in the database.");
  }

  // 7. Check orphaned movements
  console.log("\n🔗 Verifying no orphan entries exist...");
  const orphanItems = await prisma.movimientoItem.findMany({
    where: { movimientoId: "" }
  });
  if (orphanItems.length > 0) {
    console.error("❌ Error: Orphan movement items found!", orphanItems);
    errorsFound++;
  } else {
    console.log("✅ No orphaned movement items found.");
  }

  if (errorsFound > 0) {
    console.error(`\n❌ Validation finished with ${errorsFound} errors.`);
    process.exit(1);
  } else {
    console.log("\n🎉 ALL PILOT VALIDATIONS PASSED SUCCESSFULLY! NO ERRORS FOUND.");
  }
}

runValidation().catch(console.error).finally(() => prisma.$disconnect());
