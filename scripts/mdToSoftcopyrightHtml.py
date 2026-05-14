from pathlib import Path
import markdown

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs" / "softcopyright"
OUT = ROOT / "docs" / "output"
OUT.mkdir(parents=True, exist_ok=True)

CSS = """
@page { size: A4; margin: 18mm 15mm 24mm 15mm; }
body { font-family: "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif; color: #111827; line-height: 1.62; font-size: 13px; }
h1 { text-align: center; font-size: 24px; margin: 16px 0 22px; }
h2 { font-size: 18px; margin-top: 22px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
h3 { font-size: 15px; margin-top: 18px; }
pre { white-space: pre-wrap; word-break: break-word; background: #f8fafc; border: 1px solid #e5e7eb; padding: 8px; font-size: 10px; line-height: 1.35; }
code { font-family: "Noto Sans Mono CJK SC", Consolas, monospace; }
img { display: block; max-width: 94%; max-height: 185mm; margin: 10px auto 6px; object-fit: contain; }
.caption { text-align: center; font-size: 12px; color: #374151; margin: 0 0 8px; }
strong { font-weight: 700; }
.shot-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; margin: 8px 0 4px; break-inside: avoid; }
.shot-pair img { width: 100%; max-width: 100%; max-height: 118mm; margin: 0 auto 4px; }
.shot-label { text-align: center; font-size: 11px; color: #374151; margin-bottom: 4px; }
table { width: 100%; border-collapse: collapse; border-top: 1.5px solid #111827; border-bottom: 1.5px solid #111827; }
th { border-bottom: 1px solid #111827; }
td, th { padding: 6px 8px; text-align: left; }
p { margin: 7px 0; text-align: justify; }
"""

def convert(md_name: str, html_name: str, title: str):
    md = (SRC / md_name).read_text(encoding="utf-8")
    html = markdown.markdown(md, extensions=["tables", "fenced_code", "sane_lists"])
    page = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>{CSS}</style>
</head>
<body>
{html}
</body>
</html>
"""
    (OUT / html_name).write_text(page, encoding="utf-8")

convert("国际化学生单车租赁管理软件源代码.md", "source.html", "国际化学生单车租赁管理软件 V1.0 源代码")
convert("软件设计说明书.md", "design.html", "国际化学生单车租赁管理软件 V1.0 软件设计说明书")
print("HTML generated")
