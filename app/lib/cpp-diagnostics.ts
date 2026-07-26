// Pure, framework-free C++ diagnostics — consumed by the Monaco editor layer

export type DiagnosticSeverity = "error" | "warning" | "info";

export type Diagnostic = {
  severity: DiagnosticSeverity;
  message: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  source?: string;
};

const OPEN_TO_CLOSE: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE_TO_OPEN: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
const OPERATOR_CHARS = "=<>!+-*/%&|^";

// 把一行投影为「纯代码」字符串，并记录每个代码字符对应的原始 1 基列号；
// 字符串、字符字面量、行注释与块注释内容被剔除，不参与任何诊断。
function projectCode(line: string, startInBlock: boolean): { code: string; cols: number[]; endInBlock: boolean } {
  let code = "";
  const cols: number[] = [];
  let state: "normal" | "string" | "char" | "block" = startInBlock ? "block" : "normal";
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    const prev = line[i - 1];
    if (state === "normal") {
      if (ch === '"') state = "string";
      else if (ch === "'") state = "char";
      else if (ch === "/" && next === "/") break;
      else if (ch === "/" && next === "*") { state = "block"; i += 1; }
      else { code += ch; cols.push(i + 1); }
    } else if (state === "string") {
      if (ch === '"' && prev !== "\\") state = "normal";
    } else if (state === "char") {
      if (ch === "'" && prev !== "\\") state = "normal";
    } else if (ch === "*" && next === "/") { state = "normal"; i += 1; }
  }
  return { code, cols, endInBlock: state === "block" };
}

function detectAssignmentInCondition(code: string, cols: number[], lineIndex: number, out: Diagnostic[]): void {
  const keyword = /\b(if|while)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = keyword.exec(code))) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let end = code.length;
    for (let i = open; i < code.length; i += 1) {
      if (code[i] === "(") depth += 1;
      else if (code[i] === ")") { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    for (let i = open + 1; i < end; i += 1) {
      if (code[i] !== "=") continue;
      if (code[i + 1] === "=" || OPERATOR_CHARS.includes(code[i - 1] ?? "")) continue;
      const column = cols[i] ?? 1;
      out.push({
        severity: "warning",
        message: "条件判断中出现赋值 =，是否应为比较 ==？",
        startLine: lineIndex + 1, startColumn: column, endLine: lineIndex + 1, endColumn: column + 1,
      });
      break;
    }
  }
}

export function computeLocalDiagnostics(value: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const stack: { char: string; line: number; column: number }[] = [];
  const lines = value.split("\n");
  let inBlock = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const { code, cols, endInBlock } = projectCode(lines[lineIndex], inBlock);
    inBlock = endInBlock;

    for (let i = 0; i < code.length; i += 1) {
      const char = code[i];
      if (OPEN_TO_CLOSE[char]) {
        stack.push({ char, line: lineIndex + 1, column: cols[i] });
        continue;
      }
      if (!CLOSE_TO_OPEN[char]) continue;
      const expectedOpen = CLOSE_TO_OPEN[char];
      // 弹出所有类型不匹配的开括号并逐个报「缺少闭合」，尽量把错误定位到源头
      while (stack.length && stack[stack.length - 1].char !== expectedOpen) {
        const dangling = stack.pop()!;
        diagnostics.push({
          severity: "error", message: `缺少与 ${dangling.char} 对应的闭合符号`,
          startLine: dangling.line, startColumn: dangling.column, endLine: dangling.line, endColumn: dangling.column + 1,
        });
      }
      if (stack.length) stack.pop();
      else diagnostics.push({
        severity: "error", message: `不匹配的闭合符号 ${char}`,
        startLine: lineIndex + 1, startColumn: cols[i], endLine: lineIndex + 1, endColumn: cols[i] + 1,
      });
    }

    const typo = code.indexOf("std:");
    if (typo >= 0 && code[typo + 4] !== ":") {
      const column = cols[typo];
      diagnostics.push({
        severity: "error", message: "命名空间应写为 std::",
        startLine: lineIndex + 1, startColumn: column, endLine: lineIndex + 1, endColumn: column + 4,
      });
    }

    detectAssignmentInCondition(code, cols, lineIndex, diagnostics);
  }

  for (const dangling of stack) {
    diagnostics.push({
      severity: "error", message: `缺少与 ${dangling.char} 对应的闭合符号`,
      startLine: dangling.line, startColumn: dangling.column, endLine: dangling.line, endColumn: dangling.column + 1,
    });
  }

  if (!/\bint\s+main\s*\(/.test(value)) {
    diagnostics.push({
      severity: "warning", message: "提交程序需要 int main() 入口函数",
      startLine: 1, startColumn: 1, endLine: 1, endColumn: Math.max(2, (lines[0]?.length ?? 0) + 1),
    });
  }

  return diagnostics;
}

export function parseCompilerLog(value: string, log: string): Diagnostic[] {
  if (!log.trim()) return [];
  const diagnostics: Diagnostic[] = [];
  const expression = /(?:^|\n)[^:\n]+:(\d+):(\d+):\s*(fatal error|error|warning|note):\s*([^\n]+)/g;
  const lineCount = value.split("\n").length;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(log))) {
    const line = Math.min(lineCount, Math.max(1, Number(match[1])));
    const column = Math.max(1, Number(match[2]));
    const severity: DiagnosticSeverity = match[3].includes("error") ? "error" : match[3] === "warning" ? "warning" : "info";
    diagnostics.push({
      severity, message: `GCC: ${match[4].trim()}`, source: "GNU C++",
      startLine: line, startColumn: column, endLine: line, endColumn: column + 1,
    });
  }
  if (!diagnostics.length) diagnostics.push({
    severity: "error", message: log.trim().slice(0, 800), source: "GNU C++",
    startLine: 1, startColumn: 1, endLine: 1, endColumn: 2,
  });
  return diagnostics;
}
