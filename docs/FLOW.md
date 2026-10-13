# Flow zespołu (5 kroków) — status automatyzacji na 13.10.2026

## 1. Bartek dodaje ofertę na platformę
Poza skryptem. Bez zmian.

## 2. Auto-import ofert co ~30 min + powiadomienie po ~15 min
**Status: do weryfikacji (test 0C).** Docs Apilo mówią o ręcznym re-imporcie ofert
wystawionych bezpośrednio na platformach — nie zakładamy, że import działa sam.
- Jeśli 0C potwierdzi auto-import → w fazie B banner w skrypcie pokaże oferty
  bez relacji (przy wejściu do Apilo; push bez serwera nie istnieje — decyzja: brak serwera).
- Jeśli nie → do instrukcji zespołu dopisujemy ręczny import jako krok obowiązkowy.

## 3. Zespół dodaje SKU do Fakturowni
- Produkt podstawowy → waga + wymiary w Fakturowni.
- Zestaw → BEZ wagi i wymiarów. **Skrypt liczy je ze składowych** (ekspansja
  `mgExpandToBase`, waga = suma wag składowych; pokryte testami).
- Proxy bierze produkty z Fakturowni, luki z arkusza; zestaw z nierozerwalnym
  składem ląduje w fallbacku arkusza z warningiem (nie psuje bazy).

## 4. Import do Apilo (~1h) + automat skryptu
**Status: faza B (wymaga testu 0B — endpoint konwersji).** Doprecyzowanie:
- Waga „do pakowania” brana jest z Fakturowni przez proxy — działa od razu po
  wdrożeniu, bez wpisywania czegokolwiek w Apilo.
- Fizyczne wpisanie wagi do karty produktu w Apilo + „Zmień produkt na zestaw”
  jednym klikiem to osobna automatyzacja (przycisk na karcie produktu).
- Do tego czasu: konwersja zestawów ręcznie, reszta (dobór kartonu) działa.

## 5. Ręczne łączenie oferty z produktem/zestawem w Apilo
Bez zmian. W fazie B banner wskaże co niepowiązane (link do filtra Apilo).
