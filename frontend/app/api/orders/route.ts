import { NextRequest, NextResponse } from "next/server";
import { API } from "@/lib/apiFetch";

/** Proxy GET /orders — forwards the Restaurant slug so the customer's occupancy
 *  check (redacted {id, table_number, status} rows) reaches the right tenant. */
export async function GET(req: NextRequest) {
  const slug = req.headers.get("x-restaurant-slug") || req.nextUrl.searchParams.get("r") || "";
  try {
    const url = new URL(`${API}/orders`);
    if (slug) url.searchParams.set("r", slug);
    const headers: Record<string, string> = {};
    if (slug) headers["X-Restaurant-Slug"] = slug;
    const r = await fetch(url, { headers, cache: "no-store" });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
