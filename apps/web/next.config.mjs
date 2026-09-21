/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ticket-hub/contracts"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
