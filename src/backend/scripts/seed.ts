import bcrypt from "bcrypt";
import { prisma } from "../db/prisma";
import { PermissionRepository } from "../repositories/permission.repository";
import { UserRepository } from "../repositories/user.repository";
import { env } from "../config/env";
import { TipoDeposito } from "../../generated/prisma/client";

// Unique catalog of all available permissions in ERP TML
const PERMISSIONS_CATALOG = [
  { clave: "STOCK_VER", descripcion: "Visualizar el stock actual en tiempo real", modulo: "STOCK" },
  { clave: "STOCK_EDITAR", descripcion: "Realizar ajustes y recuentos excepcionales de stock", modulo: "STOCK" },
  { clave: "MOVIMIENTOS_CREAR", descripcion: "Registrar nuevos movimientos (entregas, devoluciones, traslados)", modulo: "MOVIMIENTOS" },
  { clave: "MOVIMIENTOS_VER", descripcion: "Consultar el histórico y trazabilidad de movimientos", modulo: "MOVIMIENTOS" },
  { clave: "TALLERES_VER", descripcion: "Ver saldos pendientes e historial de talleres", modulo: "TALLERES" },
  { clave: "TALLERES_EDITAR", descripcion: "Administrar talleres (crear, editar, suspender)", modulo: "TALLERES" },
  { clave: "USUARIOS_EDITAR", descripcion: "Administrar usuarios y asignar accesos dinámicos", modulo: "SEGURIDAD" },
  { clave: "REPORTES_VER", descripcion: "Visualizar tableros y estadísticas de producción", modulo: "REPORTES" },
  { clave: "REPORTES_EXPORTAR", descripcion: "Descargar reportes analíticos de la empresa", modulo: "REPORTES" },
];

const DEPOSITOS_SEED = [
  { nombre: "Galpón TML", descripcion: "Depósito principal de almacenamiento de fardos y bobinas", tipo: TipoDeposito.FABRICA },
  { nombre: "Contenedor", descripcion: "Espacio intermedio de tránsito y almacenamiento rápido", tipo: TipoDeposito.TRANSITO },
  { nombre: "Zona de Corte", descripcion: "Sector físico destinado a corte de bobinas y fraccionamiento", tipo: TipoDeposito.CORTE },
  { nombre: "Depósito Eve", descripcion: "Depósito externo asignado a control de materia prima de Eve", tipo: TipoDeposito.TALLER },
  { nombre: "Depósito Vanesa", descripcion: "Depósito externo asignado a control de materia prima de Vanesa", tipo: TipoDeposito.TALLER },
  { nombre: "Casa TML", descripcion: "Local de venta directa o distribución minorista", tipo: TipoDeposito.MINORISTA },
];

const TALLERES_SEED = [
  { nombre: "Taller Principal", observaciones: "Taller de confección textil primario" },
  { nombre: "Taller Auxiliar", observaciones: "Taller para refuerzo de confección y costuras especiales" },
];

const PRODUCTOS_SEED = [
  { nombre: "Trapo Piso Económico", descripcion: "Trapo de piso clásico gris económico", medida: "50x60 cm", unidadesPorFardo: 60, permiteUnidad: true, categoria: "Trapos" },
  { nombre: "Rejilla Doble Liviana", descripcion: "Rejilla doble blanca multiuso liviana", medida: "30x40 cm", unidadesPorFardo: 100, permiteUnidad: true, categoria: "Rejillas" },
  { nombre: "Franela", descripcion: "Franela naranja suave de algodón de primera calidad", medida: "40x50 cm", unidadesPorFardo: 50, permiteUnidad: true, categoria: "Franelas" },
];

async function main() {
  console.log("🌱 Iniciando semillado (seeding) de la base de datos ERP TML...");

  // 1. Seed Permissions Catalog
  const createdPermissions = [];
  for (const perm of PERMISSIONS_CATALOG) {
    const upserted = await PermissionRepository.upsertPermission(perm);
    createdPermissions.push(upserted);
    console.log(`🔑 Permiso registrado: [${perm.modulo}] ${perm.clave}`);
  }

  // 2. Seed Default Administrator User
  const adminEmail = "admin@textilmarialuisa.com";
  const adminRawPassword = "admin_password_tml_2026";
  
  let adminUser = await UserRepository.findByEmail(adminEmail);

  if (!adminUser) {
    console.log(`👤 Creando usuario administrador por primera vez: ${adminEmail}`);
    // Using BCRYPT_ROUNDS loaded from the verified environment config
    const passwordHash = await bcrypt.hash(adminRawPassword, env.BCRYPT_ROUNDS);

    adminUser = await UserRepository.createUser({
      nombre: "Administrador TML",
      email: adminEmail,
      passwordHash: passwordHash,
      activo: true,
    }) as any;
  } else {
    console.log(`👤 Usuario administrador ya existente en base de datos.`);
  }

  if (!adminUser) {
    throw new Error("Fallo al crear o recuperar el usuario administrador.");
  }

  // 3. Assign Permissions to Administrator
  console.log("🔗 Vinculando todos los permisos al usuario administrador...");
  await UserRepository.clearUserPermissions(adminUser.id);
  for (const perm of createdPermissions) {
    await UserRepository.assignPermissionToUser(adminUser.id, perm.id);
  }

  // 4. Seed Depositos
  console.log("🏢 Registrando depósitos físicos y virtuales...");
  for (const dep of DEPOSITOS_SEED) {
    await prisma.deposito.upsert({
      where: { nombre: dep.nombre },
      update: { tipo: dep.tipo, descripcion: dep.descripcion },
      create: { nombre: dep.nombre, descripcion: dep.descripcion, tipo: dep.tipo },
    });
    console.log(`🏠 Depósito: ${dep.nombre} (${dep.tipo})`);
  }

  // 5. Seed Talleres
  console.log("🧵 Registrando talleres externos...");
  for (const tal of TALLERES_SEED) {
    await prisma.taller.upsert({
      where: { nombre: tal.nombre },
      update: { observaciones: tal.observaciones },
      create: { nombre: tal.nombre, observaciones: tal.observaciones },
    });
    console.log(`🧶 Taller: ${tal.nombre}`);
  }

  // 6. Seed Productos
  console.log("📦 Registrando catálogo de productos base...");
  for (const prod of PRODUCTOS_SEED) {
    // Find by name since we don't have CUIDs hardcoded in arrays
    const existing = await prisma.producto.findFirst({ where: { nombre: prod.nombre } });
    if (existing) {
      await prisma.producto.update({
        where: { id: existing.id },
        data: {
          descripcion: prod.descripcion,
          medida: prod.medida,
          unidadesPorFardo: prod.unidadesPorFardo,
          permiteUnidad: prod.permiteUnidad,
          categoria: prod.categoria,
        },
      });
    } else {
      await prisma.producto.create({
        data: prod,
      });
    }
    console.log(`👕 Producto: ${prod.nombre} (${prod.unidadesPorFardo} uds/fardo)`);
  }

  console.log(`
✅ ¡Semillado completado con éxito!
--------------------------------------------------
Datos de acceso del Administrador:
- Email: ${adminEmail}
- Contraseña: ${adminRawPassword}
- Permisos asignados: ${createdPermissions.length} de ${PERMISSIONS_CATALOG.length}
--------------------------------------------------
  `);
}

main()
  .catch((e) => {
    console.error("❌ Error durante el semillado:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
