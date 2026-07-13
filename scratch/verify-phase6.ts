import { StockService } from "e:/Back PC/Desktop/WebTML/src/backend/services/stock.service";
import { StockAlertService } from "e:/Back PC/Desktop/WebTML/src/backend/services/stock-alert.service";
import { prisma } from "e:/Back PC/Desktop/WebTML/src/backend/db/prisma";
import { eventBus, DOMAIN_EVENTS } from "e:/Back PC/Desktop/WebTML/src/backend/events/domain.events";
import { metricsRegistry } from "e:/Back PC/Desktop/WebTML/src/backend/utils/metrics";

const API_URL = "http://localhost:3001/api";
let jwtToken = "";

function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function runTests() {
  console.log("🚀 Starting Phase 6 Validation Tests...");

  // 1. Authenticate to get JWT token
  console.log("🔐 Test 1: Authenticating admin user...");
  const authRes = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@textilmarialuisa.com",
      password: "AdminPassword123!"
    })
  });
  const authData: any = await authRes.json();
  if (!authRes.ok || !authData.success) {
    throw new Error(`Auth failed: ${JSON.stringify(authData)}`);
  }
  
  const cookieHeader = authRes.headers.get("set-cookie");
  const tokenCookie = cookieHeader?.split(";")[0];
  jwtToken = authData.data.token;
  console.log("✔️ Authenticated successfully.");

  const authHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${jwtToken}`,
    ...(tokenCookie ? { "Cookie": tokenCookie } : {})
  };

  // Get active entities
  const seededStock = await prisma.stockActual.findFirst({
    where: {
      cantidadUnidades: { gt: 100 },
      depositoId: { not: null },
      calidad: "PERFECTO",
      presentacion: "SIN_ETIQUETA"
    },
    include: {
      producto: true,
      deposito: true
    }
  });

  if (!seededStock) {
    throw new Error("No seeded stock record with >100 units found. Run seed script first!");
  }

  const prod = seededStock.producto;
  const dep = seededStock.deposito!;
  console.log(`ℹ️ Test product: ${prod.nombre}, stock location: ${dep.nombre}`);

  // ==========================================
  // Test 2: Offline Sync (Success, Replay, Conflict, Failure)
  // ==========================================
  console.log("\n🔄 Test 2: Verifying offline sync behavior...");
  const syncBatchId = "batch-" + generateRandomString(8);
  const clientGenId1 = "offline-" + generateRandomString(12);
  const clientGenId2 = "offline-" + generateRandomString(12);

  const syncPayload = {
    batchId: syncBatchId,
    deviceId: "device-test-1",
    schemaVersion: 1,
    movements: [
      {
        clientGeneratedId: clientGenId1,
        tipo: "INGRESO_MANUAL",
        offlineCreatedAt: new Date().toISOString(),
        items: [
          {
            productoId: prod.id,
            cantidadUnidades: 5,
            depositoDestinoId: dep.id,
            calidad: "PERFECTO",
            presentacion: "SIN_ETIQUETA",
            canal: "MAYORISTA",
            direccion: "ENTRADA"
          }
        ]
      },
      {
        clientGeneratedId: clientGenId2,
        tipo: "EGRESO",
        offlineCreatedAt: new Date().toISOString(),
        items: [
          {
            productoId: prod.id,
            cantidadUnidades: 10,
            depositoOrigenId: dep.id,
            calidad: "PERFECTO",
            presentacion: "SIN_ETIQUETA",
            canal: "MAYORISTA",
            direccion: "SALIDA"
          }
        ]
      }
    ]
  };

  console.log("-> Posting batch upload...");
  const syncRes = await fetch(`${API_URL}/sync/movimientos`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(syncPayload)
  });
  const syncData: any = await syncRes.json();
  if (!syncRes.ok || !syncData.success) {
    throw new Error(`Sync failed: ${JSON.stringify(syncData)}`);
  }
  console.log("✔️ Sync processed batch. Output details:", {
    synced: syncData.data.synced.length,
    conflicts: syncData.data.conflicts.length,
    rejected: syncData.data.rejected.length
  });

  if (syncData.data.synced.length !== 2) {
    throw new Error(`Expected 2 synced movements, got ${syncData.data.synced.length}`);
  }

  // Idempotency: Re-send same batch
  console.log("-> Re-sending same batch to test replay protection...");
  const replayRes = await fetch(`${API_URL}/sync/movimientos`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(syncPayload)
  });
  const replayData: any = await replayRes.json();
  if (!replayRes.ok || replayData.data.synced.length !== 2) {
    throw new Error(`Replay failed to return identical 2 synced: ${JSON.stringify(replayData)}`);
  }
  console.log("✔️ Idempotency verified. Movements correctly deduplicated without error.");

  // Conflict detection: Same clientGeneratedId but different payload
  console.log("-> Modifying payload for existing clientGeneratedId to trigger conflict...");
  const conflictPayload = {
    batchId: syncBatchId,
    deviceId: "device-test-1",
    schemaVersion: 1,
    movements: [
      {
        clientGeneratedId: clientGenId1,
        tipo: "EGRESO", // Changed from INGRESO_MANUAL to EGRESO
        offlineCreatedAt: new Date().toISOString(),
        items: [
          {
            productoId: prod.id,
            cantidadUnidades: 200,
            depositoOrigenId: dep.id,
            calidad: "PERFECTO",
            presentacion: "SIN_ETIQUETA",
            canal: "MAYORISTA",
            direccion: "SALIDA"
          }
        ]
      }
    ]
  };

  const conflictRes = await fetch(`${API_URL}/sync/movimientos`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(conflictPayload)
  });
  const conflictData: any = await conflictRes.json();
  if (!conflictRes.ok || conflictData.data.conflicts.length !== 1) {
    throw new Error(`Expected conflict to be flagged, got: ${JSON.stringify(conflictData)}`);
  }
  console.log("✔️ Conflict correctly flagged. syncStatus marked CONFLICT for clientGeneratedId:", clientGenId1);

  // Failure tracking: invalid movement in batch
  console.log("-> Testing batch item transaction failure...");
  const failClientGenId = "offline-" + generateRandomString(12);
  const failPayload = {
    batchId: syncBatchId,
    deviceId: "device-test-1",
    schemaVersion: 1,
    movements: [
      {
        clientGeneratedId: failClientGenId,
        tipo: "EGRESO",
        offlineCreatedAt: new Date().toISOString(),
        items: [
          {
            productoId: prod.id,
            cantidadUnidades: 9999999, // Exceeds available stock, will fail!
            depositoOrigenId: dep.id,
            calidad: "PERFECTO",
            presentacion: "SIN_ETIQUETA",
            canal: "MAYORISTA",
            direccion: "SALIDA"
          }
        ]
      }
    ]
  };

  const failRes = await fetch(`${API_URL}/sync/movimientos`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(failPayload)
  });
  const failData: any = await failRes.json();
  if (!failRes.ok || failData.data.rejected.length !== 1) {
    throw new Error(`Expected movement to be rejected, got: ${JSON.stringify(failData)}`);
  }
  console.log("✔️ Failure successfully caught and recorded. Rejected details:", failData.data.rejected[0]);

  // Check database to verify it exists with FAILED status
  const failedDbMov = await prisma.movimiento.findFirst({
    where: { clientGeneratedId: failClientGenId }
  });
  if (!failedDbMov || failedDbMov.syncStatus !== "FAILED") {
    throw new Error("Failed movement not persisted in DB with status FAILED!");
  }
  console.log("✔️ Failed movement successfully logged in DB with FAILED status and error logs.");

  // ==========================================
  // Test 3: Stock Minimum Alerting & Throttling
  // ==========================================
  console.log("\n🚨 Test 3: Checking stock minimum alerts & temporal throttling...");
  
  // Clear alerts for this product
  await prisma.alertaStock.deleteMany({
    where: { productoId: prod.id }
  });
  StockAlertService.clearThrottleCache();

  // Trigger low stock by calling StockAlertService checkStock directly
  // minimum is set to 15 in config seed
  console.log("-> Simulating stock level drop to 5 (limit is 15)...");
  await StockAlertService.checkStock(prod.id, dep.id, null, 5);

  const activeAlert = await prisma.alertaStock.findFirst({
    where: { productoId: prod.id, activa: true }
  });
  if (!activeAlert) {
    throw new Error("Expected stock alert to be generated in database!");
  }
  console.log("✔️ Stock alert correctly generated. Alert quantity:", activeAlert.cantidadActual);

  // Trigger low stock again immediately - should be throttled in-memory (no new db row, no change)
  console.log("-> Simulating subsequent drop to 2 (throttled window)...");
  await StockAlertService.checkStock(prod.id, dep.id, null, 2);

  const alertsCount = await prisma.alertaStock.count({
    where: { productoId: prod.id }
  });
  if (alertsCount !== 1) {
    throw new Error(`Expected exactly 1 alert row because of throttling, but found ${alertsCount}`);
  }
  console.log("✔️ Throttling verified. No duplicate alert rows created.");

  // Simulate stock recovery
  console.log("-> Simulating stock recovery to 20 units...");
  await StockAlertService.checkStock(prod.id, dep.id, null, 20);

  const resolvedAlert = await prisma.alertaStock.findFirst({
    where: { productoId: prod.id, id: activeAlert.id }
  });
  if (resolvedAlert?.activa !== false || !resolvedAlert.resueltaAt) {
    throw new Error("Expected alert to be automatically resolved on stock recovery!");
  }
  console.log("✔️ Alert auto-resolved on stock recovery. Resolved timestamp:", resolvedAlert.resueltaAt);

  // ==========================================
  // Test 4: Incremental CSV Export Stream
  // ==========================================
  console.log("\n📄 Test 4: Verifying incremental CSV export stream...");
  const csvRes = await fetch(`${API_URL}/movimientos/export/csv`, {
    headers: authHeaders
  });
  if (!csvRes.ok) {
    throw new Error(`CSV export failed with status: ${csvRes.status}`);
  }
  
  const buffer = await csvRes.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const hasBOM = bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
  if (!hasBOM) {
    throw new Error("CSV Export does not start with UTF-8 BOM bytes (EF BB BF)!");
  }
  console.log("✔️ UTF-8 BOM detected.");
  
  const text = new TextDecoder("utf-8").decode(buffer);
  const lines = text.split("\n");
  console.log("✔️ CSV Header:", lines[0]);
  console.log(`✔️ Total rows exported: ${lines.length - 2} (plus header/footer).`);
  
  if (!lines[0].includes("Numero Secuencial") || !lines[0].includes("ID Movimiento")) {
    throw new Error("CSV Header columns missing expected names");
  }
  console.log("✔️ CSV structure verified.");

  // ==========================================
  // Test 5: Metrics Registry Endpoint
  // ==========================================
  console.log("\n📊 Test 5: Fetching metrics snapshot from system route...");
  const metricsRes = await fetch(`${API_URL}/system/metrics`, {
    headers: authHeaders
  });
  if (!metricsRes.ok) {
    throw new Error(`Metrics endpoint failed with status: ${metricsRes.status}`);
  }
  
  const metricsData: any = await metricsRes.json();
  if (!metricsData.success || !metricsData.data.counters || !metricsData.data.gauges) {
    throw new Error(`Metrics output invalid: ${JSON.stringify(metricsData)}`);
  }
  console.log("✔️ Metrics retrieved successfully. Sample snapshot counters:", metricsData.data.counters);
  console.log("✔️ Metrics gauges:", metricsData.data.gauges);

  console.log("\n🏆 ALL PHASE 6 TEST CASES PASSED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("\n❌ Test run failed with error:", err.message);
  process.exit(1);
});
