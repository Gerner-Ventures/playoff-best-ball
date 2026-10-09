import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../../../../tests/helpers/db";
import { newToken } from "@/domain/subscribers/tokens";
import { GET, POST } from "./route";

async function active() {
  return testDb.emailSubscriber.create({
    data: { email: "fan@example.com", source: "footer", status: "ACTIVE", unsubscribeToken: newToken() },
  });
}

describe("POST /api/unsubscribe", () => {
  beforeEach(resetDb);

  it("handles RFC 8058 one-click: token in the query, form body, plain 200", async () => {
    const row = await active();
    const res = await POST(
      new Request(`http://localhost/api/unsubscribe?token=${row.unsubscribeToken}`, {
        method: "POST",
        body: new URLSearchParams({ "List-Unsubscribe": "One-Click" }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("UNSUBSCRIBED");
  });

  it("returns 404 to one-click for an unknown or mangled token", async () => {
    for (const token of [newToken(), "abc", ""]) {
      const res = await POST(new Request(`http://localhost/api/unsubscribe?token=${token}`, { method: "POST", body: new URLSearchParams({ "List-Unsubscribe": "One-Click" }) }));
      expect(res.status).toBe(404);
    }
  });

  it("redirects the page's button back to the page with a status", async () => {
    const row = await active();
    const res = await POST(new Request("http://localhost/api/unsubscribe", { method: "POST", body: new URLSearchParams({ token: row.unsubscribeToken }) }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`http://localhost/unsubscribe?token=${row.unsubscribeToken}&status=unsubscribed`);
  });

  it("redirects a mangled page token to the not-recognized state", async () => {
    const res = await POST(new Request("http://localhost/api/unsubscribe", { method: "POST", body: new URLSearchParams({ token: "trunc" }) }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/unsubscribe?token=trunc&status=invalid");
  });

  it("GET on the List-Unsubscribe URL bounces to the human page without changing state", async () => {
    const row = await active();
    const res = await GET(new Request(`http://localhost/api/unsubscribe?token=${row.unsubscribeToken}`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`http://localhost/unsubscribe?token=${row.unsubscribeToken}`);
    expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("ACTIVE");
  });
});
