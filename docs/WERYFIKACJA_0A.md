# Weryfikacja 0A — ustalenia z żywych danych (13.10.2026)

## Próbka
Wklejony odczyt `GET /products.json` (strony 1–2, ~100+ pozycji, pełne obiekty).

## Potwierdzone
- `package_products_details` wraca w GET w kształcie `{"0": {"quantity": 2.0, "id": ...}}`
  (ten sam co w docs zapisu). Parser w `Code.gs` pasuje bez zmian.
- Ilości float (`2.0`) — zaokrąglane do int.
- Wagi obecne tam gdzie wypełnione (np. zestaw 2x olej = 2.0 kg).
- Jednostki w danych to **mm** (`size_unit: "mm"`), nie m/cm z docs → `toCm` obsługuje mm.

## Znalezione zestawy w Fakturowni (4)
`2XMGGR` (2× id 9005805634239), `3XMGGR` (3× id 9005805634239),
`2xMGO10W40-011L` (2× id 8845146121571), `2XMGO5W30-011L` (2× id 8845148383926).
Uwaga: nazewnictwo inne niż 10 definicji w skrypcie (MGFP, MG5PS, …).

## Kontrola: czy 20 SKU ze skryptu jest w próbce — NIE
Sprawdzone kody ze skryptu (productDims + składniki bundli):
MGF1L, MGF5L, MGIC1L, MGIC02, MGIC5L, MGF02, MGE1L, MGE03, MGE05, MGE5L,
MGM03, MGGB03, MGO0W30, MGO5W30, MGO10W40, MGO5W301L, MGEF02, MGEF04,
MG-6905, MGLCG04.
Występujące kody w próbce: tylko SKU74, 000558, 2XMGGR, 2xMGO10W40-011L,
2XMGO5W30-011L, 3XMGGR, O-81-SYN-A-000001-0005E-3600, nazwy usług kurierskich.
Reszta: `code: null` / `""`. Żaden z 20 SKU nie występuje.
Zastrzeżenie: próbka to strony 1–2 („jest tego więcej” wg właściciela);
pełną pewność da odczyt wszystkich stron przez proxy po wdrożeniu
(warnings w JSON wskażą dokładnie co przyszło skąd).

## Szum do odfiltrowania (wdrożone w proxy)
`kind: "buy"` (usługi, etykiety kurierskie z danymi osobowymi odbiorców),
`deleted`, pusty `code`. Reguła: tylko `kind: "sell"` z kodem; luki z arkusza.

## Otwarte
1. Czy składniki zestawów (id 9005805634239, 8845146121571, 8845148383926)
   mają wypełnione `code` (decyduje czy składy idą z Fakturowni czy z arkusza).
2. Czy wymiary w Fakturowni to gabaryt opakowania i czy liczby są w jednostce
   z `size_unit` (zestaw 2x olej: 25×20×10 przy mm = absurd 2,5 cm;
   przy cm = sensowne; skrypt liczy oleje jako 11,5×23,5×34,5 cm).

## Wniosek architektoniczny
Merge hybrydowy (Fakturownia ∪ luki z arkusza, już w `Code.gs`) znosi presję
decyzji: seedy arkusza są źródłem dla 20 SKU od dnia 1, a każdy SKU uzupełniony
w Fakturowni przejmuje automatycznie. Osobnej migracji nie trzeba.
