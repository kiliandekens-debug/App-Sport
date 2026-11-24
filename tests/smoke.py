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

T = {'grants': [], 'feedback': [], 'workouts': workouts, 'sets': sets, 'custom_exercises': [], 'coach_plans': [], 'routines': [], 'run_profile': [], 'run_logs': runs, 'scheduled_pushes': [], 'push_subscriptions': []}
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
        for path in ['/', '/exercices', '/progres', '/course', '/coach', '/profil', '/historique', '/variante']:
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
