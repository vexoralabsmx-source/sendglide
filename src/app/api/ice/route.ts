import { headers } from "next/headers";
import { buildStunServers, parseIceServers } from "@/lib/ice";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET() {
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rate = checkRateLimit(`ice:${ip}`, 20, 60_000);
  if (!rate.allowed)
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rate.resetAt - Date.now()) / 1000)),
        },
      },
    );
  const servers = buildStunServers(process.env.STUN_URL);
  const cloudflareKeyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const cloudflareToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (cloudflareKeyId && cloudflareToken) {
    try {
      const response = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(cloudflareKeyId)}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cloudflareToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ttl: 3600 }),
          cache: "no-store",
        },
      );
      if (!response.ok)
        throw new Error(`Cloudflare TURN returned ${response.status}`);
      const generated = parseIceServers(await response.json());
      if (!generated.length)
        throw new Error("Cloudflare TURN returned no ICE servers");
      servers.push(...generated);
    } catch (error) {
      console.error("[api/ice] Cloudflare TURN unavailable", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  if (
    process.env.TURN_URL &&
    process.env.TURN_USERNAME &&
    process.env.TURN_CREDENTIAL
  )
    servers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  return Response.json(servers, {
    headers: {
      "Cache-Control": cloudflareKeyId ? "no-store" : "private, max-age=300",
      "X-RateLimit-Remaining": String(rate.remaining),
    },
  });
}
