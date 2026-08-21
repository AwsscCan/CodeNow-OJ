import DOMPurify from "dompurify";
import renderMathInElement from "katex/contrib/auto-render";
import { marked } from "marked";

/**
 * 笔记正文的白名单标签集：默认纯文本转义，仅显式放开这些安全标签。
 * 一切用户富文本渲染唯一经此管线，禁止旁路 dangerouslySetInnerHTML 喂未消毒内容。
 */
const ALLOWED_TAGS = [
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "blockquote",
  "code", "pre", "strong", "em", "del",
  "a", "img",
  "table", "thead", "tbody", "tr", "th", "td",
  "hr", "br", "span",
];

const ALLOWED_ATTR = ["href", "title", "src", "alt", "class"];

/** a[href] 仅允许 http/https/mailto 与页内锚点；img 的 data:/blob: 另行放行。 */
const SAFE_URI = /^(?:https?:|mailto:|#|\/)/i;
const SAFE_IMG_URI = /^(?:https?:|data:image\/|blob:|\/)/i;

let hooksInstalled = false;

function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const element = node as Element;
    const tag = element.tagName?.toLowerCase();
    if (tag === "a") {
      const href = element.getAttribute("href") ?? "";
      if (!SAFE_URI.test(href)) element.removeAttribute("href");
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer nofollow");
    }
    if (tag === "img") {
      const src = element.getAttribute("src") ?? "";
      if (!SAFE_IMG_URI.test(src)) element.removeAttribute("src");
    }
    // code 仅保留 language-* 高亮类，其余 class 一律剥除
    if (element.hasAttribute("class")) {
      const kept = (element.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter((name) => /^(?:language-[\w-]+|note-[\w-]+|problem-ref-card)$/.test(name));
      if (kept.length) element.setAttribute("class", kept.join(" "));
      else element.removeAttribute("class");
    }
  });
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] ?? char));
}

function createEscapedDollarMarker(source: string): string {
  let marker = "QZNOTEESCAPEDDOLLARQZ";
  while (source.includes(marker)) marker += "X";
  return marker;
}

function restoreEscapedDollarSigns(html: string, marker: string): string {
  return marker ? html.split(marker).join("$") : html;
}

/**
 * 把 Markdown 原文渲染为经白名单消毒的安全 HTML。
 * 服务端无 DOM 时退回转义纯文本，真正消毒在客户端挂载后执行（见 SafeMarkdown）。
 */
export function renderMarkdownToSafeHtml(markdown: string): string {
  const source = typeof markdown === "string" ? markdown : "";
  if (typeof window === "undefined") return `<pre class="note-markdown-fallback">${escapeHtml(source)}</pre>`;
  installHooks();
  const escapedDollarMarker = source.includes("\\$") ? createEscapedDollarMarker(source) : "";
  const rawHtml = marked.parse(source, {
    async: false,
    breaks: true,
    gfm: true,
    walkTokens(token) {
      if (escapedDollarMarker && token.type === "escape" && token.text === "$") {
        token.text = escapedDollarMarker;
      }
    },
  }) as string;
  const safeHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "style", "link", "meta", "form", "input", "svg", "math"],
    FORBID_ATTR: ["style", "srcset", "formaction", "onerror", "onload", "onclick"],
    ALLOW_DATA_ATTR: false,
  });
  if (!source.includes("$")) return restoreEscapedDollarSigns(safeHtml, escapedDollarMarker);

  const container = document.createElement("div");
  container.innerHTML = safeHtml;
  try {
    renderMathInElement(container, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "a"],
    });
    return restoreEscapedDollarSigns(container.innerHTML, escapedDollarMarker);
  } catch {
    return restoreEscapedDollarSigns(safeHtml, escapedDollarMarker);
  }
}
