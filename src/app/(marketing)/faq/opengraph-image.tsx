import { OG_SIZE, renderOgImage } from "@/lib/og";

export const alt = "Playoff best ball questions";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "FAQ", title: "The draft, byes, injuries and buy-ins." });
}
