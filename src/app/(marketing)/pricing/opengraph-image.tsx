import { OG_SIZE, renderOgImage } from "@/lib/og";

export const alt = "Playoff Best Ball pricing";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "Pricing", title: "Free to play. Premium per league." });
}
