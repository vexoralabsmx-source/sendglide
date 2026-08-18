import Link from "next/link";
export const metadata = { title: "Privacy" };
export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <Link href="/" className="brand">
        SENDGLIDE
      </Link>
      <article>
        <p className="eyebrow">PRIVACY</p>
        <h1>Direct by design.</h1>
        <p>
          When a direct WebRTC connection succeeds, transferred content travels
          between the paired browsers and is not persisted by SendGlide. WebRTC
          encrypts data in transit.
        </p>
        <h2>What passes through our infrastructure</h2>
        <p>
          Pairing and WebRTC signaling metadata may pass through Supabase
          infrastructure. Signaling exchanges connection descriptions and
          network candidates; it does not contain the files or text you
          transfer.
        </p>
        <h2>Browser and relay limitations</h2>
        <p>
          Some networks require a TURN relay. In that case encrypted WebRTC
          packets pass through the relay, but the relay is not designed to store
          their contents. This project does not implement a cloud file fallback.
        </p>
        <h2>Local history</h2>
        <p>
          Anonymous transfer history exists only in the active browser session.
          “Send once” removes an item from SendGlide after opening; it cannot
          delete copies already saved by a recipient.
        </p>
      </article>
    </main>
  );
}
