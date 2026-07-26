import { describe, expect, it } from "vitest";
import {
  FIRST_BATCH_CAP,
  GENERATION_BUDGET_MS,
  PER_CALL_TIMEOUT_CAP_MS,
} from "../../app/api/_lib/test-generation-pipeline";

/**
 * 生成稳定性参数回归锁：
 * - 总预算过短会导致多批次生成中途被掐(数量不足)；
 * - 单批超时过短在上游高峰期连环失败(stagnant 提前退出)；
 * - 首批请求过大使 max_tokens 截断 JSON(整批报废)。
 */
describe("AI 测试点生成稳定性参数", () => {
  it("总时间预算至少 90 秒，容纳多批次生成", () => {
    expect(GENERATION_BUDGET_MS).toBeGreaterThanOrEqual(90_000);
  });

  it("单批上游超时上限至少 40 秒，抗高峰期慢响应", () => {
    expect(PER_CALL_TIMEOUT_CAP_MS).toBeGreaterThanOrEqual(40_000);
  });

  it("首批请求量不超过 12，防 max_tokens 截断整批报废", () => {
    expect(FIRST_BATCH_CAP).toBeLessThanOrEqual(12);
  });
});
