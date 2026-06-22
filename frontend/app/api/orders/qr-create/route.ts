import { NextRequest, NextResponse } from "next/server";

const RAILWAY = "https://waheed-system-production.up.railway.app";

/** Proxy POST /orders/qr-create to Railway — avoids CORS issues on mobile browsers. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const r = await fetch(`${RAILWAY}/orders/qr-create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
