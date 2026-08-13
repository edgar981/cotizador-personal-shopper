import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Satori necesita los .ttf en disco: hay que incluirlos en el bundle de la
  // función que renderiza la historia.
  outputFileTracingIncludes: {
    "/api/historia/[id]": ["./assets/fonts/**"],
    // La historia doble se renderiza en otra función: necesita su propia copia
    // de las fuentes o en producción falla al no encontrar los .ttf.
    "/api/historia-doble": ["./assets/fonts/**"],
  },
};

export default nextConfig;
