-- CreateEnum
CREATE TYPE "TipoProduccion" AS ENUM ('PROPIO', 'TERCERIZADO');

-- CreateEnum
CREATE TYPE "CalidadProducto" AS ENUM ('PRIMERA', 'FALLADO');

-- CreateEnum
CREATE TYPE "PresentacionProducto" AS ENUM ('ETIQUETADO', 'SIN_ETIQUETA');

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "medida" TEXT,
    "unidadesPorFardo" INTEGER NOT NULL,
    "permiteUnidad" BOOLEAN NOT NULL DEFAULT true,
    "permiteDocena" BOOLEAN NOT NULL DEFAULT true,
    "tipoProduccion" "TipoProduccion" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "categoriaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposito" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deposito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_nombre_key" ON "Categoria"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Deposito_nombre_key" ON "Deposito"("nombre");

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
