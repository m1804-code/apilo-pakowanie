// Regresja walidatora bazy (plan v5.1). Uruchomienie: node tests/validate.test.js
'use strict';
const fs = require('fs');
const assert = require('assert');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'apilo-pakowanie.user.js'), 'utf8');

// Stuby srodowiska przegladarki (ladowanie pliku nie moze dotknac DOM).
const store = {};
global.window = {};
global.document = { querySelectorAll: () => [], body: {}, activeElement: null };
global.MutationObserver = class { constructor() {} observe() {} disconnect() {} };
global.GM_setValue = (k, v) => { store[k] = v; };
global.GM_getValue = (k, d) => (k in store ? store[k] : d);
global.GM_xmlhttpRequest = () => {};
const _st = global.setTimeout, _si = global.setInterval;
global.setTimeout = () => 0;
global.setInterval = () => 0;

eval(src);

global.setTimeout = _st;
global.setInterval = _si;

const T = global.window.__mgTest;
assert(T, 'brak haka __mgTest');
assert.strictEqual(T.version, '2026.10.13.1', 'wersja skryptu');

const good = {
  version: 't1',
  products: [
    { sku: 'A1', dl: 6.5, szer: 8, wys: 23, waga: null },
    { sku: 'B2', dl: 4.5, szer: 8.5, wys: 13.5, waga: 0.2 }
  ],
  bundles: [
    { zestaw: 'Z1', skladnik: 'A1', ilosc: 2 },
    { zestaw: 'Z1', skladnik: 'B2', ilosc: 1 }
  ],
  boxes: [
    { nazwa: 'M', dl_wew: 30, szer_wew: 20, wys_wew: 10, dl_zew: 31, szer_zew: 21, wys_zew: 11, waga: null, max_kg: 10, aktywny: true }
  ]
};

let r = T.validate(good);
assert.strictEqual(r.ok, true, 'poprawna baza: ' + JSON.stringify(r.errors));

const cases = [
  ['duplikat SKU', { ...good, products: [...good.products, { sku: 'a1', dl: 1, szer: 1, wys: 1, waga: null }] }],
  ['obcy skladnik', { ...good, bundles: [{ zestaw: 'Z1', skladnik: 'XXX', ilosc: 1 }] }],
  ['ilosc 0', { ...good, bundles: [{ zestaw: 'Z1', skladnik: 'A1', ilosc: 0 }] }],
  ['ilosc ulamkowa', { ...good, bundles: [{ zestaw: 'Z1', skladnik: 'A1', ilosc: 1.5 }] }],
  ['zly wymiar', { ...good, products: [{ sku: 'A1', dl: -1, szer: 8, wys: 23, waga: null }] }],
  ['zero kartonow aktywnych', { ...good, boxes: [{ ...good.boxes[0], aktywny: false }] }],
  ['cykl zestawow', {
    ...good,
    products: [...good.products, { sku: 'Z1', dl: 1, szer: 1, wys: 1, waga: null }, { sku: 'Z2', dl: 1, szer: 1, wys: 1, waga: null }],
    bundles: [{ zestaw: 'Z1', skladnik: 'Z2', ilosc: 1 }, { zestaw: 'Z2', skladnik: 'Z1', ilosc: 1 }]
  }],
  ['nie-obiekt', null],
];
for (const [name, input] of cases) {
  const res = T.validate(input);
  assert.strictEqual(res.ok, false, name + ' powinno byc odrzucone');
  assert(res.errors.length > 0, name + ': brak opisu bledu');
}

// apply: null wagi zostaje null (nie zero), zew buduje sie poprawnie
T.apply(good, 't1');
const m = T.getMaps();
assert.strictEqual(m.weights['A1'], null, 'waga null musi zostac null');
assert.strictEqual(m.weights['B2'], 0.2);
assert.deepStrictEqual(m.meta['M'].zew, [31, 21, 11]);
assert.strictEqual(m.dataVersion, 't1');
assert.deepStrictEqual(m.bundles['Z1'], { A1: 2, B2: 1 });

// legacy init: 20 SKU, 10 zestawow, 13 kartonow, wagi null
T.initLegacy();
const leg = T.getMaps();
assert.strictEqual(Object.keys(leg.dims).length, 20, 'legacy dims');
assert.strictEqual(Object.keys(leg.bundles).length, 10, 'legacy bundles');
assert.strictEqual(leg.boxes.length, 13, 'legacy boxes');
assert(Object.values(leg.weights).every((w) => w === null), 'legacy wagi = null');

// regresja rdzenia v14.5 na danych legacy
assert.strictEqual(T.condense({ MGF02: 3, MGIC02: 2 }).str, 'MG5PS', 'kondensacja MG5PS');
assert.strictEqual(T.condense({ MGE03: 1, MGEF04: 1 }).str, 'MGMR', 'kondensacja MGMR');
assert.strictEqual(T.condense({ MGF02: 1 }).str, 'MGF02', 'bez kondensacji');

// waga: null = nieznana (blokada claimu), liczby sumuja sie z iloscia
T.apply(good, 't1');
let w = T.weight([{ sku: 'A1', qty: 1 }], 'M');
assert.strictEqual(w.unknown, true, 'A1 (waga null) -> unknown');
w = T.weight([{ sku: 'B2', qty: 2 }], 'M');
assert.strictEqual(w.unknown, true, 'karton M (waga null) -> unknown');
w = T.weight([{ sku: 'B2', qty: 2 }], null);
assert.deepStrictEqual([w.unknown, w.total], [false, 0.4], 'B2x2 = 0.4 kg znane');

// hash sesji rozroznia sklad, box i wersje danych
const h1 = T.hash([{ sku: 'A1', qty: 1 }], false, 'M');
const h2 = T.hash([{ sku: 'A1', qty: 2 }], false, 'M');
const h3 = T.hash([{ sku: 'A1', qty: 1 }], false, 'M');
assert.notStrictEqual(h1, h2, 'hash rozroznia sklad');
assert.strictEqual(h1, h3, 'hash stabilny');

// krok 3 flow: zestaw BEZ wlasnych wymiarow/wagi przechodzi walidator...
const nullDims = { ...good, products: [...good.products, { sku: 'Z9', dl: null, szer: null, wys: null, waga: null }] };
assert.strictEqual(T.validate(nullDims).ok, true, 'produkt/zestaw bez wymiarow przechodzi');

// ...a jego waga liczy sie ze skladowych
T.apply({
  version: 't2',
  products: [
    { sku: 'A1', dl: 6.5, szer: 8, wys: 23, waga: 0.2 },
    { sku: 'B2', dl: 4.5, szer: 8.5, wys: 13.5, waga: 0.3 }
  ],
  bundles: [{ zestaw: 'Z1', skladnik: 'A1', ilosc: 2 }, { zestaw: 'Z1', skladnik: 'B2', ilosc: 1 }],
  boxes: [{ nazwa: 'M', dl_wew: 30, szer_wew: 20, wys_wew: 10, dl_zew: 31, szer_zew: 21, wys_zew: 11, waga: null, max_kg: 10, aktywny: true }]
}, 't2');
const counts = {};
assert.strictEqual(T.expand('Z1', 1, counts), 1, 'ekspansja znanego zestawu');
assert.deepStrictEqual(counts, { A1: 2, B2: 1 });
const wsum = T.weight(Object.keys(counts).map((k) => ({ sku: k, qty: counts[k] })), null);
assert.deepStrictEqual([wsum.unknown, wsum.total], [false, 0.7], 'waga zestawu ze skladowych: 2*0.2+0.3');
assert.strictEqual(T.expand('XXX', 1, {}), -1, 'nieznany kod');
T.apply({ version: 't3', products: [{ sku: 'A1', dl: 1, szer: 1, wys: 1, waga: 0.1 }],
  bundles: [{ zestaw: 'ZX', skladnik: 'NOPE', ilosc: 1 }],
  boxes: [{ nazwa: 'M', dl_wew: 30, szer_wew: 20, wys_wew: 10, dl_zew: null, szer_zew: null, wys_zew: null, waga: null, max_kg: null, aktywny: true }] }, 't3');
assert.strictEqual(T.expand('ZX', 1, {}), 0, 'zestaw z nieznanym skladnikiem');

console.log('OK: wszystkie testy walidatora przeszly (' + (cases.length + 4) + ' asercji grup).');
