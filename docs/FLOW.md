# Flow zespołu v2 (6 kroków) — status na 13.10.2026

## 1. Bartek dodaje ofertę na platformie i informuje zespół
OK bez zmian. (Wariant B: informacja na czacie/mailu; brak natywnego powiadomienia.)

## 2. Zespół klika import ofert danej platformy w Apilo
OK. Towary i usługi > Relacje Produktów > Importuj (Import ofert: Tak).
Status: Administracja > Zadania. Auto-importu nowych ofert nie ma (0C).

## 3. Zespół dodaje SKU do Fakturowni (base: waga + wymiary; zestaw: bez)
OK. Zestaw bez wymiarów/wagi przechodzi walidator; waga i objętość liczone
ze składowych (`mgExpandToBase`, testy). Proxy mapuje `package_products_details`
po id→code; nierozerwalny skład → fallback arkusza z warningiem.

## 4. Cykliczny import Fakturownia → Apilo (~1h) + automat skryptu
Konfiguracja po stronie Apilo (jednorazowo): Administracja > Księgowość
Konfiguracja > kafelek Fakturowni > Edytuj > ‘Platforma nadrzędna’ = Tak,
następnie ‘Konfiguruj’ przy ‘Import produktów’ i przy ‘Aktualizacji bazy
towarów’. Terminy: Administracja > Zadania.
- Wymiary do skryptu: proxy z Fakturowni — GOTOWE (czeka na URL /exec).
- **Waga Apilo←Fakturownia: POTWIERDZONA testem na żywo (13.10.2026).**
  Apilo importuje wagę z Fakturowni i samo mnoży ją w zestawach ze składowych
  — dokładnie ta sama zasada co `mgExpandToBase` + `mgShipmentWeight` w skrypcie.
  Oba systemy liczą z jednego źródła, więc nie rozjadą się.
- Auto „Zmień produkt na zestaw”: FAZA B po teście 0B (endpoint konwersji).
  Do tego czasu ręcznie.

## 5. Zespół ręcznie łączy ofertę z produktem/zestawem w Apilo
OK. Uwaga z docs (Krok III importu): po imporcie sprawdzić duplikaty
(produkt z platformy vs produkt z Fakturowni) i usunąć nadmiarowe;
łączyć oferty z produktami zasilanymi przez Fakturownię (filtr Magazyn).
Faza B: banner wskaże niepowiązane.

## 6. Zmiany wymiarów i wagi — JEDNO ŹRÓDŁO: Fakturownia (skorygowane 13.10.2026)
Pierwotna propozycja podziału (wymiary w Fakturowni, waga w Apilo) jest
nieaktualna po Twoim teście na żywo: skoro Apilo importuje wagę z Fakturowni
i samo przelicza ją w zestawach, edycja wagi w Apilo byłaby nadpisywana
synciem albo ignorowana przez skrypt (czyta wagę wyłącznie z Fakturowni).
- Zmiana wymiaru lub wagi → **zawsze w Fakturowni**.
- Apilo dociąga wagę synciem i mnoży w zestawach sam (przetestowane przez Ciebie).
- Skrypt dociąga wagę przez proxy i mnoży w zestawach sam (pokryte testami).
- Jeśli kurier wymaga wagi w karcie Apilo formalnie, Apilo ma ją z syncu —
  nic nie trzeba przepisywać ręcznie.
