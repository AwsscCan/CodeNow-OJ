// Shared C++ code formatter — used by both Monaco provider and the toolbar button

type Segment = { code: boolean; text: string };

// 把一行拆成「代码段」与「字面量/注释段」，后者原样保留不做任何运算符改写
function tokenizeLine(line: string, startInBlock: boolean): { segments: Segment[]; endInBlock: boolean } {
  const segments: Segment[] = [];
  let buffer = "";
  let code = !startInBlock;
  let state: "normal" | "string" | "char" | "line" | "block" = startInBlock ? "block" : "normal";
  const flush = () => { if (buffer) segments.push({ code, text: buffer }); buffer = ""; };

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    const prev = line[i - 1];
    if (state === "normal") {
      if (ch === '"') { flush(); code = false; state = "string"; buffer = ch; }
      else if (ch === "'") { flush(); code = false; state = "char"; buffer = ch; }
      else if (ch === "/" && next === "/") { flush(); code = false; state = "line"; buffer = ch; }
      else if (ch === "/" && next === "*") { flush(); code = false; state = "block"; buffer = ch; }
      else { if (!code) { flush(); code = true; } buffer += ch; }
    } else if (state === "string") {
      buffer += ch;
      if (ch === '"' && prev !== "\\") { flush(); code = true; state = "normal"; }
    } else if (state === "char") {
      buffer += ch;
      if (ch === "'" && prev !== "\\") { flush(); code = true; state = "normal"; }
    } else if (state === "line") {
      buffer += ch;
    } else {
      buffer += ch;
      if (ch === "*" && next === "/") { buffer += next; i += 1; flush(); code = true; state = "normal"; }
    }
  }
  flush();
  return { segments, endInBlock: state === "block" };
}

// 多字符运算符（补空格/保持紧凑），按最长优先顺序处理，避免 == 被拆成 = =
const SPACED_OPERATORS: [string, string][] = [
  ["<<=", " <<= "], [">>=", " >>= "],
  ["==", " == "], ["!=", " != "], ["<=", " <= "], [">=", " >= "],
  ["&&", " && "], ["||", " || "],
  ["+=", " += "], ["-=", " -= "], ["*=", " *= "], ["/=", " /= "], ["%=", " %= "],
  ["<<", " << "], [">>", " >> "],
];

// 仅对纯代码片段规整运算符空白；字符串/字符/注释永不进入这里
function spaceOperators(code: string): string {
  if (!code.trim()) return code;
  let result = code;
  const restore: [string, string][] = [];
  SPACED_OPERATORS.forEach(([op, replacement], index) => {
    if (!result.includes(op)) return;
    const placeholder = `${index}`;
    result = result.split(op).join(placeholder);
    restore.push([placeholder, replacement]);
  });
  result = result.replace(/\s*=\s*/g, " = ");
  for (const [placeholder, replacement] of restore) result = result.split(placeholder).join(replacement);
  result = result.replace(/\s*::\s*/g, "::").replace(/\s*->\s*/g, "->");
  return result.replace(/ {2,}/g, " ");
}

/**
 * 格式化 C++ 源码：按作用域与控制流做四空格缩进，规整运算符周围空白，
 * 且严格保护字符串、字符字面量与注释内部的内容不被改动。
 */
export function formatCppCode(text: string): string {
  if (!text.trim()) return text;

  const lines = text.split("\n");
  const formatted: string[] = [];
  let indentLevel = 0;
  let pendingSingleIndent = 0;
  let inBlock = false;
  const INDENT = "    ";

  for (const raw of lines) {
    // 块注释内部的行原样保留，避免破坏注释排版
    if (inBlock) {
      const { endInBlock } = tokenizeLine(raw, true);
      formatted.push(raw);
      inBlock = endInBlock;
      continue;
    }

    const line = raw.trim();
    if (!line) { formatted.push(""); continue; }
    if (line.startsWith("#")) { formatted.push(line); continue; }

    const { segments, endInBlock } = tokenizeLine(line, false);
    const codeOnly = segments.filter((s) => s.code).map((s) => s.text).join("");

    const compactCode = codeOnly.trim();
    const closeCount = (codeOnly.match(/}/g) || []).length;
    indentLevel = Math.max(0, indentLevel - closeCount);

    const body = segments.map((s) => (s.code ? spaceOperators(s.text) : s.text)).join("");
    const singleIndent = compactCode === "{" ? 0 : pendingSingleIndent;
    formatted.push((INDENT.repeat(indentLevel + singleIndent) + body).replace(/\s+$/, ""));

    const openCount = (codeOnly.match(/{/g) || []).length;
    indentLevel += openCount;
    pendingSingleIndent = opensSingleStatement(compactCode)
      ? singleIndent + 1
      : 0;
    inBlock = endInBlock;
  }

  return formatted.join("\n");
}

function opensSingleStatement(code: string): boolean {
  if (!code || code.includes("{")) return false;
  if (/^do\s*$/.test(code) || /^else\s*$/.test(code)) return true;
  const match = /^(?:if|for|while|switch|catch|else\s+if)\s*\(/.exec(code);
  if (!match) return false;
  let depth = 0;
  for (let index = code.indexOf("(", match.index); index < code.length; index += 1) {
    if (code[index] === "(") depth += 1;
    if (code[index] === ")") {
      depth -= 1;
      if (depth === 0) return code.slice(index + 1).trim().length === 0;
    }
  }
  return false;
}
