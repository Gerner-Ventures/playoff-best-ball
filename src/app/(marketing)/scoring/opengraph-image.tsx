import { OG_SIZE, renderOgImage } from "@/lib/og";

export const alt = "Playoff best ball scoring";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "Scoring", title: "Standard, half PPR or full PPR." });
}
