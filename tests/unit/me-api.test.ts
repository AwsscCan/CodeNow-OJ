import { describe, expect, it } from "vitest";
import { GET } from "../../app/api/me/route";

describe("current user API", () => {
  it("returns an anonymous user without exposing session fields", async () => {
    const response = await GET(new Request("http://localhost:3000/api/me"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
