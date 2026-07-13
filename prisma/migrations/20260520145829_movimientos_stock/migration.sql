-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('ENTRADA', 'SALIDA', 'MOVIMIENTO', 'ENTREGA_TALLER', 'DEVOLUCION_TALLER', 'AJUSTE', 'RECONVERSION');

-- CreateEnum
CREATE TYPE "TipoDeposito" AS ENUM ('FABRICA', 'CORTE', 'EXTERNO', 'MINORISTA');

-- CreateTable
CREATE TABLE "Taller" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "haceTrapos" BOOLEAN NOT NULL DEFAULT false,
    "haceRejillas" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Taller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitaTaller" (
    "id" TEXT NOT NULL,
    "tallerId" TEXT NOT NULL,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitaTaller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movimiento" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "productoId" TEXT NOT NULL,
    "depositoOrigenId" TEXT,
    "depositoDestinoId" TEXT,
    "tallerId" TEXT,
    "visitaTallerId" TEXT,
    "calidad" "CalidadProducto" NOT NULL,
    "presentacion" "PresentacionProducto" NOT NULL,
    "cantidadUnidades" INTEGER NOT NULL,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockActual" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "calidad" "CalidadProducto" NOT NULL,
    "presentacion" "PresentacionProducto" NOT NULL,
    "cantidadUnidades" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockActual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Taller_nombre_key" ON "Taller"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "StockActual_productoId_depositoId_calidad_presentacion_key" ON "StockActual"("productoId", "depositoId", "calidad", "presentacion");

-- AddForeignKey
ALTER TABLE "VisitaTaller" ADD CONSTRAINT "VisitaTaller_tallerId_fkey" FOREIGN KEY ("tallerId") REFERENCES "Taller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimiento" ADD CONSTRAINT "Movimiento_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimiento" ADD CONSTRAINT "Movimiento_depositoOrigenId_fkey" FOREIGN KEY ("depositoOrigenId") REFERENCES "Deposito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimiento" ADD CONSTRAINT "Movimiento_depositoDestinoId_fkey" FOREIGN KEY ("depositoDestinoId") REFERENCES "Deposito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimiento" ADD CONSTRAINT "Movimiento_tallerId_fkey" FOREIGN KEY ("tallerId") REFERENCES "Taller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimiento" ADD CONSTRAINT "Movimiento_visitaTallerId_fkey" FOREIGN KEY ("visitaTallerId") REFERENCES "VisitaTaller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockActual" ADD CONSTRAINT "StockActual_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockActual" ADD CONSTRAINT "StockActual_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
