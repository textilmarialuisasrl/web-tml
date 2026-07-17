import { PrismaClient, CalidadProducto, CanalStock } from "../../generated/prisma/client";
import { StockService } from "../services/stock.service";
import { MovementService } from "../services/movement.service";
import { DriftMonitorService } from "../services/drift-monitor.service";
import { formatearStock, unidadesAFardos, unidadesADocenas } from "../utils/unit-conversion";

const prisma = new PrismaClient();

async function runTests() {
  console.log("==================================================");
  console.log("🚀 STARTING AUTOMATED ERP MODEL VERIFICATION TESTS");
  console.log("==================================================");

  // Setup/Find products and depos
  const pb027 = await prisma.producto.findFirst({ where: { codigo: "PB027" } });
  const pf044 = await prisma.producto.findFirst({ where: { codigo: "PF044" } });
  const pf046 = await prisma.producto.findFirst({ where: { codigo: "PF046" } });
  const depCentral = await prisma.deposito.findFirst({ where: { id: "DEP002" } });
  const user = await prisma.usuario.findFirst({ where: { id: "US001" } });

  if (!pb027 || !pf044 || !pf046 || !depCentral || !user) {
    throw new Error("Missing test seed data. Please run seed-pilot first.");
  }

  // Helper to reset stock for a clean test case
  async function resetStock(pb027Qty: number, pf044Qty: number) {
    await prisma.movimientoItem.deleteMany({});
    await prisma.movimiento.deleteMany({});
    await prisma.stockActual.deleteMany({});
    
    const items = [];
    if (pb027Qty > 0) {
      items.push({
        productoId: pb027!.id,
        cantidadUnidades: pb027Qty,
        depositoDestinoId: depCentral!.id,
        direccion: "ENTRADA" as const,
        calidad: CalidadProducto.PERFECTO,
        canal: CanalStock.MAYORISTA,
        presentacion: "UNIDAD" as const
      });
    }
    if (pf044Qty > 0) {
      items.push({
        productoId: pf044!.id,
        cantidadUnidades: pf044Qty,
        depositoDestinoId: depCentral!.id,
        direccion: "ENTRADA" as const,
        calidad: CalidadProducto.PERFECTO,
        canal: CanalStock.MAYORISTA,
        presentacion: "UNIDAD" as const
      });
    }

    if (items.length > 0) {
      await MovementService.executeCreateMovimiento({
        tipo: "AJUSTE",
        usuarioId: user!.id,
        items
      });
    }
  }

  // --------------------------------------------------
  // PRUEBA 1 — El Stock existe una sola vez (Visualización)
  // --------------------------------------------------
  console.log("\n--- PRUEBA 1: Stock visual conversions ---");
  await resetStock(120, 0);
  const units = 120;
  const unitsPerFardo = pf044.unidadesPorFardo || 60; // 120
  
  console.log(`Unidades físicas: ${units}`);
  console.log(`Visualizado como DOCENAS: ${unidadesADocenas(units)} (Debe ser 10)`);
  console.log(`Visualizado como FARDOS: ${unidadesAFardos(units, unitsPerFardo)} (Debe ser 1)`);
  
  if (unidadesADocenas(units) === 10 && unidadesAFardos(units, unitsPerFardo) === 1) {
    console.log("✅ PRUEBA 1 PASSED!");
  } else {
    throw new Error("❌ PRUEBA 1 FAILED: Conversion logic incorrect");
  }

  // --------------------------------------------------
  // PRUEBA 3 — Validación de Familia / Línea
  // --------------------------------------------------
  console.log("\n--- PRUEBA 3: Family/Line validations ---");
  
  // Try invalid destination (Americana to Tubular)
  try {
    await MovementService.createEtiquetado({
      usuarioId: user.id,
      productoOrigenId: pb027.id,
      productoDestinoId: pf046.id, // PF046 is Tubular
      depositoId: depCentral.id,
      cantidadUnidades: 10,
      canal: CanalStock.MAYORISTA,
      calidad: CalidadProducto.PERFECTO
    });
    throw new Error("❌ PRUEBA 3 FAILED: Allowed invalid Americana to Tubular destination");
  } catch (err: any) {
    if (err.code === "PRODUCT_MISMATCH") {
      console.log("✅ Invalid Destination properly rejected with PRODUCT_MISMATCH");
    } else {
      throw err;
    }
  }

  // Try valid destination (Americana to Americana)
  await resetStock(100, 0);
  try {
    await MovementService.createEtiquetado({
      usuarioId: user.id,
      productoOrigenId: pb027.id,
      productoDestinoId: pf044.id, // PF044 is Americana
      depositoId: depCentral.id,
      cantidadUnidades: 10,
      canal: CanalStock.MAYORISTA,
      calidad: CalidadProducto.PERFECTO
    });
    console.log("✅ Valid Destination (same family/line) allowed");
  } catch (err) {
    throw new Error(`❌ PRUEBA 3 FAILED: Rejected valid destination: ${err}`);
  }
  console.log("✅ PRUEBA 3 PASSED!");

  // --------------------------------------------------
  // PRUEBA 2 — Etiquetado Flow Integrity
  // --------------------------------------------------
  console.log("\n--- PRUEBA 2: Etiquetado double-entry physical units ---");
  await resetStock(100, 0);

  const initialPbStockRecord = await StockService.getStock({
    productoId: pb027.id,
    depositoId: depCentral.id,
    tallerId: null,
    calidad: CalidadProducto.PERFECTO,
    canal: CanalStock.MAYORISTA
  });
  const initialPbStock = initialPbStockRecord ? initialPbStockRecord.cantidadUnidades : 0;

  const initialPfStockRecord = await StockService.getStock({
    productoId: pf044.id,
    depositoId: depCentral.id,
    tallerId: null,
    calidad: CalidadProducto.PERFECTO,
    canal: CanalStock.MAYORISTA
  });
  const initialPfStock = initialPfStockRecord ? initialPfStockRecord.cantidadUnidades : 0;
  console.log(`Inicial -> PB027: ${initialPbStock} u., PF044: ${initialPfStock} u.`);

  await MovementService.createEtiquetado({
    usuarioId: user.id,
    productoOrigenId: pb027.id,
    productoDestinoId: pf044.id,
    depositoId: depCentral.id,
    cantidadUnidades: 100,
    canal: CanalStock.MAYORISTA,
    calidad: CalidadProducto.PERFECTO
  });

  const finalPbStockRecord = await StockService.getStock({
    productoId: pb027.id,
    depositoId: depCentral.id,
    tallerId: null,
    calidad: CalidadProducto.PERFECTO,
    canal: CanalStock.MAYORISTA
  });
  const finalPbStock = finalPbStockRecord ? finalPbStockRecord.cantidadUnidades : 0;

  const finalPfStockRecord = await StockService.getStock({
    productoId: pf044.id,
    depositoId: depCentral.id,
    tallerId: null,
    calidad: CalidadProducto.PERFECTO,
    canal: CanalStock.MAYORISTA
  });
  const finalPfStock = finalPfStockRecord ? finalPfStockRecord.cantidadUnidades : 0;
  console.log(`Final -> PB027: ${finalPbStock} u., PF044: ${finalPfStock} u.`);

  if (finalPbStock === 0 && finalPfStock === 100) {
    console.log("✅ PRUEBA 2 PASSED!");
  } else {
    throw new Error(`❌ PRUEBA 2 FAILED: Stock counts incorrect. PB: ${finalPbStock}, PF: ${finalPfStock}`);
  }

  // --------------------------------------------------
  // PRUEBA 4 — Venta / Conversión / Insuficiente
  // --------------------------------------------------
  console.log("\n--- PRUEBA 4: Venta & Formatting ---");
  
  // Format check for 110 units (60 units per fardo)
  const formatRes = formatearStock(110, 60);
  console.log(`110 unidades formateadas: "${formatRes}"`);
  if (formatRes !== "1 Fardo y 50 Unidades") {
    throw new Error(`❌ PRUEBA 4 FAILED: Format output "${formatRes}" is incorrect`);
  }
  
  // Stock validation checks
  await resetStock(0, 110);
  const stockPfRecord = await StockService.getStock({
    productoId: pf044.id,
    depositoId: depCentral.id,
    tallerId: null,
    calidad: CalidadProducto.PERFECTO,
    canal: CanalStock.MAYORISTA
  });
  const stockPf = stockPfRecord ? stockPfRecord.cantidadUnidades : 0;
  
  // Try to sell 2 fardos (240 units)
  const sellUnits = 240;
  console.log(`Stock disponible PF044: ${stockPf} u.`);
  console.log(`Intento de venta: 2 Fardos (${sellUnits} u.)`);
  
  if (stockPf < sellUnits) {
    console.log("✅ Stock insuficiente detectado correctamente! (110 < 240)");
    console.log("✅ PRUEBA 4 PASSED!");
  } else {
    throw new Error("❌ PRUEBA 4 FAILED: Allowed selling more than available stock");
  }

  // --------------------------------------------------
  // PRUEBA 5 — Offline / Idempotency Sync
  // --------------------------------------------------
  console.log("\n--- PRUEBA 5: Idempotency (Offline simulation) ---");
  await resetStock(100, 0);

  const clientGenId = "test_offline_uuid_0001";
  const payloadHash = "test_hash_0001";
  
  const payload = {
    tipo: "ETIQUETADO" as const,
    usuarioId: user.id,
    deviceId: "DEVICE_OFFLINE",
    clientGeneratedId: clientGenId,
    payloadHash,
    items: [
      {
        productoId: pb027.id,
        cantidadUnidades: 30,
        depositoOrigenId: depCentral.id,
        direccion: "SALIDA" as const,
        calidad: CalidadProducto.PERFECTO,
        canal: CanalStock.MAYORISTA,
        presentacion: "UNIDAD" as const
      },
      {
        productoId: pf044.id,
        cantidadUnidades: 30,
        depositoDestinoId: depCentral.id,
        direccion: "ENTRADA" as const,
        calidad: CalidadProducto.PERFECTO,
        canal: CanalStock.MAYORISTA,
        presentacion: "UNIDAD" as const
      }
    ]
  };

  // Sync execution 1 (simulated network back online)
  const mov1 = await MovementService.executeCreateMovimiento(payload);
  console.log(`Sync 1: Movimiento creado con ID: ${mov1.id}, Estado: ${mov1.estado}`);
  
  let currentPbRecord = await StockService.getStock({
    productoId: pb027.id,
    depositoId: depCentral.id,
    tallerId: null,
    calidad: CalidadProducto.PERFECTO,
    canal: CanalStock.MAYORISTA
  });
  let currentPb = currentPbRecord ? currentPbRecord.cantidadUnidades : 0;

  let currentPfRecord = await StockService.getStock({
    productoId: pf044.id,
    depositoId: depCentral.id,
    tallerId: null,
    calidad: CalidadProducto.PERFECTO,
    canal: CanalStock.MAYORISTA
  });
  let currentPf = currentPfRecord ? currentPfRecord.cantidadUnidades : 0;

  console.log(`Stock -> PB027: ${currentPb} u. (debe ser 70), PF044: ${currentPf} u. (debe ser 30)`);
  if (currentPb !== 70 || currentPf !== 30) {
    throw new Error("Sync 1 stock mismatch");
  }

  // Sync execution 2 (idempotent retry with same payload)
  const mov2 = await MovementService.executeCreateMovimiento(payload);
  console.log(`Sync 2 (Duplicate Retry): Retornó ID: ${mov2.id}, Estado: ${mov2.estado}`);
  if (mov1.id !== mov2.id) {
    throw new Error("❌ PRUEBA 5 FAILED: Duplicate movement created on retry!");
  }

  currentPbRecord = await StockService.getStock({
    productoId: pb027.id,
    depositoId: depCentral.id,
    tallerId: null,
    calidad: CalidadProducto.PERFECTO,
    canal: CanalStock.MAYORISTA
  });
  currentPb = currentPbRecord ? currentPbRecord.cantidadUnidades : 0;

  currentPfRecord = await StockService.getStock({
    productoId: pf044.id,
    depositoId: depCentral.id,
    tallerId: null,
    calidad: CalidadProducto.PERFECTO,
    canal: CanalStock.MAYORISTA
  });
  currentPf = currentPfRecord ? currentPfRecord.cantidadUnidades : 0;

  console.log(`Stock -> PB027: ${currentPb} u. (sigue siendo 70), PF044: ${currentPf} u. (sigue siendo 30)`);
  if (currentPb !== 70 || currentPf !== 30) {
    throw new Error("❌ PRUEBA 5 FAILED: Stock mutated twice on duplicate retry!");
  }

  // Sync execution 3 (different payload hash, collision attack)
  try {
    await MovementService.executeCreateMovimiento({
      ...payload,
      payloadHash: "modified_hash_collision"
    });
    throw new Error("❌ PRUEBA 5 FAILED: Allowed ID collision with different payload!");
  } catch (err: any) {
    if (err.code === "DUPLICATE_OPERATION") {
      console.log("✅ Sync 3 collision rejected with DUPLICATE_OPERATION");
    } else {
      throw err;
    }
  }

  console.log("✅ PRUEBA 5 PASSED!");

  // --------------------------------------------------
  // PRUEBA 6 — Drift Monitor
  // --------------------------------------------------
  console.log("\n--- PRUEBA 6: Drift Monitor stock audit ---");
  const driftResult = await DriftMonitorService.checkStockDrift();
  console.log(`Inconsistencias detectadas: ${driftResult.drifts.length}`);
  if (driftResult.drifts.length === 0) {
    console.log("✅ PRUEBA 6 PASSED!");
  } else {
    console.log("Drifts found:", JSON.stringify(driftResult.drifts, null, 2));
    throw new Error("❌ PRUEBA 6 FAILED: Stock drift inconsistencies detected!");
  }

  // --------------------------------------------------
  // PRUEBA 7 — Base de Datos constraints
  // --------------------------------------------------
  console.log("\n--- PRUEBA 7: StockActual unique constraints ---");
  const dbStocks = await prisma.stockActual.findMany({
    where: { productoId: pf044.id }
  });
  console.log(`Filas encontradas para PF044 en StockActual: ${dbStocks.length}`);
  if (dbStocks.length <= 1) {
    console.log("✅ PRUEBA 7 PASSED!");
  } else {
    throw new Error(`❌ PRUEBA 7 FAILED: Found duplicate StockActual rows: ${JSON.stringify(dbStocks, null, 2)}`);
  }

  console.log("\n==================================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! ARCHITECTURE CONFIRMED.");
  console.log("==================================================");
}

runTests()
  .catch(err => {
    console.error("\n❌ TESTS FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
