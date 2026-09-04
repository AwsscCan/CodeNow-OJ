// Shared C++ code formatter — used by both Monaco provider and the toolbar button

type Segment = { code: boolean; text: string };
export type CppFormatMode = "preserve" | "full";

/**
 * 把一行普通 C++ 拆成多个顶层语句。括号、字符串和注释中的分号不会触发断行。
 */
function splitTopLevelStatements(line: string, startInBlock: boolean): { lines: string[]; endInBlock: boolean } {
  const lines: string[] = [];
  let buffer = "";
  let state: "normal" | "string" | "char" | "block" = startInBlock ? "block" : "normal";
  let parenDepth = 0;
  let bracketDepth = 0;
  let blockDepth = 0;
  const flush = () => {
    if (buffer.trim()) lines.push(buffer.trim());
    buffer = "";
  };

  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    const next = line[index + 1];
    const prev = line[index - 1];

    if (state === "block") {
      buffer += ch;
      if (ch === "*" && next === "/") {
        buffer += next;
        index += 1;
        state = "normal";
      }
      continue;
    }
    if (state === "string") {
      buffer += ch;
      if (ch === '"' && prev !== "\\") state = "normal";
      continue;
    }
    if (state === "char") {
      buffer += ch;
      if (ch === "'" && prev !== "\\") state = "normal";
      continue;
    }

    if (ch === '"') { buffer += ch; state = "string"; continue; }
    if (ch === "'") { buffer += ch; state = "char"; continue; }
    if (ch === "/" && next === "/") {
      buffer += line.slice(index);
      break;
    }
    if (ch === "/" && next === "*") {
      buffer += ch + next;
      index += 1;
      state = "block";
      continue;
    }
    if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === "[") bracketDepth += 1;
    else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);

    buffer += ch;
    if (ch === "{" && parenDepth === 0 && isBlockBrace(buffer.slice(0, -1))) {
      blockDepth += 1;
      buffer = `${buffer.slice(0, -1).trimEnd()} {`;
      flush();
      continue;
    }
    if (ch === "}" && blockDepth > 0) {
      blockDepth -= 1;
      const rest = line.slice(index + 1);
      if (buffer.trim() !== "}") {
        const closing = buffer.trim().slice(0, -1).trim();
        buffer = closing;
        flush();
        buffer = "}";
      }
      if (!/^\s*(?:else\b|while\s*\(|[,;)\/]|\/\*)/.test(rest)) flush();
      continue;
    }
    if (ch === ";" && parenDepth === 0 && bracketDepth === 0) {
      const rest = line.slice(index + 1);
      // 注释紧跟语句时保留在同一行，避免把 `statement; // note` 拆散。
      if (!/^\s*(?:\/\/|\/\*)/.test(rest)) flush();
    }
  }
  flush();
  return { lines, endInBlock: state === "block" };
}

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
  const operators: [string, string][] = [
    ...SPACED_OPERATORS,
    ["++", "++"], ["--", "--"],
    ["+=", " += "], ["-=", " -= "], ["*=", " *= "], ["/=", " /= "], ["%=", " %= "],
  ];
  operators.forEach(([op, replacement], index) => {
    if (!result.includes(op)) return;
    const placeholder = `${index}`;
    result = result.split(op).join(placeholder);
    restore.push([placeholder, replacement]);
  });
  result = result.replace(/\s*=\s*/g, " = ");
  result = result.replace(/\b(if|for|while|switch|catch)\s*\(/g, "$1 (");
  result = result.replace(/\s*,\s*/g, ", ");
  result = result.replace(/\s*;\s*/g, "; ");
  // 只处理二元加减，单目正负号和已保护的 ++/-- 不会被改写。
  result = result.replace(/([^\s+\-*/%=(,:])\s*\+\s*([^+])/g, "$1 + $2");
  result = result.replace(/([^\s+\-*/%=(,:])\s*-\s*([^->])/g, "$1 - $2");
  for (const [placeholder, replacement] of restore) result = result.split(placeholder).join(replacement);
  result = result.replace(/\s*::\s*/g, "::").replace(/\s*->\s*/g, "->");
  return result.replace(/[ \t]{2,}/g, " ").replace(/;\s+([)])/g, ";$1");
}

function isBlockBrace(prefix: string): boolean {
  const value = prefix.trim();
  if (!value) return true;
  if (/\)\s*$/.test(value)) return true;
  if (/^(?:else|do|try|finally)\b/.test(value)) return true;
  return false;
}

/**
 * 格式化 C++ 源码：按作用域与控制流做四空格缩进，规整运算符周围空白，
 * 且严格保护字符串、字符字面量与注释内部的内容不被改动。
 */
export function formatCppCode(text: string, options: { mode?: CppFormatMode } = {}): string {
  if (!text.trim()) return text;

  const mode = options.mode ?? "full";

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

    const split = mode === "full" ? splitTopLevelStatements(line, false) : { lines: [line], endInBlock: false };
    for (const statement of split.lines) {
      const { segments } = tokenizeLine(statement, false);
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
    }
    inBlock = split.endInBlock;
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
