-- AlterTable
ALTER TABLE "Cotizacion" ADD COLUMN     "captura_url" TEXT,
ADD COLUMN     "imagen_origen" TEXT NOT NULL DEFAULT 'url';
