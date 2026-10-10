import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/**
 * One share-card template, in cobalt. Mostly seen as group-chat previews, so the
 * title has to read at thumbnail size. Inline styles only: ImageResponse supports a
 * flexbox subset of CSS and no class names.
 */
export function renderOgImage({ eyebrow, title, footer = "playoffbestball.com" }: { eyebrow: string; title: string; footer?: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#f7f8fa",
          color: "#14161c",
          borderTop: "16px solid #1b4fe8",
        }}
      >
        <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: "#1b4fe8", textTransform: "uppercase", letterSpacing: 2 }}>
          {eyebrow}
        </div>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, maxWidth: 1000 }}>{title}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#3c424e" }}>
          <span>Playoff Best Ball</span>
          <span>{footer}</span>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
