/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
  // Three.js needs to run client-side only
  webpack(config) {
    config.externals = config.externals || [];
    return config;
  },
};

export default nextConfig;
