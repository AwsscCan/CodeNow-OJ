import { describe, expect, it, vi } from "vitest";
import {
  executeGeneratorArtifact,
  type GeneratorArtifact,
  type GeneratorRunResult,
} from "../../app/api/_lib/generator-artifact";

function result(overrides: Partial<GeneratorRunResult> = {}): GeneratorRunResult {
  return { accepted: true, stdout: "1 2\n", compileError: "", statusId: 3, ...overrides };
}

describe("testlib-style generator artifacts", () => {
  it("executes unique deterministic seeds and returns validated inputs", async () => {
    const artifact: GeneratorArtifact = {
      sourceCode: "#include <iostream>\nint main(){int seed;std::cin>>seed;std::cout<<seed<<\" \\n\";}",
      seeds: [7, 7, 11],
    };
    const runner = vi.fn(async (_source: string, input: string) => result({ stdout: `${input.trim()}\n` }));

    const generated = await executeGeneratorArtifact({ artifact, languageId: 54, run: runner });

    expect(runner).toHaveBeenCalledTimes(2);
    expect(generated.map((item) => item.input)).toEqual(["7\n", "11\n"]);
    expect(generated.every((item) => item.category === "ordinary" && item.targets.includes("generator seed"))).toBe(true);
  });

  it("executes only safe integer seeds", async () => {
    const runner = vi.fn(async (_source: string, input: string) => result({ stdout: input }));

    const generated = await executeGeneratorArtifact({
      artifact: { sourceCode: "safe", seeds: [1, 1.5, Number.MAX_SAFE_INTEGER + 1, 4] },
      languageId: 54,
      run: runner,
    });

    expect(runner).toHaveBeenCalledTimes(2);
    expect(generated.map((item) => item.input)).toEqual(["1\n", "4\n"]);
  });

  it("skips unsafe, compile-failing, and invalid generator outputs", async () => {
    const runner = vi.fn(async (_source: string, input: string) => {
      if (input === "2\n") return result({ compileError: "syntax error", accepted: false, statusId: 6 });
      return result({ stdout: "...\n" });
    });
    const artifact: GeneratorArtifact = { sourceCode: "safe-source", seeds: [1, 2] };

    const generated = await executeGeneratorArtifact({ artifact, languageId: 54, run: runner });

    expect(generated).toEqual([]);
  });

  it("rejects unsafe artifacts before invoking the runner", async () => {
    const runner = vi.fn(async () => result());

    const generated = await executeGeneratorArtifact({
      artifact: { sourceCode: "int main(){system(\"bad\");}", seeds: [1] },
      languageId: 54,
      run: runner,
    });

    expect(generated).toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });

  it("keeps successful seeds when a different runner call fails", async () => {
    const runner = vi.fn(async (_source: string, input: string) => {
      if (input === "2\n") throw new Error("Judge0 unavailable");
      return result({ stdout: input });
    });

    const generated = await executeGeneratorArtifact({
      artifact: { sourceCode: "safe", seeds: [1, 2] },
      languageId: 54,
      run: runner,
    });

    expect(runner).toHaveBeenCalledTimes(2);
    expect(generated.map((item) => item.input)).toEqual(["1\n"]);
  });

  it("rejects filesystem-capable artifacts before invoking the runner", async () => {
    const runner = vi.fn(async () => result());

    const generated = await executeGeneratorArtifact({
      artifact: {
        sourceCode: "#include <filesystem>\nint main(){std::filesystem::remove_all(\"../records\");}",
        seeds: [1],
      },
      languageId: 54,
      run: runner,
    });

    expect(generated).toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });
});
