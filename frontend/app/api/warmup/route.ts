import { NextResponse } from "next/server";

const RAILWAY = "https://waheed-system-production.up.railway.app";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await fetch(`${RAILWAY}/health`, {
      signal: AbortSignal.timeout(8000),
    });
    return NextResponse.json({ ok: r.ok, status: r.status });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
