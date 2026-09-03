export type CppSymbols = { variables: string[]; functions: string[]; types: string[] };

const controlWords = new Set(["if", "for", "while", "switch", "catch", "return", "sizeof"]);
const declarationTypes = [
  "auto", "bool", "char", "double", "float", "int", "long", "short", "signed", "unsigned", "void", "wchar_t",
  "size_t", "ptrdiff_t", "int64_t", "uint64_t", "int32_t", "uint32_t", "string", "vector", "array", "deque", "list",
  "queue", "priority_queue", "stack", "set", "multiset", "map", "multimap", "unordered_set", "unordered_map", "pair", "tuple", "bitset",
];

function stripNonCode(source: string): string {
  let result = "";
  let state: "code" | "line" | "block" | "string" | "char" = "code";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (state === "code" && char === "/" && next === "/") { state = "line"; result += "  "; index += 1; continue; }
    if (state === "code" && char === "/" && next === "*") { state = "block"; result += "  "; index += 1; continue; }
    if (state === "code" && char === '"') { state = "string"; result += " "; continue; }
    if (state === "code" && char === "'") { state = "char"; result += " "; continue; }
    if (state === "line" && char === "\n") { state = "code"; result += "\n"; continue; }
    if (state === "block" && char === "*" && next === "/") { state = "code"; result += "  "; index += 1; continue; }
    if ((state === "string" || state === "char") && char === "\\") { result += "  "; index += 1; continue; }
    if (state === "string" && char === '"') { state = "code"; result += " "; continue; }
    if (state === "char" && char === "'") { state = "code"; result += " "; continue; }
    result += state === "code" || char === "\n" ? char : " ";
  }
  return result;
}

function addLastIdentifier(value: string, target: Set<string>) {
  const cleaned = value.replace(/=.*/, "").trim();
  const name = cleaned.match(/([A-Za-z_]\w*)\s*(?:\[.*\])?$/)?.[1];
  if (name && !controlWords.has(name)) target.add(name);
}

export function collectCppSymbols(source: string): CppSymbols {
  const code = stripNonCode(source);
  const types = new Set<string>();
  const functions = new Set<string>();
  const variables = new Set<string>();

  for (const match of code.matchAll(/\b(?:class|struct|union|enum(?:\s+class)?)\s+([A-Za-z_]\w*)/g)) types.add(match[1]);
  for (const match of code.matchAll(/\busing\s+([A-Za-z_]\w*)\s*=/g)) types.add(match[1]);
  for (const match of code.matchAll(/\btypedef\b[^;]*?\b([A-Za-z_]\w*)\s*;/g)) types.add(match[1]);

  const functionPattern = /(?:^|[;{}]\s*)(?:template\s*<[^>]+>\s*)?(?:[\w:<>]+(?:\s*[*&])?\s+)+([A-Za-z_]\w*)\s*\(([^()]*)\)\s*(?:const\s*)?(?:noexcept\s*)?(?=[{;])/gm;
  for (const match of code.matchAll(functionPattern)) {
    if (controlWords.has(match[1])) continue;
    functions.add(match[1]);
    for (const parameter of match[2].split(",")) if (parameter.trim() && parameter.trim() !== "void") addLastIdentifier(parameter, variables);
  }

  const typeAlternatives = [...declarationTypes, ...types].sort((a, b) => b.length - a.length).map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const declarationPattern = new RegExp(`\\b(?:const\\s+|constexpr\\s+|static\\s+|volatile\\s+)*(?:${typeAlternatives})(?:\\s*<[^;{}()]+>)?(?:\\s*[*&]+)?\\s+([A-Za-z_]\\w*)`, "g");
  for (const match of code.matchAll(declarationPattern)) {
    if (!functions.has(match[1])) variables.add(match[1]);
  }

  return { variables: [...variables], functions: [...functions], types: [...types] };
}
