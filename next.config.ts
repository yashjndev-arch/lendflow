import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma"],
  // The dev server is bound to 0.0.0.0. Next.js only trusts localhost unless
  // this host is listed, so opening 127.0.0.1 never loads the client runtime
  // and controlled previews stay blank.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
