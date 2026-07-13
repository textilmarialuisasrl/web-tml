import bcrypt from "bcrypt";
import { prisma } from "../db/prisma";
import "dotenv/config";

const DEV_PERMISSIONS = [
  "MOVIMIENTOS_CREAR",
  "MOVIMIENTOS_VER",
  "STOCK_VER",
  "STOCK_EDITAR",
  "ADMIN_SISTEMA"
];

async function main() {
  console.log("🌱 Iniciando seed de usuario administrador de desarrollo...");

  // 1. Asegurar que existan los permisos
  console.log("🔑 Verificando permisos...");
  const dbPermissions = [];
  for (const permKey of DEV_PERMISSIONS) {
    let perm = await prisma.permiso.findUnique({
      where: { clave: permKey }
    });
    if (!perm) {
      perm = await prisma.permiso.create({
        data: {
          clave: permKey,
          descripcion: `Permiso para ${permKey}`,
          modulo: "GENERAL"
        }
      });
      console.log(`+ Creado permiso: ${permKey}`);
    }
    dbPermissions.push(perm);
  }

  // 2. Crear o actualizar el usuario
  const email = "admin@tml.local";
  const password = "Admin123!";
  const passwordHash = await bcrypt.hash(password, 10);

  console.log(`👤 Creando/actualizando usuario: ${email}`);
  let user = await prisma.usuario.findUnique({
    where: { email }
  });

  if (user) {
    user = await prisma.usuario.update({
      where: { email },
      data: {
        nombre: "Admin Dev",
        passwordHash,
        activo: true,
        sessionVersion: { increment: 1 } // Forzar desvinculación de sesiones previas
      }
    });
    console.log("✓ Usuario existente actualizado con nueva contraseña.");
  } else {
    user = await prisma.usuario.create({
      data: {
        nombre: "Admin Dev",
        email,
        passwordHash,
        activo: true,
        sessionVersion: 1
      }
    });
    console.log("✓ Nuevo usuario de desarrollo creado.");
  }

  // 3. Vincular permisos
  console.log("🔗 Asignando permisos al usuario...");
  for (const perm of dbPermissions) {
    const existingRelation = await prisma.usuarioPermiso.findUnique({
      where: {
        usuarioId_permisoId: {
          usuarioId: user.id,
          permisoId: perm.id
        }
      }
    });
    if (!existingRelation) {
      await prisma.usuarioPermiso.create({
        data: {
          usuarioId: user.id,
          permisoId: perm.id
        }
      });
      console.log(`  + Permiso asignado: ${perm.clave}`);
    }
  }

  console.log("🎉 Seed de desarrollo completado exitosamente!");
}

main()
  .catch((err) => {
    console.error("❌ Error ejecutando el seed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
