import DOMPurify from "dompurify";
import { marked } from "marked";

// Formatting only. No images (they can track readers by loading from other
// servers), no raw HTML, no scripts or event handlers.
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "del",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "h3",
  "h4",
  "hr",
];

// Links open in a new tab, can't control this page, and get no ranking credit.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow ugc");
  }
});

export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false, gfm: true, breaks: true });
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "title"],
  });
}
