export const PUBLIC_STUN_URLS = [
  "stun:stun.cloudflare.com:3478",
  "stun:stun.cloudflare.com:53",
  "stun:stun.l.google.com:19302",
] as const;

export function buildStunServers(configured?: string): RTCIceServer[] {
  const extra = configured
    ?.split(",")
    .map((value) => value.trim())
    .filter((value) => value.startsWith("stun:"));
  return [{ urls: [...new Set([...(extra ?? []), ...PUBLIC_STUN_URLS])] }];
}

export function parseIceServers(payload: unknown): RTCIceServer[] {
  if (!payload || typeof payload !== "object") return [];
  const value = (payload as { iceServers?: unknown }).iceServers;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RTCIceServer => {
    if (!item || typeof item !== "object") return false;
    const urls = (item as { urls?: unknown }).urls;
    return (
      typeof urls === "string" ||
      (Array.isArray(urls) && urls.every((url) => typeof url === "string"))
    );
  });
}
