-- CreateTable
CREATE TABLE "Encargo" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "cliente_nombre" TEXT NOT NULL,
    "cliente_tel" TEXT,
    "cliente_notas" TEXT,
    "talla" TEXT,
    "color" TEXT,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "destino_tipo" TEXT NOT NULL,
    "destino_ciudad" TEXT,
    "destino_dir" TEXT,
    "precio_cop" INTEGER NOT NULL,
    "envio_cop" INTEGER,
    "abono_cop" INTEGER,
    "estado" TEXT NOT NULL DEFAULT 'confirmado',
    "guia" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "comprado_at" TIMESTAMP(3),
    "en_casillero_at" TIMESTAMP(3),
    "en_bogota_at" TIMESTAMP(3),
    "despachado_at" TIMESTAMP(3),
    "entregado_at" TIMESTAMP(3),
    "cancelado_at" TIMESTAMP(3),

    CONSTRAINT "Encargo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Encargo_estado_idx" ON "Encargo"("estado");

-- CreateIndex
CREATE INDEX "Encargo_destino_tipo_estado_idx" ON "Encargo"("destino_tipo", "estado");

-- CreateIndex
CREATE INDEX "Encargo_cotizacionId_idx" ON "Encargo"("cotizacionId");

-- AddForeignKey
ALTER TABLE "Encargo" ADD CONSTRAINT "Encargo_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
