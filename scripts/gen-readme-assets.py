#!/usr/bin/env python3
"""README visuals for dsh-standards — v3 (1440x576 hero + 1100x660 flow)."""
import os
from html import escape
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'assets')
FONT_CJK = r'C:\Windows\Fonts\msyh.ttc'
FONT_CJK_BOLD = r'C:\Windows\Fonts\msyhbd.ttc'
FONT_MONO = r'C:\Windows\Fonts\consola.ttf'
FONT_EN = r'C:\Windows\Fonts\segoeui.ttf'
FONT_EN_BOLD = r'C:\Windows\Fonts\segoeuib.ttf'
for _p in (FONT_CJK, FONT_CJK_BOLD, FONT_MONO):
    if not os.path.exists(_p):
        raise SystemExit(f'FATAL: font missing: {_p}')

SKIN = {
    'light': dict(bg_from='#f9f6fd', bg_to='#e4eaf8', card='#ffffff',
                  card_edge='#e4e1ee', text='#141419', sub='#4d5261',
                  faint='#8f94a4', accent='#4B67B4', accent2='#16a34a',
                  warn='#bc4c00', pill='#ece7f9', grid='#e7e4f0',
                  shadow=(32, 26, 64)),
    'dark': dict(bg_from='#131a2a', bg_to='#0c1016', card='#1b2231',
                 card_edge='#2e374b', text='#f0f3f9', sub='#a8b1c4',
                 faint='#737b8d', accent='#8496f5', accent2='#3fb950',
                 warn='#d29922', pill='#242d42', grid='#1e2636',
                 shadow=(0, 0, 0)),
}


def font(size, kind='cjk_bold'):
    return ImageFont.truetype({
        'cjk': FONT_CJK, 'cjk_bold': FONT_CJK_BOLD, 'mono': FONT_MONO,
        'en': FONT_EN, 'en_bold': FONT_EN_BOLD}[kind], size)


def hx(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def gradient(w, h, c1, c2):
    a = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(a)
    for y in range(h):
        t = 0.2 * (y / h) + 0.8 * (y / h) ** 1.5
        d.line([(0, y), (w, y)],
               fill=tuple(int(p + (q - p) * t) for p, q in zip(hx(c1), hx(c2))))
    return a


def glow(img, cx, cy, r, color, alpha=60):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(9, 0, -1):
        rr = r * i / 9
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                  fill=color + (int(alpha * (1 - i / 10)),))
    return Image.alpha_composite(img.convert('RGBA'), layer).convert('RGB')


def card(img, box, skin, radius=20, shadow=22):
    x0, y0, x1, y1 = box
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    for i in range(shadow, 0, -3):
        sd.rounded_rectangle([x0 - i // 4, y0 + i // 2, x1 + i // 4, y1 + i],
                             radius=radius + i // 4,
                             fill=skin['shadow'] + (int(8 * (1 - i / shadow)),))
    base = Image.alpha_composite(img.convert('RGBA'),
                                 sh.filter(ImageFilter.GaussianBlur(11)))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle(box, radius=radius, fill=hx(skin['card']),
                        outline=hx(skin['card_edge']), width=2)
    return base.convert('RGB')


def pill(img, xy, text, skin, size=15, fg=None, bg=None, kind='cjk_bold'):
    d = ImageDraw.Draw(img)
    f = font(size, kind)
    tw = d.textlength(text, font=f)
    x, y = xy
    h = size + 16
    d.rounded_rectangle([x, y, x + tw + 28, y + h], radius=h // 2,
                        fill=hx(bg or skin['pill']))
    d.text((x + 14, y + 6), text, font=f, fill=hx(fg or skin['accent']))


def wrap(d, text, f, maxw):
    if ' ' in text:
        words, lines, cur = text.split(' '), [], ''
        for wd in words:
            cand = (cur + ' ' + wd) if cur else wd
            if d.textlength(cand, font=f) <= maxw or not cur:
                cur = cand
            else:
                lines.append(cur)
                cur = wd
        if cur:
            lines.append(cur)
        return lines
    lines, cur = [], ''
    for ch in text:
        if d.textlength(cur + ch, font=f) <= maxw or not cur:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines


HERO = {
    'zh': dict(kicker='DeepSeek Harness · 执行总部', title='dsh-standards',
               value=['静态不冒充运行时，', 'not-run 不算 PASS'],
               sub='兼容性、可用性、提效证据一次查清：\nDSC-01…13 静态检查 + L1–L3 运行时实测。',
               meta='DSC-01…13  ·  L1–L3 运行时  ·  报告可复现',
               checks=[('pass', '契约', 'cordis.patch.yml 能装配'),
                       ('pass', '清单', 'package.json 字段齐全'),
                       ('not-run', '运行时', 'L1–L3 需真跑，不给假 PASS'),
                       ('not-run', '证据', 'BOOST 必须实测可复现')],
               report='report · text / json / sarif',
               exits=[('0', 'pass', 'pass'), ('1', 'fail', 'fail'),
                      ('2', 'config', 'config'), ('3', 'runtime', 'runtime')],
               foot='Apache-2.0 + CC-BY-4.0  ·  PerryLink DSH plugin family'),
    'en': dict(kicker='DeepSeek Harness · Execution home', title='dsh-standards',
               value=['Static never pretends to be runtime', 'not-run is not PASS'],
               sub='Compatibility, usability and boost evidence in one pass:\nDSC-01…13 static checks + L1–L3 runtime measurement.',
               meta='DSC-01…13  ·  L1–L3 runtime  ·  reproducible reports',
               checks=[('pass', 'contract', 'cordis.patch.yml assembles'),
                       ('pass', 'manifest', 'package.json fields complete'),
                       ('not-run', 'runtime', 'L1–L3 must actually run'),
                       ('not-run', 'evidence', 'BOOST must be measured')],
               report='report · text / json / sarif',
               exits=[('0', 'pass', 'pass'), ('1', 'fail', 'fail'),
                      ('2', 'config', 'config'), ('3', 'runtime', 'runtime')],
               foot='Apache-2.0 + CC-BY-4.0  ·  PerryLink DSH plugin family'),
}


def hero(lang, skin):
    s = SKIN[skin]
    w, h = 1440, 576
    img = gradient(w, h, s['bg_from'], s['bg_to'])
    img = glow(img, 1160, 90, 380, hx(s['accent']), 30 if skin == 'light' else 44)
    img = glow(img, 200, 540, 280, hx(s['accent2']), 12 if skin == 'light' else 18)
    H = HERO[lang]
    d = ImageDraw.Draw(img)
    m = 60
    pill(img, (m, m), H['kicker'], s, size=17)
    d = ImageDraw.Draw(img)
    tsize = 84
    while tsize > 44:
        tf = font(tsize, 'mono')
        if d.textlength(H['title'], font=tf) <= 540:
            break
        tsize -= 4
    d.text((m, 112 + (84 - tsize) // 2), H['title'], font=font(tsize, 'mono'),
           fill=hx(s['text']))
    y = 228
    for line in H['value']:
        d.text((m, y), line, font=font(38, 'cjk_bold'), fill=hx(s['text']))
        y += 52
    fsub = font(25, 'cjk')
    lines = []
    for para in H['sub'].split('\n'):
        lines += wrap(d, para, fsub, 520)
    for i, ln in enumerate(lines):
        d.text((m + 2, 336 + i * 35), ln, font=fsub, fill=hx(s['sub']))
    meta_y = 336 + len(lines) * 35 + 16
    d.text((m + 2, meta_y), H['meta'], font=font(19, 'cjk'), fill=hx(s['faint']))
    d.line([m + 2, meta_y + 42, m + 540, meta_y + 42], fill=hx(s['grid']), width=2)
    d.text((m + 2, meta_y + 58), H['foot'], font=font(16, 'en'),
           fill=hx(s['faint']))

    # right: checks panel + report / exit cards
    img = card(img, (660, 52, 1080, 436), s)
    d = ImageDraw.Draw(img)
    d.text((686, 74), 'DSC-01 … DSC-13', font=font(24, 'mono'),
           fill=hx(s['text']))
    d.text((686, 106), 'static checks', font=font(15, 'en'),
           fill=hx(s['faint']))
    for i, (mark, name, desc) in enumerate(H['checks']):
        yy = 142 + i * 66
        color = s['accent2'] if mark == 'pass' else s['warn']
        if mark == 'pass':
            d.ellipse([686, yy + 6, 704, yy + 24], fill=hx(color))
        else:
            d.ellipse([686, yy + 6, 704, yy + 24], outline=hx(color), width=2)
            d.line([690, yy + 15, 700, yy + 15], fill=hx(color), width=2)
        d.text((722, yy + 2), name, font=font(21, 'cjk_bold'), fill=hx(s['text']))
        d.text((722, yy + 30), desc, font=font(16, 'cjk'), fill=hx(s['sub']))
    d.line([686, 404, 1054, 404], fill=hx(s['grid']), width=2)
    d.text((686, 412), 'static ≠ runtime · not-run ≠ PASS', font=font(15, 'mono'),
           fill=hx(s['warn']))
    # report card
    img = card(img, (1104, 52, 1380, 236), s)
    d = ImageDraw.Draw(img)
    d.text((1128, 74), 'report', font=font(22, 'mono'), fill=hx(s['accent']))
    for i, fmt in enumerate(('text', 'json', 'sarif')):
        d.text((1128, 108 + i * 30), f'· {fmt}', font=font(18, 'mono'),
               fill=hx(s['sub']))
    d.text((1128, 202), H['report'].split('·')[1].strip() if '·' in H['report'] else '',
           font=font(13, 'en'), fill=hx(s['faint']))
    # exit codes card
    img = card(img, (1104, 256, 1380, 436), s)
    d = ImageDraw.Draw(img)
    d.text((1128, 278), 'exit', font=font(22, 'mono'), fill=hx(s['accent']))
    for i, (code, name, _) in enumerate(H['exits']):
        d.text((1128, 312 + i * 28), code, font=font(17, 'mono'),
               fill=hx(s['text']))
        d.text((1152, 312 + i * 28), name, font=font(16, 'en'), fill=hx(s['sub']))
    # levels bar
    img = card(img, (660, 452, 1380, 524), s)
    d = ImageDraw.Draw(img)
    d.text((686, 472), 'ENTRY  ·  FLOW  ·  BOOST', font=font(20, 'mono'),
           fill=hx(s['accent']))
    d.text((686, 500), 'dsh-levels decides which depth a plugin actually reaches',
           font=font(15, 'en'), fill=hx(s['faint']))
    img.save(os.path.join(OUT, f'dsh-standards-hero-{lang}-{skin}.webp'),
             'WEBP', quality=92)
    print(f'dsh-standards-hero-{lang}-{skin}.webp')


FLOW = {'light': dict(bg='#ffffff', card='#fcfcfe', edge='#e6e3f0',
                      text='#141419', sub='#4d5261', accent='#4B67B4',
                      accent2='#16a34a', warn='#bc4c00', grid='#f2f0f8', pill='#ece7f9'),
        'dark': dict(bg='#0d1117', card='#161b26', edge='#2a3142',
                     text='#f0f3f9', sub='#a8b1c4', accent='#8496f5',
                     accent2='#3fb950', warn='#d29922', grid='#182031', pill='#242d42')}


def flow_svg(skin):
    s = FLOW[skin]
    W, H = 1100, 660
    nodes = [('01', 'plugin dir', 'the repository', 50),
             ('02', 'DSC-01…13', 'static checks', 256),
             ('03', 'L1–L3', 'runtime measurement', 462),
             ('04', 'report', 'text / json / sarif', 668),
             ('05', 'dsh-levels', 'ENTRY/FLOW/BOOST', 874)]
    nw, nh, y0 = 176, 118, 190
    solid = "0.10" if skin == 'light' else "0.55"
    p = [f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="dsh-standards pipeline">
<defs>
  <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="{s['accent']}" stop-opacity=".15"/>
    <stop offset=".5" stop-color="{s['accent']}" stop-opacity=".9"/>
    <stop offset="1" stop-color="{s['accent']}" stop-opacity=".15"/>
  </linearGradient>
  <filter id="soft" x="-40%" y="-40%" width="180%" height="200%">
    <feDropShadow dx="0" dy="9" stdDeviation="12" flood-color="#1b1735" flood-opacity="{solid}"/>
  </filter>
  <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
    <circle cx="1.3" cy="1.3" r="1.3" fill="{s['grid']}"/>
  </pattern>
</defs>
<rect width="{W}" height="{H}" fill="{s['bg']}"/>
<rect width="{W}" height="{H}" fill="url(#dots)" opacity=".5"/>
<text x="50" y="62" fill="{s['text']}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="32" font-weight="700">dsh-standards</text>
<text x="50" y="90" fill="{s['sub']}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="16">static checks, runtime measurement, one reproducible report</text>
<rect x="50" y="108" width="1000" height="1.6" rx="1" fill="{s['edge']}"/>''']
    for i, (num, title, sub, x) in enumerate(nodes):
        accent = s['accent2'] if i == 4 else (s['accent'] if i == 1 else s['edge'])
        stroke = 2.6 if i in (1, 4) else 1.3
        p.append(f'''<g filter="url(#soft)">
  <rect x="{x}" y="{y0}" width="{nw}" height="{nh}" rx="17" fill="{s['card']}" stroke="{accent}" stroke-width="{stroke}"/>
</g>
<circle cx="{x + 24}" cy="{y0 + 24}" r="12" fill="{s['pill']}"/>
<text x="{x + 24}" y="{y0 + 29}" text-anchor="middle" fill="{s['accent']}" font-family="ui-monospace, monospace" font-size="11.5" font-weight="700">{num}</text>
<text x="{x + nw / 2}" y="{y0 + 66}" text-anchor="middle" fill="{s['text']}" font-family="ui-monospace, monospace" font-size="15.5" font-weight="700">{escape(title)}</text>
<text x="{x + nw / 2}" y="{y0 + 92}" text-anchor="middle" fill="{s['sub']}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12.5">{escape(sub)}</text>''')
        if i < len(nodes) - 1:
            x0, x1 = x + nw + 5, nodes[i + 1][3] - 5
            mid, yy = (x0 + x1) / 2, y0 + nh / 2
            p.append(f'''<path d="M{x0} {yy} C{mid} {yy}, {mid} {yy}, {x1} {yy}" stroke="url(#lineGrad)" stroke-width="2.2" fill="none"/>
<path d="M{x1 - 10} {yy - 5} l8 5 -8 5" fill="none" stroke="{s['accent']}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>''')
    # exit-code strip under nodes 3..4
    codes = [('0', 'pass', s['accent2']), ('1', 'fail', s['warn']),
             ('2', 'config', s['warn']), ('3', 'runtime', s['warn'])]
    for i, (code, name, color) in enumerate(codes):
        cx = 462 + i * 130
        p.append(f'''<g filter="url(#soft)">
  <rect x="{cx}" y="378" width="118" height="58" rx="14" fill="{s['card']}" stroke="{color}" stroke-width="1.2"/>
</g>
<text x="{cx + 24}" y="404" fill="{color}" font-family="ui-monospace, monospace" font-size="16" font-weight="700">{code}</text>
<text x="{cx + 24}" y="423" fill="{s['sub']}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12.5">exit {name}</text>''')
    p.append(f'''<rect x="50" y="476" width="1000" height="58" rx="15" fill="{s['card']}" stroke="{s['edge']}"/>
<text x="74" y="502" fill="{s['accent']}" font-family="ui-monospace, monospace" font-size="13" font-weight="700">static ≠ runtime</text>
<text x="74" y="522" fill="{s['sub']}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">a static pass never substitutes for a runtime run; not-run is reported, never upgraded to PASS</text>
<text x="50" y="596" fill="{s['sub']}" font-family="ui-monospace, monospace" font-size="13">Apache-2.0 + CC-BY-4.0 · PerryLink DSH plugin family</text>
</svg>''')
    with open(os.path.join(OUT, f'dsh-standards-flow-v3-{skin}.svg'), 'w',
              encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(p) + '\n')
    print(f'dsh-standards-flow-v3-{skin}.svg')


def main():
    os.makedirs(OUT, exist_ok=True)
    for skin in ('light', 'dark'):
        for lang in ('zh', 'en'):
            hero(lang, skin)
        flow_svg(skin)


if __name__ == '__main__':
    main()
