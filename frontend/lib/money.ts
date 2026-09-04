/**
 * Single money formatter for the whole app (ticket 13 / plan §5.6 F9).
 *
 * The Restaurant's currency and its decimal precision come from `GET /me`
 * (see `loadSession()` in `lib/apiFetch.ts`, which calls `setCurrency()` once the
 * session loads). Decimals: JOD → 3, IQD → 0, everything else → 2.
 *
 * The customer-facing table page (`app/table/[id]`) never calls an authenticated
 * route, so it never learns the Restaurant's currency — it renders with the
 * default below (JOD). This is a documented limitation, not a bug: fixing it
 * would require exposing currency on the anonymous `GET /menu` response.
 */

const DEFAULT_CURRENCY = "JOD";

const CURRENCY_DECIMALS: Record<string, number> = {
  JOD: 3,
  IQD: 0,
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  JOD: "د.أ",
  IQD: "د.ع",
};

let currentCurrency = DEFAULT_CURRENCY;

/** Called once a session (`GET /me`) is known — see `loadSession()`. */
export function setCurrency(currency: string | null | undefined): void {
  if (currency) currentCurrency = currency.toUpperCase();
}

export function getCurrency(): string {
  return currentCurrency;
}

function decimalsFor(currency: string): number {
  return CURRENCY_DECIMALS[currency] ?? 2;
}

/** The short Arabic label shown next to an amount, e.g. "د.أ" for JOD. */
export function currencyLabel(currency?: string): string {
  const c = (currency ?? currentCurrency).toUpperCase();
  return CURRENCY_SYMBOLS[c] ?? c;
}

/** Formats `amount` with the currency's decimals and Arabic label, e.g. "12.500 د.أ". */
export function formatMoney(amount: number, currency?: string): string {
  const c = (currency ?? currentCurrency).toUpperCase();
  const decimals = decimalsFor(c);
  const number = (amount ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${number} ${currencyLabel(c)}`;
}
