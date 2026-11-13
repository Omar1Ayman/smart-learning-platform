/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // مطلوب لـ Docker / Railway
  compress: true,
  productionBrowserSourceMaps: false,
  trailingSlash: false,
  typescript: { ignoreBuildErrors: false },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.khanacademy.org" },
      { protocol: "https", hostname: "**.ytimg.com" },
      { protocol: "https", hostname: "**.youtube.com" },
    ],
    formats: ["image/webp"],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;