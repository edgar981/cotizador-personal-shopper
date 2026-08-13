import { HistorialLista, type ItemHistorial } from "@/components/historial-lista";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Historial · Cotizador" };

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Bogota",
});

export default async function HistorialPage() {
  const cotizaciones = await prisma.cotizacion.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      nombre: true,
      imagen_url: true,
      captura_url: true,
      categoria: true,
      precio_cop: true,
      createdAt: true,
    },
  });

  // La fecha se formatea aquí: así el cliente no arrastra la zona de Bogotá.
  const items: ItemHistorial[] = cotizaciones.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    imagen: c.captura_url ?? c.imagen_url ?? null,
    categoria: c.categoria,
    precio_cop: c.precio_cop,
    fecha: formatoFecha.format(c.createdAt),
  }));

  return (
    <div className="mx-auto w-full max-w-lg px-5 pt-8">
      <HistorialLista items={items} />
    </div>
  );
}
