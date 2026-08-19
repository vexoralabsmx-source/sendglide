import { describe, expect, it } from "vitest";
import { buildStunServers, parseIceServers, PUBLIC_STUN_URLS } from "@/lib/ice";

describe("ICE configuration", () => {
  it("always includes resilient public STUN fallbacks", () => {
    const [server] = buildStunServers("stun:custom.example.com:3478");
    expect(server.urls).toEqual([
      "stun:custom.example.com:3478",
      ...PUBLIC_STUN_URLS,
    ]);
  });

  it("accepts only valid ICE server entries", () => {
    expect(
      parseIceServers({
        iceServers: [
          {
            urls: ["turn:turn.example.com:3478"],
            username: "u",
            credential: "c",
          },
          { urls: 42 },
          null,
        ],
      }),
    ).toEqual([
      { urls: ["turn:turn.example.com:3478"], username: "u", credential: "c" },
    ]);
  });
});
