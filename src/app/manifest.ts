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
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
