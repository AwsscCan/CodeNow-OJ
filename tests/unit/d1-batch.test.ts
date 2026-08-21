import { describe, expect, it, vi } from "vitest";
import { executeD1Batch } from "../../app/server/admin/admin-account-service";

function statement(mapResult = vi.fn()) {
  return {
    _prepare() {
      return {
        getQuery: () => ({ sql: "select 1", params: [] }),
        mapResult,
      };
    },
  };
}

function execute(responses: unknown[], mapResult = vi.fn()) {
  const client = {
    prepare: vi.fn(() => ({ bind: vi.fn(() => ({})) })),
    batch: vi.fn(async () => responses),
  };
  return { promise: executeD1Batch({ $client: client }, [statement(mapResult)]), mapResult };
}

describe("D1 batch response validation", () => {
  it("fails closed on an unsuccessful statement response before mapping results", async () => {
    const call = execute([{ success: false, error: "D1 write failed" }]);

    await expect(call.promise).rejects.toThrow("D1 write failed");
    expect(call.mapResult).not.toHaveBeenCalled();
  });

  it("fails closed when a D1 batch response is missing", async () => {
    const call = execute([]);

    await expect(call.promise).rejects.toThrow("D1 batch statement 0 did not succeed");
    expect(call.mapResult).not.toHaveBeenCalled();
  });

  it("fails closed when D1 returns more responses than statements", async () => {
    const call = execute([{ success: true }, { success: true }]);

    await expect(call.promise).rejects.toThrow("D1 batch statement 1 did not succeed");
    expect(call.mapResult).not.toHaveBeenCalled();
  });
});
