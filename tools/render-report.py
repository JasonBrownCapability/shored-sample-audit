#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["markdown>=3.5"]
# ///
"""Render a Shored report from Markdown to a self-contained HTML page.

Usage:
    uv run tools/render-report.py report.md -o index.html

Writes the .html file next to the .md file. Inline CSS only, light and dark via
prefers-color-scheme, no external scripts, no external stylesheets.
"""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

import markdown

FOOTER = "Sample report on a synthetic codebase. Shored, shored.dev."

CSS = """
:root {
  --bg: #fbfbfa;
  --fg: #1c1f24;
  --muted: #5b6270;
  --heading: #12315c;
  --accent: #1d6b5a;
  --rule: #e2e4e8;
  --code-bg: #f1f2f4;
  --table-stripe: #f5f6f8;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #13161b;
    --fg: #e6e8eb;
    --muted: #9aa3b2;
    --heading: #9dbce8;
    --accent: #5fb3a1;
    --rule: #2b313b;
    --code-bg: #1d222a;
    --table-stripe: #191d24;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: Geist, "Geist Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 17px;
  line-height: 1.55;
}
main {
  max-width: 44rem;
  margin: 0 auto;
  padding: 2.5rem 1rem 4rem;
}
h1, h2, h3, h4 { color: var(--heading); line-height: 1.2; font-weight: 600; }
h1 { font-size: 2rem; margin: 0 0 1rem; }
h2 { font-size: 1.5rem; margin: 2.5rem 0 0.75rem; padding-top: 1.25rem; border-top: 1px solid var(--rule); }
h3 { font-size: 1.2rem; margin: 2rem 0 0.5rem; }
h4 { font-size: 1.05rem; margin: 1.5rem 0 0.5rem; }
p, ul, ol { margin: 0 0 1rem; }
li { margin-bottom: 0.3rem; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code, pre {
  font-family: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88em;
}
code { background: var(--code-bg); padding: 0.1em 0.3em; border-radius: 3px; overflow-wrap: anywhere; }
pre {
  background: var(--code-bg);
  padding: 0.9rem 1rem;
  border-radius: 6px;
  overflow-x: auto;
  line-height: 1.45;
  margin: 0 0 1.2rem;
}
pre code { background: none; padding: 0; font-size: 0.8rem; overflow-wrap: normal; }
.table-wrap { overflow-x: auto; margin: 0 0 1.4rem; -webkit-overflow-scrolling: touch; }
table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
th, td { text-align: left; vertical-align: top; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--rule); }
th { color: var(--heading); font-weight: 600; white-space: nowrap; }
tbody tr:nth-child(even) { background: var(--table-stripe); }
td code { white-space: normal; }
blockquote { margin: 0 0 1rem; padding-left: 1rem; border-left: 3px solid var(--accent); color: var(--muted); }
hr { border: 0; border-top: 1px solid var(--rule); margin: 2rem 0; }
footer {
  max-width: 44rem;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
  border-top: 1px solid var(--rule);
  color: var(--muted);
  font-size: 0.9rem;
}
/* Dense tables (four or more columns) stay inside the text column with fixed column widths and
   wrapping cells, so the page never scrolls sideways; on a narrow screen each row becomes a card. */
.table-wrap.wide { overflow: visible; }
.table-wrap.wide table { table-layout: fixed; font-size: 0.84rem; line-height: 1.4; }
.table-wrap.wide.cols-4 th:nth-child(1) { width: 5%; }
.table-wrap.wide.cols-4 th:nth-child(2) { width: 30%; }
.table-wrap.wide.cols-4 th:nth-child(3) { width: 30%; }
.table-wrap.wide.cols-4 th:nth-child(4) { width: 35%; }
.table-wrap.wide th { white-space: normal; vertical-align: bottom; }
.table-wrap.wide td, .table-wrap.wide th { overflow-wrap: anywhere; vertical-align: top; }
.table-wrap.wide.cols-6 th:nth-child(1) { width: 3.5%; }
.table-wrap.wide.cols-6 th:nth-child(2) { width: 19%; }
.table-wrap.wide.cols-6 th:nth-child(3) { width: 26%; }
.table-wrap.wide.cols-6 th:nth-child(4) { width: 21%; }
.table-wrap.wide.cols-6 th:nth-child(5) { width: 24%; }
.table-wrap.wide.cols-6 th:nth-child(6) { width: 6.5%; }
@media (max-width: 700px) {
  .table-wrap.wide { width: auto; }
  .table-wrap.wide table, .table-wrap.wide tbody, .table-wrap.wide tr, .table-wrap.wide td { display: block; width: 100%; }
  .table-wrap.wide thead { display: none; }
  .table-wrap.wide tr { border: 1px solid var(--rule); border-radius: 6px; padding: 0.6rem 0.8rem; margin: 0 0 0.8rem; background: none; }
  .table-wrap.wide td { border: 0; padding: 0.3rem 0; }
  .table-wrap.wide td::before { content: attr(data-label); display: block; font-weight: 600; color: var(--muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.1rem; }
}
@media (max-width: 600px) {
  body { font-size: 16px; }
  h1 { font-size: 1.6rem; }
  h2 { font-size: 1.3rem; }
  main { padding-top: 1.5rem; }
}
"""

TEMPLATE = """<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
<style>{css}</style>
</head>
<body>
<main>
{body}
</main>
<footer>{footer}</footer>
</body>
</html>
"""


def first_heading(md_text: str) -> str:
    for line in md_text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return "Report"


def wrap_tables(rendered: str) -> str:
    """Wrap every table. Narrow tables scroll sideways if they must. Dense tables (four or more
    columns) get the .wide class, a .cols-N class for column widths, and a data-label on every
    cell so the CSS can stack each row as a card on a narrow screen."""

    def one(match: "re.Match[str]") -> str:
        inner = match.group(1)
        headers = [re.sub(r"<[^>]+>", "", h).strip() for h in re.findall(r"<th[^>]*>(.*?)</th>", inner, flags=re.S)]
        if len(headers) < 4:
            return f'<div class="table-wrap"><table>{inner}</table></div>'

        def label_row(row_match: "re.Match[str]") -> str:
            cells = re.findall(r"<td([^>]*)>(.*?)</td>", row_match.group(1), flags=re.S)
            out = []
            for i, (attrs, body) in enumerate(cells):
                label = html.escape(headers[i] if i < len(headers) else "")
                out.append(f'<td{attrs} data-label="{label}">{body}</td>')
            return "<tr>" + "".join(out) + "</tr>"

        head, sep, body_html = inner.partition("<tbody>")
        body_html = re.sub(r"<tr>(.*?)</tr>", label_row, body_html, flags=re.S)
        return f'<div class="table-wrap wide cols-{len(headers)}"><table>{head}{sep}{body_html}</table></div>'

    return re.sub(r"<table>(.*?)</table>", one, rendered, flags=re.S)


def render(md_path: Path, out_path: Path | None = None) -> Path:
    md_text = md_path.read_text(encoding="utf-8")
    body = markdown.markdown(md_text, extensions=["tables", "fenced_code", "sane_lists"], output_format="html5")
    body = wrap_tables(body)
    title = first_heading(md_text)
    out = TEMPLATE.format(
        title=html.escape(title),
        description=html.escape(f"{title}. {FOOTER}"),
        css=CSS.strip(),
        body=body,
        footer=html.escape(FOOTER),
    )
    out_path = out_path or md_path.with_suffix(".html")
    out_path.write_text(out, encoding="utf-8")
    return out_path


def main(argv: list[str]) -> int:
    args = argv[1:]
    out: Path | None = None
    if "-o" in args:
        i = args.index("-o")
        out = Path(args[i + 1])
        del args[i : i + 2]
    if len(args) != 1:
        print(__doc__, file=sys.stderr)
        return 2
    print(render(Path(args[0]), out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
