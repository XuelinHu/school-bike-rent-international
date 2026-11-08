from pathlib import Path
import re
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image, Table, TableStyle, Preformatted
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors

ROOT = Path(__file__).resolve().parents[2]
pdfmetrics.registerFont(TTFont('CN', 'C:/Windows/Fonts/simhei.ttf'))
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='CNBody', fontName='CN', fontSize=9.5, leading=16, firstLineIndent=19, spaceAfter=7))
styles.add(ParagraphStyle(name='CNHead1', fontName='CN', fontSize=16, leading=22, spaceBefore=10, spaceAfter=10))
styles.add(ParagraphStyle(name='CNHead2', fontName='CN', fontSize=13, leading=18, spaceBefore=8, spaceAfter=7))
styles.add(ParagraphStyle(name='CNHead3', fontName='CN', fontSize=11, leading=16, spaceBefore=6, spaceAfter=5))
styles.add(ParagraphStyle(name='CNCover', fontName='CN', fontSize=22, leading=38, alignment=TA_CENTER))
styles.add(ParagraphStyle(name='CNCode', fontName='Courier', fontSize=6.4, leading=8, firstLineIndent=0))
styles.add(ParagraphStyle(name='CNCaption', fontName='CN', fontSize=8, leading=12, alignment=TA_CENTER))

def esc(t):
    return str(t).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def header(canvas, doc, title):
    if doc.page > 2:
        canvas.saveState(); canvas.setFont('CN', 8)
        canvas.drawString(18*mm, 287*mm, f'国际学生单车租赁系统 V1.0 {title}')
        canvas.drawRightString(192*mm, 10*mm, str(doc.page)); canvas.restoreState()

def parse(md):
    story, in_code, code = [], False, []
    for raw in md.splitlines():
        line = raw.rstrip()
        if line.startswith('```'):
            if in_code:
                story.append(Preformatted('\n'.join(code), styles['CNCode'])); code = []; in_code = False
            else: in_code = True
            continue
        if in_code:
            code.append(line); continue
        if not line.strip():
            story.append(Spacer(1, 3)); continue
        m = re.match(r'^(#{1,3})\s+(.*)', line)
        if m:
            level, text = len(m.group(1)), re.sub(r'`([^`]+)`', r'\1', m.group(2))
            story.append(Paragraph(esc(text), styles[f'CNHead{level}'])); continue
        im = re.match(r'^!\[[^]]*\]\(([^)]+)\)', line)
        if im:
            p = (ROOT / 'softright/text' / im.group(1)).resolve()
            if p.suffix.lower() == '.svg': p = p.with_suffix('.png')
            if p.exists():
                story.append(Image(str(p), width=155*mm, height=88*mm)); story.append(Paragraph(esc('图示：' + p.stem), styles['CNCaption']))
            continue
        if line.startswith('|'):
            cells = [x.strip() for x in line.strip('|').split('|')]
            if all(set(x) <= set('-: ') for x in cells): continue
            table = [[Paragraph(esc(x), styles['CNBody']) for x in cells]]
            story.append(Table(table, colWidths=[55*mm]*len(cells), style=TableStyle([('GRID',(0,0),(-1,-1),0.4,colors.black),('FONTNAME',(0,0),(-1,-1),'CN'),('VALIGN',(0,0),(-1,-1),'TOP')])))
            continue
        line = re.sub(r'`([^`]+)`', r'<font name="Courier">\1</font>', line)
        line = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', line)
        story.append(Paragraph(line, styles['CNBody']))
    return story

def build(src, name, title):
    md = (ROOT / 'softright/text' / src).read_text(encoding='utf-8')
    out = ROOT / 'softright/pdf' / name
    doc = SimpleDocTemplate(str(out), pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=20*mm, bottomMargin=15*mm)
    story = [Spacer(1, 55*mm), Paragraph('国际学生单车租赁系统', styles['CNCover']), Paragraph('版本号：V1.0', styles['CNCover']), Paragraph(title, styles['CNCover']), PageBreak(), Paragraph('目录', styles['CNHead1'])]
    headings = [re.sub(r'^#+\s+', '', x).strip() for x in md.splitlines() if re.match(r'^#{1,2}\s+', x)]
    for i, h in enumerate(headings, 1): story.append(Paragraph(f'{i}. {esc(h)}', styles['CNBody']))
    story += [PageBreak()] + parse(md)
    doc.build(story, onFirstPage=lambda c,d: header(c,d,title), onLaterPages=lambda c,d: header(c,d,title))

build('软件设计说明书.md', '国际学生单车租赁系统软件设计说明书.pdf', '软件设计说明书')
build('国际学生单车租赁系统用户手册.md', '国际学生单车租赁系统用户手册.pdf', '用户手册')
build('国际学生单车租赁系统源代码.md', '国际学生单车租赁系统源代码.pdf', '源代码')
