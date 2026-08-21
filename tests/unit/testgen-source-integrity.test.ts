import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyAnchor } from "../../scripts/testgen/lib.mjs";

const sourcePath = resolve(import.meta.dirname, "../../scripts/testgen/lib.mjs");

describe("testgen 源码完整性", () => {
  it("不包含会被 Git 识别为二进制的 C0 或 DEL 字节", () => {
    const bytes = readFileSync(sourcePath);
    const invisibleBytes = [...bytes.entries()]
      .filter(([, byte]) => (byte < 0x20 && ![0x09, 0x0A, 0x0D].includes(byte)) || byte === 0x7F)
      .map(([offset, byte]) => `0x${byte.toString(16).padStart(2, "0")}@${offset}`);

    expect(invisibleBytes).toEqual([]);
  });

  it("锚点校验保留行边界分隔，拒绝仅拼接文本相同的输出", () => {
    const spec = { id: "TEST", solve: () => "ab\nc\n" };

    expect(verifyAnchor(spec, "", " ab \n c \n")).toBe("ab\nc\n");
    expect(() => verifyAnchor(spec, "", "a\nbc\n")).toThrow();
  });
});
