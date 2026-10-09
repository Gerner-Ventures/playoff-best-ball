import type { MarketingEmail } from "./sender";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildConfirmationEmail(input: {
  to: string;
  confirmUrl: string;
  unsubscribePageUrl: string;
  oneClickUnsubscribeUrl: string;
}): MarketingEmail {
  const text = [
    "Confirm you want Playoff Best Ball updates: one email a week through the NFL regular season, plus a heads-up when it's time to set up your league.",
    "",
    `Confirm: ${input.confirmUrl}`,
    "",
    "The link works for 7 days. If you didn't ask for this, ignore this email and you won't hear from us.",
    "",
    `Unsubscribe: ${input.unsubscribePageUrl}`,
  ].join("\n");

  const confirm = escapeHtml(input.confirmUrl);
  const unsubscribe = escapeHtml(input.unsubscribePageUrl);
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#14161c;line-height:1.5">
<p>Confirm you want Playoff Best Ball updates: one email a week through the NFL regular season, plus a heads-up when it's time to set up your league.</p>
<p><a href="${confirm}" style="display:inline-block;background:#1b4fe8;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Confirm my email</a></p>
<p>Or paste this link into your browser:<br>${confirm}</p>
<p style="color:#5c6270">The link works for 7 days. If you didn't ask for this, ignore this email and you won't hear from us.</p>
<p style="color:#5c6270"><a href="${unsubscribe}" style="color:#5c6270">Unsubscribe</a></p>
</body></html>`;

  return {
    to: input.to,
    subject: "Confirm your Playoff Best Ball updates",
    text,
    html,
    oneClickUnsubscribeUrl: input.oneClickUnsubscribeUrl,
  };
}
