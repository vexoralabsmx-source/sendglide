import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/privacy"].map((path) => ({
    url: `https://sendglide.app${path}`,
    changeFrequency: "monthly",
  }));
}
