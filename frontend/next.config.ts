import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // El repo tiene un package-lock.json propio en la raíz (backend Express);
  // esto evita que Next.js infiera mal el workspace root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
