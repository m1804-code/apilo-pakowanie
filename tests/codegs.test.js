// Testy proxy Fakturowni w Code.gs. Uruchomienie: node tests/codegs.test.js
'use strict';
const fs = require('fs');
const assert = require('assert');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

// --- Stuby Google Apps Script ---
let tabs = {};       // nazwa -> values[][]
let props = {};      // Script Properties
let apiPages = {};   // page -> product[]
let apiCode = 200;
const fetchedUrls = [];

function sheet(values) {
  return { getDataRange: () => ({ getValues: () => values }) };
}
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: (n) => tabs[n] ? sheet(tabs[n]) : null })
};
global.Session = { getScriptTimeZone: () => 'Europe/Warsaw' };
global.Utilities = { formatDate: () => '20261013-1200' };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => props[k] || null }) };
global.UrlFetchApp = {
  fetch: (url) => {
    fetchedUrls.push(String(url).replace(/api_token=[^&]*/, 'api_token=***'));
    const m = String(url).match(/[?&]page=(\d+)/);
    const data = apiPages[m ? m[1] : 1] || [];
    return { getResponseCode: () => apiCode, getContentText: () => JSON.stringify(data) };
  }
};
global.ContentService = {
  createTextOutput: (t) => ({ setMimeType: () => {}, getText: () => t }),
  MimeType: { JSON: 'json' }
};

eval(src + '\n;globalThis.__gs = { doGet: doGet, buildPayload: buildPayload };');
const doGet = (...a) => globalThis.__gs.doGet(...a);

const P = (rows) => [['sku', 'dl_cm', 'szer_cm', 'wys_cm', 'waga_kg', 'uwagi']].concat(rows);
const B = (rows) => [['sku_zestawu', 'sku_skladnika', 'ilosc']].concat(rows);
const C = (rows) => [['nazwa', 'dl_wew', 'szer_wew', 'wys_wew', 'dl_zew', 'szer_zew', 'wys_zew', 'waga_kartonu_kg', 'max_kg', 'aktywny']].concat(rows);
const BOX = ['M', 30, 20, 10, 31, 21, 11, '', '', 1];

// 1. Tryb arkusza (brak Properties)
tabs = { Produkty: P([['A1', 6.5, 8, 23, '', '']]), Zestawy: B([['Z1', 'A1', 2]]), Kartony: C([BOX]) };
props = {};
let out = JSON.parse(doGet().getText());
assert.strictEqual(out.source, 'sheets');
assert.strictEqual(out.products.length, 1);
assert.strictEqual(out.products[0].waga, null, 'pusta waga = null');
assert.strictEqual(out.bundles.length, 1);
assert.strictEqual(out.boxes.length, 1);

// 2. Tryb Fakturowni: konwersje m->cm, g->kg + sklad po id
props = { FAKTUROWNIA_DOMAIN: 'demo', FAKTUROWNIA_TOKEN: 'sekret-nie-widoczny-w-tescie' };
apiPages = {
  1: [
    { id: 11, kind: 'sell', code: 'a1', size: '0.065', size_width: '0.08', size_height: '0.23', size_unit: 'm', weight: '200', weight_unit: 'g' },
    { id: 12, kind: 'sell', code: 'Z1', size: '10', size_width: '10', size_height: '10', size_unit: 'cm', weight: '0.5', weight_unit: 'kg', package: '1',
      package_products_details: { 0: { quantity: 2, id: 11 } } }
  ]
};
out = JSON.parse(doGet().getText());
assert.strictEqual(out.source, 'fakturownia+kartony-sheets', 'source');
assert(out.version.indexOf('fakturownia-') === 0, 'wersja ze zrodlem');
const a1 = out.products.find((p) => p.sku === 'A1');
assert.deepStrictEqual([a1.dl, a1.szer, a1.wys, a1.waga], [6.5, 8, 23, 0.2], 'm->cm, g->kg');
assert.deepStrictEqual(out.bundles, [{ zestaw: 'Z1', skladnik: 'A1', ilosc: 2 }], 'sklad po id');
assert(fetchedUrls.some((u) => u.includes('per_page=100')), 'paginacja per_page=100');
assert(!JSON.stringify(fetchedUrls).includes('sekret'), 'tokenu nie logujemy w URL-ach testowych');

// 2b. Luka w Fakturowni uzupelniona z arkusza + warning
tabs.Produkty = P([['A1', 6.5, 8, 23, '', ''], ['EXTRA', 1, 1, 1, '', '']]);
out = JSON.parse(doGet().getText());
assert(out.products.some((p) => p.sku === 'EXTRA'), 'brak z arkusza');
assert(out.warnings.some((w) => w.includes('EXTRA')), 'warning o luce');

// 3. Zestaw bez skladu w GET -> bundles z arkusza + warning
apiPages = { 1: [{ id: 12, kind: 'sell', code: 'Z1', size: '1', size_width: '1', size_height: '1', package: '1' }] };
tabs.Zestawy = B([['Z1', 'A1', 2]]);
out = JSON.parse(doGet().getText());
assert.deepStrictEqual(out.bundles, [{ zestaw: 'Z1', skladnik: 'A1', ilosc: 2 }], 'fallback zestawow');
assert(out.warnings.some((w) => w.includes('Sklady')), 'warning o skladach');

// 5. Szum z zywej bazy: kind=buy, deleted, pusty code odpadaja; mm->cm;
//    zestaw bez wymiarow/wagi przechodzi z nullami (krok 3 flow)
apiPages = {
  1: [
    { id: 21, kind: 'sell', code: 'OK1', size: '25.0', size_width: '20.0', size_height: '10.0', size_unit: 'mm', weight: '2.0', weight_unit: 'kg' },
    { id: 22, kind: 'buy', code: 'USLUGA', size: '1', size_width: '1', size_height: '1' },
    { id: 23, kind: 'sell', code: 'DEL1', size: '1', size_width: '1', size_height: '1', deleted: true },
    { id: 24, kind: 'sell', code: '', size: '1', size_width: '1', size_height: '1' },
    { id: 25, kind: 'sell', code: null, size: '1', size_width: '1', size_height: '1' },
    { id: 26, kind: 'sell', code: 'ZB', package: '1', package_products_details: { 0: { quantity: 1, id: 21 } } }
  ]
};
tabs.Produkty = P([]);
out = JSON.parse(doGet().getText());
assert.strictEqual(out.products.length, 2, 'OK1 + ZB (bez wymiarow)');
assert.deepStrictEqual([out.products[0].dl, out.products[0].waga], [2.5, 2.0], 'mm->cm: 25mm=2.5cm');
const zb = out.products.find((p) => p.sku === 'ZB');
assert.deepStrictEqual([zb.dl, zb.szer, zb.wys, zb.waga], [null, null, null, null], 'zestaw bez wymiarow = nulle');
assert.deepStrictEqual(out.bundles, [{ zestaw: 'ZB', skladnik: 'OK1', ilosc: 1 }], 'sklad zestawu po id');

// 4. Blad HTTP Fakturowni -> czysty fallback, bez wyjatku na zewnatrz
apiCode = 500;
out = JSON.parse(doGet().getText());
assert.strictEqual(out.source, 'sheets');
assert(out.warnings.some((w) => w.includes('niedostepna')), 'warning o niedostepnosci');
apiCode = 200;

console.log('OK: proxy Fakturowni — 4 scenariusze przeszly. Przykladowe URL-e:', JSON.stringify(fetchedUrls.slice(0, 2)));
