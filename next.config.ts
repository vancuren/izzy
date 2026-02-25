import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', '@e2b/code-interpreter'],
}

export default nextConfig
