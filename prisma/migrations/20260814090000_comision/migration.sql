-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "comision_pct" DOUBLE PRECISION NOT NULL DEFAULT 0.1;

-- AlterTable
ALTER TABLE "Cotizacion" ADD COLUMN     "comision_cop" DOUBLE PRECISION,
ADD COLUMN     "margen_neto_cop" DOUBLE PRECISION;
