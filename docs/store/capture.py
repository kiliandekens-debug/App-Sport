import sys, os, re, json
src = open('/home/claude/app-sport/tests/smoke.py').read().split('fails = []')[0]
exec(src)
from playwright.sync_api import sync_playwright
OUT='/tmp/store/raw'
W,H=430,932
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':W,'height':H}, device_scale_factor=3, color_scheme='dark')
    pg=ctx.new_page()
    pg.on('pageerror', lambda e: print('PAGEERR', e))
    pg.route(re.compile(r'.*supabase\.co/.*'), handle)
    pg.route(re.compile(r'.*/version\.json.*'), lambda r, q: r.fulfill(status=404, body=''))
    pg.add_init_script("document.addEventListener('DOMContentLoaded',()=>{const st=document.createElement('style');st.textContent='.app{padding-top:59px!important}';document.head.appendChild(st);});")
    pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', JSON.stringify({json.dumps(sess)}))")
    def shot(name, wait=900):
        pg.wait_for_timeout(wait); pg.screenshot(path=f'{OUT}/{name}.png')
    # session from history
    pg.goto(BASE+'/'); pg.wait_for_timeout(1500)
    pt=pg.get_by_role('button', name='Plus tard')
    if pt.count(): pt.first.click(); pg.wait_for_timeout(500)
    pg.get_by_text('Créer depuis mon historique').click(); pg.wait_for_timeout(1200)
    pg.get_by_role('button', name='Démarrer', exact=True).click(); pg.wait_for_timeout(1000)
    h=pg.get_by_text('Les échauffements (É) se calculent')
    if h.count(): h.first.click(); pg.wait_for_timeout(300)
    for i in range(14):
        v=pg.locator('.dock').get_by_role('button', name='Valider')
        if v.count(): v.click(); pg.wait_for_timeout(300)
        if i==1:
            pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(2600); shot('session-rest',100)
        s2=pg.get_by_role('button', name='Passer', exact=True)
        if s2.count(): s2.click(); pg.wait_for_timeout(200)
    pg.locator('.session-head').get_by_role('button', name='Terminer').click(); pg.wait_for_timeout(400)
    pg.locator('.sheet').get_by_role('button', name='Terminer').click(); pg.wait_for_timeout(2000)
    pg.evaluate('window.scrollTo(0,0)')
    pg.evaluate(r"""() => { const h=document.querySelector('.hero'); const w=document.createTreeWalker(h, NodeFilter.SHOW_TEXT); let n; const all=[]; while((n=w.nextNode())) all.push(n);
      all.forEach((t,i)=>{ if(t.textContent.trim()==='0' && all[i+1] && /min/.test(all[i+1].textContent)) t.textContent='58'; t.textContent=t.textContent.replace(/[−-]\d+ %/, '+4 %'); }); }""")
    shot('coach')
    from datetime import datetime as _d, timedelta as _t
    w=T['workouts'][-1]
    try:
        st=_d.fromisoformat(str(w['started_at']).replace('Z','+00:00')); w['ended_at']=(st+_t(minutes=58)).isoformat()
    except Exception as e: print('patch', e, w.keys())
    # running plan
    pg.goto(BASE+'/course'); pg.wait_for_timeout(1200)
    pg.get_by_role('button', name='10 km').click(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='3 sorties').click(); pg.wait_for_timeout(100)
    pg.get_by_role('button', name='Samedi').click(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='Suivant').click(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='Pas de course prévue').click(); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='Créer mon plan').click(); pg.wait_for_timeout(5000)
    pg.evaluate('window.scrollTo(0,0)'); shot('course')
    pg.get_by_text('Mon plan', exact=True).click(); shot('course-plan', 1200)
    # programme
    pg.goto(BASE+'/programmes'); pg.wait_for_timeout(1200)
    pg.locator('section.card', has_text='Haut / bas 4 jours').get_by_role('button', name='Choisir ce programme').click(); pg.wait_for_timeout(1500)
    pg.goto(BASE+'/'); pg.wait_for_timeout(1500)
    pt=pg.get_by_role('button', name='Plus tard')
    if pt.count(): pt.first.click(); pg.wait_for_timeout(500)
    shot('home')
    pg.goto(BASE+'/progres'); shot('progres',1500)
    pg.goto(BASE+'/programmes'); pg.wait_for_timeout(1200); shot('programmes')
    b.close()
print('done')
