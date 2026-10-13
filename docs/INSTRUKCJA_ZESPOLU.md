# Instrukcja dla zespołu (1 strona)

## Instalacja skryptu — RAZ

1. Otwórz w przeglądarce (Chrome/Edge + Violentmonkey):
   `https://raw.githubusercontent.com/m1804-code/apilo-pakowanie/main/apilo-pakowanie.user.js`
2. Kliknij **Instaluj**. Przy aktualizacji uprawnień (dostęp sieciowy do bazy) kliknij
   **Aktualizuj/Zainstaluj** — też raz.
3. Od tej pory skrypt aktualizuje się **sam**. Nic nie wklejasz.

> Masz starą wersję wklejoną ręcznie o tej samej nazwie?
> Nowa ją zastąpi przy instalacji (ta sama nazwa + namespace).
> Po instalacji sprawdź w panelu Violentmonkey, że jest **tylko jedna** pozycja
> „Apilo Auto-Karton MetalGuard”.

## Skąd skrypt bierze dane

- Produkty / zestawy / kartony edytujemy w **arkuszu Google** (link od Bartka).
- Po zmianie w arkuszu skrypt pokaże przy pakowaniu pigułkę
  **„Nowa baza — Przelicz”**. Kliknij ją, żeby przeliczyć karton na nowych danych.
- Pod panelem kartonu widać: `Baza danych: <wersja> · pobrano: <czas>` + przycisk
  **[Odśwież bazę]** (ręczne pobranie).
- Wymiary wpisujemy w **centymetrach** (np. `6,5` lub `6.5`).
- Pusta waga = nieznana → skrypt pokaże „Niezweryfikowana waga przesyłki”.

## Alerty

- Czerwony **„BRAK PRODUKTU W BAZIE”** → dopisz SKU do arkusza, karton zweryfikuj ręcznie.
- **„ZA DUŻA PACZKA”** → największy karton, weryfikacja ręczna.
- **„ZA DUŻA NA PACZKOMAT”** → poza gabarytem C / powyżej 25 kg.
