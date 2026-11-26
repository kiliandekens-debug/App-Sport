import sys, json
sys.path.insert(0,'/home/claude/app-sport')
from playwright.sync_api import sync_playwright
NM='/home/claude/app-sport/node_modules/@fontsource-variable'
K="M83.2 0L128.2 0L99.2 56.9L36 91.6Z M214.5 0L279.2 0L0.2 160L29.8 104.6Z M92.2 118.6L132 96.2L213.5 160L144.2 160Z"
SLIDES=[
 ('home','Ta muscu et ta course,<br><em>au même endroit</em>','La séance du jour t\'attend dès l\'ouverture.'),
 ('session-rest','Chaque série<br><em>en un geste</em>','Charges pré-remplies, repos chronométré, échauffement calculé.'),
 ('coach','Un coach qui te dit<br><em>quoi soulever</em>','Après chaque séance : le bilan et les charges de la prochaine fois.'),
 ('course','Un plan de course<br><em>à ta mesure</em>','Du 5 km au marathon, construit sur les méthodes des meilleurs coachs.'),
 ('course-plan','Tes allures,<br><em>calculées pour toi</em>','Footing, seuil, VMA : tu sais toujours à quelle vitesse courir.'),
 ('progres','Tes progrès,<br><em>semaine après semaine</em>','Records, 1RM estimé et séries par muscle.'),
]
def html(raw, title, sub, n):
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:M;src:url(file://{NM}/montserrat/files/montserrat-latin-wght-normal.woff2) format('woff2');font-weight:100 900}}
@font-face{{font-family:I;src:url(file://{NM}/inter/files/inter-latin-wght-normal.woff2) format('woff2');font-weight:100 900}}
*{{margin:0;box-sizing:border-box}}
body{{width:1290px;height:2796px;overflow:hidden;background:#0D0F14;color:#F5F5F5;font-family:I;position:relative}}
.glow{{position:absolute;inset:0;background:radial-gradient(900px 700px at 100% 0%,rgba(0,163,255,.22),transparent 70%),radial-gradient(800px 900px at 0% 100%,rgba(46,58,71,.65),transparent 70%)}}
.slash{{position:absolute;width:7px;height:1400px;background:linear-gradient(#00A3FF00,#00A3FF,#00A3FF00);transform:rotate(28deg);transform-origin:top}}
.top{{position:absolute;left:96px;right:96px;top:120px}}
.k{{width:110px;height:63px;fill:#F5F5F5;margin-bottom:44px;display:block}}
h1{{font-family:M;font-weight:800;font-size:92px;line-height:1.05;letter-spacing:-.025em}}
h1 em{{font-style:normal;color:#00A3FF}}
p{{margin-top:34px;font-size:44px;line-height:1.35;color:#A9B3BF;font-weight:450;max-width:1020px}}
.phone{{position:absolute;left:50%;top:650px;width:978px;height:2060px;transform:translateX(-50%);border-radius:140px;background:#05070A;padding:26px;
  box-shadow:0 0 0 4px #2E3A47, 0 60px 160px rgba(0,0,0,.7), 0 0 120px rgba(0,163,255,.12)}}
.scr{{width:100%;height:100%;border-radius:116px;overflow:hidden;background:#0D0F14 url(file:///tmp/store/raw/{raw}.png) top/100% auto no-repeat;position:relative}}
.island{{position:absolute;top:30px;left:50%;transform:translateX(-50%);width:236px;height:70px;border-radius:40px;background:#000}}
.sb{{position:absolute;top:44px;left:84px;right:70px;display:flex;justify-content:space-between;font-family:I;font-weight:600;font-size:40px;color:#fff}}
.sb svg{{height:30px;margin-left:10px;fill:#fff}}
</style></head><body><div class="glow"></div>
<div class="slash" style="left:1250px;top:-330px;height:520px"></div><div class="slash" style="left:1290px;top:-240px;height:420px;opacity:.45;width:3px"></div><div class="slash" style="left:170px;top:2420px;height:520px;opacity:.7"></div>
<div class="top"><svg class="k" viewBox="0 0 280 160"><path d="{K}"/></svg><h1>{title}</h1><p>{sub}</p></div>
<div class="phone"><div class="scr"><div class="sb"><span>9:41</span><span><svg viewBox="0 0 34 20"><rect x="0" y="13" width="6" height="7" rx="1.5"/><rect x="9" y="9" width="6" height="11" rx="1.5"/><rect x="18" y="5" width="6" height="15" rx="1.5"/><rect x="27" y="0" width="6" height="20" rx="1.5"/></svg><svg viewBox="0 0 44 20"><rect x="1" y="1" width="36" height="18" rx="5" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/><rect x="4" y="4" width="28" height="12" rx="3"/><rect x="39" y="7" width="3" height="6" rx="1.5" fill-opacity=".5"/></svg></span></div><div class="island"></div></div></div>
</body></html>'''
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1290,'height':2796})
    for i,(raw,t,s) in enumerate(SLIDES,1):
        open('/tmp/store/slide.html','w').write(html(raw,t,s,i))
        pg.goto('file:///tmp/store/slide.html'); pg.wait_for_timeout(500)
        pg.screenshot(path=f'/tmp/store/out/kadence-appstore-{i}-{raw}.png')
    b.close()
