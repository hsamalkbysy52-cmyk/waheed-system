export const API = process.env.NEXT_PUBLIC_API_URL || "https://waheed-system-production.up.railway.app";

/** fetch() لكن يضيف Authorization: Bearer <token> تلقائياً من localStorage. */
export function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API}${path}`, { ...options, headers });
}
