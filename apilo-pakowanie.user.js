// ==UserScript==
// @name         Apilo Auto-Karton MetalGuard
// @namespace    http://tampermonkey.net/
// @version      2026.10.13.1
// @description  Automatic box selection (3D Bin Packing) with precise InPost Gabaryt verification & alerts + live data sync
// @match        https://*.apilo.com/warehouse/shipment/new-for-order*
// @match        https://*.apilo.com/warehouse/shipment/new-multi*
// @updateURL    https://raw.githubusercontent.com/m1804-code/apilo-pakowanie/main/apilo-pakowanie.user.js
// @downloadURL  https://raw.githubusercontent.com/m1804-code/apilo-pakowanie/main/apilo-pakowanie.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==
//
// Plan v5.1: ta sama tozsamosc (@name/@namespace bez zmian — D6), minimalne
// granty bez unsafeWindow (D2 — dopisac tylko jesli test sandbox to wymusi).
// Dane: MG_DATA_URL (Apps Script JSON). Brak URL = tryb wbudowany v14.5.
// Repo: m1804-code/apilo-pakowanie. Przy innej nazwie repo podmien URL w 2 liniach ponizej.

(function() {
    'use strict';

    // ============ WARSTWA DANYCH (v5.1) ============
    var MG_SCRIPT_VERSION = '2026.10.13.1';
    var MG_DATA_URL = ''; // <-- wkleic URL wdrozenia Apps Script (Code.gs); puste = dane wbudowane
    var MG_FETCH_TTL_MS = 15 * 60 * 1000;
    var MG_LEGACY_VERSION = 'wbudowana v14.5';
    var MG_INPOST_MAX_KG = 25;

    // Dane wbudowane v14.5 — fallback, zachowane 1:1
    var MG_LEGACY_DIMS = {
        'MGF1L': [6.5, 8, 23],
        'MGF5L': [12.5, 19.5, 31],
        'MGIC1L': [6.5, 8, 23],
        'MGIC02': [6.5, 6.5, 20],
        'MGIC5L': [12.5, 19.5, 31],
        'MGF02': [6.5, 6.5, 20],
        'MGE1L': [7.5, 9, 22.5],
        'MGE03': [4.5, 8.5, 13.5],
        'MGE05': [5.5, 8.5, 18],
        'MGE5L': [12.5, 19.5, 31],
        'MGM03': [4.5, 8.5, 13.5],
        'MGGB03': [4.5, 8.5, 13.5],
        'MGO0W30': [11.5, 23.5, 34.5],
        'MGO5W30': [11.5, 23.5, 34.5],
        'MGO10W40': [11.5, 23.5, 34.5],
        'MGO5W301L': [7.5, 9, 22.5],
        'MGEF02': [6.5, 6.5, 20],
        'MGEF04': [7.5, 7.5, 15],
        'MG-6905': [7, 7, 20.5],
        'MGLCG04': [6, 6, 24]
    };

    var MG_LEGACY_BUNDLES = {
        'MGFP':   { 'MGF02': 2, 'MGIC02': 2, 'MGEF04': 1, 'MGE05': 1 },
        'MG5PS':  { 'MGIC02': 2, 'MGF02': 3 },
        'MGPP':   { 'MGE1L': 1, 'MGF02': 3 },
        'MGTP4':  { 'MGE03': 1, 'MGGB03': 1, 'MGF02': 1, 'MGIC02': 1 },
        'MGPDM':  { 'MGEF04': 1, 'MGIC02': 1, 'MGF02': 1 },
        'MGM3':   { 'MGE05': 1, 'MGIC02': 1, 'MGF02': 1 },
        'MGP':    { 'MGE03': 1, 'MGIC02': 1, 'MGF02': 1 },
        'MGMRXL': { 'MGE1L': 1, 'MGEF04': 1 },
        'MGMR':   { 'MGE03': 1, 'MGEF04': 1 },
        'MGDUO':  { 'MGE05': 1, 'MGIC02': 1 }
    };

    var MG_LEGACY_BOXES = [
        { name: '13,5x10x8', dims: [13.5, 10, 8] },
        { name: '19x11x8', dims: [19, 11, 8] },
        { name: '25x15x8', dims: [25, 15, 8] },
        { name: '25x20x10', dims: [25, 20, 10] },
        { name: '30x20x10', dims: [30, 20, 10] },
        { name: '30x20x15', dims: [30, 20, 15] },
        { name: '35x25x15', dims: [35, 25, 15] },
        { name: '40x30x15', dims: [40, 30, 15] },
        { name: '39x27x23', dims: [39, 27, 23] },
        { name: '40x30x20', dims: [40, 30, 20] },
        { name: '45x45x30', dims: [45, 45, 30] },
        { name: '60x40x30', dims: [60, 40, 30] },
        { name: '60x40x40', dims: [60, 40, 40] }
    ];

    // Aktywne mapy (podmieniane po walidacji; start = legacy)
    var productDims = {};
    var bundleDefinitions = {};
    var customBoxes = [];
    var productWeights = {}; // sku -> number|null (null = nieznana, NIGDY 0 zastepcze)
    var boxMeta = {};        // name -> {zew:[..]|null, waga:null|number, max_kg:null|number, aktywny:bool}
    var mgDataVersion = MG_LEGACY_VERSION;
    var mgLastFetchTime = null;   // tekst czasu ostatniego UDANEGO pobrania
    var mgSessionPin = {};        // shipmentId -> version (pin sesji pakowania)
    var mgPendingData = null;     // zwalidowane, czeka na swiadome „Przelicz”

    function mgClone(o) { return JSON.parse(JSON.stringify(o)); }

    function mgInitFromLegacy() {
        productDims = mgClone(MG_LEGACY_DIMS);
        bundleDefinitions = mgClone(MG_LEGACY_BUNDLES);
        customBoxes = mgClone(MG_LEGACY_BOXES);
        productWeights = {};
        Object.keys(productDims).forEach(function (k) { productWeights[k] = null; });
        boxMeta = {};
        customBoxes.forEach(function (b) {
            boxMeta[b.name] = { zew: null, waga: null, max_kg: null, aktywny: true };
        });
        mgDataVersion = MG_LEGACY_VERSION;
    }

    function mgIsNum(x) { return typeof x === 'number' && isFinite(x); }

    // Walidator calej bazy PRZED podmiana (v5.1): duplikaty, obce skladniki,
    // cykle, ilosci, wymiary, niepuste kartony. Blad = zostaje stara baza.
    function mgValidateData(d) {
        var errors = [];
        if (!d || typeof d !== 'object') return { ok: false, errors: ['Odpowiedz nie jest obiektem JSON'] };
        var products = d.products, bundles = d.bundles, boxes = d.boxes;
        if (!Array.isArray(products)) errors.push('Brak tablicy products');
        if (!Array.isArray(bundles)) errors.push('Brak tablicy bundles');
        if (!Array.isArray(boxes)) errors.push('Brak tablicy boxes');
        if (errors.length) return { ok: false, errors: errors };

        var seen = {}, i, p;
        for (i = 0; i < products.length; i++) {
            p = products[i] || {};
            var sku = String(p.sku || '').trim().toUpperCase();
            if (!sku) { errors.push('Produkt wiersz ' + (i + 1) + ': pusty sku'); continue; }
            if (seen[sku]) { errors.push('Duplikat SKU: ' + sku); continue; }
            seen[sku] = true;
            [['dl', p.dl], ['szer', p.szer], ['wys', p.wys]].forEach(function (kv) {
                if (kv[1] !== null && kv[1] !== undefined && !(mgIsNum(kv[1]) && kv[1] > 0))
                    errors.push('SKU ' + sku + ': niepoprawny wymiar ' + kv[0]);
            });
            if (p.waga !== null && p.waga !== undefined && !(mgIsNum(p.waga) && p.waga >= 0))
                errors.push('SKU ' + sku + ': niepoprawna waga');
        }

        var bundleRows = {}; // zestaw -> [{skladnik, ilosc}]
        for (i = 0; i < bundles.length; i++) {
            var b = bundles[i] || {};
            var z = String(b.zestaw || '').trim().toUpperCase();
            var s = String(b.skladnik || '').trim().toUpperCase();
            var q = b.ilosc;
            if (!z) { errors.push('Zestawy wiersz ' + (i + 1) + ': pusty sku_zestawu'); continue; }
            if (!s) { errors.push('Zestaw ' + z + ': pusty skladnik'); continue; }
            if (!(mgIsNum(q) && q > 0 && Math.round(q) === q)) { errors.push('Zestaw ' + z + ': ilosc musi byc dodatnia calkowita'); continue; }
            if (!seen[s]) { errors.push('Zestaw ' + z + ': skladnik spoza bazy: ' + s); continue; }
            (bundleRows[z] = bundleRows[z] || []).push({ skladnik: s, ilosc: q });
        }
        // Wykrywanie cykli: zestaw nie moze (posrednio) zawierac sam siebie.
        // Uwaga: skladniki wskazuja tylko produkty bazowe, wiec cykl to zestaw
        // bedacy jednoczesnie skladnikiem innego zestawu tworzacego petle.
        Object.keys(bundleRows).forEach(function (z) {
            var stack = [z], visited = {};
            while (stack.length) {
                var cur = stack.pop();
                if (visited[cur]) continue;
                visited[cur] = true;
                (bundleRows[cur] || []).forEach(function (row) {
                    if (row.skladnik === z) errors.push('Cykl zestawow przy: ' + z);
                    if (bundleRows[row.skladnik]) stack.push(row.skladnik);
                });
            }
        });
        if (Object.keys(bundleRows).length === 0 && bundles.length > 0)
            errors.push('Brak poprawnych definicji zestawow');

        var activeBoxes = 0, j;
        for (j = 0; j < boxes.length; j++) {
            var bx = boxes[j] || {};
            if (!bx.nazwa) { errors.push('Karton wiersz ' + (j + 1) + ': pusta nazwa'); continue; }
            var wew = [bx.dl_wew, bx.szer_wew, bx.wys_wew];
            var bad = wew.some(function (v) { return !(mgIsNum(v) && v > 0); });
            if (bad) { errors.push('Karton ' + bx.nazwa + ': niepoprawne wymiary wew'); continue; }
            var zew = [bx.dl_zew, bx.szer_zew, bx.wys_zew];
            var zewGiven = zew.some(function (v) { return v !== null && v !== undefined; });
            if (zewGiven && zew.some(function (v) { return !(mgIsNum(v) && v > 0); }))
                errors.push('Karton ' + bx.nazwa + ': niepoprawne wymiary zew');
            if (bx.aktywny) activeBoxes++;
        }
        if (activeBoxes === 0) errors.push('Brak aktywnych kartonow');

        return { ok: errors.length === 0, errors: errors };
    }

    function mgApplyData(d, version) {
        var dims = {}, weights = {}, bundles = {}, boxes = [], meta = {};
        d.products.forEach(function (p) {
            var sku = String(p.sku).trim().toUpperCase();
            dims[sku] = [Number(p.dl), Number(p.szer), Number(p.wys)];
            weights[sku] = (p.waga === null || p.waga === undefined) ? null : Number(p.waga);
        });
        d.bundles.forEach(function (b) {
            var z = String(b.zestaw).trim().toUpperCase();
            var s = String(b.skladnik).trim().toUpperCase();
            (bundles[z] = bundles[z] || {})[s] = Number(b.ilosc);
        });
        d.boxes.forEach(function (bx) {
            if (!bx.aktywny) return;
            var wew = [Number(bx.dl_wew), Number(bx.szer_wew), Number(bx.wys_wew)];
            var zewGiven = (bx.dl_zew !== null && bx.dl_zew !== undefined);
            boxes.push({ name: String(bx.nazwa), dims: wew });
            meta[String(bx.nazwa)] = {
                zew: zewGiven ? [Number(bx.dl_zew), Number(bx.szer_zew), Number(bx.wys_zew)] : null,
                waga: (bx.waga === null || bx.waga === undefined) ? null : Number(bx.waga),
                max_kg: (bx.max_kg === null || bx.max_kg === undefined) ? null : Number(bx.max_kg),
                aktywny: true
            };
        });
        productDims = dims;
        productWeights = weights;
        bundleDefinitions = bundles;
        customBoxes = boxes;
        boxMeta = meta;
        mgDataVersion = version;
    }

    function mgCacheSave(d, version) {
        try {
            if (typeof GM_setValue !== 'undefined')
                GM_setValue('mg_data', JSON.stringify({ v: version, t: new Date().toISOString(), d: d }));
        } catch (e) { /* brak dostepu do storage — dzialamy na biezacych */ }
    }

    function mgLoadCached() {
        try {
            if (typeof GM_getValue === 'undefined') return false;
            var raw = GM_getValue('mg_data', null);
            if (!raw) return false;
            var parsed = JSON.parse(raw);
            var chk = mgValidateData(parsed.d);
            if (!chk.ok) return false;
            mgApplyData(parsed.d, parsed.v);
            mgLastFetchTime = parsed.t || null;
            return true;
        } catch (e) { return false; }
    }

    // SWR: start natychmiast na cache/legacy, odswiezenie w tle BEZ auto-podmiany.
    // Nowa wersja czeka w mgPendingData na swiadome „Przelicz” (pin sesji).
    function mgRefreshInBackground(manual) {
        if (!MG_DATA_URL) {
            mgRefreshBadges('Brak URL bazy — tryb wbudowany ' + MG_LEGACY_VERSION);
            return;
        }
        if (typeof GM_xmlhttpRequest === 'undefined') return;
        GM_xmlhttpRequest({
            method: 'GET',
            url: MG_DATA_URL + (MG_DATA_URL.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now(),
            timeout: 15000,
            onload: function (resp) {
                var d;
                try { d = JSON.parse(resp.responseText); }
                catch (e) { mgRefreshBadges('Blad JSON bazy — zostaje ' + mgDataVersion); return; }
                var chk = mgValidateData(d);
                if (!chk.ok) {
                    mgRefreshBadges('Baza odrzucona (' + chk.errors[0] + ') — zostaje ' + mgDataVersion);
                    return;
                }
                var version = d.version || ('pobrana ' + new Date().toLocaleString());
                if (version === mgDataVersion && !manual) { mgRefreshBadges(); return; }
                mgPendingData = { d: d, version: version };
                mgLastFetchTime = new Date().toLocaleString();
                mgCacheSave(d, version);
                mgRefreshBadges();
                try { checkAndInjectUI(); } catch (e) { /* UI odswiezy sie przy kolejnej mutacji */ }
            },
            onerror: function () { mgRefreshBadges('Blad pobrania bazy — zostaje ' + mgDataVersion); },
            ontimeout: function () { mgRefreshBadges('Timeout bazy — zostaje ' + mgDataVersion); }
        });
    }

    function mgApplyPending() {
        if (!mgPendingData) return;
        mgApplyData(mgPendingData.d, mgPendingData.version);
        mgPendingData = null;
        mgSessionPin = {}; // nowa baza: sesje przypinaja sie od nowa przy kolejnym renderze
        try { checkAndInjectUI(); } catch (e) {}
    }

    function mgStateHash(items, incomplete, boxName) {
        return items.map(function (x) { return x.sku + ':' + x.qty; }).sort().join(',')
            + '|inc:' + (incomplete ? 1 : 0)
            + '|box:' + (boxName || '-')
            + '|data:' + mgDataVersion;
    }

    function mgShipmentWeight(items, boxName) {
        var total = 0, unknown = false, i;
        for (i = 0; i < items.length; i++) {
            var w = productWeights[items[i].sku];
            if (w === null || w === undefined) unknown = true;
            else total += w * items[i].qty;
        }
        var bw = boxName && boxMeta[boxName] ? boxMeta[boxName].waga : null;
        if (boxName && (bw === null || bw === undefined)) unknown = true;
        else if (bw) total += bw;
        return { total: total, unknown: unknown };
    }

    // ============ LOGIKA PAKOWANIA (v14.5, zachowana) ============

    function getUnitVolume(code) {
        if (productDims[code]) {
            return productDims[code][0] * productDims[code][1] * productDims[code][2];
        }
        if (bundleDefinitions[code]) {
            let vol = 0;
            for (let subSku in bundleDefinitions[code]) {
                vol += getUnitVolume(subSku) * bundleDefinitions[code][subSku];
            }
            return vol;
        }
        return 0;
    }

    window.mgShipmentState = window.mgShipmentState || {};
    let isProgrammaticUpdate = false;

    function getShipmentUniqueKey(label) {
        let row = label.closest('tr[data-role="shipment-preferences"]');
        if (row) {
            let orderLink = row.querySelector('a[href*="/order/order/detail/"]');
            return 'multi_' + (orderLink ? orderLink.textContent.trim() : row.dataset.roleId);
        } else {
            let match = window.location.href.match(/new-for-order\/([A-Za-z0-9\-]+)/);
            return 'single_' + (match ? match[1] : 'default');
        }
    }

    function updateCommentCounter(commentInput) {
        if (!commentInput) return;
        let counter = commentInput.parentElement ? commentInput.parentElement.querySelector('.mg-comment-counter') : null;
        if (!counter) {
            counter = document.createElement('span');
            counter.className = 'mg-comment-counter';
            counter.style.cssText = 'color: #dc3545; font-weight: bold; font-size: 12px; margin-left: 6px; display: inline-block; vertical-align: middle;';
            commentInput.insertAdjacentElement('afterend', counter);
        }
        let len = (commentInput.value || '').length;
        if (len > 30) {
            counter.textContent = `${len}/30`;
            counter.style.display = 'inline-block';
        } else {
            counter.style.display = 'none';
        }
    }

    function updateMissingProductAlert(commentInput, isMissing) {
        if (!commentInput) return;
        let alertEl = commentInput.parentElement ? commentInput.parentElement.querySelector('.mg-missing-alert') : null;
        if (!alertEl) {
            alertEl = document.createElement('span');
            alertEl.className = 'mg-missing-alert';
            alertEl.style.cssText = 'color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px; margin-left: 6px; display: inline-block; vertical-align: middle;';
            alertEl.textContent = '⚠️ BRAK PRODUKTU W BAZIE – KARTON MOŻE BYĆ ŹLE LICZONY!';
            commentInput.insertAdjacentElement('afterend', alertEl);
        }
        alertEl.style.display = isMissing ? 'inline-block' : 'none';
    }

    function updateNoBoxAlert(container, show) {
        if (!container) return;
        let alertEl = container.querySelector('.mg-nobox-alert');
        if (!alertEl) {
            alertEl = document.createElement('div');
            alertEl.className = 'mg-nobox-alert';
            alertEl.style.cssText = 'color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 6px 10px; border-radius: 4px; font-weight: bold; font-size: 12px; margin-top: 6px; margin-bottom: 4px; display: block; width: 100%;';
            alertEl.innerHTML = '⚠️ <strong>ZA DUŻA PACZKA!</strong> Wymagana weryfikacja ręczna — nie ustawiono kartonu automatycznie.';
            container.appendChild(alertEl);
        }
        alertEl.style.display = show ? 'block' : 'none';
    }

    function updateInpostAlert(container, show) {
        if (!container) return;
        let alertEl = container.querySelector('.mg-inpost-alert');
        if (!alertEl) {
            alertEl = document.createElement('div');
            alertEl.className = 'mg-inpost-alert';
            alertEl.style.cssText = 'color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 6px 10px; border-radius: 4px; font-weight: bold; font-size: 12px; margin-top: 6px; margin-bottom: 4px; display: block; width: 100%;';
            alertEl.innerHTML = '⚠️ <strong>PRZESYŁKA ZA DUŻA NA PACZKOMAT INPOST!</strong> (Przekracza Gabaryt C: 41x38x64 cm lub 25 kg)';
            container.appendChild(alertEl);
        }
        alertEl.style.display = show ? 'block' : 'none';
    }

    // Waga: null = nieznana → „Niezweryfikowana waga”, NIGDY claim o limicie.
    function updateWeightAlert(container, weight, boxName) {
        if (!container) return;
        let alertEl = container.querySelector('.mg-weight-alert');
        if (!alertEl) {
            alertEl = document.createElement('div');
            alertEl.className = 'mg-weight-alert';
            alertEl.style.cssText = 'color: #856404; background-color: #fff3cd; border: 1px solid #ffeeba; padding: 6px 10px; border-radius: 4px; font-weight: bold; font-size: 12px; margin-top: 6px; margin-bottom: 4px; display: block; width: 100%;';
            container.appendChild(alertEl);
        }
        var meta = boxName && boxMeta[boxName] ? boxMeta[boxName] : null;
        if (weight.unknown) {
            alertEl.innerHTML = '⚠️ <strong>Niezweryfikowana waga przesyłki</strong> — uzupełnij wagi w bazie. Nie potwierdzono mieszczenia w limicie 25 kg.';
            alertEl.style.display = 'block';
            return false;
        }
        if (weight.total > MG_INPOST_MAX_KG) {
            alertEl.innerHTML = '⚠️ <strong>Przesyłka ' + weight.total.toFixed(2) + ' kg — powyżej 25 kg (poza InPost A/B/C).</strong>';
            alertEl.style.display = 'block';
            return false;
        }
        if (meta && meta.max_kg !== null && meta.max_kg !== undefined && weight.total > meta.max_kg) {
            alertEl.innerHTML = '⚠️ <strong>Przesyłka ' + weight.total.toFixed(2) + ' kg — powyżej limitu kartonu ' + boxName + ' (' + meta.max_kg + ' kg).</strong>';
            alertEl.style.display = 'block';
            return false;
        }
        alertEl.style.display = 'none';
        return true;
    }

    function mgOuterDims(boxName, fallbackDims) {
        var m = boxName && boxMeta[boxName] ? boxMeta[boxName].zew : null;
        return m ? m.slice() : fallbackDims.slice();
    }

    // Badge wersji bazy + przycisk odswiezenia + pigulka „Przelicz” (pin sesji).
    function mgEnsureDataBar(container, shipmentId) {
        if (!container) return;
        let bar = container.querySelector('.mg-data-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'mg-data-bar';
            bar.style.cssText = 'font-size: 11px; color: #6c757d; margin-top: 4px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;';
            container.appendChild(bar);
        }
        var pin = mgSessionPin[shipmentId] || mgDataVersion;
        var html = '<span>Baza danych: <strong>' + mgDataVersion + '</strong>'
            + ' · sesja: ' + pin
            + (mgLastFetchTime ? ' · pobrano: ' + mgLastFetchTime : '')
            + ' · skrypt v' + MG_SCRIPT_VERSION + '</span>';
        html += '<button type="button" class="mg-refresh-btn btn btn-sm btn-outline-secondary" style="padding:0 8px;">Odśwież bazę</button>';
        if (mgPendingData && pin !== mgPendingData.version) {
            html += '<button type="button" class="mg-recalc-btn btn btn-sm btn-warning">Nowa baza (' + mgPendingData.version + ') — Przelicz</button>';
        }
        bar.innerHTML = html;
        var rb = bar.querySelector('.mg-refresh-btn');
        if (rb) rb.addEventListener('click', function (e) { e.preventDefault(); mgRefreshInBackground(true); });
        var cb = bar.querySelector('.mg-recalc-btn');
        if (cb) cb.addEventListener('click', function (e) { e.preventDefault(); mgApplyPending(); });
    }

    function mgRefreshBadges(note) {
        document.querySelectorAll('.mg-data-bar').forEach(function (bar) {
            var first = bar.querySelector('span');
            if (first && note) first.textContent = note + ' · ' + first.textContent;
        });
        try { checkAndInjectUI(); } catch (e) {}
    }

    function findOptimalCondensation(initialCounts) {
        const memo = new Map();

        function getCacheKey(counts) {
            return Object.keys(counts).filter(k => counts[k] > 0).sort().map(k => `${k}:${counts[k]}`).join(',');
        }

        function formatResult(bundleCounts, remainingCounts) {
            let res = [];
            for (let code in bundleCounts) {
                let qty = bundleCounts[code];
                if (qty > 0) res.push({ text: qty === 1 ? code : `${qty}x${code}`, totalVol: getUnitVolume(code) * qty });
            }
            for (let sku in remainingCounts) {
                let qty = remainingCounts[sku];
                if (qty > 0) res.push({ text: qty === 1 ? sku : `${qty}x${sku}`, totalVol: getUnitVolume(sku) * qty });
            }
            res.sort((a, b) => (b.totalVol - a.totalVol) || a.text.localeCompare(b.text));
            return { str: res.map(i => i.text).join(';'), items: res };
        }

        function search(currentCounts) {
            let cacheKey = getCacheKey(currentCounts);
            if (memo.has(cacheKey)) return memo.get(cacheKey);

            let bestSolution = { bundleCounts: {}, remainingCounts: { ...currentCounts } };
            let bestFormatted = formatResult({}, currentCounts);

            for (let bundleCode in bundleDefinitions) {
                let req = bundleDefinitions[bundleCode];
                let fits = true;
                for (let sku in req) {
                    if ((currentCounts[sku] || 0) < req[sku]) { fits = false; break; }
                }

                if (fits) {
                    let nextCounts = { ...currentCounts };
                    for (let sku in req) nextCounts[sku] -= req[sku];

                    let sub = search(nextCounts);
                    let candidateBundles = { ...sub.bundleCounts };
                    candidateBundles[bundleCode] = (candidateBundles[bundleCode] || 0) + 1;
                    let candidateFormatted = formatResult(candidateBundles, sub.remainingCounts);

                    let isBetter = false;
                    if (candidateFormatted.str.length < bestFormatted.str.length) isBetter = true;
                    else if (candidateFormatted.str.length === bestFormatted.str.length && candidateFormatted.items.length < bestFormatted.items.length) isBetter = true;

                    if (isBetter) {
                        bestFormatted = candidateFormatted;
                        bestSolution = { bundleCounts: candidateBundles, remainingCounts: sub.remainingCounts };
                    }
                }
            }
            memo.set(cacheKey, bestSolution);
            return bestSolution;
        }

        let best = search(initialCounts);
        return formatResult(best.bundleCounts, best.remainingCounts);
    }

    // PAKOWANIE 3D BIN PACKING (Extreme Points Algorithm) — bez zmian v14.5
    function canFitInBox3D(unitBoxes, boxDims) {
        const [bx, by, bz] = [...boxDims].sort((a, b) => b - a);

        const getUniqueOrientations = ([d, w, h]) => {
            const orientations = [[d, w, h], [d, h, w], [w, d, h], [w, h, d], [h, d, w], [h, w, d]];
            const unique = [];
            const seen = new Set();
            for (const o of orientations) {
                const key = o.join('x');
                if (!seen.has(key)) { seen.add(key); unique.push(o); }
            }
            return unique;
        };

        const placed = [];
        let extremePoints = [{ x: 0, y: 0, z: 0 }];

        const overlaps = (a, b) => !(a.x2 <= b.x1 || a.x1 >= b.x2 || a.y2 <= b.y1 || a.y1 >= b.y2 || a.z2 <= b.z1 || a.z1 >= b.z2);

        for (const itemDims of unitBoxes) {
            const orientations = getUniqueOrientations(itemDims);
            let fits = false;

            extremePoints.sort((a, b) => (a.z - b.z) || (a.y - b.y) || (a.x - b.x));

            for (let i = 0; i < extremePoints.length; i++) {
                const ep = extremePoints[i];

                for (const [dx, dy, dz] of orientations) {
                    const candidate = { x1: ep.x, y1: ep.y, z1: ep.z, x2: ep.x + dx, y2: ep.y + dy, z2: ep.z + dz };
                    if (candidate.x2 > bx || candidate.y2 > by || candidate.z2 > bz) continue;

                    let hasOverlap = false;
                    for (const p of placed) {
                        if (overlaps(candidate, p)) { hasOverlap = true; break; }
                    }

                    if (!hasOverlap) {
                        placed.push(candidate);
                        fits = true;
                        extremePoints.splice(i, 1);
                        extremePoints.push({ x: candidate.x2, y: ep.y, z: ep.z });
                        extremePoints.push({ x: ep.x, y: candidate.y2, z: ep.z });
                        extremePoints.push({ x: ep.x, y: ep.y, z: candidate.z2 });

                        const epSeen = new Set();
                        extremePoints = extremePoints.filter(p => {
                            const key = `${p.x},${p.y},${p.z}`;
                            if (epSeen.has(key)) return false;
                            epSeen.add(key);
                            return true;
                        });
                        break;
                    }
                }
                if (fits) break;
            }
            if (!fits) return false;
        }
        return true;
    }

    function calculateBestBox(items) {
        if (!items || items.length === 0) return null;
        let unitBoxes = [];
        items.forEach(item => {
            for (let i = 0; i < item.qty; i++) unitBoxes.push([...item.dims]);
        });
        unitBoxes.sort((a, b) => (b[0] * b[1] * b[2]) - (a[0] * a[1] * a[2]));
        const totalItemVol = unitBoxes.reduce((sum, b) => sum + (b[0] * b[1] * b[2]), 0);

        let validBoxes = customBoxes.filter(box => {
            let boxVol = box.dims[0] * box.dims[1] * box.dims[2];
            if (boxVol < totalItemVol) return false;
            return canFitInBox3D(unitBoxes, box.dims);
        });

        validBoxes.sort((a, b) => (a.dims[0] * a.dims[1] * a.dims[2]) - (b.dims[0] * b.dims[1] * b.dims[2]));

        if (validBoxes.length > 0) {
            return { box: validBoxes[0], fits: true };
        }
        return { box: customBoxes[customBoxes.length - 1], fits: false };
    }

    // WERYFIKACJA GABARYTÓW INPOST (A: 8x38x64, B: 19x38x64, C: 41x38x64) — bez zmian
    function determineInpostGabaryt(dims) {
        if (!dims || dims.length !== 3) return null;
        let [b1, b2, b3] = [...dims].map(Number).sort((a, b) => a - b);

        if (b1 <= 8 && b2 <= 38 && b3 <= 64) return 'A';
        if (b1 <= 19 && b2 <= 38 && b3 <= 64) return 'B';
        if (b1 <= 38 && b2 <= 41 && b3 <= 64) return 'C';

        return null;
    }

    // Krok 3 flow: rozwija SKU na skladowe bazowe. Zestaw NIE potrzebuje wlasnej
    // wagi/wymiarow — waga i objetosc licza sie ze skladowych.
    // Zwraca 1 (znane, skonsumowane), 0 (zestaw z nieznanymi skladowymi,
    // skonsumowane) lub -1 (nieznany kod — zostawic w komentarzu).
    function mgExpandToBase(code, qty, skuCounts) {
        if (bundleDefinitions[code]) {
            let known = true;
            let bItems = bundleDefinitions[code];
            for (let bSku in bItems) {
                if (!productDims[bSku]) known = false;
                skuCounts[bSku] = (skuCounts[bSku] || 0) + (bItems[bSku] * qty);
            }
            return known ? 1 : 0;
        } else if (productDims[code]) {
            skuCounts[code] = (skuCounts[code] || 0) + qty;
            return 1;
        }
        return -1;
    }

    function parseCommentAndGetItems(label) {
        let row = label.closest('tr[data-role="shipment-preferences"]');
        let commentInput = row ? row.querySelector('input[name*="[comment]"]') : document.querySelector('input[name*="[comment]"]');
        if (!commentInput) return { items: [], incomplete: false };

        if (!commentInput.dataset.mgCounterListener) {
            ['input', 'change', 'blur'].forEach(evt => {
                commentInput.addEventListener(evt, () => {
                    if (isProgrammaticUpdate) return;
                    checkAndInjectUI();
                });
            });
            commentInput.dataset.mgCounterListener = 'true';
        }

        let text = commentInput.value || '';
        let skuCounts = {};
        let hasUnknownProduct = false;

        let remainingText = text.replace(/(?:^|[\s;,]+)(?:(\d+)\s*x\s*)?([A-Za-z0-9\-]+)/gi, (match, qtyStr, codeMatch) => {
            let qty = qtyStr ? parseInt(qtyStr, 10) : 1;
            let code = codeMatch.toUpperCase();

            let expanded = mgExpandToBase(code, qty, skuCounts);
            if (expanded === -1) {
                hasUnknownProduct = true;
                return match;
            }
            if (expanded === 0) hasUnknownProduct = true;
            return '';
        });

        remainingText = remainingText.replace(/^[;, ]+|[;, ]+$/g, '').replace(/[;,]{2,}/g, ';').trim();

        if (remainingText.length > 0) {
            hasUnknownProduct = true;
        }

        updateMissingProductAlert(commentInput, hasUnknownProduct);

        let items = [];
        for (let sku in skuCounts) {
            if (productDims[sku] && skuCounts[sku] > 0) {
                items.push({ sku: sku, qty: skuCounts[sku], dims: productDims[sku] });
            }
        }

        let optimalRes = findOptimalCondensation(skuCounts);

        let finalParts = [];
        if (remainingText) finalParts.push(remainingText);
        if (optimalRes.str) finalParts.push(optimalRes.str);
        let formattedComment = finalParts.join(';');

        let isFocused = (document.activeElement === commentInput);

        if (formattedComment && commentInput.value !== formattedComment && !isFocused) {
            isProgrammaticUpdate = true;
            commentInput.value = formattedComment;
            commentInput.dispatchEvent(new Event('input', { bubbles: true }));
            commentInput.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof window.jQuery !== 'undefined') {
                window.jQuery(commentInput).trigger('input').trigger('change');
            }
            isProgrammaticUpdate = false;
        }

        updateCommentCounter(commentInput);
        return { items: items, incomplete: hasUnknownProduct };
    }

    function checkAndInjectUI() {
        const labels = Array.from(document.querySelectorAll('label, small')).filter(l => {
            let text = l.textContent.trim().toLowerCase();
            return text === 'wymiary (cm)' || text === 'wymiary';
        });

        labels.forEach(label => {
            const container = label.parentElement;
            let parsed = parseCommentAndGetItems(label);
            let items = parsed.items;
            let incomplete = parsed.incomplete;
            let shipmentId = getShipmentUniqueKey(label);
            if (!mgSessionPin[shipmentId]) mgSessionPin[shipmentId] = mgDataVersion;

            let boxResult = calculateBestBox(items);
            let bestBox = boxResult ? boxResult.box : null;
            let fits = boxResult ? boxResult.fits : true;

            updateNoBoxAlert(container, items.length > 0 && !fits);

            let existingWrapper = container.querySelector('.mg-box-wrapper');
            // FIX v5.1: hash (sklad + box + wersja danych) zamiast samej nazwy kartonu.
            let newHash = bestBox ? mgStateHash(items, incomplete, bestBox.name) : 'none|' + mgDataVersion;
            if (existingWrapper && existingWrapper.dataset.mgHash === newHash) {
                let w0 = bestBox ? mgShipmentWeight(items, bestBox.name) : { total: 0, unknown: true };
                updateWeightAlert(container, w0, bestBox ? bestBox.name : null);
                mgEnsureDataBar(container, shipmentId);
                return;
            }
            if (existingWrapper) existingWrapper.remove();

            if (!bestBox) {
                mgEnsureDataBar(container, shipmentId);
                updateInpostAlert(container, false);
                return;
            }

            let row = label.closest('tr[data-role="shipment-preferences"]');
            let carrierSelect = row ? row.querySelector('select[name*="[method]"]') : document.querySelector('#warehousebundle_shipment_carrierAccount');
            let currentCarrier = carrierSelect ? carrierSelect.value : 'unknown';

            let state = window.mgShipmentState[shipmentId] || { custom: false, lastDispatched: null, carrier: null, box: null };
            window.mgShipmentState[shipmentId] = state;

            if (state.carrier !== currentCarrier) {
                state.carrier = currentCarrier;
                state.lastDispatched = null;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'mg-box-wrapper d-flex align-items-center mb-2 mt-1';
            wrapper.dataset.mgHash = newHash;
            wrapper.style.cssText = 'width: 100%; flex-wrap: nowrap;';

            const select = document.createElement('select');
            select.className = 'mg-box-selector form-control form-control-sm';
            select.style.cssText = 'background-color: #f7f8fa; flex: 1 1 auto; min-width: 0;';
            select.innerHTML = '<option value="">Wybierz karton...</option>' +
                customBoxes.map(b => `<option value="${b.dims.join('x')}">${b.name}</option>`).join('');

            const resetBtn = document.createElement('button');
            resetBtn.type = 'button';
            resetBtn.className = 'btn btn-sm btn-outline-secondary ml-1';
            resetBtn.style.cssText = 'padding: 0.35rem 0.6rem; flex: 0 0 auto;';
            resetBtn.title = 'Przywróć polecany karton';
            resetBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`;

            wrapper.appendChild(select);
            wrapper.appendChild(resetBtn);
            label.insertAdjacentElement('afterend', wrapper);

            // Waga: liczymy zawsze; przy incomplete/unknown tylko informujemy.
            let weight = mgShipmentWeight(items, bestBox.name);
            updateWeightAlert(container, weight, bestBox.name);

            const applyDims = (dimsToApply, isManualDropdown = false) => {
                const dims = [...dimsToApply].sort((a,b) => b-a);
                const boxStr = dims.join('x');

                if (isManualDropdown) {
                    state.custom = true;
                    state.box = boxStr;
                }

                let shouldDispatch = (state.lastDispatched !== boxStr) || isManualDropdown;
                const radios = container.querySelectorAll('input[type="radio"]');

                if (radios.length > 0) {
                    let gabaryt = determineInpostGabaryt(mgOuterDims(bestBox.name, dims));
                    let targetGab = gabaryt || 'C';
                    radios.forEach(r => {
                        let textContent = r.parentElement.textContent.toUpperCase();
                        let val = r.value.toLowerCase();
                        let isMatch = false;
                        if (targetGab === 'A' && (val === 'small' || val === 'a' || textContent.includes('A ('))) isMatch = true;
                        if (targetGab === 'B' && (val === 'medium' || val === 'b' || textContent.includes('B ('))) isMatch = true;
                        if (targetGab === 'C' && (val === 'large' || val === 'c' || textContent.includes('C ('))) isMatch = true;

                        if (isMatch && !r.checked) {
                            r.checked = true;
                            if (shouldDispatch) {
                                state.lastDispatched = boxStr;
                                r.dispatchEvent(new Event('change', { bubbles: true }));
                                r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                                if (typeof window.jQuery !== 'undefined') {
                                    window.jQuery(r).trigger('change').trigger('click');
                                }
                            }
                        }
                    });
                } else {
                    let lengthInp = container.querySelector('input[name*="[length]"], input[placeholder*="Dł"]');
                    let widthInp  = container.querySelector('input[name*="[width]"], input[placeholder*="Sz"]');
                    let heightInp = container.querySelector('input[name*="[height]"], input[placeholder*="Wys"]');
                    if (lengthInp && widthInp && heightInp) {
                        let changed = false;
                        if (Math.abs(parseFloat((lengthInp.value || "0").replace(',','.')) - dims[0]) > 0.01) { lengthInp.value = dims[0]; changed = true; }
                        if (Math.abs(parseFloat((widthInp.value || "0").replace(',','.')) - dims[1]) > 0.01) { widthInp.value = dims[1]; changed = true; }
                        if (Math.abs(parseFloat((heightInp.value || "0").replace(',','.')) - dims[2]) > 0.01) { heightInp.value = dims[2]; changed = true; }

                        if (changed || shouldDispatch) {
                            state.lastDispatched = boxStr;
                            [lengthInp, widthInp, heightInp].forEach(inp => {
                                inp.dispatchEvent(new Event('input', { bubbles: true }));
                                inp.dispatchEvent(new Event('change', { bubbles: true }));
                                if (typeof window.jQuery !== 'undefined') {
                                    window.jQuery(inp).trigger('input').trigger('change');
                                }
                            });
                        }
                    }
                }
            };

            const getUIState = () => {
                const radios = container.querySelectorAll('input[type="radio"]');
                if (radios.length > 0) {
                    let curGab = null;
                    radios.forEach(r => {
                        if (r.checked) {
                            let textContent = r.parentElement.textContent.toUpperCase();
                            let val = r.value.toLowerCase();
                            if (val === 'small' || val === 'a' || textContent.includes('A (')) curGab = 'A';
                            else if (val === 'medium' || val === 'b' || textContent.includes('B (')) curGab = 'B';
                            else if (val === 'large' || val === 'c' || textContent.includes('C (')) curGab = 'C';
                        }
                    });
                    return { type: 'inpost', gabaryt: curGab };
                } else {
                    let lengthInp = container.querySelector('input[name*="[length]"], input[placeholder*="Dł"]');
                    let widthInp  = container.querySelector('input[name*="[width]"], input[placeholder*="Sz"]');
                    let heightInp = container.querySelector('input[name*="[height]"], input[placeholder*="Wys"]');
                    if (lengthInp && widthInp && heightInp) {
                        let curDims = [
                            parseFloat((lengthInp.value || "0").replace(',','.')),
                            parseFloat((widthInp.value || "0").replace(',','.')),
                            parseFloat((heightInp.value || "0").replace(',','.'))
                        ].sort((a,b) => b-a);
                        return { type: 'dims', dims: curDims };
                    }
                    return { type: 'unknown' };
                }
            };

            const updateVisibility = () => {
                let ui = getUIState();
                let targetValue = '';
                let showDropdown = false;
                let showReset = false;
                let recOuter = mgOuterDims(bestBox.name, bestBox.dims).sort((a,b) => b-a);

                if (ui.type === 'inpost') {
                    let activeDims = (state && state.custom && state.box) ? state.box.split('x').map(Number) : bestBox.dims;
                    let activeGab = determineInpostGabaryt(mgOuterDims(bestBox.name, activeDims));

                    updateInpostAlert(container, items.length > 0 && activeGab === null);

                    let recGab = determineInpostGabaryt(recOuter);
                    if (ui.gabaryt === recGab && recGab !== null) {
                        showDropdown = true;
                        showReset = false;
                        targetValue = bestBox.dims.join('x');
                        state.custom = false;
                    } else {
                        showReset = true;
                        if (state && state.custom) {
                            let customDims = state.box.split('x').map(Number);
                            if (determineInpostGabaryt(customDims) === ui.gabaryt) {
                                showDropdown = true;
                                targetValue = state.box;
                            } else showDropdown = false;
                        } else showDropdown = false;
                    }
                } else if (ui.type === 'dims') {
                    updateInpostAlert(container, false);
                    let isRec = (Math.abs(ui.dims[0] - recOuter[0]) < 0.01 &&
                                 Math.abs(ui.dims[1] - recOuter[1]) < 0.01 &&
                                 Math.abs(ui.dims[2] - recOuter[2]) < 0.01);
                    if (isRec) {
                        showDropdown = true;
                        showReset = false;
                        targetValue = bestBox.dims.join('x');
                        state.custom = false;
                    } else {
                        let matchedBox = customBoxes.find(b => {
                            let bSort = [...b.dims].sort((x,y) => y-x);
                            return Math.abs(bSort[0] - ui.dims[0]) < 0.01 &&
                                   Math.abs(bSort[1] - ui.dims[1]) < 0.01 &&
                                   Math.abs(bSort[2] - ui.dims[2]) < 0.01;
                        });
                        showReset = true;
                        if (matchedBox) {
                            showDropdown = true;
                            targetValue = matchedBox.dims.join('x');
                        } else showDropdown = false;
                    }
                }

                select.style.display = showDropdown ? '' : 'none';
                if (showDropdown && select.value !== targetValue) select.value = targetValue;
                resetBtn.style.display = showReset ? '' : 'none';
            };

            select.addEventListener('change', (e) => {
                if (!e.target.value) return;
                const dims = e.target.value.split('x').map(Number);
                applyDims(dims, true);
                updateVisibility();
            });

            resetBtn.addEventListener('click', (e) => {
                e.preventDefault();
                state.custom = false;
                applyDims(bestBox.dims, false);
                updateVisibility();
            });

            if (!container.dataset.mgListeners) {
                const handleManualInteraction = (e) => {
                    if (e.target.classList.contains('mg-box-selector') || e.target.closest('.mg-box-wrapper')) return;
                    if(e.isTrusted) {
                        state.custom = false;
                        setTimeout(updateVisibility, 50);
                    }
                };
                container.addEventListener('input', handleManualInteraction);
                container.addEventListener('change', handleManualInteraction);
                container.addEventListener('click', handleManualInteraction);
                container.dataset.mgListeners = "true";
            }

            // v5.1: auto-apply TYLKO gdy komplet + miesci sie. W przeciwnym razie
            // dropdown do wyboru recznego (weryfikacja czlowieka).
            if (!incomplete && fits) {
                if (state.custom) {
                    let customDims = state.box.split('x').map(Number);
                    applyDims(customDims, true);
                } else applyDims(bestBox.dims, false);
            } else {
                select.style.display = '';
                resetBtn.style.display = '';
            }

            updateVisibility();
            mgEnsureDataBar(container, shipmentId);
        });
    }

    const observer = new MutationObserver(() => {
        observer.disconnect();
        try { checkAndInjectUI(); }
        catch(err) { console.error('MetalGuard Script Error:', err); }
        observer.observe(document.body, { childList: true, subtree: true });
    });

    function mgInitData() {
        mgInitFromLegacy();
        mgLoadCached(); // SWR: natychmiast cache/legacy, potem tlo
        setTimeout(function () { mgRefreshInBackground(false); }, 3000);
        setInterval(function () { mgRefreshInBackground(false); }, MG_FETCH_TTL_MS);
    }

    // Hak testowy (tylko do odczytu, regresja w konsoli / node).
    window.__mgTest = {
        version: MG_SCRIPT_VERSION,
        validate: mgValidateData,
        apply: mgApplyData,
        initLegacy: mgInitFromLegacy,
        weight: mgShipmentWeight,
        hash: mgStateHash,
        condense: findOptimalCondensation,
        expand: mgExpandToBase,
        getMaps: function () {
            return { dims: productDims, bundles: bundleDefinitions, boxes: customBoxes, weights: productWeights, meta: boxMeta, dataVersion: mgDataVersion };
        }
    };

    setTimeout(() => {
        mgInitData();
        checkAndInjectUI();
        observer.observe(document.body, { childList: true, subtree: true });
    }, 1500);

})();
