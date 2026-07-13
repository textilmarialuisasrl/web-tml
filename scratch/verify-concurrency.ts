import { prisma } from '../src/backend/db/prisma';

async function run() {
  const baseUrl = 'http://localhost:3001';
  console.log('=== INICIANDO AUDITORÍA DE CONCURRENCIA ===\n');

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

  const clientGeneratedId = 'concurrent-audit-' + Math.random().toString(36).substring(2, 10).toUpperCase();

  // Limpiar base de datos
  await prisma.movimiento.deleteMany({ where: { clientGeneratedId } });
  await prisma.stockActual.deleteMany({
    where: { productoId: product.id, depositoId: deposito.id }
  });

  // Establecer stock inicial en 100 unidades
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
    batchId: 'batch-concurrent-123',
    deviceId: 'device-concurrent-999',
    schemaVersion: 1,
    movements: [
      {
        clientGeneratedId,
        tipo: 'ENTREGA_TALLER',
        offlineCreatedAt: new Date().toISOString(),
        tallerId: taller.id,
        observaciones: 'Auditoría Concurrencia',
        items: [
          {
            productoId: product.id,
            cantidadUnidades: 40,
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

  console.log(`Lanzando 2 peticiones simultáneas para clientGeneratedId: ${clientGeneratedId}...`);

  const request1 = fetch(`${baseUrl}/api/sync/movimientos`, {
    method: 'POST',
    headers: { 'Cookie': cookies, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const request2 = fetch(`${baseUrl}/api/sync/movimientos`, {
    method: 'POST',
    headers: { 'Cookie': cookies, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  // Ejecutar en paralelo
  const [res1, res2] = await Promise.all([request1, request2]);

  const json1 = await res1.json();
  const json2 = await res2.json();

  console.log('\n--- RESPUESTA PETICIÓN 1 ---');
  console.log(JSON.stringify(json1, null, 2));

  console.log('\n--- RESPUESTA PETICIÓN 2 ---');
  console.log(JSON.stringify(json2, null, 2));

  // --- CONSULTAR BASE DE DATOS POST-CONCURRENCIA ---
  console.log('\n--- ESTADO FINAL EN POSTGRESQL ---');
  const dbRecords = await prisma.movimiento.findMany({
    where: { clientGeneratedId },
    include: { items: true }
  });

  console.log(`Cantidad de registros persistidos para el clientGeneratedId: ${dbRecords.length}`);
  console.dir(dbRecords, { depth: null });

  const finalStock = await prisma.stockActual.findFirst({
    where: { productoId: product.id, depositoId: deposito.id }
  });
  console.log(`\nStock final de ${product.nombre} en DB: ${finalStock?.cantidadUnidades} unidades (esperado: 60)`);

  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
});
