import { describe, expect, it } from "vitest";
import {
  AuthRequiredError,
  createUserReader,
  type CurrentUser,
} from "../../app/lib/current-user";

const user: CurrentUser = {
  id: "u1",
  email: "a@example.com",
  name: "A",
};

describe("current user reader", () => {
  it("rejects a request without a session", async () => {
    const reader = createUserReader(async () => null);

    await expect(reader.require(new Headers())).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("returns the authenticated user", async () => {
    const reader = createUserReader(async () => ({ user }));

    await expect(reader.require(new Headers())).resolves.toEqual(user);
    await expect(reader.optional(new Headers())).resolves.toEqual(user);
  });
});
