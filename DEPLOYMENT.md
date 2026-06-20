# Nasazení zdarma

Aplikace je webová PWA bez přihlášení. Každý, kdo má veřejný odkaz, vidí a může upravovat stejná data.

Doporučená free varianta:

- **Supabase Free** pro společná data.
- **Vercel Free** pro veřejný web.

## 1. Supabase databáze

V Supabase otevři projekt a jdi do:

`SQL Editor` -> `New query`

Vlož obsah souboru `SUPABASE_SETUP.sql` a spusť `Run`.

Tím vznikne tabulka `public.app_state`, ve které je uložený jeden společný stav celé aplikace.

## 2. Vercel hosting

Na Vercelu zvol:

`Add New` -> `Project` -> importuj GitHub repo `malymatymoc-max/makrocyklusacs`.

Není potřeba žádný placený persistent disk. Aplikace běží jako statický web a data ukládá do Supabase.

## 3. Kontrola

Po nasazení otevři veřejnou URL z Vercelu. V horní liště by se po načtení mělo zobrazit:

`Sdíleno přes Supabase`

Pokud je tam `Lokální režim`, obvykle ještě není spuštěný SQL skript v Supabase nebo se nenačetl `config.js`.

## Důležité

Tahle verze je záměrně bez přihlášení. Publishable Supabase klíč je veřejný a pravidla v `SUPABASE_SETUP.sql` dovolují číst i upravovat data každému, kdo má odkaz na aplikaci.
