import { prisma } from "../db/prisma";

export const ProductRepository = {
  async findById(id: string, tx?: any) {
    const client = tx || prisma;
    return client.producto.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
  },

  async findManyActive() {
    return prisma.producto.findMany({
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
    medida?: string | null;
    unidadesPorFardo: number;
    permiteUnidad?: boolean;
    activo?: boolean;
    categoria: string;
    unidadPreferidaVisual?: "UNIDAD" | "DOCENA" | "FARDO";
  }) {
    return prisma.producto.create({
      data,
    });
  },
};
