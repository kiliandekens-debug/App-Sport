import subprocess, os, sys
from playwright.sync_api import sync_playwright
NM='/home/claude/app-sport/node_modules/@fontsource-variable'
K1,K2,K3="M83.2 0L128.2 0L99.2 56.9L36 91.6Z","M214.5 0L279.2 0L0.2 160L29.8 104.6Z","M92.2 118.6L132 96.2L213.5 160L144.2 160Z"
WORD=open('/home/claude/app-sport/src/brand.jsx').read().split("const WORD_PATH = '")[1].split("'")[0]
FPS=30
BASE_CSS=f'''@font-face{{font-family:M;src:url(file://{NM}/montserrat/files/montserrat-latin-wght-normal.woff2);font-weight:100 900}}
@font-face{{font-family:I;src:url(file://{NM}/inter/files/inter-latin-wght-normal.woff2);font-weight:100 900}}
*{{margin:0;box-sizing:border-box}}
body{{width:1080px;height:1920px;overflow:hidden;background:#0D0F14;color:#F5F5F5;font-family:I;position:relative}}
.glow{{position:absolute;inset:0;background:radial-gradient(800px 700px at 100% 0%,rgba(0,163,255,.20),transparent 70%),radial-gradient(700px 800px at 0% 100%,rgba(46,58,71,.6),transparent 70%)}}
.slash{{position:absolute;width:6px;background:linear-gradient(#00A3FF00,#00A3FF,#00A3FF00);transform:rotate(28deg);transform-origin:top}}
h1{{font-family:M;font-weight:800;letter-spacing:-.025em;line-height:1}}
em{{font-style:normal;color:#00A3FF}}
.anim{{animation-fill-mode:both;animation-timing-function:cubic-bezier(.2,.8,.2,1)}}
@keyframes up{{from{{opacity:0;transform:translateY(60px)}}to{{opacity:1;transform:none}}}}
@keyframes fade{{from{{opacity:0}}to{{opacity:1}}}}
@keyframes out{{from{{opacity:1}}to{{opacity:0}}}}
@keyframes phone{{from{{transform:translate(-50%,500px) rotate(4deg)}}to{{transform:translate(-50%,0) rotate(0)}}}}
@keyframes zoom{{from{{transform:scale(1)}}to{{transform:scale(1.045)}}}}
@keyframes sweep{{from{{transform:translateY(-1400px) rotate(28deg)}}to{{transform:translateY(2400px) rotate(28deg)}}}}
@keyframes bladeA{{from{{opacity:0;transform:translate(-140px,80px)}}to{{opacity:1;transform:none}}}}
@keyframes bladeB{{from{{opacity:0;transform:translate(220px,-120px)}}to{{opacity:1;transform:none}}}}
@keyframes bladeC{{from{{opacity:0;transform:translate(160px,120px)}}to{{opacity:1;transform:none}}}}
@keyframes wipe{{from{{clip-path:inset(0 100% 0 0)}}to{{clip-path:inset(0 0 0 0)}}}}
@keyframes grow{{from{{transform:scaleX(0)}}to{{transform:scaleX(1)}}}}
.fadeout{{position:absolute;inset:0;background:#0D0F14;animation:fade .35s linear both}}
'''
def page(body, dur):
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{BASE_CSS}</style></head><body><div class="glow"></div>{body}<div class="fadeout" style="animation-delay:{dur-0.35}s"></div></body></html>'
def logo_scene(dur):
    return page(f'''
<div class="slash" style="left:540px;top:0;height:900px;animation:sweep 1.6s .2s cubic-bezier(.5,0,.3,1) both"></div>
<svg viewBox="0 0 280 160" style="position:absolute;left:260px;top:700px;width:560px;height:320px;fill:#F5F5F5;overflow:visible">
<path d="{K1}" class="anim" style="animation:bladeA .7s .25s cubic-bezier(.2,.8,.2,1) both"/>
<path d="{K2}" class="anim" style="animation:bladeB .7s .1s cubic-bezier(.2,.8,.2,1) both"/>
<path d="{K3}" class="anim" style="animation:bladeC .7s .4s cubic-bezier(.2,.8,.2,1) both"/></svg>
<svg viewBox="0 0 524 43" style="position:absolute;left:190px;top:1110px;width:700px;fill:#F5F5F5;animation:wipe .8s 1.0s cubic-bezier(.6,0,.2,1) both"><path fill-rule="evenodd" d="{WORD}"/></svg>
<div style="position:absolute;left:390px;top:1230px;width:300px;height:5px;border-radius:3px;background:#00A3FF;animation:grow .6s 1.5s cubic-bezier(.2,.8,.2,1) both"></div>
''', dur)
def feature(raw, big, sub, dur, tilt=0):
    return page(f'''
<div class="slash" style="left:1000px;top:-200px;height:520px"></div>
<div style="position:absolute;left:80px;right:80px;top:150px">
 <h1 style="font-size:126px;white-space:nowrap;animation:up .6s .05s cubic-bezier(.2,.8,.2,1) both">{big}</h1>
 <p style="margin-top:30px;font-size:50px;line-height:1.3;color:#A9B3BF;font-weight:500;animation:up .6s .25s cubic-bezier(.2,.8,.2,1) both">{sub}</p>
</div>
<div style="position:absolute;left:50%;top:600px;width:600px;height:1254px;border-radius:92px;background:#05070A;padding:20px;box-shadow:0 0 0 3px #2E3A47,0 50px 140px rgba(0,0,0,.7),0 0 100px rgba(0,163,255,.14);animation:phone .9s .15s cubic-bezier(.2,.85,.25,1) both">
 <div style="width:100%;height:100%;border-radius:74px;overflow:hidden;position:relative;background:#0D0F14">
  <img src="file:///tmp/store/raw/{raw}.png" style="width:100%;display:block;transform-origin:50% 0;animation:zoom {dur}s linear both;transform-origin:50% 40%">
  <div style="position:absolute;top:18px;left:50%;transform:translateX(-50%);width:150px;height:44px;border-radius:24px;background:#000"></div><div style="position:absolute;top:27px;left:52px;font-weight:600;font-size:24px">9:41</div>
 </div></div>
''', dur)
def end_scene(dur):
    return page(f'''
<div class="slash" style="left:1000px;top:-200px;height:620px"></div><div class="slash" style="left:150px;top:1500px;height:520px;opacity:.7"></div>
<svg viewBox="0 0 280 160" style="position:absolute;left:400px;top:560px;width:280px;fill:#F5F5F5;animation:up .6s .05s cubic-bezier(.2,.8,.2,1) both"><path d="{K1} {K2} {K3}"/></svg>
<svg viewBox="0 0 524 43" style="position:absolute;left:215px;top:800px;width:650px;fill:#F5F5F5;animation:up .6s .15s cubic-bezier(.2,.8,.2,1) both"><path fill-rule="evenodd" d="{WORD}"/></svg>
<h1 style="position:absolute;left:80px;right:80px;top:960px;text-align:center;font-size:76px;line-height:1.12;animation:up .6s .35s cubic-bezier(.2,.8,.2,1) both">Muscu et course,<br><em>au même endroit.</em></h1>
<div style="position:absolute;left:50%;top:1260px;transform:translateX(-50%);padding:30px 64px;border-radius:999px;background:#00A3FF;color:#0D0F14;font-family:M;font-weight:700;font-size:50px;white-space:nowrap;animation:fade .5s .7s both">sport.kadeon.be</div>
''', dur+0.36)
SCENES=[('s1',logo_scene(2.6),2.6),
 ('s2',feature('session-rest','Ta <em>muscu.</em>','Chaque série en un geste,<br>le repos se lance seul.',3.2),3.2),
 ('s3',feature('coach','Ton <em>coach.</em>','Il te dit quoi soulever<br>la prochaine fois.',3.2),3.2),
 ('s4',feature('course','Ta <em>course.</em>','Un plan du 5 km au marathon,<br>à ton niveau.',3.2),3.2),
 ('s5',feature('progres','Tes <em>progrès.</em>','Records et 1RM,<br>semaine après semaine.',3.2),3.2),
 ('s6',end_scene(3.6),3.6)]
only=sys.argv[1:]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1080,'height':1920})
    for name,html,dur in SCENES:
        if only and name not in only and 'still' not in only: continue
        open(f'/tmp/store/vid/{name}.html','w').write(html)
        pg.goto(f'file:///tmp/store/vid/{name}.html'); pg.wait_for_timeout(600)
        pg.evaluate("document.getAnimations().forEach(a=>a.pause())")
        n=int(round(dur*FPS))
        if 'still' in only:
            for t in [0.5, 1.2, dur-0.5]:
                pg.evaluate(f"document.getAnimations().forEach(a=>a.currentTime={t*1000})")
                pg.screenshot(path=f'/tmp/store/vid/still-{name}-{t:.1f}.jpg', type='jpeg', quality=85)
            continue
        tmp=f'/tmp/store/vid/{name}.tmp.mp4'
        ff=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','image2pipe','-framerate',str(FPS),'-c:v','mjpeg','-i','-','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-r',str(FPS),tmp],stdin=subprocess.PIPE)
        for i in range(n):
            pg.evaluate(f"document.getAnimations().forEach(a=>a.currentTime={i*1000/FPS})")
            ff.stdin.write(pg.screenshot(type='jpeg', quality=92))
        ff.stdin.close()
        if ff.wait()==0: os.replace(tmp, f'/tmp/store/vid/{name}.mp4')
        print(name, n)
    b.close()
