/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prisma resolves the query engine from node_modules; keep it external to the
  // server bundle so the native binary is picked up from disk.
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },
  eslint: {
    dirs: ['src'],
  },
};

export default nextConfig;
