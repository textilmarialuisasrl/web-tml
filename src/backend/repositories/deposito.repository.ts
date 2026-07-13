import { prisma } from "../db/prisma";

export const DepositoRepository = {
  async findById(id: string, tx?: any) {
    const client = tx || prisma;
    return client.deposito.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
  },

  async findManyActive() {
    return prisma.deposito.findMany({
      where: {
        activo: true,
        deletedAt: null,
      },
      orderBy: { nombre: "asc" },
    });
  },

  async create(data: {
    nombre: string;
    descripcion?: string | null;
    tipo: "FABRICA" | "TALLER" | "TRANSITO" | "CORTE" | "MINORISTA";
    activo?: boolean;
  }) {
    return prisma.deposito.create({
      data,
    });
  },
};
