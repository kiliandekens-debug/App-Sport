"""Smoke tests for Kadence, on synthetic data (no personal data).

Usage:
  npm run build -- --outDir /tmp/ks-dist   (with VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY set to any value)
  npx vite preview --outDir /tmp/ks-dist --port 4173 &
  python3 tests/smoke.py            # exits 1 on failure, screenshots in /tmp/ks-shots

Supabase is mocked in the browser (page.route): reads return the synthetic tables, writes are recorded.
"""
import json, re, sys, time, uuid, random, os
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:4173')
SHOTS = '/tmp/ks-shots'; os.makedirs(SHOTS, exist_ok=True)
REF = 'mrqxkncxksncidkpwlib'
random.seed(1)
now = datetime.now(timezone.utc)

# --- synthetic history: 3 rotating sessions over 10 weeks, plus runs ---
PROGRAMS = {
  'Pecs du lundi': [('Développé Couché (Haltère)', 30), ('Chest Press (Machine)', 50), ('Butterfly (Pec Deck)', 60)],
  'Dos / Biceps': [('Tirage Poitrine (Poulie)', 60), ('Rowing Assis (Machine)', 55), ('Curl Marteau (Haltère)', 14)],
  'Épaules / Triceps': [('Développé Militaire (Haltère)', 32), ('Élévation Latérale (Poulie)', 7), ('Extension Triceps Corde', 25), ('Traction', 0)],
}
workouts, sets = [], []
d = now - timedelta(days=70)
i = 0
while d < now - timedelta(days=1):
    title = list(PROGRAMS)[i % 3]; i += 1
    wid = str(uuid.uuid4())
    workouts.append({'id': wid, 'title': title, 'started_at': d.isoformat(), 'ended_at': (d + timedelta(minutes=65)).isoformat()})
    for pos, (ex, kg) in enumerate(PROGRAMS[title]):
        for k in range(4):
            sets.append({'workout_id': wid, 'exercise': ex, 'position': pos, 'set_index': k, 'set_type': 'warmup' if k == 0 else 'normal',
                         'weight_kg': round(kg * (0.6 if k == 0 else 1) + i * 0.2, 1), 'reps': random.choice([6, 7, 8, 10]), 'duration_seconds': None, 'distance_km': None, 'superset_id': None})
    d += timedelta(days=random.choice([2, 2, 3]))
runs = [{'id': f'r{j}', 'done_at': (now - timedelta(days=60 - j * 5)).isoformat(), 'distance_km': 5 + j % 4, 'duration_s': int((5 + j % 4) * 370), 'avg_hr': 150, 'calories': 400, 'feel': 3, 'source': 'strava', 'notes': f'Course {j}', 'session_key': None} for j in range(10)]
# 1.18.0: one incline walk (12-3-30, felt easy): must not count as a run, and raises the template's level.
runs.append({'id': 'w1', 'done_at': (now - timedelta(days=3)).isoformat(), 'distance_km': 2.4, 'duration_s': 1800, 'avg_hr': 130, 'calories': 250, 'feel': 2, 'source': 'timer', 'notes': '12-3-30', 'session_key': 'tpl:12-3-30', 'activity': 'incline_walk', 'speed_kmh': 4.8, 'incline_pct': 12, 'elevation_m': 288, 'segments': None})

# 1.19.0: friends' feed (Léa is a friend, Inès asks).
social = {
  'social_profiles': [{'user_id': 'u1', 'name': 'Kilian', 'invite_code': 'KIL12345', 'share_mode': 'ask'}, {'user_id': 'f1', 'name': 'Léa', 'invite_code': 'LEA12345', 'share_mode': 'ask'}, {'user_id': 'f2', 'name': 'Inès', 'invite_code': 'INE12345', 'share_mode': 'ask'}],
  'friendships': [{'id': 'fr1', 'requester': 'u1', 'addressee': 'f1', 'status': 'accepted', 'created_at': now.isoformat()}, {'id': 'fr2', 'requester': 'f2', 'addressee': 'u1', 'status': 'pending', 'created_at': now.isoformat()}],
  'posts': [{'id': 'p1', 'user_id': 'f1', 'kind': 'run', 'ref_id': 'x', 'title': 'Fractionné 4 × 6 min', 'note': 'Prête pour le 10 km', 'done_at': (now - timedelta(hours=2)).isoformat(), 'stats': {'km': 8.2, 'secs': 2790, 'held': 4, 'of': 4, 'bars': [[10, 0.3, 'easy'], [6, 1, 'tempo'], [2, 0.2, 'recovery'], [6, 1, 'tempo'], [10, 0.3, 'easy']]}}],
  'reactions': [{'post_id': 'p1', 'user_id': 'f2'}],
  'comments': [{'id': 'c1', 'post_id': 'p1', 'user_id': 'f1', 'body': 'Dernier effort à fond', 'created_at': now.isoformat()}],
  'blocks': [], 'reports': [],
}
T = {**social, 'grants': [], 'feedback': [], 'workouts': workouts, 'sets': sets, 'custom_exercises': [], 'coach_plans': [], 'routines': [], 'run_profile': [], 'run_logs': runs, 'scheduled_pushes': [], 'push_subscriptions': []}
writes, errors, rpcs = [], [], []
sess = {"access_token": "x.y.z", "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": "r",
        "user": {"id": "u1", "email": "test@example.com", "user_metadata": {}, "aud": "authenticated", "role": "authenticated"}}

def handle(route, req):
    url = req.url
    if '/rest/v1/rpc/redeem_invite' in url:
        rpcs.append('redeem_invite')
        code = (req.post_data_json or {}).get('p_code', '')
        body = {'seat': 7, 'ends_at': (now + timedelta(days=365)).isoformat()} if code.upper() == 'KAD-TEST-0001' else {'error': 'Code inconnu, expiré ou déjà utilisé.'}
        if 'seat' in body: T['grants'] = [{'kind': 'beta', 'seat': 7, 'starts_at': now.isoformat(), 'ends_at': body['ends_at'], 'revoked_at': None}]
        return route.fulfill(status=200, body=json.dumps(body), headers={'content-type': 'application/json'})
    if '/rest/v1/rpc/request_friend' in url:
        rpcs.append('request_friend')
        return route.fulfill(status=200, body=json.dumps({'name': 'Tom', 'status': 'pending'}), headers={'content-type': 'application/json'})
    if '/rest/v1/rpc/respond_friend' in url:
        rpcs.append('respond_friend')
        T['friendships'][1]['status'] = 'accepted'
        return route.fulfill(status=200, body='null', headers={'content-type': 'application/json'})
    if '/rest/v1/rpc/' in url:
        return route.fulfill(status=200, body='false', headers={'content-type': 'application/json'})
    if '/auth/v1/' in url:
        return route.fulfill(status=200, body=json.dumps(sess['user'] if '/auth/v1/user' in url else {}), headers={'content-type': 'application/json'})
    m = re.search(r'/rest/v1/(\w+)', url)
    if not m:
        return route.fulfill(status=200, body='{}', headers={'content-type': 'application/json'})
    t, meth = m.group(1), req.method
    if meth == 'GET':
        rows = T.get(t, [])
        if t == 'social_profiles' and 'user_id=eq.' in url:
            rows = [r for r in rows if 'user_id=eq.' + r['user_id'] in url]
        if 'vnd.pgrst.object' in (req.headers.get('accept') or ''):
            if not rows: return route.fulfill(status=406, body=json.dumps({'code': 'PGRST116', 'message': 'no rows'}), headers={'content-type': 'application/json'})
            return route.fulfill(status=200, body=json.dumps(rows[0]), headers={'content-type': 'application/json'})
        if 'head' in req.method.lower() or (req.headers.get('prefer') or '').find('count=exact') >= 0:
            return route.fulfill(status=200, body=json.dumps(rows), headers={'content-type': 'application/json', 'content-range': f'0-{max(0, len(rows) - 1)}/{len(rows)}'})
        off = int((re.search(r'offset=(\d+)', url) or [0, 0])[1]); lim = int((re.search(r'limit=(\d+)', url) or [0, 100000])[1])
        rng = req.headers.get('range')
        if rng: a, b = map(int, rng.split('-')); off, lim = a, b - a + 1
        return route.fulfill(status=200, body=json.dumps(rows[off:off + lim]), headers={'content-type': 'application/json'})
    body = req.post_data_json if req.post_data else None
    writes.append((meth, t))
    if meth == 'POST':
        rows = body if isinstance(body, list) else [body]
        out = []
        for x in rows:
            x = dict(x); x.setdefault('id', str(uuid.uuid4())); T.setdefault(t, []).append(x); out.append(x)
        single = 'vnd.pgrst.object' in (req.headers.get('accept') or '')
        return route.fulfill(status=201, body=json.dumps(out[0] if single else out), headers={'content-type': 'application/json'})
    return route.fulfill(status=204, body='')

fails = []
def check(cond, label):
    print(('OK   ' if cond else 'FAIL ') + label)
    if not cond: fails.append(label)

with sync_playwright() as p:
    exe = '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
    b = p.chromium.launch(executable_path=exe, args=['--no-sandbox']) if exe else p.chromium.launch()
    for mode in ['dark', 'light']:
        pg = b.new_page(viewport={'width': 390, 'height': 844})
        pg.on('pageerror', lambda e: errors.append(f'{mode} PAGEERR {e}'))
        pg.on('console', lambda m: errors.append(f'{mode} CONSOLE {m.text[:200]}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        pg.route(re.compile(r'.*supabase\.co/.*'), handle)
        pg.route(re.compile(r'.*/version\.json.*'), lambda r, q: r.fulfill(status=404, body=''))
        pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', JSON.stringify({json.dumps(sess)}))")
        pg.emulate_media(color_scheme=mode)
        for path in ['/', '/exercices', '/progres', '/course', '/coach', '/profil', '/historique', '/variante', '/tapis', '/amis', '/amis/gerer']:
            pg.goto(BASE + path); pg.wait_for_timeout(1200)
            sw = pg.evaluate('document.documentElement.scrollWidth')
            check(sw <= 390, f'{mode} {path} no horizontal overflow ({sw})')
            check(pg.locator('main').count() > 0, f'{mode} {path} renders')
            if path == '/':
                gaps = pg.evaluate("(() => { const n = document.querySelector('.nav-in').getBoundingClientRect(); const a = [...document.querySelectorAll('.nav-in a')].map((x) => x.getBoundingClientRect()); return [a[0].left - n.left, n.right - a[a.length - 1].right]; })()")
                check(abs(gaps[0] - gaps[1]) < 2, f'{mode} tab bar centred ({gaps})')
            if path == '/coach':
                # Regression 1.5.4: a 3-digit load must not slide under the + button of the stepper.
                over = pg.evaluate("""() => { const b = document.querySelector('button[aria-label^="Plus de charge"]'); if (!b) return -1;
                  const v = b.previousElementSibling.querySelector('.display'); v.firstChild.textContent = '102,5';
                  v.style.fontSize = '19px'; // what the component picks for a 5-character value
                  return Math.round(v.getBoundingClientRect().right - b.getBoundingClientRect().left); }""")
                check(over <= 0, f'{mode} coach stepper value fits ({over})')
                pg.goto(BASE + path); pg.wait_for_timeout(1200)
            pg.screenshot(path=f'{SHOTS}/{mode}{path.replace("/", "-") or "-home"}.png', full_page=True)
        pg.close()

    # Session flow: routines from history, start, validate, finish, coach.
    pg = b.new_page(viewport={'width': 390, 'height': 844})
    pg.on('pageerror', lambda e: errors.append(f'flow PAGEERR {e}'))
    pg.route(re.compile(r'.*supabase\.co/.*'), handle)
    pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', JSON.stringify({json.dumps(sess)}))")
    pg.goto(BASE + '/'); pg.wait_for_timeout(1200)
    pg.get_by_text('Créer depuis mon historique').click(); pg.wait_for_timeout(1200)
    check(len(T['routines']) >= 3, 'routines created from history')
    pg.get_by_role('button', name='Démarrer', exact=True).click(); pg.wait_for_timeout(800)
    # Simulated 300 px keyboard: the dock must sit right above it.
    pg.evaluate("document.documentElement.style.setProperty('--kb','300px'); document.body.classList.add('kb-open')")
    pg.wait_for_timeout(100)
    db = pg.evaluate("document.querySelector('.dock').getBoundingClientRect().bottom")
    check(abs(db - (844 - 300)) < 2, f'dock lifted above keyboard ({db})')
    pg.screenshot(path=f'{SHOTS}/flow-keyboard.png')
    pg.evaluate("document.documentElement.style.setProperty('--kb','0px'); document.body.classList.remove('kb-open')")
    for i in range(3):
        v = pg.locator('.dock').get_by_role('button', name='Valider')
        if v.count(): v.click(); pg.wait_for_timeout(200)
        if i == 0:
            check(pg.locator('.session-head .head-rest').count() == 1, 'rest countdown shown in session header')
            pg.screenshot(path=f'{SHOTS}/flow-rest-head.png')
        s = pg.get_by_role('button', name='Passer', exact=True)
        if s.count(): s.click(); pg.wait_for_timeout(200)
    n0 = len(T['workouts'])
    pg.locator('.session-head').get_by_role('button', name='Terminer').click(); pg.wait_for_timeout(300)
    pg.locator('.sheet').get_by_role('button', name='Terminer').click(); pg.wait_for_timeout(1500)
    check(len(T['workouts']) == n0 + 1, 'finished session saved')
    check('/coach' in pg.url, 'redirected to coach after session')
    pg.screenshot(path=f'{SHOTS}/flow-coach.png', full_page=True)
    check(pg.get_by_text('Zone travaillée').count() == 1, 'coach shows session analysis')
    check(pg.locator('.bm svg').count() == 2, 'body map front and back drawn')
    check(pg.locator('.bm-m.hit').count() > 0, 'worked muscles highlighted')
    pg.locator('.ana-head').first.click(); pg.wait_for_timeout(200)
    check(pg.locator('.ana-more').count() == 1, 'muscle row expands with explanation')

    # Analysis in the history sheet.
    pg.goto(BASE + '/historique'); pg.wait_for_timeout(1200)
    pg.locator('.list button').filter(has_not_text=' km').first.click(); pg.wait_for_timeout(600)
    check(pg.locator('.wsheet .ana').count() == 2, 'history sheet shows analysis')
    pg.screenshot(path=f'{SHOTS}/flow-sheet.png', full_page=False)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)

    # Regression 1.5.3: a routine using library names must pick up the coach plan
    # and history stored under the imported (Hevy) names.
    T['coach_plans'] = [{'id': 'cp1', 'exercise': 'Développé Couché (Haltère)', 'target_kg': 77, 'target_reps': 7, 'reason': 'test'}]
    T['routines'] = [{'id': 'rlib', 'name': 'Pecs bibliothèque', 'position': 0, 'exercises': [
        {'name': 'Développé couché (haltères)', 'sets': [{'type': 'normal'}, {'type': 'normal'}]},
        {'name': 'Pec deck (machine)', 'sets': [{'type': 'normal'}]}]}]
    pg.goto(BASE + '/'); pg.wait_for_timeout(1200)
    pg.get_by_role('button', name='Démarrer Pecs bibliothèque').click(); pg.wait_for_timeout(800)
    body = pg.locator('main').inner_text()
    check('Développé Couché (Haltère)' in body, 'library routine name resolved to history name')
    check('Butterfly (Pec Deck)' in body, 'pec deck resolved to Butterfly history')
    vals = [v.replace(',', '.') for v in pg.locator('main input').evaluate_all('els => els.map(e => e.value)')]
    check('77' in vals or '77.0' in vals, f'coach plan load applied ({vals[:6]})')
    # 1.8.0: automatic warm-up (50 % × 5, 75 % × 3) before the first heavy exercise of the muscle.
    check(vals[:4] == ['38.5', '5', '58', '3'], f'automatic warm-up from the working load ({vals[:4]})')
    pg.screenshot(path=f'{SHOTS}/flow-library-routine.png', full_page=True)
    # 1.24.0: one more warm-up set (like the last one, before the working sets), and the kilos
    # lifted count warm-ups (load × reps as typed).
    pg.get_by_role('button', name="Ajouter une série d'échauffement à Développé Couché (Haltère)").click(); pg.wait_for_timeout(300)
    vals = [v.replace(',', '.') for v in pg.locator('main input').evaluate_all('els => els.map(e => e.value)')]
    check(vals[:6] == ['38.5', '5', '58', '3', '58', '3'], f'extra warm-up added before the working sets ({vals[:6]})')
    pg.get_by_role('button', name='Valider la série 1').first.click(); pg.wait_for_timeout(400)
    head = re.sub(r'\s', '', pg.locator('.session-head').inner_text())
    check('193kg' in head, f'warm-up counted in kilos lifted ({head[:60]})')
    pg.get_by_role('button', name='Annuler la validation de la série 1').first.click(); pg.wait_for_timeout(300)
    sk = pg.get_by_role('button', name='Passer', exact=True)
    if sk.count(): sk.click(); pg.wait_for_timeout(200)
    # 1.25.0: × beside each set removes it at once; « Changer d'exercice » offers the same muscle.
    card = pg.locator('section.ex-card').first
    n_rows = card.locator('.set-row').count()
    card.get_by_role('button', name='Supprimer la série 3').click(); pg.wait_for_timeout(200)
    check(card.locator('.set-row').count() == n_rows - 1, f'set removed with its × button ({n_rows} → {card.locator(".set-row").count()})')
    pg.get_by_role('button', name='Options de Développé Couché (Haltère)').click(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name="Changer d'exercice").click(); pg.wait_for_timeout(200)
    alts = pg.locator('.ex-menu button').all_inner_texts()
    check(any('Chest Press (Machine)' in t and 'Dernière fois' in t for t in alts), f'similar exercises offered, done ones with last load ({[t.split(chr(10))[0] for t in alts[:4]]})')
    pg.screenshot(path=f'{SHOTS}/flow-swap.png')
    pg.locator('.ex-menu button', has_text='Chest Press (Machine)').first.click(); pg.wait_for_timeout(400)
    names = pg.locator('section.ex-card').evaluate_all('els => els.map(e => e.getAttribute("aria-label"))')
    check(names[0] == 'Chest Press (Machine)' and 'Développé Couché (Haltère)' not in names, f'exercise swapped ({names})')
    sw = pg.evaluate('document.documentElement.scrollWidth')
    check(sw <= 390, f'session with × buttons fits the width ({sw})')
    pg.locator('.session-head').get_by_role('button', name='Terminer').click(); pg.wait_for_timeout(300)
    d = pg.locator('.sheet').get_by_role('button', name='Abandonner')
    if d.count(): d.click(); pg.wait_for_timeout(500)

    # Running plan creation from history.
    # 1.16.0: four simple questions, the coach places the week around the long-run day.
    pg.goto(BASE + '/course'); pg.wait_for_timeout(1200)
    pg.get_by_role('button', name='10 km').click(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='3 sorties').click(); pg.wait_for_timeout(100)
    pg.get_by_role('button', name='Samedi').click(); pg.wait_for_timeout(200)
    pg.screenshot(path=f'{SHOTS}/flow-course-week.png', full_page=True)
    pg.get_by_role('button', name='Suivant').click(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='Pas de course prévue').click(); pg.wait_for_timeout(400)
    check(pg.get_by_label('Temps de référence').input_value() != '', 'running level prefilled from history')
    week = pg.locator('section[aria-label="Ta semaine type"]').inner_text()
    check('Samedi' in week and 'Sortie longue' in week and 'Séance rythmée' in week, 'coach places the week around the long-run day')
    pg.screenshot(path=f'{SHOTS}/flow-course-summary.png', full_page=True)
    pg.get_by_role('button', name='Créer mon plan').click(); pg.wait_for_timeout(1200)
    check(len(T['run_profile']) == 1, 'running plan saved')
    check(pg.locator('.hero').count() > 0, 'running plan shows next session')
    check(pg.locator('section[aria-label="Ce que tu fais"] li').count() >= 1, 'session explained step by step')
    check(T['run_profile'][-1]['schedule'][5] == 'long', 'long run saved on the chosen day')
    pg.screenshot(path=f'{SHOTS}/flow-course.png', full_page=True)

    # 1.15.0: beta code, feedback, /admin gone from the app.
    pg.goto(BASE + '/profil'); pg.wait_for_timeout(1200)
    check(pg.get_by_role('button', name="J'ai un code bêta").count() == 1, 'profile offers the beta code')
    pg.get_by_role('button', name="J'ai un code bêta").click(); pg.wait_for_timeout(300)
    pg.locator('.sheet input').fill('kad-test-0001'); pg.locator('.sheet').get_by_role('button', name='Valider').click(); pg.wait_for_timeout(1500)
    check('redeem_invite' in rpcs, 'beta code sent to the server')
    check(pg.get_by_text('Bêta-testeur n° 7').count() == 1, 'beta badge shown after the code')
    pg.get_by_role('button', name='Donner mon avis').click(); pg.wait_for_timeout(300)
    pg.locator('.sheet textarea').fill('Test : tout marche.'); pg.locator('.sheet').get_by_role('button', name='Envoyer').click(); pg.wait_for_timeout(800)
    check(any(t == 'feedback' and m == 'POST' for m, t in writes) and T['feedback'][-1]['message'] == 'Test : tout marche.', 'feedback saved')
    pg.screenshot(path=f'{SHOTS}/flow-profil-beta.png', full_page=True)
    pg.goto(BASE + '/admin'); pg.wait_for_timeout(800)
    check(not pg.url.rstrip('/').endswith('/admin'), 'no /admin screen in the app any more')

    # 1.16.2: Progrès in three blocks, details folded.
    pg.goto(BASE + '/progres'); pg.wait_for_timeout(1200)
    body = pg.locator('main').inner_text()
    check('Ta semaine' in body and 'Un exercice' in body and 'Tes derniers records' in body, 'progress screen in three blocks')
    check(not re.search(r'\d,\d (épaules|triceps|biceps)', body.lower()), 'muscle sets shown as whole numbers')
    check(pg.locator('.list').last.locator(':scope > div').count() <= 3, 'three latest records by default')
    pg.locator('.metric-pick').select_option('maxKg'); pg.wait_for_timeout(300)
    check('Charge max' in pg.locator('.metric-pick').evaluate("e => e.options[e.selectedIndex].text"), 'metric menu switches the chart')

    # 1.18.0: tapis and incline walking: guided session on the phone, saved with its D+.
    pg.close()
    pg = b.new_page(viewport={'width': 390, 'height': 844})
    pg.on('pageerror', lambda e: errors.append(f'tapis PAGEERR {e}'))
    pg.route(re.compile(r'.*supabase\.co/.*'), handle)
    pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', JSON.stringify({json.dumps(sess)}))")
    pg.clock.install()
    pg.goto(BASE + '/tapis'); pg.wait_for_timeout(1200)
    body = pg.locator('main').inner_text()
    check('12-3-30' in body and 'niveau 2' in body, 'tapis: templates listed, level raised after an easy session')
    check('Tes dernières séances' in body and '288 m D+' in body, 'tapis: history with D+')
    pg.get_by_role('button', name=re.compile('^12-3-30 · niveau')).click(); pg.wait_for_timeout(300)
    check('13 %' in pg.locator('main').inner_text(), 'tapis: next 12-3-30 at 13 %')
    pg.get_by_role('button', name='Démarrer sur le téléphone').click(); pg.wait_for_timeout(500)
    dlg = pg.get_by_role('dialog')
    check('Règle le tapis' in dlg.inner_text(), 'tapis: timer tells how to set the tapis')
    pg.get_by_role('button', name='Pente plus').click(); pg.wait_for_timeout(200)
    pg.clock.fast_forward('05:00'); pg.wait_for_timeout(500)
    check('13,5 %' in dlg.inner_text(), 'tapis: incline changed by hand')
    pg.screenshot(path=f'{SHOTS}/flow-tapis-timer.png')
    pg.get_by_role('button', name='Terminer').click(); pg.wait_for_timeout(300)
    pg.locator('.sheet').get_by_role('button', name='Terminer').click(); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='Facile', exact=True).click()
    pg.screenshot(path=f'{SHOTS}/flow-tapis-end.png', full_page=True)
    pg.get_by_role('button', name='Enregistrer', exact=True).click(); pg.wait_for_timeout(1000)
    w = T['run_logs'][-1]
    check(w.get('activity') == 'incline_walk' and w.get('session_key') == 'tpl:12-3-30' and (w.get('elevation_m') or 0) > 0 and w.get('calories', 0) > 0, f"tapis: walk saved with D+ ({w.get('elevation_m')} m, {w.get('distance_km')} km, {w.get('calories')} kcal)")
    pg.goto(BASE + '/course'); pg.wait_for_timeout(1000)
    check(pg.get_by_role('link', name=re.compile('Tapis et marche inclinée')).count() == 1, 'course links to the tapis screen')

    # 1.19.0: friends' feed: bravo, comment, accept a request, share a session.
    pg.goto(BASE + '/amis'); pg.wait_for_timeout(1500)
    body = pg.locator('main').inner_text()
    check('Fractionné 4 × 6 min' in body and 'ALLURE TENUE' in body, "feed shows a friend's run")
    check(pg.locator('nav a[href="/amis"]').count() == 1 and pg.locator('nav a[href="/exercices"]').count() == 0, 'Amis tab replaces Exercices in the tab bar')
    pg.get_by_role('button', name=re.compile('^Bravo')).first.click(); pg.wait_for_timeout(500)
    check(('POST', 'reactions') in writes, 'bravo saved')
    pg.screenshot(path=f'{SHOTS}/flow-amis-fil.png', full_page=True)
    pg.get_by_role('button', name=re.compile('^Commentaires')).first.click(); pg.wait_for_timeout(800)
    check('Dernier effort à fond' in pg.get_by_role('dialog').inner_text(), 'comments shown')
    pg.get_by_label('Ton commentaire').fill('Bravo !'); pg.get_by_role('button', name='Envoyer').click(); pg.wait_for_timeout(600)
    check(('POST', 'comments') in writes, 'comment saved')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.goto(BASE + '/amis/gerer'); pg.wait_for_timeout(1500)
    check('KIL12345' in pg.locator('main').inner_text(), 'invite code shown')
    pg.get_by_role('button', name='Accepter').click(); pg.wait_for_timeout(800)
    check('respond_friend' in rpcs, 'friend request accepted')
    pg.screenshot(path=f'{SHOTS}/flow-amis-gerer.png', full_page=True)
    pg.goto(BASE + '/historique'); pg.wait_for_timeout(1200)
    pg.get_by_role('button', name=re.compile('Pecs du lundi')).first.click(); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='Partager avec mes amis').click(); pg.wait_for_timeout(800)
    pg.screenshot(path=f'{SHOTS}/flow-amis-partage.png')
    pg.get_by_role('button', name='Publier pour mes amis').click(); pg.wait_for_timeout(800)
    post = T['posts'][-1]
    check(post.get('kind') == 'gym' and post['stats'].get('sets', 0) > 0 and post['stats'].get('exercises'), 'gym session published with its numbers')

    # Sign-up form (logged out).
    lo = b.new_page(viewport={'width': 390, 'height': 844})
    lo.on('pageerror', lambda e: errors.append(f'login PAGEERR {e}'))
    lo.route(re.compile(r'.*supabase\.co/.*'), handle)
    lo.goto(BASE + '/'); lo.wait_for_timeout(1000)
    lo.get_by_role('button', name='Pas encore de compte ? Créer un compte').click(); lo.wait_for_timeout(200)
    check(lo.get_by_label('Code bêta (facultatif)').count() == 1 or lo.get_by_text('Code bêta (facultatif)').count() == 1, 'sign-up form with beta code')
    lo.screenshot(path=f'{SHOTS}/flow-signup.png')
    b.close()

for e in errors: print('ERR  ' + e)
print(f'{len(fails)} failure(s), {len(errors)} console/page error(s)')
sys.exit(1 if fails or errors else 0)
