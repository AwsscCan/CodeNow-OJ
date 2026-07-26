// Shared C++ code formatter — used by both Monaco provider and the toolbar button

export function formatCppCode(text: string): string {
  if (!text.trim()) return text;

  const lines = text.split("\n");
  const formatted: string[] = [];
  let indentLevel = 0;
  const INDENT = "    "; // 4 spaces

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) {
      formatted.push("");
      continue;
    }

    // Preprocessor directives — no indent
    if (line.startsWith("#")) {
      formatted.push(line);
      continue;
    }

    // Closing brace — reduce indent before this line
    const closeCount = (line.match(/}/g) || []).length;
    indentLevel = Math.max(0, indentLevel - closeCount);

    let indented = INDENT.repeat(indentLevel) + line;

    // Opening brace — increase indent for next lines
    const openCount = (line.match(/{/g) || []).length;
    indentLevel += openCount;

    // Space normalization around common operators
    indented = indented
      .replace(/\s*=\s*/g, " = ")
      .replace(/\s*\+\s*/g, " + ")
      .replace(/\s*-\s*/g, " - ")
      .replace(/\s*\*\s*/g, " * ")
      .replace(/\s*\/\s*/g, " / ")
      .replace(/\s*%\s*/g, " % ")
      // Fix doubled spaces
      .replace(/  +/g, " ")
      // Fix spacing after increment/decrement
      .replace(/\+\+ \=/g, "++ =")
      .replace(/-- \=/g, "-- =")
      // Comparison operators (restore after general replacements)
      .replace(/\s*==\s*/g, " == ")
      .replace(/\s*!=\s*/g, " != ")
      .replace(/\s*<=\s*/g, " <= ")
      .replace(/\s*>=\s*/g, " >= ")
      // Stream operators (keep tight)
      .replace(/\s*<<\s*/g, " << ")
      .replace(/\s*>>\s*/g, " >> ")
      // Arrow and scope operators (keep tight)
      .replace(/\s*->\s*/g, "->")
      .replace(/\s*::\s*/g, "::")
      // Semicolons
      .replace(/\s*;\s*$/, ";")
      // Trailing whitespace
      .replace(/\s+$/g, "");

    formatted.push(indented);
  }

  return formatted.join("\n");
}
