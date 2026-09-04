import { NextResponse } from "next/server";
import { API } from "@/lib/apiFetch";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await fetch(`${API}/health`, {
      signal: AbortSignal.timeout(8000),
    });
    return NextResponse.json({ ok: r.ok, status: r.status });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
