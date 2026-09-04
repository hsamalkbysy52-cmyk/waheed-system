import { setCurrency } from "@/lib/money";

export const API = process.env.NEXT_PUBLIC_API_URL || "https://waheed-system-production.up.railway.app";

const NO_REDIRECT_PREFIXES = ["/login", "/register", "/table/"];

function onExemptPath(): boolean {
  if (typeof window === "undefined") return true;
  const path = window.location.pathname;
  return path === "/login" || path === "/register" || NO_REDIRECT_PREFIXES.some((p) => path.startsWith(p));
}

/** Logs the session out locally. Does not itself navigate. */
export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.clear();
  cachedSession = null;
  sessionPromise = null;
}

function clearSessionAndRedirect(): void {
  clearSession();
  if (typeof window !== "undefined" && !onExemptPath()) {
    window.location.assign("/login");
  }
}

/** Calls `POST /auth/refresh` with the stored refresh token, without an Authorization header
 *  (an expired access token there would make the call fail before it even runs). */
async function tryRefresh(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const refreshToken = localStorage.getItem("refresh");
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.token) return false;
    localStorage.setItem("token", data.token);
    if (data.refresh) localStorage.setItem("refresh", data.refresh);
    return true;
  } catch {
    return false;
  }
}

/** fetch() لكن يضيف Authorization: Bearer <token> تلقائياً من localStorage.
 *  On a 401 it tries `/auth/refresh` once and retries; if that fails it clears the
 *  session and sends the user back to `/login` (unless already on a public page). */
export async function authFetch(path: string, options: RequestInit = {}, _retried = false): Promise<Response> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API}${path}`, { ...options, headers });

  if (response.status === 401 && !_retried) {
    const refreshed = await tryRefresh();
    if (refreshed) return authFetch(path, options, true);
    clearSessionAndRedirect();
  }

  return response;
}

export type Session = {
  username: string;
  role: string;
  restaurant_id: number | null;
  restaurant: { name: string; slug: string; currency: string; timezone: string } | null;
};

let cachedSession: Session | null = null;
let sessionPromise: Promise<Session | null> | null = null;

/** GETs `/me` once per page load (cached in memory) and sets the money formatter's
 *  currency as a side effect. Returns null when there is no valid session. */
export function loadSession(): Promise<Session | null> {
  if (cachedSession) return Promise.resolve(cachedSession);
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    try {
      const res = await authFetch("/me");
      if (!res.ok) return null;
      const data = (await res.json()) as Session;
      cachedSession = data;
      setCurrency(data.restaurant?.currency);
      return data;
    } catch {
      return null;
    } finally {
      sessionPromise = null;
    }
  })();

  return sessionPromise;
}
