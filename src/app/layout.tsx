import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://sendglide.app",
  ),
  title: {
    default: "SendGlide — Move anything between your devices",
    template: "%s — SendGlide",
  },
  description:
    "Send files, photos, links, and text between your devices instantly. No account required.",
  applicationName: "SendGlide",
  openGraph: {
    title: "SendGlide",
    description: "Move anything. Anywhere.",
    type: "website",
    siteName: "SendGlide",
  },
  twitter: {
    card: "summary_large_image",
    title: "SendGlide",
    description: "Move anything. Anywhere.",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#090a0a" },
  ],
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
