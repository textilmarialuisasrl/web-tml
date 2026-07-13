import { prisma } from "../db/prisma";

export const TallerRepository = {
  async findById(id: string, tx?: any) {
    const client = tx || prisma;
    return client.taller.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
  },

  async findManyActive() {
    return prisma.taller.findMany({
      where: {
        activo: true,
        deletedAt: null,
      },
      orderBy: { nombre: "asc" },
    });
  },

  async create(data: {
    nombre: string;
    observaciones?: string | null;
    activo?: boolean;
  }) {
    return prisma.taller.create({
      data,
    });
  },
};
