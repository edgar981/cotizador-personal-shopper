import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Satori necesita los .ttf en disco: hay que incluirlos en el bundle de la
  // función que renderiza la historia.
  outputFileTracingIncludes: {
    "/api/historia/[id]": ["./assets/fonts/**"],
  },
};

export default nextConfig;
