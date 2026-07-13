import { prisma } from '../src/backend/db/prisma';

async function run() {
  const baseUrl = 'http://localhost:3001';
  console.log('=== INICIANDO AUDITORÍA DE INTEGRIDAD HISTÓRICA ===\n');

  // 1. Autenticar para obtener cookies
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'operario@textilmarialuisa.com',
      password: 'OperarioPassword123!'
    })
  });

  if (!loginRes.ok) {
    console.error('Login failed:', await loginRes.text());
    process.exit(1);
  }

  const cookieHeaders = typeof loginRes.headers.getSetCookie === 'function' 
    ? loginRes.headers.getSetCookie() 
    : (loginRes.headers.get('set-cookie') ? [loginRes.headers.get('set-cookie')!] : []);
  
  const cookieMap: Record<string, string> = {};
  for (const setCookie of cookieHeaders) {
    const parts = setCookie.split(';')[0].split('=');
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim();
    if (val) {
      cookieMap[key] = val;
    }
  }
  const cookies = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');

  // Obtener catálogos
  const catalogRes = await fetch(`${baseUrl}/api/catalogos`, {
    headers: { 'Cookie': cookies }
  });
  const catalogData = await catalogRes.json();
  
  const product = catalogData.data.productos[0];
  const deposito = catalogData.data.depositos[0];
  const taller = catalogData.data.talleres[0];

  const clientGeneratedId = 'hist-audit-' + Math.random().toString(36).substring(2, 10).toUpperCase();

  // Limpiar posibles residuos
  await prisma.movimiento.deleteMany({ where: { clientGeneratedId } });
  
  // Establecer stock inicial insuficiente (10 unidades)
  await prisma.stockActual.deleteMany({
    where: { productoId: product.id, depositoId: deposito.id }
  });
  const stockRecord = await prisma.stockActual.create({
    data: {
      productoId: product.id,
      depositoId: deposito.id,
      tallerId: null,
      calidad: 'PERFECTO',
      presentacion: 'SIN_ETIQUETA',
      canal: 'MAYORISTA',
      cantidadUnidades: 10
    }
  });

  // Payload: Solicita 80 unidades (con stock = 10 -> Fallará)
  const payload = {
    batchId: 'batch-hist-123',
    deviceId: 'device-hist-999',
    schemaVersion: 1,
    movements: [
      {
        clientGeneratedId,
        tipo: 'ENTREGA_TALLER',
        offlineCreatedAt: new Date().toISOString(),
        tallerId: taller.id,
        observaciones: 'Auditoría Trazabilidad Histórica',
        items: [
          {
            productoId: product.id,
            cantidadUnidades: 80,
            depositoOrigenId: deposito.id,
            depositoDestinoId: null,
            tallerOrigenId: null,
            tallerDestinoId: taller.id,
            calidad: 'PERFECTO',
            presentacion: 'SIN_ETIQUETA',
            canal: 'MAYORISTA',
            direccion: 'SALIDA'
          }
        ]
      }
    ]
  };

  console.log('1. Enviando movimiento con stock insuficiente (Fallo esperado)...');
  const syncRes1 = await fetch(`${baseUrl}/api/sync/movimientos`, {
    method: 'POST',
    headers: {
      'Cookie': cookies,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const resJson1 = await syncRes1.json();
  console.log('Resultado API 1 (rejected):', resJson1.data.rejected.length > 0);

  // --- OBTENER Y MOSTRAR REGISTRO ANTES DEL RETRY ---
  const beforeRow = await prisma.movimiento.findFirst({
    where: { clientGeneratedId }
  });

  console.log('\n--- REGISTRO EN BASE DE DATOS (ANTES DEL RETRY) ---');
  if (beforeRow) {
    console.log(JSON.stringify({
      id: beforeRow.id,
      clientGeneratedId: beforeRow.clientGeneratedId,
      createdAt: beforeRow.createdAt.toISOString(),
      updatedAt: beforeRow.updatedAt.toISOString(),
      syncStatus: beforeRow.syncStatus,
      payloadHash: beforeRow.payloadHash
    }, null, 2));
  } else {
    console.log('ERROR: No se encontró el registro en la DB.');
    process.exit(1);
  }

  // 2. Corregir el stock a 150 unidades
  console.log('\n2. Corrigiendo stock a 150 unidades en DB...');
  await prisma.stockActual.update({
    where: { id: stockRecord.id },
    data: { cantidadUnidades: 150 }
  });

  // 3. Simular el Retry (enviar el mismo payload)
  console.log('3. Reintentando movimiento con stock suficiente (Éxito esperado)...');
  const syncRes2 = await fetch(`${baseUrl}/api/sync/movimientos`, {
    method: 'POST',
    headers: {
      'Cookie': cookies,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const resJson2 = await syncRes2.json();
  console.log('Resultado API 2 (synced):', resJson2.data.synced.length > 0);

  // --- OBTENER Y MOSTRAR REGISTRO DESPUÉS DEL RETRY ---
  const afterRow = await prisma.movimiento.findFirst({
    where: { clientGeneratedId }
  });

  console.log('\n--- REGISTRO EN BASE DE DATOS (DESPUÉS DEL RETRY) ---');
  if (afterRow) {
    console.log(JSON.stringify({
      id: afterRow.id,
      clientGeneratedId: afterRow.clientGeneratedId,
      createdAt: afterRow.createdAt.toISOString(),
      updatedAt: afterRow.updatedAt.toISOString(),
      syncStatus: afterRow.syncStatus,
      payloadHash: afterRow.payloadHash
    }, null, 2));
  } else {
    console.log('ERROR: No se encontró el registro post-retry.');
    process.exit(1);
  }

  // --- CONTAR REGISTROS ASOCIADOS A ESTE CLIENT_GENERATED_ID ---
  const countSameId = await prisma.movimiento.count({
    where: { clientGeneratedId }
  });
  console.log(`\nCantidad de registros físicos con clientGeneratedId "${clientGeneratedId}": ${countSameId}`);

  // --- EJECUTAR LA CONSULTA SQL DE DUPLICADOS EN LA TABLA ---
  console.log('\n4. Ejecutando consulta de detección de duplicados en la tabla "Movimiento":');
  const duplicates: any[] = await prisma.$queryRawUnsafe(`
    SELECT "clientGeneratedId", COUNT(*) as count
    FROM "Movimiento"
    GROUP BY "clientGeneratedId"
    HAVING COUNT(*) > 1
  `);
  
  console.log('Resultado de duplicados (debe ser vacío/[]):');
  console.dir(duplicates);

  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
});
