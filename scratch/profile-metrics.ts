import { prisma } from '../src/backend/db/prisma';

async function run() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  console.log('--- PROFILING METRICS QUERIES ---');

  // Query 1: SELECT 1
  let start = performance.now();
  await prisma.$executeRawUnsafe('SELECT 1');
  console.log(`1. SELECT 1: ${(performance.now() - start).toFixed(2)}ms`);

  // Query 2: groupBy syncStatus
  start = performance.now();
  const statusGroups = await prisma.movimiento.groupBy({
    by: ['syncStatus'],
    _count: {
      _all: true,
    },
  });
  console.log(`2. groupBy syncStatus: ${(performance.now() - start).toFixed(2)}ms`);

  // Query 3: findMany lastErrors
  start = performance.now();
  const lastErrors = await prisma.movimiento.findMany({
    where: {
      syncStatus: 'FAILED',
    },
    select: {
      id: true,
      clientGeneratedId: true,
      syncErrorMessage: true,
      updatedAt: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 10,
  });
  console.log(`3. findMany lastErrors (take 10): ${(performance.now() - start).toFixed(2)}ms`);

  // Query 4: Grouped counts for retries/replays
  start = performance.now();
  const auditCounts24h = await prisma.$queryRawUnsafe(`
    SELECT accion, COUNT(*)::integer as count
    FROM "Auditoria"
    WHERE "createdAt" >= $1
      AND accion IN ('SYNC_MOVEMENT_RETRY', 'SYNC_MOVEMENT_REPLAY')
    GROUP BY accion
  `, oneDayAgo);
  console.log(`4. Grouped counts Auditoria: ${(performance.now() - start).toFixed(2)}ms`);

  // Query 5: Average duration
  start = performance.now();
  const avgDurationResult = await prisma.$queryRawUnsafe(`
    SELECT COALESCE(AVG((cambios->>'durationMs')::numeric), 0) as avg
    FROM "Auditoria"
    WHERE accion = 'SYNC_BATCH_PROCESSED'
      AND "createdAt" >= $1
  `, oneDayAgo);
  console.log(`5. Average duration Auditoria: ${(performance.now() - start).toFixed(2)}ms`);

  await prisma.$disconnect();
}

run();
