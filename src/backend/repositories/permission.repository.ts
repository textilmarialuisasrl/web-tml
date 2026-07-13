import { prisma } from "../db/prisma";

export const PermissionRepository = {
  async findByKey(clave: string) {
    return prisma.permiso.findUnique({
      where: { clave },
    });
  },

  async findAll() {
    return prisma.permiso.findMany({
      orderBy: { modulo: "asc" },
    });
  },

  async upsertPermission(data: { clave: string; descripcion: string; modulo: string }) {
    return prisma.permiso.upsert({
      where: { clave: data.clave },
      update: {
        descripcion: data.descripcion,
        modulo: data.modulo,
      },
      create: {
        clave: data.clave,
        descripcion: data.descripcion,
        modulo: data.modulo,
      },
    });
  },
};
