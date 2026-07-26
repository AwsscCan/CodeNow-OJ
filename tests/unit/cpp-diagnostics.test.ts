import { describe, it, expect } from "vitest";
import { computeLocalDiagnostics, parseCompilerLog } from "../../app/lib/cpp-diagnostics";

describe("computeLocalDiagnostics - 括号与命名空间", () => {
  it("干净且含 main 的程序不报本地诊断", () => {
    const code = "int main() {\n    int x = 1;\n    return 0;\n}";
    expect(computeLocalDiagnostics(code)).toEqual([]);
  });

  it("多余的闭合括号报错", () => {
    const errors = computeLocalDiagnostics("int main() { )\n    return 0;\n}");
    expect(errors.some((d) => d.severity === "error" && d.message.includes(")"))).toBe(true);
  });

  it("缺少闭合括号在开括号处报错", () => {
    const diags = computeLocalDiagnostics("int main() {\n    if (a\n    return 0;\n}");
    expect(diags.some((d) => d.severity === "error" && d.startLine === 2)).toBe(true);
  });

  it("单冒号的 std: 报错", () => {
    const diags = computeLocalDiagnostics("int main() {\n    std:cout;\n    return 0;\n}");
    expect(diags.some((d) => d.severity === "error" && d.message.includes("std::"))).toBe(true);
  });

  it("缺少 int main 入口报警告", () => {
    const diags = computeLocalDiagnostics("int foo() { return 0; }");
    expect(diags.some((d) => d.severity === "warning" && d.message.includes("main"))).toBe(true);
  });

  it("字符串里的括号不参与匹配", () => {
    const code = "int main() {\n    cout << \"(\";\n    return 0;\n}";
    expect(computeLocalDiagnostics(code)).toEqual([]);
  });

  it("行注释里的括号不参与匹配", () => {
    const code = "int main() {\n    // (\n    return 0;\n}";
    expect(computeLocalDiagnostics(code)).toEqual([]);
  });
});

describe("computeLocalDiagnostics - 条件中误用赋值 =", () => {
  it("if 条件中出现单个 = 报警告", () => {
    const diags = computeLocalDiagnostics("int main() {\n    if (x = 5) return 0;\n}");
    expect(diags.some((d) => d.severity === "warning" && d.startLine === 2 && /==|赋值/.test(d.message))).toBe(true);
  });

  it("while 条件中出现单个 = 报警告", () => {
    const diags = computeLocalDiagnostics("int main() {\n    while (n = 0) {}\n    return 0;\n}");
    expect(diags.some((d) => d.severity === "warning" && d.startLine === 2 && /==|赋值/.test(d.message))).toBe(true);
  });

  it("if 条件中的 == 不报赋值警告", () => {
    const diags = computeLocalDiagnostics("int main() {\n    if (x == 5) return 0;\n}");
    expect(diags.some((d) => /==|赋值/.test(d.message))).toBe(false);
  });

  it("if 条件中的 <= 不报赋值警告", () => {
    const diags = computeLocalDiagnostics("int main() {\n    if (x <= 5) return 0;\n}");
    expect(diags.some((d) => /==|赋值/.test(d.message))).toBe(false);
  });
});

describe("parseCompilerLog - GCC 诊断解析", () => {
  it("空日志返回空数组", () => {
    expect(parseCompilerLog("int main(){}", "")).toEqual([]);
  });

  it("解析行列号与错误信息", () => {
    const log = "main.cpp:5:9: error: 'x' was not declared in this scope";
    const diags = parseCompilerLog("a\nb\nc\nd\ne\nf", log);
    expect(diags[0]).toMatchObject({ severity: "error", startLine: 5, startColumn: 9 });
    expect(diags[0].message).toContain("was not declared");
  });

  it("warning 映射为 warning 级别", () => {
    const log = "main.cpp:2:3: warning: unused variable 'y'";
    const diags = parseCompilerLog("a\nb\nc", log);
    expect(diags[0].severity).toBe("warning");
  });

  it("无法解析的非空日志给出兜底错误", () => {
    const diags = parseCompilerLog("int main(){}", "internal compiler error boom");
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("error");
  });

  it("行号超过源码行数时被夹到有效范围", () => {
    const log = "main.cpp:999:1: error: stray token";
    const diags = parseCompilerLog("line1\nline2", log);
    expect(diags[0].startLine).toBeLessThanOrEqual(2);
  });
});
