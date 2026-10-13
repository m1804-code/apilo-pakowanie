# Seed 20 SKU do Fakturowni (`scripts/fakturownia_seed.py`)

Tylko gdy zdecydujesz, że 20 bazowych produktów ma fizycznie powstać
w Fakturowni (z odczytu 0A: nie istnieją — nie ma czego aktualizować).

```bash
export FAKTUROWNIA_DOMAIN=twoja-domena
export FAKTUROWNIA_TOKEN=twoj-token   # tylko w Twoim terminalu, nigdy na czat
python3 scripts/fakturownia_seed.py --check
python3 scripts/fakturownia_seed.py --create --yes
```

- `--check` jest read-only: wypisuje ISTNIEJE/BRAK dla 20 SKU + zastane wymiary/wagi.
- `--create` tworzy TYLKO brakujące: name=code=SKU, tax 23, price_net 0,
  wymiary w cm. **Wagi nie ustawia** (nieznane) — uzupełnij w UI Fakturowni.
- Po utworzeniu sprawdź w UI: kind=sprzedaż, cena (0!), waga. Produkty
  z platformą nadrzędną zasilą Apilo — cena 0 nie może wyciec na oferty
  (nie łącz ich przed weryfikacją).
