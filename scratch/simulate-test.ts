import { prisma } from '../src/backend/db/prisma';

async function run() {
  const baseUrl = 'http://localhost:3001';
  console.log('--- STARTING SIMULATION ---');

  // 1. Login
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
    } else {
      delete cookieMap[key];
    }
  }
  const cookies = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
  console.log('Formatted cookies for request:', cookies);

  // 2. Fetch catalogs to get valid IDs
  const catalogRes = await fetch(`${baseUrl}/api/catalogos`, {
    headers: { 'Cookie': cookies }
  });
  const catalogData = await catalogRes.json();
  
  const product = catalogData.data.productos[0];
  const deposito = catalogData.data.depositos[0]; // Zona de Corte
  const taller = catalogData.data.talleres[0]; // Estampados TML

  console.log(`Using Product: ${product.nombre} (${product.id})`);
  console.log(`Using Depósito: ${deposito.nombre} (${deposito.id})`);
  console.log(`Using Taller: ${taller.nombre} (${taller.id})`);

  // Ensure stock is 0 initially in database for this product/deposito
  await prisma.stockActual.deleteMany({
    where: {
      productoId: product.id,
      depositoId: deposito.id
    }
  });

  const clientGeneratedId = 'test-mov-' + Math.random().toString(36).substring(2, 10).toUpperCase();

  // 3. Simulate AUTO SYNC with insufficient stock
  console.log('\n--- SIMULATING AUTO SYNC (INSUFFICIENT STOCK) ---');
  const payload1 = {
    batchId: 'batch-auto-123',
    deviceId: 'device-test-123',
    schemaVersion: 1,
    movements: [
      {
        clientGeneratedId,
        tipo: 'ENTREGA_TALLER',
        offlineCreatedAt: new Date().toISOString(),
        tallerId: taller.id,
        observaciones: 'Simulación de auto sync con error de stock',
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

  // Log client-side AUTO SYNC log start (simulating client output)
  console.log('[AUTO SYNC]');
  console.log(`movementId: ${clientGeneratedId}`);
  console.log(`payload: ${JSON.stringify(payload1.movements[0])}`);
  console.log(`endpoint: /api/sync/movimientos`);

  const syncRes1 = await fetch(`${baseUrl}/api/sync/movimientos`, {
    method: 'POST',
    headers: {
      'Cookie': cookies,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload1)
  });

  const syncResult1 = await syncRes1.json();
  console.log('Result:', JSON.stringify(syncResult1));

  // Check DB state for this movement
  let dbMov = await prisma.movimiento.findFirst({
    where: { clientGeneratedId },
    include: { items: true }
  });
  console.log(`\nServer DB record status: ${dbMov?.syncStatus}`);
  console.log(`Server DB record error msg: ${dbMov?.syncErrorMessage}`);

  // 4. Now add stock of 100 units to allow the retry to succeed
  console.log('\n--- INCREMENTING STOCK TO 100 ---');
  await prisma.stockActual.deleteMany({
    where: {
      productoId: product.id,
      depositoId: deposito.id,
      tallerId: null,
      calidad: 'PERFECTO',
      presentacion: 'SIN_ETIQUETA',
      canal: 'MAYORISTA'
    }
  });
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

  // Verify stock is indeed 100
  let stock = await prisma.stockActual.findFirst({
    where: { productoId: product.id, depositoId: deposito.id }
  });
  console.log(`Stock level in DB: ${stock?.cantidadUnidades} units`);

  // 5. Simulate MANUAL RETRY
  console.log('\n--- SIMULATING MANUAL RETRY ---');
  console.log('[MANUAL RETRY]');
  console.log(`movementId: ${clientGeneratedId}`);
  console.log(`payload: ${JSON.stringify(payload1.movements[0])}`);
  console.log(`endpoint: /api/sync/movimientos`);

  const syncRes2 = await fetch(`${baseUrl}/api/sync/movimientos`, {
    method: 'POST',
    headers: {
      'Cookie': cookies,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload1) // Exact same payload and clientGeneratedId
  });

  const syncResult2 = await syncRes2.json();
  console.log('Result:', JSON.stringify(syncResult2));

  // Check DB state after retry
  dbMov = await prisma.movimiento.findFirst({
    where: { clientGeneratedId },
    include: { items: true }
  });
  console.log(`\nServer DB record status after retry: ${dbMov?.syncStatus}`);

  // Check stock level after retry
  stock = await prisma.stockActual.findFirst({
    where: { productoId: product.id, depositoId: deposito.id }
  });
  console.log(`Stock level in DB after retry: ${stock?.cantidadUnidades} units`);

  console.log('--- SIMULATION COMPLETED ---');
  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
});
