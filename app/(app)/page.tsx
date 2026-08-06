import { NuevaCotizacion } from "@/components/nueva-cotizacion";
import { obtenerSettings } from "@/lib/settings";
import { obtenerTrm } from "@/lib/trm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nueva cotización · Cotizador" };

export default async function HomePage() {
  const [settings, trm] = await Promise.all([obtenerSettings(), obtenerTrm()]);
  return <NuevaCotizacion settings={settings} trm={trm} />;
}
