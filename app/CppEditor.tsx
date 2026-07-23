"use client";

import Editor, { loader, type Monaco, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import type { editor as MonacoEditor, languages as MonacoLanguages } from "monaco-editor";

loader.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.56.0/min/vs" } });

let configured = false;

function configureCpp(monaco: Monaco) {
  monaco.editor.defineTheme("codenow-vscode", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "C586C0", fontStyle: "bold" },
      { token: "keyword.control", foreground: "C586C0" },
      { token: "type", foreground: "4EC9B0" },
      { token: "type.identifier", foreground: "4EC9B0" },
      { token: "identifier", foreground: "DCDCAA" },
      { token: "number", foreground: "B5CEA8" },
      { token: "string", foreground: "CE9178" },
      { token: "comment", foreground: "6A9955", fontStyle: "italic" },
      { token: "operator", foreground: "D4D4D4" },
      { token: "delimiter", foreground: "D4D4D4" },
      { token: "predefined", foreground: "4FC1FF" },
    ],
    colors: {
      "editor.background": "#121722",
      "editor.foreground": "#D4D4D4",
      "editorLineNumber.foreground": "#596375",
      "editorLineNumber.activeForeground": "#C6CFDC",
      "editorCursor.foreground": "#7BA8FF",
      "editor.selectionBackground": "#264F78",
      "editor.inactiveSelectionBackground": "#1E3A55",
      "editor.lineHighlightBackground": "#171E2B",
      "editorIndentGuide.background1": "#273142",
      "editorIndentGuide.activeBackground1": "#48617F",
      "editorBracketHighlight.foreground1": "#FFD700",
      "editorBracketHighlight.foreground2": "#DA70D6",
      "editorBracketHighlight.foreground3": "#179FFF",
      "editorInlayHint.foreground": "#8190A6",
      "editorInlayHint.background": "#202A39",
      "editorError.foreground": "#F14C4C",
      "editorWarning.foreground": "#CCA700",
      "editorGutter.background": "#121722",
      "minimap.background": "#10151F",
    },
  });
  monaco.editor.defineTheme("codenow-vscode-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "AF00DB", fontStyle: "bold" },
      { token: "keyword.control", foreground: "AF00DB" },
      { token: "type", foreground: "267F99" },
      { token: "type.identifier", foreground: "267F99" },
      { token: "identifier", foreground: "795E26" },
      { token: "number", foreground: "098658" },
      { token: "string", foreground: "A31515" },
      { token: "comment", foreground: "008000", fontStyle: "italic" },
      { token: "operator", foreground: "333333" },
      { token: "predefined", foreground: "0070C1" },
    ],
    colors: {
      "editor.background": "#FFFFFF",
      "editor.foreground": "#1F2430",
      "editorLineNumber.foreground": "#9AA1AB",
      "editorLineNumber.activeForeground": "#344054",
      "editorCursor.foreground": "#245FDF",
      "editor.selectionBackground": "#ADD6FF",
      "editor.inactiveSelectionBackground": "#E5EBF1",
      "editor.lineHighlightBackground": "#F6F8FA",
      "editorIndentGuide.background1": "#E4E8EE",
      "editorIndentGuide.activeBackground1": "#AEB8C6",
      "editorInlayHint.foreground": "#697586",
      "editorInlayHint.background": "#E9EEF5",
      "editorError.foreground": "#D1242F",
      "editorWarning.foreground": "#9A6700",
      "editorGutter.background": "#FFFFFF",
      "minimap.background": "#F7F9FB",
    },
  });
  monaco.editor.defineTheme("codenow-vscode-girl", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "B84F5B", fontStyle: "bold" },
      { token: "keyword.control", foreground: "B84F5B" },
      { token: "type", foreground: "476A78" },
      { token: "type.identifier", foreground: "476A78" },
      { token: "identifier", foreground: "7A563B" },
      { token: "number", foreground: "B46A30" },
      { token: "string", foreground: "A45147" },
      { token: "comment", foreground: "7D8B68", fontStyle: "italic" },
      { token: "operator", foreground: "594741" },
      { token: "delimiter", foreground: "594741" },
      { token: "predefined", foreground: "8F4D72" },
    ],
    colors: {
      "editor.background": "#FFF8F2",
      "editor.foreground": "#463733",
      "editorLineNumber.foreground": "#C1A79D",
      "editorLineNumber.activeForeground": "#7A5148",
      "editorCursor.foreground": "#C85D4B",
      "editor.selectionBackground": "#F2CFC2",
      "editor.inactiveSelectionBackground": "#F8E5DC",
      "editor.lineHighlightBackground": "#FFF1E9",
      "editorIndentGuide.background1": "#EAD8CF",
      "editorIndentGuide.activeBackground1": "#C99F8E",
      "editorBracketHighlight.foreground1": "#C85D4B",
      "editorBracketHighlight.foreground2": "#D69B42",
      "editorBracketHighlight.foreground3": "#476A78",
      "editorInlayHint.foreground": "#986D60",
      "editorInlayHint.background": "#F4E2D8",
      "editorError.foreground": "#D64555",
      "editorWarning.foreground": "#B2771A",
      "editorGutter.background": "#FFF8F2",
      "minimap.background": "#FFF3EC",
    },
  });

  if (configured) return;
  configured = true;

  monaco.languages.registerCompletionItemProvider("cpp", {
    triggerCharacters: ["#", ":", ".", "<"],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const snippets = [
        ["#include", "#include <bits/stdc++.h>", "竞赛常用万能头文件"],
        ["main", "int main() {\n\tios::sync_with_stdio(false);\n\tcin.tie(nullptr);\n\n\t${0}\n\treturn 0;\n}", "C++17 主函数模板"],
        ["for", "for (int ${1:i} = ${2:0}; ${1:i} < ${3:n}; ++${1:i}) {\n\t${0}\n}", "for 循环"],
        ["vector", "vector<${1:int}> ${2:a}(${3:n});", "动态数组"],
        ["sort", "sort(${1:a}.begin(), ${1:a}.end());", "升序排序"],
        ["lower_bound", "lower_bound(${1:a}.begin(), ${1:a}.end(), ${2:x})", "二分查找第一个不小于 x 的位置"],
        ["fastio", "ios::sync_with_stdio(false);\ncin.tie(nullptr);", "快速输入输出"],
        ["long long", "long long ${1:value};", "64 位有符号整数"],
      ];
      return {
        suggestions: snippets.map(([label, insertText, detail]) => ({
          label,
          detail,
          documentation: detail,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        })),
      };
    },
  });

  monaco.languages.registerInlineCompletionsProvider("cpp", {
    provideInlineCompletions(model, position) {
      const prefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const match = prefix.match(/\b(for|ios)$/);
      if (!match) return { items: [] };
      const startColumn = position.column - match[1].length;
      const insertText = match[1] === "for"
        ? { snippet: "for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n\t${0}\n}" }
        : "ios::sync_with_stdio(false);\ncin.tie(nullptr);";
      return { items: [{ insertText, range: new monaco.Range(position.lineNumber, startColumn, position.lineNumber, position.column) }] };
    },
    disposeInlineCompletions() {},
  });

  monaco.languages.registerInlayHintsProvider("cpp", {
    displayName: "CodeNow C++ parameter hints",
    provideInlayHints(model, range) {
      const hints: MonacoLanguages.InlayHint[] = [];
      const names: Record<string, [string, string]> = { sort: ["first:", "last:"], lower_bound: ["first:", "last:"] };
      for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber += 1) {
        const line = model.getLineContent(lineNumber);
        for (const name of Object.keys(names)) {
          const expression = new RegExp(`\\b${name}\\s*\\(`, "g");
          let match: RegExpExecArray | null;
          while ((match = expression.exec(line))) {
            const open = line.indexOf("(", match.index);
            const comma = line.indexOf(",", open + 1);
            if (comma < 0) continue;
            hints.push({ label: names[name][0], position: { lineNumber, column: open + 2 }, kind: monaco.languages.InlayHintKind.Parameter, paddingRight: true });
            hints.push({ label: names[name][1], position: { lineNumber, column: comma + 2 }, kind: monaco.languages.InlayHintKind.Parameter, paddingRight: true });
          }
        }
      }
      return { hints, dispose() {} };
    },
  });

  const hoverDocs: Record<string, string> = {
    vector: "`std::vector<T>` — 连续存储的动态数组，随机访问为 O(1)。",
    sort: "`std::sort(first, last)` — 默认升序排序，复杂度 O(n log n)。",
    lower_bound: "`std::lower_bound(first, last, value)` — 返回第一个不小于 value 的位置。",
    unordered_map: "`std::unordered_map<K, V>` — 基于哈希表的键值容器，平均查询 O(1)。",
    "long": "`long long` — 至少 64 位的有符号整数类型。",
  };
  monaco.languages.registerHoverProvider("cpp", {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word || !hoverDocs[word.word]) return null;
      return { range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn), contents: [{ value: hoverDocs[word.word] }] };
    },
  });
}

function getLocalMarkers(value: string, monaco: Monaco): MonacoEditor.IMarkerData[] {
  const markers: MonacoEditor.IMarkerData[] = [];
  const stack: { char: string; line: number; column: number }[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const lines = value.split("\n");
  let blockComment = false;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    let quote = "";
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (blockComment) { if (char === "*" && next === "/") { blockComment = false; i += 1; } continue; }
      if (!quote && char === "/" && next === "*") { blockComment = true; i += 1; continue; }
      if (!quote && char === "/" && next === "/") break;
      if ((char === '"' || char === "'") && line[i - 1] !== "\\") { quote = quote === char ? "" : quote || char; continue; }
      if (quote) continue;
      if ("([{ ".includes(char) && char !== " ") stack.push({ char, line: lineIndex + 1, column: i + 1 });
      if (pairs[char]) {
        const opening = stack.pop();
        if (!opening || opening.char !== pairs[char]) markers.push({ severity: monaco.MarkerSeverity.Error, message: `不匹配的闭合符号 ${char}`, startLineNumber: lineIndex + 1, endLineNumber: lineIndex + 1, startColumn: i + 1, endColumn: i + 2 });
      }
    }
    const typo = line.indexOf("std:");
    if (typo >= 0 && line[typo + 4] !== ":") markers.push({ severity: monaco.MarkerSeverity.Error, message: "命名空间应写为 std::", startLineNumber: lineIndex + 1, endLineNumber: lineIndex + 1, startColumn: typo + 1, endColumn: typo + 5 });
  }
  for (const opening of stack) markers.push({ severity: monaco.MarkerSeverity.Error, message: `缺少与 ${opening.char} 对应的闭合符号`, startLineNumber: opening.line, endLineNumber: opening.line, startColumn: opening.column, endColumn: opening.column + 1 });
  if (!/\bint\s+main\s*\(/.test(value)) markers.push({ severity: monaco.MarkerSeverity.Warning, message: "提交程序需要 int main() 入口函数", startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: Math.max(2, lines[0]?.length + 1 || 2) });
  return markers;
}

function getCompilerMarkers(value: string, diagnostic: string, monaco: Monaco): MonacoEditor.IMarkerData[] {
  if (!diagnostic.trim()) return [];
  const markers: MonacoEditor.IMarkerData[] = [];
  const expression = /(?:^|\n)[^:\n]+:(\d+):(\d+):\s*(fatal error|error|warning|note):\s*([^\n]+)/g;
  let match: RegExpExecArray | null;
  const lineCount = value.split("\n").length;
  while ((match = expression.exec(diagnostic))) {
    const line = Math.min(lineCount, Math.max(1, Number(match[1])));
    const column = Math.max(1, Number(match[2]));
    const severity = match[3].includes("error") ? monaco.MarkerSeverity.Error : match[3] === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info;
    markers.push({ severity, message: `GCC: ${match[4].trim()}`, source: "GNU C++", startLineNumber: line, endLineNumber: line, startColumn: column, endColumn: column + 1 });
  }
  if (!markers.length) markers.push({ severity: monaco.MarkerSeverity.Error, message: diagnostic.trim().slice(0, 800), source: "GNU C++", startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 2 });
  return markers;
}

type Props = {
  value: string;
  themeMode: "light" | "dark" | "girl";
  compilerDiagnostic: string;
  onChange: (value: string) => void;
  onCursorChange: (line: number, column: number) => void;
};

export function CppEditor({ value, themeMode, compilerDiagnostic, onChange, onCursorChange }: Props) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const localMarkerTimer = useRef<number | null>(null);
  const cursorFrame = useRef<number | null>(null);
  const latestCursor = useRef({ line: 1, column: 1 });

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model && monacoRef.current) monacoRef.current.editor.setModelMarkers(model, "gcc", getCompilerMarkers(value, compilerDiagnostic, monacoRef.current));
  }, [compilerDiagnostic, value]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    const model = editor.getModel();
    if (model) {
      model.updateOptions({ tabSize: 4, insertSpaces: true });
      monaco.editor.setModelMarkers(model, "codenow-local", getLocalMarkers(model.getValue(), monaco));
      monaco.editor.setModelMarkers(model, "gcc", getCompilerMarkers(model.getValue(), compilerDiagnostic, monaco));
    }
    editor.onDidChangeCursorPosition(({ position }) => {
      latestCursor.current = { line: position.lineNumber, column: position.column };
      if (cursorFrame.current !== null) return;
      cursorFrame.current = window.requestAnimationFrame(() => {
        cursorFrame.current = null;
        onCursorChange(latestCursor.current.line, latestCursor.current.column);
      });
    });
    editor.focus();
  };

  useEffect(() => () => {
    if (localMarkerTimer.current !== null) window.clearTimeout(localMarkerTimer.current);
    if (cursorFrame.current !== null) window.cancelAnimationFrame(cursorFrame.current);
  }, []);

  return <Editor
    height="100%"
    language="cpp"
    path="main.cpp"
    value={value}
    theme={themeMode === "light" ? "codenow-vscode-light" : themeMode === "girl" ? "codenow-vscode-girl" : "codenow-vscode"}
    beforeMount={configureCpp}
    onMount={handleMount}
    onChange={(next) => {
      const updated = next ?? "";
      const model = editorRef.current?.getModel();
      if (model && monacoRef.current) {
        const monaco = monacoRef.current;
        if (localMarkerTimer.current !== null) window.clearTimeout(localMarkerTimer.current);
        localMarkerTimer.current = window.setTimeout(() => {
          localMarkerTimer.current = null;
          monaco.editor.setModelMarkers(model, "codenow-local", getLocalMarkers(updated, monaco));
        }, 180);
        monacoRef.current.editor.setModelMarkers(model, "gcc", []);
      }
      onChange(updated);
    }}
    loading={<div className="monaco-loading"><span>C++</span><b>正在加载智能编辑器…</b></div>}
    options={{
      automaticLayout: true,
      fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
      fontSize: 13,
      fontLigatures: true,
      lineHeight: 21,
      minimap: { enabled: false },
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
      inlineSuggest: { enabled: true, showToolbar: "onHover" },
      inlayHints: { enabled: "on" },
      parameterHints: { enabled: true },
      bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
      guides: { bracketPairs: true, indentation: true },
      autoClosingBrackets: "always",
      autoClosingQuotes: "always",
      autoIndent: "full",
      formatOnPaste: true,
      folding: true,
      glyphMargin: true,
      renderValidationDecorations: "on",
      renderWhitespace: "selection",
      scrollBeyondLastLine: false,
      smoothScrolling: false,
      cursorSmoothCaretAnimation: "off",
      cursorBlinking: "blink",
      padding: { top: 12, bottom: 12 },
      wordWrap: "off",
    }}
  />;
}
