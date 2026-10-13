# Flow zespołu (5 kroków) — status automatyzacji na 13.10.2026

## 1. Bartek dodaje ofertę na platformę
Poza skryptem. Bez zmian.

## 2. Import ofert + powiadomienie
**Status: ROZSTRZYGNIĘTE 13.10.2026 — auto-importu ofert NIE MA (test 0C zamknięty docs).**
- Apilo **nie wykrywa** nowych ofert wystawionych bezpośrednio na platformach
  („Apilo nie pobiera informacji czy w platformie sprzedaży pojawiły się nowe
  oferty. Wyjątkiem jest wystawianie ofert z panelu Apilo” — pomoc Apilo).
  Po wystawieniu na platformie trzeba kliknąć ponowny import:
  Towary i usługi > Relacje Produktów > Importuj (Import ofert: Tak).
  Status: Administracja > Zadania.
- Co synchronizuje się SAMO (cyklicznie): zamówienia (~5 min), stany/ceny
  (standard co 2–4h zależnie od pakietu; płatnie co 1h / 10 min / real-time).
  Podgląd: Administracja > Synchronizacja danych.
- Warianty dla zespołu (do wyboru):
  A. Bartek wystawia oferty Z POZIOMU Apilo (Sprzedaż → manager platformy)
     → wpadają same, import zbędny. **Rekomendowane.**
  B. Bartek wystawia na platformie i od razu klika Import w Relacjach (2 min)
     → krok 1 i import w jednej ręce, zespół nie czeka.
  C. Import robi zespół przed łączeniem (filtr Czy powiązano: Nie pokaże braki).
- Powiadomienie „po 15 min”: brak natywnego mechanizmu. Opcje: Bartek daje znać
  na czacie/mailu (zero techniki) albo banner w skrypcie fazy B (tylko przy
  wejściu do Apilo — push bez serwera nie istnieje).

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
