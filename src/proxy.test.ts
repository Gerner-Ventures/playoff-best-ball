import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

describe("proxy", () => {
  it("sends a visitor with a session cookie from / to the dashboard", () => {
    const res = proxy(new NextRequest("http://localhost:3000/", { headers: { cookie: "better-auth.session_token=abc.def" } }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });

  it("recognizes the __Secure- cookie production sets over https", () => {
    const res = proxy(new NextRequest("https://playoffbestball.com/", { headers: { cookie: "__Secure-better-auth.session_token=abc.def" } }));
    expect(res.headers.get("location")).toBe("https://playoffbestball.com/dashboard");
  });

  it("lets signed-out visitors through to the static page", () => {
    const res = proxy(new NextRequest("http://localhost:3000/"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("runs on the home page only", () => {
    expect(config.matcher).toBe("/");
  });
});
