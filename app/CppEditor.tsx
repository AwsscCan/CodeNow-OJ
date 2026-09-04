"use client";

import Editor, { loader, type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor, languages as MonacoLanguages, Position, Range } from "monaco-editor";
import { memo, useEffect, useRef } from "react";
import { computeLocalDiagnostics, parseCompilerLog, type Diagnostic } from "./lib/cpp-diagnostics";
import { collectCppSymbols } from "./lib/cpp-symbols";
import { formatCppCode, type CppFormatMode } from "./lib/format-cpp";

loader.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.56.0/min/vs" } });

let configured = false;
let activeFormatMode: CppFormatMode = "full";

const cppControlKeywords = [
  "if", "else", "switch", "case", "default", "for", "while", "do", "break", "continue", "return", "goto", "try", "catch", "throw",
];
const cppTypeKeywords = [
  "bool", "char", "char8_t", "char16_t", "char32_t", "double", "float", "int", "long", "short", "signed", "unsigned", "void", "wchar_t",
  "auto", "decltype", "size_t", "ptrdiff_t", "int64_t", "uint64_t", "int32_t", "uint32_t", "string", "vector", "array", "deque", "list",
  "queue", "priority_queue", "stack", "set", "multiset", "map", "multimap", "unordered_set", "unordered_map", "pair", "tuple", "bitset",
];
const cppModifierKeywords = [
  "const", "constexpr", "consteval", "constinit", "static", "extern", "inline", "virtual", "explicit", "mutable", "volatile", "register",
  "friend", "using", "namespace", "typedef", "template", "typename", "class", "struct", "union", "enum", "public", "private", "protected",
  "operator", "new", "delete", "sizeof", "alignof", "noexcept", "override", "final",
];
const cppConstantKeywords = ["true", "false", "nullptr", "NULL"];
const cppStdSymbols = [
  "std", "cin", "cout", "cerr", "clog", "endl", "ios", "sort", "stable_sort", "lower_bound", "upper_bound", "binary_search", "max", "min",
  "swap", "reverse", "unique", "next_permutation", "prev_permutation", "gcd", "lcm", "abs", "sqrt", "pow", "begin", "end", "push_back",
  "emplace_back", "pop_back", "insert", "erase", "find", "count", "size", "empty", "front", "back", "top",
];

function installCppTokenizer(monaco: Monaco) {
  monaco.languages.setMonarchTokensProvider("cpp", {
    defaultToken: "",
    tokenPostfix: ".cpp",
    controlKeywords: cppControlKeywords,
    typeKeywords: cppTypeKeywords,
    modifierKeywords: cppModifierKeywords,
    constantKeywords: cppConstantKeywords,
    stdSymbols: cppStdSymbols,
    operators: [
      "=", ">", "<", "!", "~", "?", ":", "==", "<=", ">=", "!=", "&&", "||", "++", "--", "+", "-", "*", "/", "&", "|", "^", "%", "<<",
      ">>", "+=", "-=", "*=", "/=", "&=", "|=", "^=", "%=", "<<=", ">>=", "->", "::", ".",
    ],
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]+|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    tokenizer: {
      root: [
        [/^\s*#\s*[a-zA-Z_]\w*/, "keyword.directive.cpp"],
        [/[a-zA-Z_]\w*/, {
          cases: {
            "@controlKeywords": "keyword.control.cpp",
            "@typeKeywords": "keyword.type.cpp",
            "@modifierKeywords": "keyword.modifier.cpp",
            "@constantKeywords": "constant.language.cpp",
            "@stdSymbols": "support.function.cpp",
            "@default": "identifier.cpp",
          },
        }],
        { include: "@whitespace" },
        [/[{}()\[\]]/, "@brackets"],
        [/[<>](?!@symbols)/, "@brackets"],
        [/@symbols/, { cases: { "@operators": "operator.cpp", "@default": "" } }],
        [/\d*\.\d+([eE][\-+]?\d+)?[fFlL]?/, "number.float.cpp"],
        [/0[xX][0-9a-fA-F]+[uUlL]*/, "number.hex.cpp"],
        [/\d+[uUlL]*/, "number.cpp"],
        [/[;,.]/, "delimiter.cpp"],
        [/"([^"\\]|\\.)*$/, "string.invalid.cpp"],
        [/"/, { token: "string.quote.cpp", bracket: "@open", next: "@string" }],
        [/'([^'\\]|\\.)'/, "string.char.cpp"],
        [/'.*$/, "string.invalid.cpp"],
      ],
      string: [
        [/[^\\"]+/, "string.cpp"],
        [/@escapes/, "string.escape.cpp"],
        [/\\./, "string.escape.invalid.cpp"],
        [/"/, { token: "string.quote.cpp", bracket: "@close", next: "@pop" }],
      ],
      whitespace: [
        [/[ \t\r\n]+/, ""],
        [/\/\*/, "comment.cpp", "@comment"],
        [/\/\/.*$/, "comment.cpp"],
      ],
      comment: [
        [/[^\/*]+/, "comment.cpp"],
        [/\*\//, "comment.cpp", "@pop"],
        [/[\/*]/, "comment.cpp"],
      ],
    },
  } as MonacoLanguages.IMonarchLanguage);
}

function configureCpp(monaco: Monaco) {
  monaco.editor.defineTheme("codenow-vscode", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword.directive.cpp", foreground: "C586C0", fontStyle: "bold" },
      { token: "keyword.control.cpp", foreground: "C586C0", fontStyle: "bold" },
      { token: "keyword.type.cpp", foreground: "4EC9B0" },
      { token: "keyword.modifier.cpp", foreground: "569CD6" },
      { token: "constant.language.cpp", foreground: "569CD6" },
      { token: "support.function.cpp", foreground: "DCDCAA" },
      { token: "identifier.cpp", foreground: "D4D4D4" },
      { token: "number.float.cpp", foreground: "B5CEA8" },
      { token: "number.hex.cpp", foreground: "B5CEA8" },
      { token: "string.escape.cpp", foreground: "D7BA7D" },
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
      { token: "keyword.directive.cpp", foreground: "AF00DB", fontStyle: "bold" },
      { token: "keyword.control.cpp", foreground: "AF00DB", fontStyle: "bold" },
      { token: "keyword.type.cpp", foreground: "267F99" },
      { token: "keyword.modifier.cpp", foreground: "0000FF" },
      { token: "constant.language.cpp", foreground: "0000FF" },
      { token: "support.function.cpp", foreground: "795E26" },
      { token: "identifier.cpp", foreground: "1F2430" },
      { token: "number.float.cpp", foreground: "098658" },
      { token: "number.hex.cpp", foreground: "098658" },
      { token: "string.escape.cpp", foreground: "EE0000" },
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
      { token: "keyword.directive.cpp", foreground: "B84F5B", fontStyle: "bold" },
      { token: "keyword.control.cpp", foreground: "B84F5B", fontStyle: "bold" },
      { token: "keyword.type.cpp", foreground: "476A78" },
      { token: "keyword.modifier.cpp", foreground: "9D5A74" },
      { token: "constant.language.cpp", foreground: "9D5A74" },
      { token: "support.function.cpp", foreground: "8A633D" },
      { token: "identifier.cpp", foreground: "463733" },
      { token: "number.float.cpp", foreground: "B46A30" },
      { token: "number.hex.cpp", foreground: "B46A30" },
      { token: "string.escape.cpp", foreground: "C7743F" },
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
  installCppTokenizer(monaco);

  const headers = ["algorithm", "array", "bits/stdc++.h", "deque", "iostream", "map", "queue", "set", "stack", "string", "unordered_map", "unordered_set", "vector"];
  const builtInSymbols = [
    ...cppControlKeywords.map((label) => ({ label, kind: monaco.languages.CompletionItemKind.Keyword })),
    ...cppTypeKeywords.map((label) => ({ label, kind: monaco.languages.CompletionItemKind.TypeParameter })),
    ...cppModifierKeywords.map((label) => ({ label, kind: monaco.languages.CompletionItemKind.Keyword })),
    ...cppConstantKeywords.map((label) => ({ label, kind: monaco.languages.CompletionItemKind.Constant })),
    ...cppStdSymbols.map((label) => ({ label, kind: monaco.languages.CompletionItemKind.Function })),
  ];

  monaco.languages.registerCompletionItemProvider("cpp", {
    triggerCharacters: ["#", "<", ":", "."],
    provideCompletionItems(model: MonacoEditor.ITextModel, position: Position) {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const beforeCursor = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const headerMatch = beforeCursor.match(/^(\s*#\s*include\s*<)([A-Za-z0-9_./-]*)$/);

      if (headerMatch) {
        const headerRange = new monaco.Range(position.lineNumber, headerMatch[1].length + 1, position.lineNumber, position.column);
        return {
          suggestions: headers
            .filter((header) => header.startsWith(headerMatch[2]))
            .map((header) => ({
              label: `<${header}>`,
              detail: "C++ 标准库头文件",
              kind: monaco.languages.CompletionItemKind.Module,
              insertText: `${header}>`,
              range: headerRange,
            })),
        };
      }

      const directiveMatch = beforeCursor.match(/^(\s*#\s*)([A-Za-z_]*)$/);
      if (directiveMatch && directiveMatch[2] && "include".startsWith(directiveMatch[2])) {
        const directiveRange = new monaco.Range(position.lineNumber, directiveMatch[1].length + 1, position.lineNumber, position.column);
        return {
          suggestions: [{
            label: "#include <bits/stdc++.h>",
            detail: "常用竞赛头文件",
            kind: monaco.languages.CompletionItemKind.Module,
            insertText: "include <bits/stdc++.h>",
            range: directiveRange,
          }],
        };
      }

      const documentSymbols = collectCppSymbols(model.getValue());
      const prefix = word.word;
      const suggestions = new Map<string, { label: string; kind: MonacoLanguages.CompletionItemKind }>();
      for (const symbol of builtInSymbols) suggestions.set(symbol.label, symbol);
      for (const label of documentSymbols.variables) suggestions.set(label, { label, kind: monaco.languages.CompletionItemKind.Variable });
      for (const label of documentSymbols.functions) suggestions.set(label, { label, kind: monaco.languages.CompletionItemKind.Function });
      for (const label of documentSymbols.types) suggestions.set(label, { label, kind: monaco.languages.CompletionItemKind.Class });

      return {
        suggestions: [...suggestions.values()]
          .filter((symbol) => symbol.label.startsWith(prefix) && symbol.label !== prefix)
          .map((symbol) => ({ ...symbol, insertText: symbol.label, range })),
      };
    },
  });

  monaco.languages.registerInlayHintsProvider("cpp", {
    displayName: "CodeNow C++ parameter hints",
    provideInlayHints(model: MonacoEditor.ITextModel, range: Range) {
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
    provideHover(model: MonacoEditor.ITextModel, position: Position) {
      const word = model.getWordAtPosition(position);
      if (!word || !hoverDocs[word.word]) return null;
      return { range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn), contents: [{ value: hoverDocs[word.word] }] };
    },
  });

  // Real-time C++ auto-formatting provider
  monaco.languages.registerDocumentFormattingEditProvider("cpp", {
    displayName: "CodeNow C++ Formatter",
    async provideDocumentFormattingEdits(model: MonacoEditor.ITextModel) {
      const text = model.getValue();
      const formattedText = formatCppCode(text, { mode: activeFormatMode });
      if (formattedText === text) return [];
      return [{
        range: model.getFullModelRange(),
        text: formattedText,
      }];
    },
  });

  // Register Shift+Alt+F keyboard shortcut for format
  monaco.editor.addKeybindingRule({
    keybinding: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
    command: "editor.action.formatDocument",
  });
}

function toMarkers(diagnostics: Diagnostic[], monaco: Monaco): MonacoEditor.IMarkerData[] {
  const severityMap = {
    error: monaco.MarkerSeverity.Error,
    warning: monaco.MarkerSeverity.Warning,
    info: monaco.MarkerSeverity.Info,
  } as const;
  return diagnostics.map((d) => ({
    severity: severityMap[d.severity],
    message: d.message,
    source: d.source,
    startLineNumber: d.startLine,
    endLineNumber: d.endLine,
    startColumn: d.startColumn,
    endColumn: d.endColumn,
  }));
}

const getLocalMarkers = (value: string, monaco: Monaco) => toMarkers(computeLocalDiagnostics(value), monaco);
const getCompilerMarkers = (value: string, diagnostic: string, monaco: Monaco) => toMarkers(parseCompilerLog(value, diagnostic), monaco);

type Props = {
  value: string;
  themeMode: "light" | "dark" | "girl";
  formatMode?: CppFormatMode;
  compilerDiagnostic: string;
  onChange: (value: string) => void;
  onCursorChange: (line: number, column: number) => void;
};

export const CppEditor = memo(function CppEditor({ value, themeMode, formatMode = "full", compilerDiagnostic, onChange, onCursorChange }: Props) {
  activeFormatMode = formatMode;
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
      // Keep operators such as >= and <= visibly ASCII; ligatures turn them into ≥/≤.
      fontLigatures: false,
      lineHeight: 21,
      minimap: { enabled: false },
      quickSuggestions: { other: true, comments: false, strings: false },
      wordBasedSuggestions: "currentDocument",
      suggestOnTriggerCharacters: true,
      suggest: { showStatusBar: true, preview: false, insertMode: "insert" },
      acceptSuggestionOnCommitCharacter: false,
      tabCompletion: "off",
      inlineSuggest: { enabled: false },
      inlayHints: { enabled: "on" },
      parameterHints: { enabled: true },
      bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
      guides: { bracketPairs: true, indentation: true, highlightActiveIndentation: true, bracketPairsHorizontal: true },
      matchBrackets: "always",
      autoClosingBrackets: "always",
      autoClosingQuotes: "always",
      autoIndent: "full",
      linkedEditing: true,
      formatOnPaste: true,
      folding: true,
      foldingHighlight: true,
      showFoldingControls: "always",
      stickyScroll: { enabled: true, maxLineCount: 3 },
      glyphMargin: true,
      renderValidationDecorations: "on",
      renderLineHighlight: "all",
      renderWhitespace: "selection",
      occurrencesHighlight: "singleFile",
      unicodeHighlight: { ambiguousCharacters: true, invisibleCharacters: true },
      scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12, useShadows: true },
      scrollBeyondLastLine: false,
      cursorSurroundingLines: 0,
      roundedSelection: true,
      mouseWheelZoom: false,
      smoothScrolling: false,
      cursorSmoothCaretAnimation: "off",
      cursorBlinking: "blink",
      padding: { top: 12, bottom: 12 },
      wordWrap: "off",
    }}
  />;
});
