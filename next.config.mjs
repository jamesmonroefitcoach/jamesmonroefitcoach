/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  experimental: {
    outputFileTracingExcludes: {
      "*": [
        "node_modules/@swc/**",
        "node_modules/@esbuild/**",
        "node_modules/webpack/**",
        "node_modules/terser/**",
        "node_modules/typescript/**",
        "node_modules/eslint/**",
      ],
    },
  },
};

export default nextConfig;
