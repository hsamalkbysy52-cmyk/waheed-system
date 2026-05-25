import { NextResponse } from "next/server";

const RAILWAY = "https://waheed-system-production.up.railway.app";

export const dynamic = "force-dynamic";

/** Proxy GET /menu from Railway — avoids CORS issues on mobile browsers. */
export async function GET() {
  try {
    const r = await fetch(`${RAILWAY}/menu`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: `Railway returned HTTP ${r.status}` },
        { status: r.status }
      );
    }
    const data = await r.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
