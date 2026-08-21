import renderMathInElement from "katex/contrib/auto-render";

const container = document.createElement("div");

renderMathInElement(container, {
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "$", right: "$", display: false },
  ],
  throwOnError: false,
  ignoredTags: ["pre", "code"],
});

renderMathInElement(container, {
  delimiters: [
    // @ts-expect-error Delimiter display mode must be boolean.
    { left: "\\(", right: "\\)", display: "inline" },
  ],
});
