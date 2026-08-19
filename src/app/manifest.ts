import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SendGlide",
    short_name: "SendGlide",
    description: "Move anything. Anywhere.",
    start_url: "/",
    display: "standalone",
    background_color: "#090a0a",
    theme_color: "#090a0a",
    icons: [
      {
        src: "/sendglide-logo-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/sendglide-logo-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
