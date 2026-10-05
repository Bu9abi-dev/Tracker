import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Statement uploads (up to 4 MB) go through a server action; Vercel caps requests at ~4.5 MB.
    serverActions: { bodySizeLimit: "4.4mb" },
  },
  // The CSV data source reads /data at runtime; make sure Vercel bundles it.
  outputFileTracingIncludes: { "/**": ["./data/**/*.csv"] },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Private financial data: never cache pages or API responses anywhere.
        source: "/((?!_next/static|_next/image|icons/).*)",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
