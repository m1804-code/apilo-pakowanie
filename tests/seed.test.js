// Testy scripts/fakturownia_seed.py przez wbudowany harness (bez sieci).
// Uruchomienie: node tests/seed.test.js
'use strict';
const { execFileSync } = require('child_process');
const assert = require('assert');

const PY = `
import json, sys
sys.path.insert(0, 'scripts')
import fakturownia_seed as S

calls = []
class Resp:
    def __init__(self, data): self._d = data
    def read(self): return json.dumps(self._d).encode()
    def __enter__(self): return self
    def __exit__(self, *a): return False

def fake_transport(req):
    calls.append(req.full_url.replace('api_token=SEKRET', 'api_token=***'))
    if req.method == 'GET':
        if 'page=1' in req.full_url:
            return Resp([{"id": 1, "code": "mgf02", "size": "6.5", "size_width": "6.5",
                          "size_height": "20", "size_unit": "cm", "weight": None}])
        return Resp([])
    if req.method == 'POST':
        body = json.loads(req.data.decode())
        assert body.get('api_token') == 'SEKRET', 'token w body POST'
        p = body['product']
        assert p['size_unit'] == 'cm' and 'weight' not in p, 'payload: cm, bez wagi'
        return Resp({"id": 999, "code": p['code']})
    raise AssertionError('nieoczekiwana metoda ' + req.method)

# 1. paginacja + match case-insensitive
allp = S.list_all('demo', 'SEKRET', transport=fake_transport)
assert len(allp) == 1, 'paginacja stop po pustej stronie'
m = S.match_codes(allp, ['MGF02', 'MGF1L'])
assert m['MGF02'] and m['MGF02']['id'] == 1, 'match case-insensitive'
assert m['MGF1L'] is None, 'brakujacy SKU'

# 2. payload: 20 pozycji, wymiary z v14.5, jednostka cm
assert len(S.PRODUCTS) == 20, 'pelne 20 SKU'
pl = S.build_payload('MGF02', 6.5, 6.5, 20)
assert pl['product']['code'] == 'MGF02' and pl['product']['size'] == '6.5', 'payload'

# 3. create omija istniejace
created, failed = S.cmd_create('demo', 'SEKRET', ['MGF1L'], transport=fake_transport)
assert created == [('MGF1L', 999)] and failed == [], 'create brakujacego'
assert all('api_token=***' in u or 'api_token' not in u for u in calls), 'token maskowany w logach testu'
print('SEED-OK')
`;
const out = execFileSync('python3', ['-c', PY], { cwd: '/tmp/opencode/apilo-pakowanie' }).toString();
assert(out.includes('SEED-OK'), 'seed test failed: ' + out);
console.log('OK: fakturownia_seed — paginacja, match, payload, create.');
