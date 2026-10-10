import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/indexing";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries();
}
