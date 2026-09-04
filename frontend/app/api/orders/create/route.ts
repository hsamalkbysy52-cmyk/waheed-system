import { NextRequest, NextResponse } from "next/server";
import { API } from "@/lib/apiFetch";

/** Proxy POST /orders/create to Railway — avoids CORS issues on mobile browsers.
 *  Forwards the Restaurant slug so the QR order lands on the right tenant; the
 *  backend's Arabic {error, detail} body (offline/suspended/unknown/missing
 *  restaurant) is passed through untouched for the customer page to display. */
export async function POST(req: NextRequest) {
  const slug = req.headers.get("x-restaurant-slug") || req.nextUrl.searchParams.get("r") || "";
  try {
    const body = await req.json();
    const url = new URL(`${API}/orders/create`);
    if (slug) url.searchParams.set("r", slug);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (slug) headers["X-Restaurant-Slug"] = slug;
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
