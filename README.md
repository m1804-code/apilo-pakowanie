# Apilo Pakowanie (MetalGuard) — kod + dane rozdzielone

Instalacja jednorazowa (zespół klika raz, potem auto-update):

```
https://raw.githubusercontent.com/m1804-code/apilo-pakowanie/main/apilo-pakowanie.user.js
```

> Skonfigurowane pod `m1804-code/apilo-pakowanie`. Przy innej nazwie repo
> podmień URL w `@updateURL` / `@downloadURL` w `apilo-pakowanie.user.js`.

## Struktura

```
apilo-pakowanie.user.js   # skrypt (v14.5 + warstwa danych, SWR, walidacja)
apps-script/Code.gs       # Web App: JSON {products, bundles, boxes} z arkusza (+ hook Fakturowni)
schema/sheets-schema.json # schemat zakładek arkusza
docs/INSTRUKCJA_ZESPOLU.md
docs/SPIKE_0ABC.md        # testy 0A/0B/0C
```

## Wersje

- `2026.10.13.1` — migracja v14.5: ta sama tożsamość (`@name`/`@namespace` bez zmian),
  minimalne granty, dane wbudowane jako fallback, warstwa SWR + walidator + pin sesji.
- Każdą kolejną zmianę logiki wydaj z podbitym `@version` (inaczej VM nie wykryje update).
- Zmiany samych danych w arkuszu NIE wymagają nowej wersji skryptu.
