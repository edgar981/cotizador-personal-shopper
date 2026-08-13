-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "zonas_envio" JSONB;

-- AlterTable
ALTER TABLE "Cotizacion" ADD COLUMN     "envio_nacional_cop" INTEGER,
ADD COLUMN     "zona_envio" TEXT;
