from pathlib import Path
from html import escape
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import landscape, A4

ROOT = Path(__file__).resolve().parents[2] / 'softright' / 'images' / 'diagrams'
ROOT.mkdir(parents=True, exist_ok=True)
W, H = 1400, 820
BG, PANEL, INK, ACCENT, DATA = '#f4f1e8', '#fffdf8', '#24332d', '#3f7656', '#b85c38'

def svg(name, title, groups, links):
    def box(x, y, w, h, text, fill=ACCENT):
        return f'<g><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{fill}" stroke="{INK}" stroke-width="3"/><text x="{x+w/2}" y="{y+42}" text-anchor="middle" font-size="26" font-family="Microsoft YaHei,Arial" fill="#fff">{escape(text)}</text></g>'
    out=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><rect width="100%" height="100%" fill="{BG}"/><text x="60" y="64" font-size="36" font-weight="bold" font-family="Microsoft YaHei,Arial" fill="{INK}">{escape(title)}</text>']
    for x,y,w,h,t,f in groups: out.append(box(x,y,w,h,t,f))
    for x1,y1,x2,y2 in links: out.append(f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{INK}" stroke-width="4" marker-end="url(#arrow)"/>')
    out.insert(1, f'<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="{INK}"/></marker></defs>')
    out.append('</svg>')
    p=ROOT/f'{name}.svg'; p.write_text('\n'.join(out), encoding='utf-8')
    png=ROOT/f'{name}.png'; im=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(im); d.text((60,25),title,fill=INK); 
    for x,y,w,h,t,f in groups:
        d.rounded_rectangle((x,y,x+w,y+h),radius=14,fill=f,outline=INK,width=3); d.text((x+18,y+30),t,fill='white')
    im.save(png)
    pdf=ROOT/f'{name}.pdf'; c=canvas.Canvas(str(pdf), pagesize=landscape(A4)); c.setFillColorRGB(0.96,0.95,0.91); c.rect(0,0,*landscape(A4),fill=1,stroke=0); c.setFillColorRGB(0.14,0.2,0.18); c.setFont('Helvetica-Bold',18); c.drawString(24,560,title); c.setFont('Helvetica',11)
    for x,y,w,h,t,f in groups:
        sx,sy=0.55,0.55; px,py=24+x*sx,80+(H-y-h)*sy; c.setFillColorRGB(0.25,0.46,0.34); c.roundRect(px,py,w*sx,h*sy,8,fill=1,stroke=1); c.setFillColorRGB(1,1,1); c.drawCentredString(px+w*sx/2,py+h*sy/2,t)
    c.save()
    drawio=ROOT/f'{name}.drawio'; cells=''.join(f'<mxCell id="n{i}" value="{escape(t)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor={f};fontColor=#ffffff;strokeColor=#24332d;" vertex="1" parent="1"><mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>' for i,(x,y,w,h,t,f) in enumerate(groups))
    drawio.write_text(f'<mxfile host="app.diagrams.net"><diagram name="{escape(title)}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>{cells}</root></mxGraphModel></diagram></mxfile>',encoding='utf-8')

svg('01_system_boundary','系统边界与角色功能',[(70,180,240,100,'学生',ACCENT),(70,360,240,100,'管理员',DATA),(70,540,240,100,'维护人员',ACCENT),(500,230,330,120,'Vue 3 / Vite H5',ACCENT),(500,450,330,120,'Express API / JWT',DATA),(1000,230,300,120,'车辆、站点、公告',ACCENT),(1000,450,300,120,'租赁订单与维护',DATA),(1000,650,300,100,'业务助手 / Ollama',ACCENT)],[(310,230,500,280),(310,410,500,500),(310,590,500,500),(830,290,1000,290),(830,510,1000,510),(830,560,1000,690)])
svg('02_architecture','系统架构图',[(70,170,300,110,'Android WebView',ACCENT),(70,350,300,110,'浏览器 / H5',ACCENT),(470,190,330,110,'Vue Router + Views',DATA),(470,390,330,110,'Express Routes',DATA),(470,590,330,110,'AI Agent + Tools',ACCENT),(950,190,300,110,'PostgreSQL',DATA),(950,390,300,110,'JWT / Role Guard',ACCENT),(950,590,300,110,'Ollama Models',ACCENT)],[(370,220,470,240),(370,400,470,440),(800,240,950,240),(800,440,950,440),(800,640,950,640)])
svg('03_deployment','部署与运行拓扑',[(70,210,300,120,'Windows PC\nVite 4030',ACCENT),(70,470,300,120,'Android 手机\nWebView',ACCENT),(500,210,330,120,'Linux PM2\nAPI 8032',DATA),(500,470,330,120,'Linux Ollama\n11434',ACCENT),(1000,210,300,120,'PostgreSQL\n5433',DATA),(1000,470,300,120,'局域网浏览器\nHTTP',ACCENT)],[(370,270,500,270),(370,530,500,530),(830,270,1000,270),(830,530,1000,530)])
svg('04_rental_flow','租赁状态流程',[(80,300,250,110,'available',ACCENT),(430,300,250,110,'renting',DATA),(780,300,250,110,'completed',ACCENT),(1130,300,200,110,'异常回退',DATA),(330,355,100,0,'',INK),(680,355,100,0,'',INK)],[(330,355,430,355),(680,355,780,355),(1030,355,1130,355)])
