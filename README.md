# GFXWRLD Public

One search across public domain museum and library archives, built for people who put graphics on shirts. Live at https://gfxwrld-public.vercel.app and planned for public.gfxwrld.com.

Every result is public domain or CC0. Nothing else is shown.

## How it works

- `public/` is the site: plain HTML, CSS and JavaScript, no build step.
- `api/search.js` takes a search, asks each archive at the same time, and returns one common record shape.
- `api/home.js` builds the home page crates and is cached for a day.
- `api/img.js` passes archive images through this site so the background remover can read them. It only allows the archives' own image hosts.
- `lib/` has one file per archive.

## Archives

| Archive | Key needed | Notes |
|---|---|---|
| The Met | No | Refuses requests after about 40 calls in a few seconds. One search costs about 37. Needs to move to an index. |
| Art Institute of Chicago | No | Image server refuses requests that carry a referrer, so the site sends `Referrer-Policy: no-referrer`. |
| Cleveland Museum of Art | No | |
| Europeana | `EUROPEANA_API_KEY` | Narrowed to public domain mark and CC0. |
| Wikimedia Commons | No | Public domain or CC0, and dated 1930 or earlier. |

Not connected yet: Smithsonian (needs `SMITHSONIAN_API_KEY`), Rijksmuseum, Library of Congress, National Gallery of Art, Biodiversity Heritage Library. NYPL retired its API on 2026-08-01.

## Checking it

Add `&summary=1` to any search address to see which archives answered and how many results each returned, for example `/api/search?q=skull&summary=1`. `/api/home?debug=1` does the same for the crates.

## Keys

Keys live in the Vercel project's Environments settings. See `.env.example` for the names. Never commit a real key.
