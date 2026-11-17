"""Smoke tests for Kadeon Sport, on synthetic data (no personal data).

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

T = {'workouts': workouts, 'sets': sets, 'custom_exercises': [], 'coach_plans': [], 'routines': [], 'run_profile': [], 'run_logs': runs, 'scheduled_pushes': [], 'push_subscriptions': []}
writes, errors = [], []
sess = {"access_token": "x.y.z", "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": "r",
        "user": {"id": "u1", "email": "test@example.com", "user_metadata": {}, "aud": "authenticated", "role": "authenticated"}}

def handle(route, req):
    url = req.url
    if '/rest/v1/rpc/' in url:
        return route.fulfill(status=200, body='false', headers={'content-type': 'application/json'})
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
    for _ in range(3):
        v = pg.locator('.dock').get_by_role('button', name='Valider')
        if v.count(): v.click(); pg.wait_for_timeout(200)
        s = pg.get_by_role('button', name='Passer', exact=True)
        if s.count(): s.click(); pg.wait_for_timeout(200)
    n0 = len(T['workouts'])
    pg.locator('.session-head').get_by_role('button', name='Terminer').click(); pg.wait_for_timeout(300)
    pg.locator('.sheet').get_by_role('button', name='Terminer').click(); pg.wait_for_timeout(1500)
    check(len(T['workouts']) == n0 + 1, 'finished session saved')
    check('/coach' in pg.url, 'redirected to coach after session')
    pg.screenshot(path=f'{SHOTS}/flow-coach.png', full_page=True)

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
    kg = pg.locator('.wex, .ex-card, main').locator('input').first.input_value()
    check(kg.replace(',', '.') in ('77', '77.0'), f'coach plan load applied ({kg})')
    pg.screenshot(path=f'{SHOTS}/flow-library-routine.png', full_page=True)
    pg.locator('.session-head').get_by_role('button', name='Terminer').click(); pg.wait_for_timeout(300)
    d = pg.locator('.sheet').get_by_role('button', name='Abandonner')
    if d.count(): d.click(); pg.wait_for_timeout(500)

    # Running plan creation from history.
    pg.goto(BASE + '/course'); pg.wait_for_timeout(1200)
    check(pg.get_by_label('Temps de référence').input_value() != '', 'running level prefilled from history')
    pg.get_by_role('button', name='Créer mon plan').click(); pg.wait_for_timeout(1200)
    check(len(T['run_profile']) == 1, 'running plan saved')
    check(pg.locator('.hero').count() > 0, 'running plan shows next session')
    pg.screenshot(path=f'{SHOTS}/flow-course.png', full_page=True)
    b.close()

for e in errors: print('ERR  ' + e)
print(f'{len(fails)} failure(s), {len(errors)} console/page error(s)')
sys.exit(1 if fails or errors else 0)
