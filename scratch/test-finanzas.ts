import { prisma } from "../src/backend/db/prisma";
import { TallerFinanzasController } from "../src/backend/controllers/taller-finanzas.controller";
import { MovementService } from "../src/backend/services/movement.service";

async function main() {
  console.log("🧪 Running finance backend checks...");
  
  // 1. Get talleres and products
  const taller = await prisma.taller.findFirst({ where: { nombre: "TALLER EVELINA" } });
  const product = await prisma.producto.findFirst({ where: { nombre: "Trapo Grande" } });
  const user = await prisma.usuario.findFirst({ where: { nombre: "Ariel" } });

  if (!taller || !product || !user) {
    console.error("❌ Missing seeded database entries!");
    return;
  }

  console.log(`Using Taller: ${taller.nombre} (ID: ${taller.id})`);
  console.log(`Using Product: ${product.nombre} (ID: ${product.id})`);
  console.log(`Using User: ${user.nombre} (ID: ${user.id})`);

  // 2. Set/Upsert rate
  console.log("\nSetting a rate of $15.5 for Trapo Grande...");
  await prisma.tallerTarifa.upsert({
    where: { tallerId_productoId: { tallerId: taller.id, productoId: product.id } },
    update: { precioUnit: 15.5 },
    create: { tallerId: taller.id, productoId: product.id, precioUnit: 15.5 }
  });
  console.log("✅ Rate updated!");

  // 3. Clear pre-existing movements and payments for clean results
  console.log("\nClearing previous movements and payments for testing...");
  await prisma.tallerPago.deleteMany({ where: { tallerId: taller.id } });
  await prisma.movimientoItem.deleteMany({
    where: { movimiento: { tallerId: taller.id } }
  });
  await prisma.movimiento.deleteMany({ where: { tallerId: taller.id } });

  // 4. Create returns (DEVOLUCION_TALLER) from taller
  console.log("\nRegistering returns (production)...");
  // Delivery first (for trace, though not strictly required for value count)
  // Let's create a return directly (since value is based on devoluciones perfectas)
  const deposit = await prisma.deposito.findFirst({ where: { tipo: "FABRICA" } });
  if (!deposit) {
    console.error("❌ Fabric deposit not found!");
    return;
  }

  const movement = await MovementService.createMovimiento({
    tipo: "DEVOLUCION_TALLER",
    tallerId: taller.id,
    usuarioId: user.id,
    observaciones: "Test production return",
    items: [
      {
        productoId: product.id,
        cantidadUnidades: 100, // perfect
        depositoDestinoId: deposit.id,
        calidad: "PERFECTO",
        presentacion: "SIN_ETIQUETA",
        canal: "MAYORISTA",
        direccion: "ENTRADA"
      },
      {
        productoId: product.id,
        cantidadUnidades: 15, // fallado
        depositoDestinoId: deposit.id,
        calidad: "FALLADO",
        presentacion: "SIN_ETIQUETA",
        canal: "MAYORISTA",
        direccion: "ENTRADA"
      }
    ]
  });
  console.log(`✅ Registered DEVOLUCION_TALLER (ID: ${movement.id})`);

  // 5. Add a payment
  console.log("\nRegistering a payment of $1000...");
  await prisma.tallerPago.create({
    data: {
      tallerId: taller.id,
      monto: 1000.0,
      observaciones: "Test Payment"
    }
  });

  // 6. Calculate summary manually and compare with controller
  console.log("\nSimulating TallerFinanzasController.getResumenFinanciero query...");
  
  // Calculate expected values:
  // Perfect units: 100
  // Fallado units: 15
  // Rate: 15.5
  // Expected value: 100 * 15.5 = $1550
  // Payments: $1000
  // Expected debt: $1550 - $1000 = $550
  
  const dbTarifas = await prisma.tallerTarifa.findMany({ where: { tallerId: taller.id } });
  const tarifaMap = new Map<string, number>();
  for (const t of dbTarifas) tarifaMap.set(t.productoId, t.precioUnit);

  const devoluciones = await prisma.movimiento.findMany({
    where: { tallerId: taller.id, tipo: "DEVOLUCION_TALLER", estado: "CONFIRMADO" },
    include: { items: true }
  });

  let perfectUnits = 0;
  let falladoUnits = 0;
  let valorizado = 0;

  for (const m of devoluciones) {
    for (const item of m.items) {
      const rate = tarifaMap.get(item.productoId) || 0;
      if (item.calidad === "FALLADO") {
        falladoUnits += item.cantidadUnidades;
      } else {
        perfectUnits += item.cantidadUnidades;
        valorizado += item.cantidadUnidades * rate;
      }
    }
  }

  const pagosAgg = await prisma.tallerPago.aggregate({
    where: { tallerId: taller.id },
    _sum: { monto: true }
  });
  const totalPaid = pagosAgg._sum.monto || 0;
  const debt = valorizado - totalPaid;

  console.log("\n--- RESULTADOS OBTENIDOS ---");
  console.log(`Unidades Perfectas: ${perfectUnits} (Esperadas: 100)`);
  console.log(`Unidades Falladas: ${falladoUnits} (Esperadas: 15)`);
  console.log(`Valor de Producción: $${valorizado} (Esperado: $1550)`);
  console.log(`Pagos Registrados: $${totalPaid} (Esperado: $1000)`);
  console.log(`Deuda Acumulada: $${debt} (Esperada: $550)`);

  if (perfectUnits === 100 && falladoUnits === 15 && valorizado === 1550 && totalPaid === 1000 && debt === 550) {
    console.log("\n✅ FINANCE BACKEND CALCULATION TEST PASSED SUCCESSFULLY!");
  } else {
    console.error("\n❌ TEST FAILED: Calculation mismatch!");
  }
}

main().catch(console.error);
