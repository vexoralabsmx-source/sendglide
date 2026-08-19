# SendGlide

**Move anything. Anywhere.** SendGlide is a browser-first, anonymous device transfer application. It pairs browsers with a QR code or short code, negotiates a WebRTC DataChannel, and moves files and text directly between peers.

## What works

- QR, short-code, and shareable URL pairing
- Supabase Realtime signaling in deployed environments
- Real WebRTC offer/answer/ICE negotiation with STUN and optional TURN
- Ordered, chunked file transfer with DataChannel backpressure
- Incoming transfer approval, progress, cancellation protocol, SHA-256 verification, and downloads
- Text, URL, email, phone, and code-like content detection
- Paste events, drag-and-drop, multi-file queue, and mobile camera capture input
- Responsive light/dark UI, keyboard focus, reduced motion, PWA manifest/service worker
- Strict Zod validation for the internal `SEND/1` protocol

Files are not uploaded to the application server in direct mode. Supabase carries signaling messages only. On restrictive networks, WebRTC may route encrypted packets through the configured TURN server.

## Local setup

Requirements: Node 20+ and pnpm 10+.

```bash
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

Without Supabase variables, signaling uses `BroadcastChannel`, which is useful for testing two tabs on the same browser origin. Cross-device pairing requires Supabase Realtime:

1. Create a Supabase project and enable Realtime.
2. Copy the project URL and anon key to `.env.local`.
3. Apply `supabase/migrations/20260818000000_sendglide.sql` if using persistent session metadata.
4. Restart the development server.
5. Open the displayed LAN/HTTPS URL on both devices. Camera and some PWA features require a secure context.

The ICE endpoint always includes Cloudflare STUN on ports 53 and 3478 plus Google STUN. For restrictive networks, configure `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN`; `/api/ice` exchanges that server-only key for one-hour browser credentials. Static `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL` values remain supported as an alternative.

## Quality commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Architecture

- `src/lib/protocol` — validated `SEND/1` discriminated-union messages
- `src/lib/webrtc.ts` — DataChannel lifecycle and flow control
- `src/lib/signaling.ts` — Supabase Realtime / local signaling adapter
- `src/lib/transfer.ts` — chunk metadata, assembly, hashing, formatting
- `src/components/sendglide-app.tsx` — interactive product shell and transfer orchestration
- `supabase/migrations` — locked-down metadata schema with RLS enabled

The transport boundary is intentionally separate from the UI, so a future encrypted cloud relay or native client can implement the same protocol.

## Honest limitations and production checklist

- Browser pages cannot discover arbitrary nearby devices, guarantee deletion after download, or open the operating system Downloads folder.
- “Send once” can only remove an item from SendGlide after it is opened; it cannot revoke a saved copy.
- The current file receiver assembles chunks into a Blob. Very large multi-gigabyte transfers should add File System Access API streaming with a fallback before advertising unlimited sizes.
- The in-process rate limiter is suitable for local and single-instance protection. Configure a Redis/Upstash adapter before horizontally scaled production traffic.
- Public receive links and authenticated trusted-device history are architecture-ready database concepts, not part of this anonymous two-peer transfer slice.
- Before launch: use a production TURN provider, add Redis rate limiting, mediate session creation/join through authenticated server functions, run multi-browser Playwright tests, and verify iOS Safari on physical hardware.

## Security notes

Incoming protocol messages are parsed with Zod, filenames are sanitized, URLs are restricted to HTTP(S), arbitrary HTML is never rendered, and normal P2P file content is not stored in PostgreSQL. Secrets are server-only; only the Supabase anon key is public by design. Security headers are configured in `next.config.ts`.
