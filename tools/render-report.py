#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["markdown>=3.5"]
# ///
"""Render a Shored report from Markdown to a single HTML page in the shored.dev design system.

Usage:
    uv run tools/render-report.py report.md -o index.html

Same tokens as web/app/globals.css in the Shored repo (navy, charcoal, sea-green, Geist), the
text wordmark with its green rule, the navy footer. Inline CSS, no scripts. The only external
request is the Geist font from Google Fonts, with system-ui as the fallback, which is how the
site itself loads it.
"""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

import markdown

BRAND = "Shored"
SITE = "https://shored.dev"
FOOTER_NOTE = "Sample report on a synthetic codebase. Meadowlark, its founder and every key in its repository are fictional."
LEGAL = "Shored is a trading name of Capability Systems Ltd, registered in England and Wales."

CSS = """
:root {
  --background: #ffffff;
  --foreground: #1e1e1e;
  --primary: #1a2b4a;
  --primary-foreground: #ffffff;
  --accent: #1d6b5a;
  --accent-hover: #165548;
  --accent-light: #5fb3a1;
  --muted: #f8f9fa;
  --muted-foreground: #5a6a7a;
  --border: #e2e6ea;
  --section-alt: #f1f4f8;
  --code-bg: #f1f4f8;
  color-scheme: light;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-padding-top: 5rem; }
body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: Geist, "Geist Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 16px;
  line-height: 1.65;
}
a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
a:hover { color: var(--primary); }
h1, h2, h3, h4 { color: var(--primary); line-height: 1.2; margin: 0 0 0.6rem; letter-spacing: -0.01em; }
h1 { font-size: 2.6rem; font-weight: 700; }
h2 { font-size: 1.9rem; font-weight: 700; margin-top: 0; }
h3 { font-size: 1.15rem; font-weight: 600; margin-top: 2.2rem; }
p, ul, ol { margin: 0 0 1rem; }
li { margin: 0.25rem 0; }
strong { color: var(--foreground); }
code, pre, kbd {
  font-family: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
}
code { background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 4px; overflow-wrap: anywhere; color: var(--primary); }
pre {
  background: var(--primary);
  color: #e6ebf2;
  padding: 1rem 1.15rem;
  border-radius: 0.75rem;
  overflow-x: auto;
  margin: 1.1rem 0 1.4rem;
  line-height: 1.5;
}
pre code { background: none; padding: 0; color: inherit; font-size: 0.82rem; overflow-wrap: normal; }
blockquote {
  margin: 1.2rem 0;
  padding: 0.75rem 1.1rem;
  border-left: 3px solid var(--accent);
  background: var(--muted);
  color: var(--muted-foreground);
  border-radius: 0 0.5rem 0.5rem 0;
}
blockquote p:last-child { margin-bottom: 0; }
hr { border: 0; border-top: 1px solid var(--border); margin: 2rem 0; }

/* Header, as the site's: sticky white bar with the wordmark. */
.site-header {
  position: sticky; top: 0; z-index: 50;
  border-bottom: 1px solid var(--border);
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(4px);
}
.site-header .bar { max-width: 80rem; margin: 0 auto; padding: 1rem 1.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.wordmark { display: inline-flex; flex-direction: column; line-height: 1; text-decoration: none; }
.wordmark .name { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.02em; color: var(--primary); }
.wordmark .rule { display: block; height: 2px; width: 100%; margin-top: 0.25rem; border-radius: 999px; background: var(--accent); }
.wordmark.dark .name { color: #fff; }
.wordmark.dark .rule { background: var(--accent-light); }
.site-header .kicker { font-size: 0.875rem; color: var(--muted-foreground); }
.site-header .kicker a { text-decoration: none; font-weight: 500; color: var(--foreground); }
.site-header .kicker a:hover { color: var(--accent); }

/* Cover: the title, the framing paragraph and the metadata grid. */
.cover { padding: 4rem 1.5rem 3rem; }
.cover .inner { max-width: 56rem; margin: 0 auto; }
.cover .eyebrow { display: inline-block; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); margin-bottom: 1rem; }
.cover h1 { margin-bottom: 1.2rem; }
.cover .lede { font-size: 1.1rem; color: var(--muted-foreground); max-width: 46rem; }
.meta {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px;
  background: var(--border); border: 1px solid var(--border); border-radius: 0.75rem; overflow: hidden;
  margin: 2rem 0 0;
}
.meta > div { background: #fff; padding: 1rem 1.15rem; }
.meta > div.wide { grid-column: 1 / -1; }
.meta dt { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted-foreground); margin-bottom: 0.3rem; }
.meta dd { margin: 0; font-size: 0.95rem; }

/* Sections, alternating like the site. */
.sec { padding: 3.5rem 1.5rem; }
.sec.alt { background: var(--section-alt); }
.sec .inner { max-width: 56rem; margin: 0 auto; }
.sec .inner > p, .sec .inner > ul, .sec .inner > ol, .sec .inner > blockquote { max-width: 46rem; }
.sec h2 { margin-bottom: 1.4rem; }
.sec h2 .num { color: var(--accent); margin-right: 0.5rem; }
.sec.callout .inner { background: #fff; border: 1px solid var(--border); border-left: 4px solid var(--accent); border-radius: 0.75rem; padding: 2rem 2rem 1.4rem; }
.sec.callout .inner > p, .sec.callout .inner > ul, .sec.callout .inner > ol { max-width: none; }

/* Tables in the site's treatment. */
.table-wrap { overflow-x: auto; margin: 1.2rem 0 1.6rem; border: 1px solid var(--border); border-radius: 0.75rem; background: #fff; }
table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
th, td { padding: 0.7rem 0.9rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--border); }
thead th { background: var(--primary); color: var(--primary-foreground); font-weight: 600; white-space: nowrap; font-size: 0.85rem; }
tbody tr:nth-child(even) { background: var(--section-alt); }
tbody tr:last-child td { border-bottom: 0; }
td code { white-space: normal; }
.table-wrap.wide table { table-layout: fixed; font-size: 0.86rem; line-height: 1.45; }
.table-wrap.wide th { white-space: normal; vertical-align: bottom; }
.table-wrap.wide td, .table-wrap.wide th { overflow-wrap: anywhere; }
.table-wrap.wide td:first-child, .table-wrap.wide th:first-child { white-space: nowrap; overflow-wrap: normal; font-weight: 600; color: var(--accent); }
.table-wrap.wide thead th:first-child { color: var(--primary-foreground); }
.table-wrap.wide.cols-4 th:nth-child(1) { width: 3rem; }
.table-wrap.wide.cols-4 th:nth-child(2) { width: 29%; }
.table-wrap.wide.cols-4 th:nth-child(3) { width: 30%; }
.table-wrap.wide.cols-4 th:nth-child(4) { width: 35%; }
@media (max-width: 700px) {
  .table-wrap.wide { border: 0; background: none; }
  .table-wrap.wide table, .table-wrap.wide tbody, .table-wrap.wide tr, .table-wrap.wide td { display: block; width: 100%; }
  .table-wrap.wide thead { display: none; }
  .table-wrap.wide tr { border: 1px solid var(--border); border-radius: 0.75rem; padding: 0.7rem 0.9rem; margin: 0 0 0.8rem; background: #fff !important; }
  .table-wrap.wide td { border: 0; padding: 0.3rem 0; }
  .table-wrap.wide td::before { content: attr(data-label); display: block; font-weight: 600; color: var(--muted-foreground); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.1rem; }
  .table-wrap.wide td:first-child { color: var(--accent); }
}

/* Footer, as the site's: navy, wordmark, small print. */
.site-footer { border-top: 1px solid var(--border); background: var(--primary); color: var(--primary-foreground); }
.site-footer .inner { max-width: 80rem; margin: 0 auto; padding: 3rem 1.5rem; }
.site-footer p { font-size: 0.875rem; line-height: 1.6; color: rgba(255,255,255,0.7); max-width: 40rem; }
.site-footer .legal { margin-top: 2rem; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 1.5rem; color: rgba(255,255,255,0.5); }
.site-footer a { color: rgba(255,255,255,0.85); }
.site-footer a:hover { color: #fff; }

@media (max-width: 600px) {
  h1 { font-size: 1.9rem; }
  h2 { font-size: 1.45rem; }
  .cover { padding: 2.5rem 1rem 2rem; }
  .sec { padding: 2.5rem 1rem; }
  .sec.callout .inner { padding: 1.4rem 1.2rem 1rem; }
  .meta { grid-template-columns: 1fr; }
}
@media print {
  .site-header { position: static; }
  .sec, .cover { padding: 1.5rem 0; }
  pre { color: #000; background: #f1f4f8; }
}
"""

TEMPLATE = """<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · {brand}</title>
<meta name="description" content="{description}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">
<style>{css}</style>
</head>
<body>
<header class="site-header">
  <div class="bar">
    <a class="wordmark" href="{site}" aria-label="{brand} home"><span class="name">{brand}</span><span class="rule" aria-hidden="true"></span></a>
    <span class="kicker">Sample report · <a href="{site}">Book the £550 day</a></span>
  </div>
</header>
<main>
{body}
</main>
<footer class="site-footer">
  <div class="inner">
    <a class="wordmark dark" href="{site}" aria-label="{brand} home"><span class="name">{brand}</span><span class="rule" aria-hidden="true"></span></a>
    <p style="margin-top:1rem">{footer_note}</p>
    <p>Founder-built. Production-ready. Shored up, not rebuilt. <a href="{site}">{site_short}</a></p>
    <p class="legal">{legal}</p>
  </div>
</footer>
</body>
</html>
"""


def first_heading(md_text: str) -> str:
    for line in md_text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return "Report"


def wrap_tables(rendered: str) -> str:
    """Wrap every table. Dense tables (four or more columns) get the .wide class, a .cols-N class
    for column widths, and a data-label on every cell so the CSS can stack rows as cards on a
    narrow screen."""

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


def cover_and_sections(body: str) -> str:
    """Turn the flat document into the site's shape: a cover (h1, lede, metadata grid) followed
    by one section per h2, alternating backgrounds, with 'Do this today' as a callout."""
    parts = re.split(r"(?=<h2[ >])", body)
    head, sections = parts[0], parts[1:]

    # Cover: h1, the first paragraph, and the two-column header table as a definition grid.
    h1 = re.search(r"<h1>(.*?)</h1>", head, flags=re.S)
    title = h1.group(1) if h1 else ""
    lede = re.search(r"</h1>\s*<p>(.*?)</p>", head, flags=re.S)
    lede_html = lede.group(1) if lede else ""
    meta_html = ""
    tbl = re.search(r"<table>(.*?)</table>", head, flags=re.S)
    if tbl:
        rows = re.findall(r"<tr>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*</tr>", tbl.group(1), flags=re.S)
        cells = []
        for k, v in rows:
            wide = " wide" if len(re.sub(r"<[^>]+>", "", v)) > 90 else ""
            cells.append(f'<div class="{wide.strip()}"><dt>{k}</dt><dd>{v}</dd></div>')
        meta_html = f'<dl class="meta">{"".join(cells)}</dl>'
    cover = (
        '<section class="cover"><div class="inner">'
        '<span class="eyebrow">Enforcement-tier audit · sample</span>'
        f"<h1>{title}</h1>"
        f'<p class="lede">{lede_html}</p>'
        f"{meta_html}"
        "</div></section>"
    )

    out = [cover]
    for i, sec in enumerate(sections):
        h2 = re.match(r"<h2>(.*?)</h2>", sec, flags=re.S)
        heading = h2.group(1) if h2 else ""
        num = re.match(r"(\d+)\.\s+(.*)", heading)
        if num:
            heading_html = f'<span class="num">{num.group(1)}</span>{num.group(2)}'
        else:
            heading_html = heading
        rest = sec[h2.end():] if h2 else sec
        classes = ["sec"]
        if i % 2 == 1:
            classes.append("alt")
        if "do this today" in heading.lower():
            classes.append("callout")
        out.append(f'<section class="{" ".join(classes)}"><div class="inner"><h2>{heading_html}</h2>{rest}</div></section>')
    return "".join(out)


def render(md_path: Path, out_path: Path | None = None) -> Path:
    md_text = md_path.read_text(encoding="utf-8")
    body = markdown.markdown(md_text, extensions=["tables", "fenced_code", "sane_lists"], output_format="html5")
    body = cover_and_sections(body)
    body = wrap_tables(body)
    title = first_heading(md_text)
    out = TEMPLATE.format(
        title=html.escape(title),
        brand=BRAND,
        site=SITE,
        site_short=SITE.replace("https://", ""),
        description=html.escape(f"{title}. {FOOTER_NOTE}"),
        css=CSS.strip(),
        body=body,
        footer_note=html.escape(FOOTER_NOTE),
        legal=html.escape(LEGAL),
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
