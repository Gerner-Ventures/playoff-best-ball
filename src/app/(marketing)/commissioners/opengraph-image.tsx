import { OG_SIZE, renderOgImage } from "@/lib/og";

export const alt = "Run a playoff best ball league";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "For commissioners", title: "Run the league. Skip the spreadsheet." });
}
