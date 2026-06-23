import { NextResponse } from "next/server";

const RAILWAY = "https://waheed-system-production.up.railway.app";

export async function GET() {
  try {
    const r = await fetch(`${RAILWAY}/orders`, { cache: "no-store" });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
