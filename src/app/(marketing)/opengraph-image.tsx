import { OG_SIZE, renderOgImage } from "@/lib/og";

export const alt = "Playoff Best Ball: draft once, watch all playoffs";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "NFL playoff best ball", title: "Draft once. Watch all playoffs." });
}
