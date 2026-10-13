/**
 * Apilo Pakowanie — Web App (plan v5.1, D3).
 *
 * Wdrożenie: Rozszerzenia > Aplikacje Apps Script > wkleić > Wdróż > Nowe wdrożenie
 * typ: Aplikacja internetowa, dostęp: Wszyscy (read-only na SKU/wymiary — D9).
 * URL wdrożenia wkleić do MG_DATA_URL w apilo-pakowanie.user.js.
 *
 * UWAGA CORS (D3): ContentService nie ustawia nagłówków Access-Control-Allow-Origin.
 * Po stronie userscriptu używamy GM_xmlhttpRequest (obsługuje redirect do
 * script.googleusercontent.com), NIE zwykłego fetch() ze strony.
 *
 * Faza A: wszystko z arkusza. Wariant docelowy (po teście 0A): produkty/składy
 * z Fakturowni (sekcja FAKTUROWNIA poniżej), kartony nadal z arkusza.
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

function buildPayload() {
  var products = readTab(SHEET_PRODUCTS).map(function (r) {
    return {
      sku: String(r['sku'] || '').trim().toUpperCase(),
      dl: numOrNull(r['dl_cm']),
      szer: numOrNull(r['szer_cm']),
      wys: numOrNull(r['wys_cm']),
      waga: numOrNull(r['waga_kg'])
    };
  }).filter(function (p) { return p.sku !== ''; });

  var bundles = readTab(SHEET_BUNDLES).map(function (r) {
    return {
      zestaw: String(r['sku_zestawu'] || '').trim().toUpperCase(),
      skladnik: String(r['sku_skladnika'] || '').trim().toUpperCase(),
      ilosc: intOrNull(r['ilosc'])
    };
  }).filter(function (b) { return b.zestaw !== ''; });

  var boxes = readTab(SHEET_BOXES).map(function (r) {
    return {
      nazwa: String(r['nazwa'] || '').trim(),
      dl_wew: numOrNull(r['dl_wew']), szer_wew: numOrNull(r['szer_wew']), wys_wew: numOrNull(r['wys_wew']),
      dl_zew: numOrNull(r['dl_zew']), szer_zew: numOrNull(r['szer_zew']), wys_zew: numOrNull(r['wys_zew']),
      waga: numOrNull(r['waga_kartonu_kg']),
      max_kg: numOrNull(r['max_kg']),
      aktywny: String(r['aktywny']).trim() !== '0' && String(r['aktywny']).toLowerCase() !== 'nie'
    };
  }).filter(function (b) { return b.nazwa !== ''; });

  /* ---- FAKTUROWNIA (wariant docelowy, po teście 0A) ----
   * Jeśli 0A potwierdzi odczyt składów, products/bundles nadpisać danymi
   * z Fakturowni (token w Script Properties: FAKTUROWNIA_TOKEN, domena:
   * FAKTUROWNIA_DOMAIN), kartony zostają z arkusza. Szkielet:
   *
   * var f = fetchFakturowniaProducts(); // GET https://DOMAIN.fakturownia.pl/products.json
   * if (f && f.length) { products = f.products; bundles = f.bundles; }
   * -------------------------------------------------------- */

  return {
    version: 'sheets-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm'),
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
