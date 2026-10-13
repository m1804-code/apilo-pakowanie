# Spike 0A / 0B / 0C — testy żywe (nie z dokumentacji)

## 0A — Fakturownia: odczyt produktu i zestawu

**Stan po weryfikacji docs (13.10.2026, github.com/fakturownia/API, sekcja Produkty):**

Potwierdzone w dokumentacji (nie trzeba sprawdzać):
- `GET /products.json?api_token=..&per_page=100&page=N` (+`date_from`, +`warehouse_id`),
  `GET /products/ID.json`.
- Pola: `code`, `size`, `size_width`, `size_height`, `size_unit` (m/cm),
  `weight`, `weight_unit` (kg/g), `package` (1/0).
- Zestaw tworzy się przez `package: true` + `package_products_details: {"0": {quantity, id}}`
  (składniki po **wewnętrznym id**, nie po SKU — proxy samo mapuje id→code).

Do sprawdzenia NA ŻYWO (docs nie pokazują przykładu odpowiedzi GET):
1. Czy odczyt zestawu (`package: 1`) zwraca `package_products_details` i w jakim
   kształcie (obiekt jak przy zapisie, czy tablica, jakie klucze).
2. Czy wymiary `size/size_width/size_height` to gabaryt **opakowania** (do 3D),
   czy samego produktu.
3. Wystarczy 1 zwykły produkt + 1 zestaw, odpowiedź **zanonimizowana**
   (usunąć ceny/klientów/token; zostawić pola z listy powyżej).

Wynik: działa (źródło = Fakturownia, proxy już w `apps-script/Code.gs`) /
nie działa (składy lub pola wracają do zakładek arkusza — tylko luki, nie cała baza).

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
