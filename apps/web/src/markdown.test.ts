import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders basic formatting", () => {
    const html = renderMarkdown("**bold**, _italic_ and\n- a list");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<li>a list</li>");
  });

  it("removes scripts and event handlers", () => {
    const html = renderMarkdown(
      '<script>alert(1)</script><img src=x onerror="alert(2)"><p onclick="alert(3)">hi</p>',
    );
    expect(html).not.toMatch(/<script|onerror|onclick|<img/i);
    expect(html).toContain("hi");
  });

  it("drops javascript: links but keeps the text", () => {
    const html = renderMarkdown("[click me](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("click me");
  });

  it("makes links safe to open", () => {
    const html = renderMarkdown("[source](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(html).toContain('target="_blank"');
  });

  it("drops images and iframes", () => {
    const html = renderMarkdown(
      '![tracker](https://evil.example/pixel.png)<iframe src="https://evil.example"></iframe>',
    );
    expect(html).not.toMatch(/<img|<iframe/i);
  });

  it("downgrades big headings to text", () => {
    const html = renderMarkdown("# Huge heading");
    expect(html).not.toContain("<h1");
    expect(html).toContain("Huge heading");
  });
});
