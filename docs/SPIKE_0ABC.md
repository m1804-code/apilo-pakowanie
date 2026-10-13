# Spike 0A / 0B / 0C — testy żywe (nie z dokumentacji)

## 0A — Fakturownia: odczyt produktu i zestawu

1. Wybierz 1 zwykły produkt i 1 istniejący zestaw w Fakturowni.
2. Wykonaj `GET /products.json` (pojedynczy odczyt) dla obu.
3. Zapisz **zanonimizowaną** odpowiedź: zostaw pola
   `code, size, size_width, size_height, weight, weight_unit, package,
   package_products_details`, usuń ceny/klientów/tokeny.
4. Dopisz: czy wymiary to gabaryt **opakowania** (do 3D) czy samego produktu.
5. Wynik: TAK (bierzemy Fakturownię jako źródło) / NIE + które pola wracają do Sheets.

## 0B — Apilo: konwersja produktu na zestaw

1. Na **testowym** SKU w Apilo: DevTools (F12) → Network → Fetch/XHR.
2. Kliknij „Zmień produkt na zestaw”, zanotuj request.
3. Do analizy wystarczą: **metoda + ścieżka + nazwy nagłówków + struktura
   payloadu (zanonimizowana)**. BEZ ciasteczek, CSRF, tokenów i danych zamówień.
4. Wynik: TAK (robimy przycisk 1-klik) / NIE (zestawy ręcznie, reszta bez zmian).

## 0C — Apilo: import nowych ofert

1. Wystaw testową ofertę na platformie (nie z poziomu Apilo).
2. Sprawdź, czy pojawi się w relacjach Apilo **bez ręcznego importu** i po jakim czasie.
3. Wynik: TAK (banner wystarczy) / NIE (do flow zespołu dopisujemy ręczny import).
