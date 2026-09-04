import { NextRequest, NextResponse } from "next/server";
import { API } from "@/lib/apiFetch";

export const dynamic = "force-dynamic";

/** Proxy GET /menu from Railway — avoids CORS issues on mobile browsers.
 *  Forwards the Restaurant slug (X-Restaurant-Slug header or ?r= query) so the
 *  customer's QR page reaches the right tenant (plan §5.6 F1). */
export async function GET(req: NextRequest) {
  const slug = req.headers.get("x-restaurant-slug") || req.nextUrl.searchParams.get("r") || "";
  try {
    const url = new URL(`${API}/menu`);
    if (slug) url.searchParams.set("r", slug);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (slug) headers["X-Restaurant-Slug"] = slug;
    const r = await fetch(url, { headers });
    const data = await r.json();
    if (!r.ok) return NextResponse.json(data, { status: r.status });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
