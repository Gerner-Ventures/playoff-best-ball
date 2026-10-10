import { OG_SIZE, renderOgImage } from "@/lib/og";

export const alt = "How playoff best ball works";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "How it works", title: "Nine players. Four rounds. Nothing to manage." });
}
