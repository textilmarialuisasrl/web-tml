import { prisma } from '../src/backend/db/prisma';
import { SyncService } from '../src/backend/services/sync.service';

async function run() {
  console.log('======================================================================');
  console.log('SIMULACIÓN DE VOLUMEN MASIVO Y MEDICIÓN DE RENDIMIENTO DE MÉTRICAS');
  console.log('======================================================================\n');

  // Fetch a valid user to satisfy foreign keys
  const user = await prisma.usuario.findFirst();
  if (!user) {
    console.error('No user found to run the simulation.');
    process.exit(1);
  }
  const usuarioId = user.id;

  console.log(`Utilizando Usuario ID: ${usuarioId} (${user.nombre})`);

  // Generate 2000 movements in memory
  console.log('\nGenerando 2,000 movimientos en memoria...');
  const movementsData = [];
  for (let i = 0; i < 2000; i++) {
    const status = i % 4 === 0 ? 'SYNCED' : i % 4 === 1 ? 'FAILED' : i % 4 === 2 ? 'CONFLICT' : 'PENDING';
    movementsData.push({
      tipo: 'ENTREGA_TALLER' as any,
      usuarioId,
      usuarioNombreSnapshot: user.nombre,
      syncStatus: status as any,
      deviceId: 'SIMULATION_DEVICE',
      clientGeneratedId: `sim-perf-${i}-${Math.random().toString(36).substring(2, 8)}`,
      payloadHash: `hash-${i}-${Math.random()}`,
      syncErrorMessage: status === 'FAILED' ? 'Synthetic connection error' : null,
      createdAt: new Date(Date.now() - Math.random() * 48 * 60 * 60 * 1000), // last 48 hours
      updatedAt: new Date(),
    });
  }

  // Insert movements in batch
  console.log('Insertando 2,000 movimientos en PostgreSQL...');
  const insertMovementsStart = Date.now();
  await prisma.movimiento.createMany({
    data: movementsData,
  });
  console.log(`Movimientos insertados en ${Date.now() - insertMovementsStart}ms.`);

  // Generate 5000 audit records in memory
  console.log('\nGenerando 5,000 registros de auditoría en memoria...');
  const auditData = [];
  for (let i = 0; i < 5000; i++) {
    const action = i % 3 === 0 ? 'SYNC_BATCH_PROCESSED' : i % 3 === 1 ? 'SYNC_MOVEMENT_RETRY' : 'SYNC_MOVEMENT_REPLAY';
    auditData.push({
      usuarioId,
      accion: action,
      entidad: 'Movimiento',
      entidadId: `entity-id-${i}`,
      cambios: action === 'SYNC_BATCH_PROCESSED' ? { durationMs: Math.round(10 + Math.random() * 90) } : {},
      createdAt: new Date(Date.now() - Math.random() * 48 * 60 * 60 * 1000), // last 48 hours
    });
  }

  // Insert audit records in batches of 1000 to avoid query size limits
  console.log('Insertando 5,000 registros de auditoría en PostgreSQL...');
  const insertAuditsStart = Date.now();
  for (let offset = 0; offset < auditData.length; offset += 1000) {
    const chunk = auditData.slice(offset, offset + 1000);
    await prisma.auditoria.createMany({
      data: chunk,
    });
  }
  console.log(`Auditorías insertadas en ${Date.now() - insertAuditsStart}ms.`);

  // Total count verify
  const totalMovs = await prisma.movimiento.count();
  const totalAudits = await prisma.auditoria.count();
  console.log(`\nEstado actual de la base de datos:`);
  console.log(`  - Total Movimientos: ${totalMovs}`);
  console.log(`  - Total Auditorías: ${totalAudits}`);

  // Measure getSyncMetrics latency (Run 5 iterations to warm up cache and get accurate times)
  console.log('\nEjecutando mediciones del endpoint de métricas indexadas (GET /api/sync/metrics)...');
  const latencies: number[] = [];
  for (let iter = 1; iter <= 5; iter++) {
    const start = performance.now();
    const metricsResult = await SyncService.getSyncMetrics();
    const duration = performance.now() - start;
    latencies.push(duration);
    console.log(`  Iteración ${iter}: ${duration.toFixed(2)}ms`);
    if (iter === 1) {
      console.log(`    Contadores retornados:`, JSON.stringify(metricsResult.counts));
      console.log(`    Promedio Sync (24h): ${metricsResult.avgSyncTimeMs}ms`);
      console.log(`    Reintentos (24h): ${metricsResult.retries24h}`);
      console.log(`    Replays (24h): ${metricsResult.replays24h}`);
    }
  }

  const averageLatency = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
  console.log(`\n📈 LATENCIA PROMEDIO DEL ENDPOINT DE MÉTRICAS: ${averageLatency.toFixed(2)}ms`);

  if (averageLatency < 100) {
    console.log('✅ EXCELENTE: El endpoint de métricas responde en menos de 100ms bajo carga masiva.');
  } else {
    console.log('🚨 ALERTA: El endpoint superó el límite de 100ms de respuesta.');
  }

  // Cleanup simulation data
  console.log('\nLimpiando datos de simulación...');
  const cleanupStart = Date.now();
  await prisma.movimiento.deleteMany({
    where: {
      deviceId: 'SIMULATION_DEVICE',
    },
  });
  await prisma.auditoria.deleteMany({
    where: {
      entidadId: {
        startsWith: 'entity-id-',
      },
    },
  });
  console.log(`Limpieza completada en ${Date.now() - cleanupStart}ms.`);

  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error('Error en simulación:', e);
  await prisma.$disconnect();
});
