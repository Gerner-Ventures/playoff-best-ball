// Ops alerts to a Slack incoming webhook. Env-gated: unset = console.warn only.
export async function sendOpsAlert(text: string): Promise<void> {
  const url = process.env.OPS_ALERT_SLACK_WEBHOOK_URL;
  if (!url) {
    console.warn(`[ops-alert] (no webhook configured) ${text}`);
    return;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) console.error(`[ops-alert] slack webhook responded ${res.status}`);
  } catch (err) {
    console.error("[ops-alert] slack webhook failed", err); // alerting must never throw
  }
}
