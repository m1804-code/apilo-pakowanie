#!/usr/bin/env python3
"""Seed 20 bazowych SKU MetalGuard do Fakturowni (TYLKO wymiary, bez wag).

Dlaczego nie robi tego agent za Ciebie:
  - token API Fakturowni to sekret — nigdy nie przechodzi przez czat ani agenta,
  - produkty z tymi kodami wedlug odczytu 0A NIE ISTNIEJA w Fakturowni,
    wiec nie ma czego aktualizowac — trzeba je UTWORZYC (decyzja wlasciciela),
  - skrypt v14.5 nie zna wag (same nulle) — wagi uzupelnia zespol recznie,
  - tworzenie produktow z cena 0 w systemie ksiegowym ma skutki (sync do Apilo),
    wiec tworzenie jest wylacznie swiadome i po dry-run.

Uzycie (na WLASNEJ maszynie, token tylko w zmiennej srodowiskowej):
  export FAKTUROWNIA_DOMAIN=twoja-domena
  export FAKTUROWNIA_TOKEN=twoj-token
  python3 scripts/fakturownia_seed.py --check            # tylko raport: co istnieje
  python3 scripts/fakturownia_seed.py --create --yes     # utworz brakujace

Tworzone produkty: name=code=SKU, tax=23, price_net=0, size/size_width/
size_height w cm + size_unit=cm. WAGA NIE JEST USTAWIANA (nieznana).
Po utworzeniu w Fakturownia UI: sprawdz kind=sprzedaz, uzupelnij wage.
"""

import json
import sys
import urllib.request
import urllib.error

# code, dl_cm, szer_cm, wys_cm — 1:1 z productDims v14.5
PRODUCTS = [
    ("MGF1L", 6.5, 8, 23),
    ("MGF5L", 12.5, 19.5, 31),
    ("MGIC1L", 6.5, 8, 23),
    ("MGIC02", 6.5, 6.5, 20),
    ("MGIC5L", 12.5, 19.5, 31),
    ("MGF02", 6.5, 6.5, 20),
    ("MGE1L", 7.5, 9, 22.5),
    ("MGE03", 4.5, 8.5, 13.5),
    ("MGE05", 5.5, 8.5, 18),
    ("MGE5L", 12.5, 19.5, 31),
    ("MGM03", 4.5, 8.5, 13.5),
    ("MGGB03", 4.5, 8.5, 13.5),
    ("MGO0W30", 11.5, 23.5, 34.5),
    ("MGO5W30", 11.5, 23.5, 34.5),
    ("MGO10W40", 11.5, 23.5, 34.5),
    ("MGO5W301L", 7.5, 9, 22.5),
    ("MGEF02", 6.5, 6.5, 20),
    ("MGEF04", 7.5, 7.5, 15),
    ("MG-6905", 7, 7, 20.5),
    ("MGLCG04", 6, 6, 24),
]

PER_PAGE = 100
MAX_PAGES = 50


def build_payload(code, dl, szer, wys):
    """Payload POST /products.json (pola z docs p5 + wymiary). Bez wagi."""
    return {
        "product": {
            "name": code,
            "code": code,
            "tax": "23",
            "price_net": "0",
            "size": str(dl),
            "size_width": str(szer),
            "size_height": str(wys),
            "size_unit": "cm",
        }
    }


def http_json(domain, token, method, path, payload=None, query="", transport=None):
    """Cienki wrapper HTTP (transport podmienialny w testach)."""
    t = transport or urllib.request.urlopen
    if method == "GET":
        url = "https://%s.fakturownia.pl%s?api_token=%s&per_page=%d%s" % (
            domain, path, token, PER_PAGE, query)
        req = urllib.request.Request(url, method="GET")
        with t(req) as r:
            return json.loads(r.read().decode("utf-8"))
    body = dict(payload or {})
    body["api_token"] = token
    req = urllib.request.Request(
        "https://%s.fakturownia.pl%s" % (domain, path),
        data=json.dumps(body).encode("utf-8"),
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method=method)
    with t(req) as r:
        raw = r.read().decode("utf-8")
        return json.loads(raw) if raw.strip() else {}


def list_all(domain, token, transport=None):
    out = []
    for page in range(1, MAX_PAGES + 1):
        data = http_json(domain, token, "GET", "/products.json",
                         query="&page=%d" % page, transport=transport)
        items = data if isinstance(data, list) else data.get("products", data)
        if not items:
            break
        out.extend(items)
        if len(items) < PER_PAGE:
            break
    return out


def match_codes(all_products, codes):
    """Zwraca {CODE: produkt_lub_None} (dopasowanie case-insensitive po code)."""
    by_code = {}
    for p in all_products:
        if not isinstance(p, dict):
            continue
        c = p.get("code")
        if c:
            by_code[str(c).strip().upper()] = p
    return {c: by_code.get(c) for c in codes}


def cmd_check(domain, token, transport=None):
    all_products = list_all(domain, token, transport)
    found = match_codes(all_products, [c for c, _, _, _ in PRODUCTS])
    missing = [c for c, p in found.items() if p is None]
    print("Fakturownia: %d produktow na liscie, szukane SKU: %d" % (len(all_products), len(PRODUCTS)))
    for code, _, _, _ in PRODUCTS:
        p = found[code]
        if p is None:
            print("  BRAK    %s" % code)
        else:
            print("  ISTNIEJE %s id=%s size=%s/%s/%s%s waga=%s%s" % (
                code, p.get("id"), p.get("size"), p.get("size_width"),
                p.get("size_height"), p.get("size_unit") or "?",
                p.get("weight"), p.get("weight_unit") or ""))
    return missing


def cmd_create(domain, token, missing, transport=None):
    created, failed = [], []
    for code, dl, szer, wys in PRODUCTS:
        if code not in missing:
            continue
        try:
            res = http_json(domain, token, "POST", "/products.json",
                            build_payload(code, dl, szer, wys), transport=transport)
            created.append((code, res.get("id") if isinstance(res, dict) else "?"))
            print("  UTWORZONO %s" % code)
        except urllib.error.HTTPError as e:
            failed.append(code)
            print("  BLAD %s: HTTP %s" % (code, e.code))
    return created, failed


def main(argv):
    import os
    domain = os.environ.get("FAKTUROWNIA_DOMAIN", "")
    token = os.environ.get("FAKTUROWNIA_TOKEN", "")
    if not domain or not token:
        print("Ustaw FAKTUROWNIA_DOMAIN i FAKTUROWNIA_TOKEN w srodowisku.", file=sys.stderr)
        return 2
    if "--check" in argv:
        missing = cmd_check(domain, token)
        print("Do utworzenia: %d" % len(missing))
        return 0
    if "--create" in argv:
        if "--yes" not in argv:
            print("Dry-run pomijalny tylko z --yes. Najpierw zrob --check.", file=sys.stderr)
            return 2
        missing = cmd_check(domain, token)
        if not missing:
            print("Nic do utworzenia.")
            return 0
        print("UWAGA: utworze %d produktow z cena 0 (do weryfikacji kind/cena/waga w UI)." % len(missing))
        created, failed = cmd_create(domain, token, missing)
        print("Utworzono: %d, bledy: %d %s" % (len(created), len(failed), failed))
        return 1 if failed else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
