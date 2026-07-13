import { prisma } from "../db/prisma";
import { env } from "../config/env";
import bcrypt from "bcrypt";

const PRODUCTOS_DATA = [
  // Hilados
  { nombre: "Algodón 24/1 Peinado Crudo", categoria: "HILADOS", unidadesPorFardo: 24, unidadPreferidaVisual: "FARDO" },
  { nombre: "Algodón 24/1 Peinado Negro", categoria: "HILADOS", unidadesPorFardo: 24, unidadPreferidaVisual: "FARDO" },
  { nombre: "Algodón 20/1 Cardado Azul", categoria: "HILADOS", unidadesPorFardo: 20, unidadPreferidaVisual: "FARDO" },
  { nombre: "Poliéster Texturizado 150/48", categoria: "HILADOS", unidadesPorFardo: 30, unidadPreferidaVisual: "FARDO" },
  
  // Telas
  { nombre: "Jersey de Algodón Peinado Gris", categoria: "TELAS", unidadesPorFardo: 10, unidadPreferidaVisual: "UNIDAD" },
  { nombre: "Jersey de Algodón Peinado Blanco", categoria: "TELAS", unidadesPorFardo: 10, unidadPreferidaVisual: "UNIDAD" },
  { nombre: "Frisa Invisible de Algodón Azul", categoria: "TELAS", unidadesPorFardo: 8, unidadPreferidaVisual: "UNIDAD" },
  { nombre: "Rústico con Lycra Negro", categoria: "TELAS", unidadesPorFardo: 12, unidadPreferidaVisual: "UNIDAD" },
  
  // Avios
  { nombre: "Etiquetas de Marca TML Bordadas", categoria: "AVIOS", unidadesPorFardo: 500, unidadPreferidaVisual: "DOCENA" },
  { nombre: "Etiquetas de Talle M de Poliéster", categoria: "AVIOS", unidadesPorFardo: 1000, unidadPreferidaVisual: "DOCENA" },
  { nombre: "Botones de Camisa Transparentes", categoria: "AVIOS", unidadesPorFardo: 1200, unidadPreferidaVisual: "DOCENA" },
  
  // Prendas
  { nombre: "Remera Algodón Básica Negra S", categoria: "PRENDAS", unidadesPorFardo: 50, unidadPreferidaVisual: "DOCENA" },
  { nombre: "Remera Algodón Básica Negra M", categoria: "PRENDAS", unidadesPorFardo: 50, unidadPreferidaVisual: "DOCENA" },
  { nombre: "Remera Algodón Básica Negra L", categoria: "PRENDAS", unidadesPorFardo: 50, unidadPreferidaVisual: "DOCENA" },
  { nombre: "Buzo Oversized Frisa Negro M", categoria: "PRENDAS", unidadesPorFardo: 15, unidadPreferidaVisual: "DOCENA" }
];

const DEPOSITOS_DATA = [
  { nombre: "Depósito Central", descripcion: "Almacén principal de materias primas", tipo: "FABRICA" as const },
  { nombre: "Zona de Corte", descripcion: "Sector de trazado y fraccionamiento", tipo: "CORTE" as const },
  { nombre: "Depósito de Tránsito", descripcion: "Mercadería en camino a talleres", tipo: "TRANSITO" as const },
  { nombre: "Local Minorista Flores", descripcion: "Punto de venta y despacho menor", tipo: "MINORISTA" as const },
];

const TALLERES_DATA = [
  { nombre: "Confecciones Juan", observaciones: "Taller externo especialista en remeras" },
  { nombre: "Bordados Express", observaciones: "Taller para avíos y marcas complejas" },
  { nombre: "Estampados TML", observaciones: "Estampado rotativo y directo" }
];

const PERMISOS = [
  "MOVIMIENTOS_CREAR",
  "MOVIMIENTOS_VER",
  "STOCK_VER",
  "STOCK_EDITAR",
  "ADMIN_SISTEMA"
];

async function seed() {
  console.log("🌱 Starting automatic demo database seeding...");

  // 1. Clean existing records in reverse dependency order
  console.log("🧹 Cleaning old records...");
  await prisma.auditoria.deleteMany({});
  await prisma.alertaStock.deleteMany({});
  await prisma.movimientoInsumo.deleteMany({});
  await prisma.movimientoItem.deleteMany({});
  await prisma.movimiento.deleteMany({});
  await prisma.stockActual.deleteMany({});
  await prisma.usuarioPermiso.deleteMany({});
  await prisma.permiso.deleteMany({});
  await prisma.usuario.deleteMany({});
  await prisma.producto.deleteMany({});
  await prisma.deposito.deleteMany({});
  await prisma.taller.deleteMany({});
  await prisma.configuracion.deleteMany({});

  // 2. Seed Permisos
  console.log("🔑 Seeding permissions...");
  const dbPermisos: any[] = [];
  for (const perm of PERMISOS) {
    const created = await prisma.permiso.create({
      data: { clave: perm, descripcion: `Permiso para ${perm}`, modulo: "GENERAL" }
    });
    dbPermisos.push(created);
  }

  const saltRounds = env.BCRYPT_ROUNDS;

  // 3. Seed Users
  console.log("👥 Seeding demo users...");

  // 3.1 Admin User
  const adminHash = await bcrypt.hash("AdminPassword123!", saltRounds);
  const admin = await prisma.usuario.create({
    data: {
      nombre: "Administrador Demo",
      email: "admin@textilmarialuisa.com",
      passwordHash: adminHash,
      activo: true
    }
  });
  // Assign all permissions to admin
  for (const perm of dbPermisos) {
    await prisma.usuarioPermiso.create({
      data: { usuarioId: admin.id, permisoId: perm.id }
    });
  }

  // 3.2 Supervisor User
  const supervisorHash = await bcrypt.hash("SupervisorPassword123!", saltRounds);
  const supervisor = await prisma.usuario.create({
    data: {
      nombre: "Supervisor Demo",
      email: "supervisor@textilmarialuisa.com",
      passwordHash: supervisorHash,
      activo: true
    }
  });
  // Assign supervisor permissions
  const supervisorPermKeys = ["MOVIMIENTOS_VER", "STOCK_VER"];
  const supervisorPerms = dbPermisos.filter(p => supervisorPermKeys.includes(p.clave));
  for (const perm of supervisorPerms) {
    await prisma.usuarioPermiso.create({
      data: { usuarioId: supervisor.id, permisoId: perm.id }
    });
  }

  // 3.3 Operario User
  const operarioHash = await bcrypt.hash("OperarioPassword123!", saltRounds);
  const operario = await prisma.usuario.create({
    data: {
      nombre: "Operario Demo",
      email: "operario@textilmarialuisa.com",
      passwordHash: operarioHash,
      activo: true
    }
  });
  // Assign operario permissions
  const operarioPermKeys = ["MOVIMIENTOS_CREAR", "STOCK_VER"];
  const operarioPerms = dbPermisos.filter(p => operarioPermKeys.includes(p.clave));
  for (const perm of operarioPerms) {
    await prisma.usuarioPermiso.create({
      data: { usuarioId: operario.id, permisoId: perm.id }
    });
  }

  // 4. Seed Products
  console.log("📦 Seeding products...");
  const dbProductos = [];
  for (const prod of PRODUCTOS_DATA) {
    const created = await prisma.producto.create({
      data: {
        nombre: prod.nombre,
        categoria: prod.categoria,
        unidadesPorFardo: prod.unidadesPorFardo,
        activo: true,
        medida: "Unidades"
      }
    });
    dbProductos.push(created);
  }

  // 5. Seed Depositos
  console.log("🏪 Seeding warehouses...");
  const dbDepositos = [];
  for (const dep of DEPOSITOS_DATA) {
    const created = await prisma.deposito.create({
      data: dep
    });
    dbDepositos.push(created);
  }

  // 6. Seed Talleres
  console.log("🧵 Seeding workshops...");
  const dbTalleres = [];
  for (const tal of TALLERES_DATA) {
    const created = await prisma.taller.create({
      data: tal
    });
    dbTalleres.push(created);
  }

  // 7. Seed Mappings user_access:<userId>
  console.log("🔒 Seeding workshop/warehouse access mappings...");
  
  // 7.1 Admin mapping: access to all workshops and deposits
  const adminAccess = {
    allowedTalleres: dbTalleres.map(t => t.id),
    allowedDepositos: dbDepositos.map(d => d.id)
  };
  await prisma.configuracion.create({
    data: {
      clave: `user_access:${admin.id}`,
      valor: JSON.stringify(adminAccess),
      descripcion: `Mappings de acceso para admin: ${admin.email}`
    }
  });

  // 7.2 Supervisor mapping: access to Confecciones Juan & Bordados Express, Central & Flores deposits
  const supervisorAccess = {
    allowedTalleres: [dbTalleres[0].id, dbTalleres[1].id],
    allowedDepositos: [dbDepositos[0].id, dbDepositos[3].id]
  };
  await prisma.configuracion.create({
    data: {
      clave: `user_access:${supervisor.id}`,
      valor: JSON.stringify(supervisorAccess),
      descripcion: `Mappings de acceso para supervisor: ${supervisor.email}`
    }
  });

  // 7.3 Operario mapping: access to Confecciones Juan workshop, Central deposit
  const operarioAccess = {
    allowedTalleres: [dbTalleres[0].id],
    allowedDepositos: [dbDepositos[0].id]
  };
  await prisma.configuracion.create({
    data: {
      clave: `user_access:${operario.id}`,
      valor: JSON.stringify(operarioAccess),
      descripcion: `Mappings de acceso para operario: ${operario.email}`
    }
  });

  // 8. Global Configurations
  console.log("⚙️ Seeding system global configurations...");
  await prisma.configuracion.create({
    data: {
      clave: "STOCK_MINIMO_ALERTA",
      valor: "15",
      descripcion: "Umbral mínimo global para disparar alertas de stock"
    }
  });

  // 9. Seed Initial Stock Actual Records
  console.log("📊 Seeding initial stock balances...");
  
  // Algodón Peinado Crudo in Deposito Central (240 units = 10 fardos)
  await prisma.stockActual.create({
    data: {
      productoId: dbProductos[0].id,
      depositoId: dbDepositos[0].id,
      calidad: "PERFECTO",
      presentacion: "SIN_ETIQUETA",
      canal: "MAYORISTA",
      cantidadUnidades: 240,
      version: 1
    }
  });

  // Algodón Peinado Negro in Deposito Central (120 units = 5 fardos)
  await prisma.stockActual.create({
    data: {
      productoId: dbProductos[1].id,
      depositoId: dbDepositos[0].id,
      calidad: "PERFECTO",
      presentacion: "SIN_ETIQUETA",
      canal: "MAYORISTA",
      cantidadUnidades: 120,
      version: 1
    }
  });

  // Remera M Black in Flores Minorista (200 units, etiquetadas, minorista)
  await prisma.stockActual.create({
    data: {
      productoId: dbProductos[12].id,
      depositoId: dbDepositos[3].id,
      calidad: "PERFECTO",
      presentacion: "ETIQUETADO",
      canal: "MINORISTA",
      cantidadUnidades: 200,
      version: 1
    }
  });

  // Remera S Black in Workshop Confecciones Juan (300 units virtual stock)
  await prisma.stockActual.create({
    data: {
      productoId: dbProductos[11].id,
      tallerId: dbTalleres[0].id,
      calidad: "PERFECTO",
      presentacion: "SIN_ETIQUETA",
      canal: "MAYORISTA",
      cantidadUnidades: 300,
      version: 1
    }
  });

  console.log("🎉 Seeding of automatic demo data completed successfully!");
}

seed()
  .catch((err) => {
    console.error("❌ Seeding failed with error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
