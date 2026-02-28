/**
 * Build a gateway URL using the current browser hostname instead of
 * hard-coded "localhost", so the dashboard works over LAN.
 * Falls back to "localhost" during SSR.
 */
export function buildGatewayUrl(port: number, path: string, params?: Record<string, string>): string {
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const url = new URL(`http://${host}:${port}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  return url.toString();
}
