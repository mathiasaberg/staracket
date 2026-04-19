# ståräcket

Svensk fotboll – tabeller och resultat via Everysport API.

## Kom igång

```bash
npm install
npm run dev
```

Öppna http://localhost:3000

## Struktur

```
pages/
  index.tsx                    # Huvudvy: ligaväljare, tabell, matcher
  api/
    everysport/[...path].ts    # Proxy → Everysport API (löser CORS)
styles/
  Home.module.css              # All styling
.env.local                     # API-nyckel (lägg inte i git!)
```

## Miljövariabler

Kopiera `.env.local.example` → `.env.local` och fyll i din nyckel:

```
EVERYSPORT_API_KEY=din_nyckel_här
```

## Deploya till Vercel

```bash
vercel
```

Lägg till `EVERYSPORT_API_KEY` som environment variable i Vercel-dashboarden.
