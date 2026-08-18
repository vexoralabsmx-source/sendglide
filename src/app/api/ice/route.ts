import { headers } from "next/headers";
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
  const servers: RTCIceServer[] = [
    { urls: process.env.STUN_URL || "stun:stun.l.google.com:19302" },
  ];
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
      "Cache-Control": "private, max-age=300",
      "X-RateLimit-Remaining": String(rate.remaining),
    },
  });
}
