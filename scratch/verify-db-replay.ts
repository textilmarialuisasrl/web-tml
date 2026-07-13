import { prisma } from '../src/backend/db/prisma';

async function run() {
  const baseUrl = 'http://localhost:3001';
  console.log('--- STARTING AUDIT SIMULATION ---');

  // 1. Authenticate to get valid cookies
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

  // Fetch catalog to get valid IDs
  const catalogRes = await fetch(`${baseUrl}/api/catalogos`, {
    headers: { 'Cookie': cookies }
  });
  const catalogData = await catalogRes.json();
  
  const product = catalogData.data.productos[0];
  const deposito = catalogData.data.depositos[0]; // Zona de Corte
  const taller = catalogData.data.talleres[0]; // Estampados TML

  const clientGeneratedId = 'audit-mov-' + Math.random().toString(36).substring(2, 10).toUpperCase();

  // Reset database records to ensure clean state
  await prisma.movimiento.deleteMany({
    where: { clientGeneratedId }
  });
  await prisma.stockActual.deleteMany({
    where: {
      productoId: product.id,
      depositoId: deposito.id
    }
  });

  // Create initial stock of 100 units
  await prisma.stockActual.create({
    data: {
      productoId: product.id,
      depositoId: deposito.id,
      tallerId: null,
      calidad: 'PERFECTO',
      presentacion: 'SIN_ETIQUETA',
      canal: 'MAYORISTA',
      cantidadUnidades: 100
    }
  });

  const payload = {
    batchId: 'audit-batch-111',
    deviceId: 'audit-device-999',
    schemaVersion: 1,
    movements: [
      {
        clientGeneratedId,
        tipo: 'ENTREGA_TALLER',
        offlineCreatedAt: new Date().toISOString(),
        tallerId: taller.id,
        observaciones: 'Simulación de Auditoría de Replay',
        items: [
          {
            productoId: product.id,
            cantidadUnidades: 50,
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

  console.log(`\n=========================================`);
  console.log(`EJECUTANDO PRIMER INTENTO (AUTO SYNC)`);
  console.log(`=========================================`);

  const syncRes1 = await fetch(`${baseUrl}/api/sync/movimientos`, {
    method: 'POST',
    headers: {
      'Cookie': cookies,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const resJson1 = await syncRes1.json();
  console.log('Respuesta de API (Primer Intento):', JSON.stringify(resJson1, null, 2));

  // --- QUERY 1: ANTES DEL RETRY ---
  console.log(`\n>>> [SQL RESULT] ANTES DEL RETRY:`);
  const recordBefore = await prisma.movimiento.findFirst({
    where: { clientGeneratedId }
  });
  
  if (recordBefore) {
    console.table([{
      id: recordBefore.id,
      client_generated_id: recordBefore.clientGeneratedId,
      sync_status: recordBefore.syncStatus,
      sync_error_message: recordBefore.syncErrorMessage,
      created_at: recordBefore.createdAt.toISOString()
    }]);
  } else {
    console.log('No se encontró el registro.');
  }

  // --- STOCK 1: ANTES DEL RETRY ---
  let stockBefore = await prisma.stockActual.findFirst({
    where: { productoId: product.id, depositoId: deposito.id }
  });
  console.log(`>>> STOCK ACTUAL ANTES DEL RETRY: ${stockBefore?.cantidadUnidades} unidades`);

  console.log(`\n=========================================`);
  console.log(`EJECUTANDO SEGUNDO INTENTO (MANUAL RETRY)`);
  console.log(`=========================================`);

  const syncRes2 = await fetch(`${baseUrl}/api/sync/movimientos`, {
    method: 'POST',
    headers: {
      'Cookie': cookies,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const resJson2 = await syncRes2.json();
  console.log('Respuesta de API (Segundo Intento):', JSON.stringify(resJson2, null, 2));

  // --- QUERY 2: DESPUÉS DEL RETRY ---
  console.log(`\n>>> [SQL RESULT] DESPUÉS DEL RETRY:`);
  const recordAfter = await prisma.movimiento.findFirst({
    where: { clientGeneratedId }
  });
  
  if (recordAfter) {
    console.table([{
      id: recordAfter.id,
      client_generated_id: recordAfter.clientGeneratedId,
      sync_status: recordAfter.syncStatus,
      sync_error_message: recordAfter.syncErrorMessage,
      created_at: recordAfter.createdAt.toISOString()
    }]);
  } else {
    console.log('No se encontró el registro.');
  }

  // --- STOCK 2: DESPUÉS DEL RETRY ---
  let stockAfter = await prisma.stockActual.findFirst({
    where: { productoId: product.id, depositoId: deposito.id }
  });
  console.log(`>>> STOCK ACTUAL DESPUÉS DEL RETRY: ${stockAfter?.cantidadUnidades} unidades`);

  console.log('\n--- AUDIT SIMULATION COMPLETED ---');
  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
});
