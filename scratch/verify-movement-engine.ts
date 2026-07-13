const BASE_URL = "http://localhost:3001/api";

async function runVerification() {
  console.log("🧪 Iniciando pruebas de verificación del MOTOR DE MOVIMIENTOS y STOCK...\n");

  let cookieHeader = "";

  // 1. Iniciar sesión como Administrador para obtener Cookie
  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@textilmarialuisa.com",
        password: "admin_password_tml_2026",
      }),
    });
    const data = await res.json() as any;
    if (!res.ok || !data.success) {
      throw new Error(`Fallo de autenticación: ${JSON.stringify(data.error)}`);
    }
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      cookieHeader = setCookie.split(";")[0];
    }
    console.log("✅ 1. Autenticación exitosa. Cookie de sesión capturada.");
  } catch (err: any) {
    console.error("🔴 Error al iniciar sesión:", err.message);
    return;
  }

  // Helper local para peticiones HTTP
  const apiCall = async (path: string, method = "GET", body?: any) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json() as any;
    return { status: res.status, data: json };
  };

  // 2. Recuperar ID de productos, depósitos y talleres creados en el seed
  let productoId = "";
  let depositoGalponId = "";
  let depositoCasaId = "";
  let tallerPrincipalId = "";

  try {
    const { prisma } = require("../src/backend/db/prisma");
    const prod = await prisma.producto.findFirst({ where: { nombre: "Trapo Piso Económico" } });
    const depGalpon = await prisma.deposito.findFirst({ where: { nombre: "Galpón TML" } });
    const depCasa = await prisma.deposito.findFirst({ where: { nombre: "Casa TML" } });
    const talPrincipal = await prisma.taller.findFirst({ where: { nombre: "Taller Principal" } });

    productoId = prod.id;
    depositoGalponId = depGalpon.id;
    depositoCasaId = depCasa.id;
    tallerPrincipalId = talPrincipal.id;

    console.log("✅ 2. Identificadores recuperados de base de datos:");
    console.log(`   - Producto: ${prod.nombre} (${productoId})`);
    console.log(`   - Depósito Galpón: ${depGalpon.nombre} (${depositoGalponId})`);
    console.log(`   - Depósito Casa: ${depCasa.nombre} (${depositoCasaId})`);
    console.log(`   - Taller Principal: ${talPrincipal.nombre} (${tallerPrincipalId})\n`);
  } catch (err: any) {
    console.error("🔴 Error al consultar IDs base:", err.message);
    return;
  }

  // 3. Crear Ingreso Manual inicial de stock en Galpón TML (120 unidades = 2 fardos de 60 unidades)
  try {
    const res = await apiCall("/movements", "POST", {
      tipo: "INGRESO_MANUAL",
      observaciones: "Carga inicial de trapos para pruebas",
      items: [
        {
          productoId,
          cantidadUnidades: 120, // 2 fardos de 60 unidades
          depositoDestinoId: depositoGalponId,
          calidad: "PERFECTO",
          presentacion: "SIN_ETIQUETA",
          canal: "MAYORISTA",
        },
      ],
    });
    console.log(`✅ 3. Ingreso Manual: Status ${res.status}, success: ${res.data.success}`);
  } catch (err: any) {
    console.error("🔴 Error en ingreso manual:", err.message);
  }

  // 4. Consultar stock del producto para verificar carga
  try {
    const res = await apiCall(`/stocks/producto/${productoId}`);
    console.log("✅ 4. Consulta de Stock Actual inicial para el producto:");
    console.log(JSON.stringify(res.data.data, null, 2));
  } catch (err: any) {
    console.error("🔴 Error al consultar stock:", err.message);
  }

  // 5. Entrega a Taller (Enviar 60 unidades = 1 fardo del Galpón al Taller Principal)
  try {
    const res = await apiCall("/movements/entrega-taller", "POST", {
      tallerId: tallerPrincipalId,
      observaciones: "Envío de 1 fardo para costura",
      items: [
        {
          productoId,
          cantidadUnidades: 60,
          depositoOrigenId: depositoGalponId,
          calidad: "PERFECTO",
          presentacion: "SIN_ETIQUETA",
          canal: "MAYORISTA",
        },
      ],
    });
    console.log(`✅ 5. Entrega a Taller: Status ${res.status}, success: ${res.data.success}`);
  } catch (err: any) {
    console.error("🔴 Error en entrega a taller:", err.message);
  }

  // 6. Consultar Stock consolidado posterior al envío a taller
  try {
    const res = await apiCall(`/stocks/producto/${productoId}`);
    console.log("✅ 6. Stock consolidado post-envío a taller (Debe haber 60 en Galpón y 60 en Taller):");
    console.log(JSON.stringify(res.data.data, null, 2));
  } catch (err: any) {
    console.error("🔴 Error al consultar stock post-entrega:", err.message);
  }

  // 7. Devolución de Taller (El taller devuelve 40 PERFECTOS y 20 FALLADOS al Galpón TML)
  try {
    const res = await apiCall("/movements/devolucion-taller", "POST", {
      tallerId: tallerPrincipalId,
      observaciones: "Devolución de lote de taller terminado",
      items: [
        {
          productoId,
          cantidadUnidades: 40,
          depositoDestinoId: depositoGalponId,
          calidad: "PERFECTO",
          presentacion: "SIN_ETIQUETA",
          canal: "MAYORISTA",
        },
        {
          productoId,
          cantidadUnidades: 20,
          depositoDestinoId: depositoGalponId,
          calidad: "FALLADO", // Taller confeccionó fallados
          presentacion: "SIN_ETIQUETA",
          canal: "MAYORISTA",
        },
      ],
    });
    console.log(`✅ 7. Devolución de Taller: Status ${res.status}, success: ${res.data.success}`);
  } catch (err: any) {
    console.error("🔴 Error en devolución taller:", err.message);
  }

  // 8. Consultar Stock consolidado posterior a devolución de taller
  try {
    const res = await apiCall(`/stocks/producto/${productoId}`);
    console.log("✅ 8. Stock consolidado post-devolución (Galpón debe tener 100 perfectos y 20 fallados. Taller debe tener 0):");
    console.log(JSON.stringify(res.data.data, null, 2));
  } catch (err: any) {
    console.error("🔴 Error al consultar stock post-devolución:", err.message);
  }

  // 9. Apertura de Fardo (Abrir 1 fardo de 60 unidades del Galpón TML: MAYORISTA -> MINORISTA)
  try {
    const res = await apiCall("/movements/apertura-fardo", "POST", {
      productoId,
      depositoId: depositoGalponId,
      cantidadFardos: 1,
      unidadesPorFardo: 60,
      observaciones: "Apertura manual de 1 fardo para venta minorista en mostrador",
    });
    console.log(`✅ 9. Apertura de Fardo: Status ${res.status}, success: ${res.data.success}`);
  } catch (err: any) {
    console.error("🔴 Error en apertura de fardo:", err.message);
  }

  // 10. Consultar Stock post-apertura (Galpón debe tener 40 perfectos MAYORISTA y 60 perfectos MINORISTA)
  try {
    const res = await apiCall(`/stocks/producto/${productoId}`);
    console.log("✅ 10. Stock consolidado post-apertura de fardo:");
    console.log(JSON.stringify(res.data.data, null, 2));
  } catch (err: any) {
    console.error("🔴 Error al consultar stock post-apertura:", err.message);
  }

  // 11. Etiquetado (Pasar 30 unidades MINORISTA SIN_ETIQUETA a ETIQUETADO en Galpón TML)
  try {
    const res = await apiCall("/movements/etiquetado", "POST", {
      productoId,
      depositoId: depositoGalponId,
      cantidadUnidades: 30,
      canal: "MINORISTA",
      calidad: "PERFECTO",
      observaciones: "Etiquetado rápido para lote minorista",
    });
    console.log(`✅ 11. Etiquetado: Status ${res.status}, success: ${res.data.success}`);
  } catch (err: any) {
    console.error("🔴 Error en etiquetado:", err.message);
  }

  // 12. Consultar Stock post-etiquetado
  try {
    const res = await apiCall(`/stocks/producto/${productoId}`);
    console.log("✅ 12. Stock consolidado post-etiquetado (Debe haber 30 MINORISTA ETIQUETADO y 30 MINORISTA SIN_ETIQUETA):");
    console.log(JSON.stringify(res.data.data, null, 2));
  } catch (err: any) {
    console.error("🔴 Error al consultar stock post-etiquetado:", err.message);
  }

  // 13. Reconversión Compleja (Consumir 20 fallados y convertirlos en 10 perfectos en Casa TML)
  try {
    const res = await apiCall("/movements/reconversion", "POST", {
      observaciones: "Reconfección de lote fallado a trapos perfectos pequeños",
      items: [
        {
          productoId,
          cantidadUnidades: 20,
          depositoOrigenId: depositoGalponId, // egresa de galpón
          calidad: "FALLADO",
          presentacion: "SIN_ETIQUETA",
          canal: "MAYORISTA",
        },
        {
          productoId,
          cantidadUnidades: 10,
          depositoDestinoId: depositoCasaId, // ingresa en casa TML como perfecto
          calidad: "PERFECTO",
          presentacion: "SIN_ETIQUETA",
          canal: "MINORISTA",
        },
      ],
    });
    console.log(`✅ 13. Reconversión Compleja: Status ${res.status}, success: ${res.data.success}`);
  } catch (err: any) {
    console.error("🔴 Error en reconversión:", err.message);
  }

  // 14. Consultar Stock post-reconversión (Comprobar salida de fallado en Galpón e ingreso de perfecto en Casa TML)
  try {
    const res = await apiCall(`/stocks/producto/${productoId}`);
    console.log("✅ 14. Stock consolidado post-reconversión:");
    console.log(JSON.stringify(res.data.data, null, 2));
  } catch (err: any) {
    console.error("🔴 Error al consultar stock post-reconversion:", err.message);
  }

  // 15. Test de Transacción y Rollback (Intentar un movimiento multi-ítem donde el segundo ítem falla por stock insuficiente)
  try {
    console.log("🔄 15. Ejecutando test de Rollback... (Ítem 2 requiere más stock del disponible)");
    const res = await apiCall("/movements", "POST", {
      tipo: "MOVIMIENTO_INTERNO",
      observaciones: "Este movimiento debería fallar y hacer rollback completo de todos los ítems",
      items: [
        {
          // Ítem 1: Válido (mover 10 unidades)
          productoId,
          cantidadUnidades: 10,
          depositoOrigenId: depositoCasaId, // Casa tiene 10 unidades
          depositoDestinoId: depositoGalponId,
          calidad: "PERFECTO",
          presentacion: "SIN_ETIQUETA",
          canal: "MINORISTA",
        },
        {
          // Ítem 2: Inválido (Casa TML solo tiene 10 unidades en total de este canal, pedimos 999)
          productoId,
          cantidadUnidades: 999,
          depositoOrigenId: depositoCasaId,
          depositoDestinoId: depositoGalponId,
          calidad: "PERFECTO",
          presentacion: "SIN_ETIQUETA",
          canal: "MINORISTA",
        },
      ],
    });
    console.log(`➡️  Resultado del error esperado: Status ${res.status}, success: ${res.data.success}`);
    console.log("   Payload de error recibido:", JSON.stringify(res.data.error, null, 2));
  } catch (err: any) {
    console.error("🔴 Error en test de rollback:", err.message);
  }

  // 16. Consultar Stock final para comprobar que el Ítem 1 no fue aplicado (Casa TML debe seguir teniendo 10 unidades)
  try {
    const res = await apiCall(`/stocks/producto/${productoId}`);
    const itemsCasa = (res.data.data || []).filter((s: any) => s.depositoId === depositoCasaId);
    console.log("✅ 16. Comprobación de Stock Final en Casa TML (Debe seguir siendo exactamente 10 unidades):");
    console.log(JSON.stringify(itemsCasa, null, 2));
  } catch (err: any) {
    console.error("🔴 Error al verificar stock final post-rollback:", err.message);
  }

  console.log("\n🏁 Pruebas de verificación del motor de movimientos finalizadas.");
}

runVerification();
