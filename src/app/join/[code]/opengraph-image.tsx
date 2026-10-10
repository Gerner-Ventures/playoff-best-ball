import { db } from "@/lib/db";
import { getInvitePreview } from "@/domain/leagues/invite-preview";
import { OG_SIZE, renderOgImage } from "@/lib/og";

export const alt = "League invite";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const preview = await getInvitePreview(db, code);
  if (!preview) return renderOgImage({ eyebrow: "Playoff Best Ball", title: "Invite not found" });
  return renderOgImage({
    eyebrow: "You're invited",
    title: preview.leagueName,
    footer: preview.commissionerFirstName ? `${preview.commissionerFirstName}'s playoff best ball league` : "Playoff best ball",
  });
}
