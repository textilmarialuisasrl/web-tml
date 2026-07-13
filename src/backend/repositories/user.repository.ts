import { prisma } from "../db/prisma";

export const UserRepository = {
  async findByEmail(email: string, tx?: any) {
    const client = tx || prisma;
    return client.usuario.findFirst({
      where: {
        email: email.toLowerCase().trim(),
        deletedAt: null,
      },
      include: {
        permisos: {
          include: {
            permiso: true,
          },
        },
      },
    });
  },

  async findById(id: string, tx?: any) {
    const client = tx || prisma;
    return client.usuario.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
  },

  async findByIdWithPermissions(id: string, tx?: any) {
    const client = tx || prisma;
    return client.usuario.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        permisos: {
          include: {
            permiso: true,
          },
        },
      },
    });
  },

  async updateLastLogin(id: string, tx?: any) {
    const client = tx || prisma;
    return client.usuario.update({
      where: { id },
      data: {
        ultimoLoginAt: new Date(),
      },
    });
  },

  async createUser(data: { nombre: string; email: string; passwordHash: string; activo?: boolean }, tx?: any) {
    const client = tx || prisma;
    return client.usuario.create({
      data: {
        nombre: data.nombre,
        email: data.email.toLowerCase().trim(),
        passwordHash: data.passwordHash,
        activo: data.activo !== undefined ? data.activo : true,
      },
    });
  },

  async assignPermissionToUser(usuarioId: string, permisoId: string, tx?: any) {
    const client = tx || prisma;
    return client.usuarioPermiso.upsert({
      where: {
        usuarioId_permisoId: {
          usuarioId,
          permisoId,
        },
      },
      create: {
        usuarioId,
        permisoId,
      },
      update: {},
    });
  },

  async clearUserPermissions(usuarioId: string, tx?: any) {
    const client = tx || prisma;
    return client.usuarioPermiso.deleteMany({
      where: { usuarioId },
    });
  },
};
