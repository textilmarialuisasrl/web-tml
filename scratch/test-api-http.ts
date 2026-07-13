import { env } from "../src/backend/config/env";

async function testHttpAPI() {
  const baseUrl = "http://localhost:3001";
  console.log(`Connecting to HTTP API at ${baseUrl}...`);

  // Test 1: Healthcheck
  const healthRes = await fetch(`${baseUrl}/api/health`);
  if (!healthRes.ok) {
    throw new Error(`Healthcheck failed: ${healthRes.statusText}`);
  }
  const healthData = await healthRes.json();
  console.log("✅ Healthcheck response:", healthData);

  // Test 2: Login with Ariel
  console.log("Attempting HTTP Login for arielroskopf@gmail.com...");
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "arielroskopf@gmail.com",
      password: "Textil2026!"
    })
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed with status ${loginRes.status}: ${await loginRes.text()}`);
  }

  const loginData = await loginRes.json();
  console.log("✅ Login Response payload:", loginData);

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
  console.log("Cookies received:", cookies);

  // Test 3: Fetch Catalogos
  console.log("Fetching catalogos via HTTP...");
  const catalogRes = await fetch(`${baseUrl}/api/catalogos`, {
    headers: { "Cookie": cookies }
  });

  if (!catalogRes.ok) {
    throw new Error(`Failed to fetch catalogos: ${catalogRes.status} ${await catalogRes.text()}`);
  }

  const catalogData = await catalogRes.json();
  console.log("✅ Catalogos retrieved. Counts:");
  console.log(`   Depositos: ${catalogData.data.depositos.length}`);
  console.log(`   Talleres: ${catalogData.data.talleres.length}`);
  console.log(`   Productos: ${catalogData.data.productos.length}`);
}

testHttpAPI().catch(err => {
  console.error("❌ HTTP API test failed:", err);
  process.exit(1);
});
