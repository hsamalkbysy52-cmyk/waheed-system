import { NextResponse } from "next/server";
import os from "os";

export const dynamic = "force-dynamic";

/**
 * Returns the best publicly-reachable base URL for QR code generation.
 *
 * Priority:
 *  1. SITE_URL env var  — explicit override (set this in Vercel env vars if needed)
 *  2. VERCEL_URL        — injected by Vercel on every deployment (server-side only)
 *  3. Local network IP  — auto-detected via os.networkInterfaces() for dev/LAN use
 *  4. localhost fallback
 */
export function GET() {
  // 1. Explicit override
  if (process.env.SITE_URL) {
    return NextResponse.json({ url: process.env.SITE_URL.replace(/\/$/, "") });
  }

  // 2. Vercel deployment (VERCEL_URL has no protocol prefix)
  if (process.env.VERCEL_URL) {
    return NextResponse.json({ url: `https://${process.env.VERCEL_URL}` });
  }

  // 3. Local development — find the first non-loopback IPv4 address so phones
  //    on the same WiFi can reach the dev server.
  const port = process.env.PORT ?? "3000";
  const nets = os.networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return NextResponse.json({ url: `http://${iface.address}:${port}` });
      }
    }
  }

  // 4. Last resort
  return NextResponse.json({ url: `http://localhost:${port}` });
}
