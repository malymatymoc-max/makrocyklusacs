# Nasazení veřejné verze

Tahle aplikace je jednoduchá Node webová aplikace bez přihlášení. Každý, kdo má veřejný odkaz, může data číst i upravovat.

## Doporučené nasazení

Použij hosting, který umí:

- spustit Node server přes `npm start`,
- držet persistentní disk/souborové uložiště.

Vhodné jsou například Render nebo Railway.

## Nastavení

Start command:

```bash
npm start
```

Environment variables:

```bash
NODE_ENV=production
DATA_DIR=/data
```

`DATA_DIR` musí ukazovat na persistentní disk. Do něj se bude ukládat soubor `shared-state.json` se společnými daty všech trenérů.

## Důležité

Bez persistentního disku se data mohou při restartu hostingu ztratit. Pro ostré používání tedy nepoužívat hosting, který nemá trvalé uložiště pro `shared-state.json`.
