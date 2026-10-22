import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 blocks dev-resource HMR/webpack requests from origins it didn't
  // serve from. Playwright e2e (chunk 29) navigates to 127.0.0.1:<E2E_PORT>,
  // which Next sees as a cross-origin request and blocks. Allowing the local
  // loopback hosts is a dev-only opt-in and has no effect on production.
  // To open the dev server from another host (a LAN or Tailscale IP, a tunnel
  // hostname), list those hosts comma-separated in ALLOWED_DEV_ORIGINS in .env.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    ...(process.env.ALLOWED_DEV_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ],
};

export default nextConfig;
