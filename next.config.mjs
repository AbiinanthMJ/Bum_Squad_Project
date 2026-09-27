/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the Turbopack workspace root to this project. Without it, Next.js walks up,
  // finds the stray pnpm-workspace.yaml in C:\Users\Abiinanth.m.j and warns that it
  // ignored it because it would include the whole home directory (see dev.log).
  turbopack: { root: import.meta.dirname },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
