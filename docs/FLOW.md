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
- **Waga Apilo←Fakturownia: NIEPOTWIERDZONE.** Docs mówią tylko o zasilaniu
  „ilość/cena”; waga występuje jedynie w imporcie CSV („aktualizacja pełna”).
  Nie zakładamy, że waga przechodzi synciem.
- Auto „Zmień produkt na zestaw”: FAZA B po teście 0B (endpoint konwersji).
  Do tego czasu ręcznie.

## 5. Zespół ręcznie łączy ofertę z produktem/zestawem w Apilo
OK. Uwaga z docs (Krok III importu): po imporcie sprawdzić duplikaty
(produkt z platformy vs produkt z Fakturowni) i usunąć nadmiarowe;
łączyć oferty z produktami zasilanymi przez Fakturownię (filtr Magazyn).
Faza B: banner wskaże niepowiązane.

## 6. Zmiany: wymiary w Fakturowni, waga w Apilo — ODRZUCONE, decyzja:
**Jedno źródło prawdy dla wagi i wymiarów = Fakturownia.** Uzasadnienie:
- Skrypt czyta wagę WYŁĄCZNIE z Fakturowni (proxy). Waga wpisana w Apilo
  byłaby dla skryptu niewidzialna → rozjazd i fałszywe „Niezweryfikowana”.
- Skoro niepotwierdzone jest nawet czy Apilo importuje wagę (krok 4),
  edycja wagi w Apilo może być nadpisywana synciem albo ignorowana —
  obie opcje złe.
- Wyjątek: jeśli kurier/etykieta wymaga wagi w karcie Apilo, to osobny
  obowiązek formalny, nie źródło dla skryptu. Ewentualny automat
  wpisujący wagę do Apilo to faza B (po 0B), nie ręczna edycja.
