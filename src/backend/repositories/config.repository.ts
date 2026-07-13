import { prisma } from "../db/prisma";

export const ConfigRepository = {
  async findByKey(clave: string) {
    return prisma.configuracion.findUnique({
      where: { clave },
    });
  },

  async upsertConfig(clave: string, valor: string, descripcion?: string | null) {
    return prisma.configuracion.upsert({
      where: { clave },
      update: { valor, descripcion },
      create: { clave, valor, descripcion },
    });
  },

  async findMany() {
    return prisma.configuracion.findMany({
      orderBy: { clave: "asc" },
    });
  },

  async checkDatabaseHealth(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  },
};
