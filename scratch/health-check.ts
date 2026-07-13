import { prisma } from '../src/backend/db/prisma';

async function run() {
  const args = process.argv.slice(2);
  const isFullMode = args.includes('--mode=full');

  console.log('======================================================================');
  console.log(`INICIANDO SCRIPT DE HEALTH-CHECK - MODO: ${isFullMode ? 'FULL' : 'FAST'}`);
  console.log('======================================================================\n');

  const startDb = Date.now();
  await prisma.$executeRawUnsafe('SELECT 1');
  const dbLatency = Date.now() - startDb;

  console.log(`• Latencia de Base de Datos: ${dbLatency}ms`);
  console.log(`• Uptime de Proceso: ${Math.round(process.uptime())}s`);

  // --- CHEQUEO 1: ESTADOS DE SINCRONIZACIÓN Y CONTADORES GENERALES ---
  console.log('\n--- 1. CONTADORES GENERALES DE MOVIMIENTOS ---');
  const statusGroups: any[] = await prisma.$queryRawUnsafe(`
    SELECT "syncStatus", COUNT(*) as count
    FROM "Movimiento"
    GROUP BY "syncStatus"
  `);

  const counts: Record<string, number> = {
    SYNCED: 0,
    FAILED: 0,
    CONFLICT: 0,
  };

  for (const group of statusGroups) {
    counts[group.syncStatus] = Number(group.count);
  }
  console.log(`  - SYNCED (Sincronizados): ${counts.SYNCED}`);
  console.log(`  - FAILED (Fallidos): ${counts.FAILED}`);
  console.log(`  - CONFLICT (En Conflicto): ${counts.CONFLICT}`);

  // --- CHEQUEO 2: DETECTAR ESTADOS INVÁLIDOS ---
  console.log('\n--- 2. AUDITAR ESTADOS INVÁLIDOS EN POSTGRESQL ---');
  const invalidStatesCount = await prisma.movimiento.count({
    where: {
      syncStatus: {
        notIn: ['SYNCED', 'FAILED', 'CONFLICT']
      }
    }
  });

  if (invalidStatesCount > 0) {
    console.log(`  🚨 ALERTA: Se encontraron ${invalidStatesCount} movimientos con estados inválidos en DB.`);
  } else {
    console.log('  ✅ Todos los movimientos poseen estados válidos (SYNCED, FAILED, CONFLICT).');
  }

  // --- CHEQUEO 3: DETECTAR DUPLICADOS DE clientGeneratedId ---
  console.log('\n--- 3. AUDITAR DUPLICADOS DE clientGeneratedId ---');
  const duplicates: any[] = await prisma.$queryRawUnsafe(`
    SELECT "clientGeneratedId", COUNT(*) as count
    FROM "Movimiento"
    WHERE "clientGeneratedId" IS NOT NULL
    GROUP BY "clientGeneratedId"
    HAVING COUNT(*) > 1
  `);

  if (duplicates.length > 0) {
    console.log(`  🚨 ALERTA: Se encontraron ${duplicates.length} clientGeneratedId duplicados:`);
    console.dir(duplicates);
  } else {
    console.log('  ✅ No se encontraron duplicados de clientGeneratedId. Integridad preservada.');
  }

  // --- CHEQUEO 4: DETECTAR MOVIMIENTOS E ÍTEMS HUÉRFANOS ---
  console.log('\n--- 4. AUDITAR MOVIMIENTOS E ÍTEMS HUÉRFANOS ---');
  
  // Movimientos sin ítems
  const movementsWithoutItems: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, tipo, "clientGeneratedId"
    FROM "Movimiento"
    WHERE id NOT IN (SELECT DISTINCT "movimientoId" FROM "MovimientoItem")
  `);

  // Ítems sin movimiento
  const itemsWithoutMovement: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, "productoId", "cantidadUnidades"
    FROM "MovimientoItem"
    WHERE "movimientoId" NOT IN (SELECT id FROM "Movimiento")
  `);

  // Movimientos sin usuario emisor válido
  const movementsWithoutUser: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, tipo, "clientGeneratedId"
    FROM "Movimiento"
    WHERE "usuarioId" NOT IN (SELECT id FROM "Usuario")
  `);

  let orphanFound = false;
  if (movementsWithoutItems.length > 0) {
    console.log(`  🚨 ALERTA: Se encontraron ${movementsWithoutItems.length} movimientos sin ítems asociados:`);
    console.dir(movementsWithoutItems);
    orphanFound = true;
  }
  if (itemsWithoutMovement.length > 0) {
    console.log(`  🚨 ALERTA: Se encontraron ${itemsWithoutMovement.length} ítems de movimientos sin movimiento madre:`);
    console.dir(itemsWithoutMovement);
    orphanFound = true;
  }
  if (movementsWithoutUser.length > 0) {
    console.log(`  🚨 ALERTA: Se encontraron ${movementsWithoutUser.length} movimientos sin usuario emisor válido:`);
    console.dir(movementsWithoutUser);
    orphanFound = true;
  }

  if (!orphanFound) {
    console.log('  ✅ No se detectaron movimientos ni ítems huérfanos. Estructura relacional íntegra.');
  }

  // --- CHEQUEO 5: MODO FULL - AUDITORÍA COMPLETA DE CONSISTENCIA DE STOCK ---
  if (isFullMode) {
    console.log('\n======================================================================');
    console.log('5. MODO FULL: AUDITORÍA DE CONSISTENCIA DE STOCK HISTÓRICO');
    console.log('======================================================================');

    console.log('Cargando registros de StockActual...');
    const dbStocks = await prisma.stockActual.findMany({
      include: { producto: true }
    });

    console.log(`Analizando consistencia para ${dbStocks.length} combinaciones de stock...`);

    let discrepanciesCount = 0;
    for (const stock of dbStocks) {
      const { productoId, depositoId, tallerId, calidad, presentacion, canal, cantidadUnidades } = stock;

      // Obtener todos los ítems de movimientos confirmados (estado CONFIRMADO y syncStatus SYNCED)
      // que impactan sobre este casillero de stock.
      // 1. Entradas a esta ubicación (depositoDestinoId o tallerDestinoId coincidente)
      const entradas: any[] = await prisma.$queryRawUnsafe(`
        SELECT SUM("cantidadUnidades") as sum
        FROM "MovimientoItem" mi
        INNER JOIN "Movimiento" m ON mi."movimientoId" = m.id
        WHERE m.estado = 'CONFIRMADO' AND m."syncStatus" = 'SYNCED'
          AND mi."productoId" = $1
          AND mi.calidad::text = $2
          AND mi.presentacion::text = $3
          AND mi.canal::text = $4
          AND mi.direccion = 'ENTRADA'
          AND (
            ($5::text IS NOT NULL AND mi."depositoDestinoId" = $5) OR
            ($6::text IS NOT NULL AND mi."tallerDestinoId" = $6)
          )
      `, productoId, calidad, presentacion, canal, depositoId, tallerId);

      // 2. Salidas de esta ubicación (depositoOrigenId o tallerOrigenId coincidente)
      const salidas: any[] = await prisma.$queryRawUnsafe(`
        SELECT SUM("cantidadUnidades") as sum
        FROM "MovimientoItem" mi
        INNER JOIN "Movimiento" m ON mi."movimientoId" = m.id
        WHERE m.estado = 'CONFIRMADO' AND m."syncStatus" = 'SYNCED'
          AND mi."productoId" = $1
          AND mi.calidad::text = $2
          AND mi.presentacion::text = $3
          AND mi.canal::text = $4
          AND mi.direccion = 'SALIDA'
          AND (
            ($5::text IS NOT NULL AND mi."depositoOrigenId" = $5) OR
            ($6::text IS NOT NULL AND mi."tallerOrigenId" = $6)
          )
      `, productoId, calidad, presentacion, canal, depositoId, tallerId);

      const totalEntradas = Number(entradas[0]?.sum || 0);
      const totalSalidas = Number(salidas[0]?.sum || 0);

      // El stock inicial esperado antes de movimientos se asume 0 en esta reconstrucción (o relativo),
      // pero en este ERP, todos los productos arrancan con stock 0 a menos que haya un movimiento de INGRESO_MANUAL o AJUSTE
      // que tiene direccion ENTRADA. Por lo tanto, el stock actual debe ser exactamente entradas - salidas.
      const calculatedStock = totalEntradas - totalSalidas;

      if (calculatedStock !== cantidadUnidades) {
        discrepanciesCount++;
        const locationType = depositoId ? `Depósito ID ${depositoId}` : `Taller ID ${tallerId}`;
        console.log(`  🚨 DISCREPANCIA DETECTADA:`);
        console.log(`    - Producto: ${stock.producto.nombre} (${productoId})`);
        console.log(`    - Ubicación: ${locationType}`);
        console.log(`    - Config: Calidad: ${calidad} | Pres: ${presentacion} | Canal: ${canal}`);
        console.log(`    - Stock en DB: ${cantidadUnidades} u.`);
        console.log(`    - Stock Calculado (Movimientos): ${calculatedStock} u. (Entradas: ${totalEntradas}, Salidas: ${totalSalidas})`);
        console.log(`    - Deriva: ${cantidadUnidades - calculatedStock} unidades.\n`);
      }
    }

    if (discrepanciesCount === 0) {
      console.log('  ✅ Consistencia de Stock 100% Correcta. Todas las existencias coinciden exactamente con sus históricos de movimientos.');
    } else {
      console.log(`  🚨 Total de inconsistencias detectadas: ${discrepanciesCount}`);
    }
  }

  console.log('\n======================================================================');
  console.log('AUDITORÍA DE HEALTH-CHECK FINALIZADA');
  console.log('======================================================================');

  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
});
