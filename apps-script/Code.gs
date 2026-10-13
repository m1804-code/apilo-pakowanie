/**
 * Apilo Pakowanie — Web App (plan v5.1, D3/D8).
 *
 * Wdrożenie: Rozszerzenia > Aplikacje Apps Script > wkleić > Wdróż > Nowe wdrożenie
 * typ: Aplikacja internetowa, dostęp: Wszyscy (read-only na SKU/wymiary — D9).
 * URL wdrożenia wkleić do MG_DATA_URL w apilo-pakowanie.user.js.
 *
 * UWAGA CORS (D3): ContentService nie ustawia nagłówków Access-Control-Allow-Origin.
 * Po stronie userscriptu używamy GM_xmlhttpRequest (obsługuje redirect do
 * script.googleusercontent.com), NIE zwykłego fetch() ze strony.
 *
 * ŹRÓDŁA DANYCH (D8):
 * - Produkty/wagi/wymiary/składy: FAKTUROWNIA (jeśli ustawione Script Properties),
 *   zakładki arkusza Produkty/Zestawy tylko uzupełniają braki (gaps).
 * - Kartony: ZAWSZE z arkusza (zakładka Kartony).
 * - Bez Properties: wszystko z arkusza (tryb awaryjny).
 *
 * Sekrety (token Fakturowni) wpisuje WŁAŚCICIEL w Script Properties
 * (ikonka koła zębatego > Właściwości skryptu) — nigdy w kodzie ani na czacie:
 *   FAKTUROWNIA_DOMAIN — subdomena, np. "twojadomena" (bez .fakturownia.pl)
 *   FAKTUROWNIA_TOKEN  — Kod autoryzacyjny API (Ustawienia > Integracja)
 *   FAKTUROWNIA_WAREHOUSE_ID — opcjonalnie, do stanów magazynowych
 *
 * Potwierdzone z oficjalnych docs (github.com/fakturownia/API, sekcja Produkty):
 *   GET /products.json?api_token=..&per_page=100&page=N (+date_from, +warehouse_id)
 *   GET /products/ID.json
 *   Pola: code, size, size_width, size_height, size_unit (m/cm),
 *         weight, weight_unit (kg/g), package (1/0).
 * NIEPOTWIERDZONE w docs (brak przykladu odpowiedzi GET) — weryfikuje test 0A:
 *   czy odczyt zestawu zwraca package_products_details i w jakim ksztalcie.
 * Dlatego parser skladu jest defensywny (obiekt LUB tablica, id/product_id/code),
 * a przy package=1 bez skladu bundles biora sie z arkusza (flaga uzupelniona).
 */

var SHEET_PRODUCTS = 'Produkty';   // sku | dl_cm | szer_cm | wys_cm | waga_kg | uwagi
var SHEET_BUNDLES = 'Zestawy';     // sku_zestawu | sku_skladnika | ilosc
var SHEET_BOXES = 'Kartony';       // nazwa | dl_wew..wys_wew | dl_zew..wys_zew | waga_kartonu_kg | max_kg | aktywny

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  var s = String(v).replace(',', '.').trim();
  if (s === '') return null;
  var n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function intOrNull(v) {
  var n = numOrNull(v);
  if (n === null) return null;
  return Math.round(n);
}

function toCm(v, unit) {
  var n = numOrNull(v);
  if (n === null) return null;
  return (String(unit || 'cm').toLowerCase() === 'm') ? n * 100 : n;
}

function toKg(v, unit) {
  var n = numOrNull(v);
  if (n === null) return null;
  return (String(unit || 'kg').toLowerCase() === 'g') ? n / 1000 : n;
}

function faktConfig() {
  try {
    var p = PropertiesService.getScriptProperties();
    return {
      domain: p.getProperty('FAKTUROWNIA_DOMAIN'),
      token: p.getProperty('FAKTUROWNIA_TOKEN'),
      warehouse: p.getProperty('FAKTUROWNIA_WAREHOUSE_ID')
    };
  } catch (e) { return {}; }
}

/**
 * Defensywny parser skladu zestawu. Format zapisu (docs p5b):
 *   package_products_details: {"0": {quantity, id}, ...}
 * Odczyt GET jest nieudokumentowany — akceptujemy obiekt LUB tablice,
 * id LUB product_id LUB gotowy code. Zwraca [] przy braku danych
 * (rozroznienie: puste [] = brak skladu, nie blad).
 */
function parseBundleDetails(det, idToCode) {
  var rows = [];
  if (!det) return rows;
  var vals = Array.isArray(det)
    ? det
    : Object.keys(det).map(function (k) { return det[k]; });
  vals.forEach(function (e) {
    if (!e || typeof e !== 'object') return;
    var q = intOrNull(e.quantity);
    if (!(q > 0)) return;
    var id = (e.id !== undefined && e.id !== null) ? e.id
      : (e.product_id !== undefined ? e.product_id : e.productId);
    var code = (id !== undefined && id !== null && idToCode) ? idToCode[id] : null;
    if (!code && e.code) code = String(e.code).trim().toUpperCase();
    if (code) rows.push({ skladnik: code, ilosc: q });
  });
  return rows;
}

/**
 * Pobiera produkty z Fakturowni. Zwraca null gdy brak konfiguracji,
 * rzuca przy bledzie HTTP (nie cache'ujemy bledow — SWR trzyma stara baze).
 * Zwraca {products, bundles, bundlesComplete}.
 * Zalozenie do weryfikacji w 0A: size/dl, size_width/szer, size_height/wys
 * to gabaryt OPAKOWANIA (do 3D), nie samego produktu.
 */
function fetchFakturowniaProducts() {
  var cfg = faktConfig();
  if (!cfg.domain || !cfg.token) return null;
  var base = 'https://' + cfg.domain + '.fakturownia.pl/products.json?api_token='
    + encodeURIComponent(cfg.token) + '&per_page=100';
  if (cfg.warehouse) base += '&warehouse_id=' + encodeURIComponent(cfg.warehouse);

  var all = [], page = 1;
  for (var guard = 0; guard < 50; guard++) { // max 5000 produktow
    var resp = UrlFetchApp.fetch(base + '&page=' + page, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200)
      throw new Error('Fakturownia HTTP ' + resp.getResponseCode());
    var arr = JSON.parse(resp.getContentText());
    if (!arr || !arr.length) break;
    all = all.concat(arr);
    if (arr.length < 100) break;
    page++;
  }

  var idToCode = {};
  all.forEach(function (p) {
    if (p && p.id !== undefined && p.code)
      idToCode[p.id] = String(p.code).trim().toUpperCase();
  });

  var products = [], bundles = [], bundlesComplete = true;
  all.forEach(function (p) {
    if (!p) return;
    var sku = String(p.code || '').trim().toUpperCase();
    if (!sku) return;
    products.push({
      sku: sku,
      dl: toCm(p.size, p.size_unit),
      szer: toCm(p.size_width, p.size_unit),
      wys: toCm(p.size_height, p.size_unit),
      waga: toKg(p.weight, p.weight_unit)
    });
    if (String(p.package) === '1' || p.package === true) {
      var rows = parseBundleDetails(p.package_products_details, idToCode);
      if (!rows.length) { bundlesComplete = false; return; }
      rows.forEach(function (r) { bundles.push({ zestaw: sku, skladnik: r.skladnik, ilosc: r.ilosc }); });
    }
  });
  return { products: products, bundles: bundles, bundlesComplete: bundlesComplete };
}

function readTab(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) return [];
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  var head = vals[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < vals.length; i++) {
    var o = {};
    var empty = true;
    for (var j = 0; j < head.length; j++) {
      o[head[j]] = vals[i][j];
      if (vals[i][j] !== '' && vals[i][j] !== null && vals[i][j] !== undefined) empty = false;
    }
    if (!empty) rows.push(o);
  }
  return rows;
}

function sheetProducts() {
  return readTab(SHEET_PRODUCTS).map(function (r) {
    return {
      sku: String(r['sku'] || '').trim().toUpperCase(),
      dl: numOrNull(r['dl_cm']),
      szer: numOrNull(r['szer_cm']),
      wys: numOrNull(r['wys_cm']),
      waga: numOrNull(r['waga_kg'])
    };
  }).filter(function (p) { return p.sku !== ''; });
}

function sheetBundles() {
  return readTab(SHEET_BUNDLES).map(function (r) {
    return {
      zestaw: String(r['sku_zestawu'] || '').trim().toUpperCase(),
      skladnik: String(r['sku_skladnika'] || '').trim().toUpperCase(),
      ilosc: intOrNull(r['ilosc'])
    };
  }).filter(function (b) { return b.zestaw !== ''; });
}

function sheetBoxes() {
  return readTab(SHEET_BOXES).map(function (r) {
    return {
      nazwa: String(r['nazwa'] || '').trim(),
      dl_wew: numOrNull(r['dl_wew']), szer_wew: numOrNull(r['szer_wew']), wys_wew: numOrNull(r['wys_wew']),
      dl_zew: numOrNull(r['dl_zew']), szer_zew: numOrNull(r['szer_zew']), wys_zew: numOrNull(r['wys_zew']),
      waga: numOrNull(r['waga_kartonu_kg']),
      max_kg: numOrNull(r['max_kg']),
      aktywny: String(r['aktywny']).trim() !== '0' && String(r['aktywny']).toLowerCase() !== 'nie'
    };
  }).filter(function (b) { return b.nazwa !== ''; });
}

function buildPayload() {
  var sProducts = sheetProducts();
  var sBundles = sheetBundles();
  var boxes = sheetBoxes();
  var source = 'sheets', warnings = [];

  var products = sProducts, bundles = sBundles;
  try {
    var f = fetchFakturowniaProducts();
    if (f) {
      source = 'fakturownia+kartony-sheets';
      var seen = {};
      products = [];
      f.products.forEach(function (p) { seen[p.sku] = true; products.push(p); });
      sProducts.forEach(function (p) { // arkusz uzupelnia TYLKO braki
        if (!seen[p.sku]) { seen[p.sku] = true; products.push(p); warnings.push('SKU z arkusza (brak w Fakturowni): ' + p.sku); }
      });
      if (f.bundlesComplete) { bundles = f.bundles; }
      else { bundles = sBundles; warnings.push('Sklady zestawow z arkusza (Fakturownia nie zwrocila kompletu)'); }
    }
  } catch (e) {
    warnings.push('Fakturownia niedostepna (' + String(e && e.message || e) + ') — dane z arkusza');
  }

  return {
    version: source.split('+')[0] + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm'),
    source: source,
    warnings: warnings,
    products: products,
    bundles: bundles,
    boxes: boxes
  };
}

function doGet() {
  var out = ContentService.createTextOutput(JSON.stringify(buildPayload()));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
