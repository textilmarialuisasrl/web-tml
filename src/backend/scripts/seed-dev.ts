import { prisma } from "../db/prisma";
import { env } from "../config/env";
import bcrypt from "bcrypt";

const PRODUCTOS_DATA = [
  // Hilados
  { nombre: "Algodón 24/1 Peinado Crudo", categoria: "HILADOS", unidadesPorFardo: 24, unidadPreferidaVisual: "FARDO" as const },
  { nombre: "Algodón 24/1 Peinado Negro", categoria: "HILADOS", unidadesPorFardo: 24, unidadPreferidaVisual: "FARDO" as const },
  { nombre: "Algodón 20/1 Cardado Azul", categoria: "HILADOS", unidadesPorFardo: 20, unidadPreferidaVisual: "FARDO" as const },
  { nombre: "Poliéster Texturizado 150/48", categoria: "HILADOS", unidadesPorFardo: 30, unidadPreferidaVisual: "FARDO" as const },
  { nombre: "Hilado de Lana Rústica Blanca", categoria: "HILADOS", unidadesPorFardo: 15, unidadPreferidaVisual: "FARDO" as const },
  { nombre: "Hilo Acrílico de Tejer 2/28", categoria: "HILADOS", unidadesPorFardo: 40, unidadPreferidaVisual: "FARDO" as const },
  
  // Telas
  { nombre: "Jersey de Algodón Peinado Gris", categoria: "TELAS", unidadesPorFardo: 10, unidadPreferidaVisual: "UNIDAD" as const },
  { nombre: "Jersey de Algodón Peinado Blanco", categoria: "TELAS", unidadesPorFardo: 10, unidadPreferidaVisual: "UNIDAD" as const },
  { nombre: "Frisa Invisible de Algodón Azul", categoria: "TELAS", unidadesPorFardo: 8, unidadPreferidaVisual: "UNIDAD" as const },
  { nombre: "Rústico con Lycra Negro", categoria: "TELAS", unidadesPorFardo: 12, unidadPreferidaVisual: "UNIDAD" as const },
  { nombre: "Interlock de Algodón Beige", categoria: "TELAS", unidadesPorFardo: 15, unidadPreferidaVisual: "UNIDAD" as const },
  { nombre: "Rib de Algodón 1x1 Blanco", categoria: "TELAS", unidadesPorFardo: 20, unidadPreferidaVisual: "UNIDAD" as const },
  { nombre: "Lino Rústico Lavado Natural", categoria: "TELAS", unidadesPorFardo: 10, unidadPreferidaVisual: "UNIDAD" as const },
  { nombre: "Gabardina de Algodón 8oz Arena", categoria: "TELAS", unidadesPorFardo: 10, unidadPreferidaVisual: "UNIDAD" as const },
  
  // Avios
  { nombre: "Etiquetas de Marca TML Bordadas", categoria: "AVIOS", unidadesPorFardo: 500, unidadPreferidaVisual: "DOCENA" as const },
  { nombre: "Etiquetas de Talle S de Poliéster", categoria: "AVIOS", unidadesPorFardo: 1000, unidadPreferidaVisual: "DOCENA" as const },
  { nombre: "Etiquetas de Talle M de Poliéster", categoria: "AVIOS", unidadesPorFardo: 1000, unidadPreferidaVisual: "DOCENA" as const },
  { nombre: "Etiquetas de Talle L de Poliéster", categoria: "AVIOS", unidadesPorFardo: 1000, unidadPreferidaVisual: "DOCENA" as const },
  { nombre: "Botones de Camisa Transparentes", categoria: "AVIOS", unidadesPorFardo: 1200, unidadPreferidaVisual: "DOCENA" as const },
  { nombre: "Cierres Fijos YKK de Cobre 18cm", categoria: "AVIOS", unidadesPorFardo: 100, unidadPreferidaVisual: "DOCENA" as const },
  { nombre: "Hilos de Coser 40/2 Spun Poliéster", categoria: "AVIOS", unidadesPorFardo: 50, unidadPreferidaVisual: "DOCENA" as const },
  { nombre: "Elástico de Cintura de 40mm Negro", categoria: "AVIOS", unidadesPorFardo: 10, unidadPreferidaVisual: "UNIDAD" as const },
  
  // Prendas
  { nombre: "Remera Algodón Básica Negra S", categoria: "PRENDAS", unidadesPorFardo: 50, unidadPreferidaVisual: "DOCENA" as const },
  { nombre: "Remera Algodón Básica Negra M", categoria: "PRENDAS", unidadesPorFardo: 50, unidadPreferidaVisual: "DOCENA" as const },
  { nombre: "Remera Algodón Básica Negra L", categoria: "PRENDAS", unidadesPorFardo: 50, unidadPreferidaVisual: "DOCENA" as const },
  { nombre: "Remera Algodón Básica Blanca S", categoria: "PRENDAS", unidadesPorFardo: 50, unidadPreferidaVisual: "DOCENA" as const },
  { nombre: "Remera Algodón Básica Blanca M", categoria: "PRENDAS", unidadesPorFardo: 50, unidadPreferidaVisual: "DOCENA" as const },
  { nombre: "Remera Algodón Básica Blanca L", categoria: "PRENDAS", unidadesPorFardo: 50, unidadPreferidaVisual: "DOCENA" as const },
  { nombre: "Pantalón Cargo Gabardina Verde 40", categoria: "PRENDAS", unidadesPorFardo: 20, unidadPreferidaVisual: "UNIDAD" as const },
  { nombre: "Pantalón Cargo Gabardina Verde 42", categoria: "PRENDAS", unidadesPorFardo: 20, unidadPreferidaVisual: "UNIDAD" as const },
  { nombre: "Pantalón Cargo Gabardina Verde 44", categoria: "PRENDAS", unidadesPorFardo: 20, unidadPreferidaVisual: "UNIDAD" as const },
  { nombre: "Buzo Oversized Frisa Negro S", categoria: "PRENDAS", unidadesPorFardo: 15, unidadPreferidaVisual: "DOCENA" as const },
  { nombre: "Buzo Oversized Frisa Negro M", categoria: "PRENDAS", unidadesPorFardo: 15, unidadPreferidaVisual: "DOCENA" as const },
  { nombre: "Buzo Oversized Frisa Negro L", categoria: "PRENDAS", unidadesPorFardo: 15, unidadPreferidaVisual: "DOCENA" as const }
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
  console.log("🌱 Starting realistic developer database seeding...");

  // 1. Clean existing records in reverse dependency order
  console.log("🧹 Cleaning old records...");
  await prisma.auditoria.deleteMany({});
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
  const dbPermisos = [];
  for (const perm of PERMISOS) {
    const created = await prisma.permiso.create({
      data: { clave: perm, descripcion: `Permiso para ${perm}`, modulo: "GENERAL" }
    });
    dbPermisos.push(created);
  }

  // 3. Seed Admin User
  console.log("👤 Seeding admin user...");
  const saltRounds = env.BCRYPT_ROUNDS;
  const hash = await bcrypt.hash("AdminPassword123!", saltRounds);
  const admin = await prisma.usuario.create({
    data: {
      nombre: "Administrador TML",
      email: "admin@textilmarialuisa.com",
      passwordHash: hash,
      activo: true
    }
  });

  // Assign all permissions to admin
  for (const perm of dbPermisos) {
    await prisma.usuarioPermiso.create({
      data: {
        usuarioId: admin.id,
        permisoId: perm.id
      }
    });
  }

  // 4. Seed Products
  console.log("📦 Seeding products (30+)...");
  const dbProductos = [];
  for (const prod of PRODUCTOS_DATA) {
    const created = await prisma.producto.create({
      data: {
        nombre: prod.nombre,
        categoria: prod.categoria,
        unidadesPorFardo: prod.unidadesPorFardo,
        activo: true,
        medida: "Metros"
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

  // 7. Seed Configurations
  console.log("⚙️ Seeding configurations...");
  await prisma.configuracion.create({
    data: {
      clave: "STOCK_MINIMO_ALERTA",
      valor: "15",
      descripcion: "Umbral mínimo global para disparar alertas de stock"
    }
  });

  // 8. Seed Initial Stock Actual Records
  console.log("📊 Seeding initial stock balances...");
  
  // Algodón Peinado Crudo in Deposito Central (240 units = 10 fardos)
  await prisma.stockActual.create({
    data: {
      productoId: dbProductos[0].id,
      depositoId: dbDepositos[0].id,
      calidad: "PERFECTO",
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
      canal: "MAYORISTA",
      cantidadUnidades: 120,
      version: 1
    }
  });

  // Jersey Algodon Peinado Blanco in Zona de Corte (50 units)
  await prisma.stockActual.create({
    data: {
      productoId: dbProductos[7].id,
      depositoId: dbDepositos[1].id,
      calidad: "PERFECTO",
      canal: "MAYORISTA",
      cantidadUnidades: 50,
      version: 1
    }
  });

  // Labels in Deposito Central (5000 units)
  await prisma.stockActual.create({
    data: {
      productoId: dbProductos[14].id,
      depositoId: dbDepositos[0].id,
      calidad: "PERFECTO",
      canal: "MAYORISTA",
      cantidadUnidades: 5000,
      version: 1
    }
  });

  // Clothes (Remera M Black) in Local Flores (200 units, etiquetadas, minorista)
  await prisma.stockActual.create({
    data: {
      productoId: dbProductos[23].id,
      depositoId: dbDepositos[3].id,
      calidad: "PERFECTO",
      canal: "MINORISTA",
      cantidadUnidades: 200,
      version: 1
    }
  });

  // Damaged clothes (Buzo Oversized L Black) in Local Flores (15 units)
  await prisma.stockActual.create({
    data: {
      productoId: dbProductos[33].id,
      depositoId: dbDepositos[3].id,
      calidad: "FALLADO",
      canal: "MINORISTA",
      cantidadUnidades: 15,
      version: 1
    }
  });

  // Remera S Black in Workshop Confecciones Juan (300 units virtual stock)
  await prisma.stockActual.create({
    data: {
      productoId: dbProductos[22].id,
      tallerId: dbTalleres[0].id,
      calidad: "PERFECTO",
      canal: "MAYORISTA",
      cantidadUnidades: 300,
      version: 1
    }
  });

  console.log("🎉 Seeding completed successfully!");
}

seed()
  .catch((err) => {
    console.error("❌ Seeding failed with error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
