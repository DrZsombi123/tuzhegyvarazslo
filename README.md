# A Tűzhegy Varázslója — KJK webes játék

React + Vite + TypeScript alapú böngészős Kaland-Játék-Kockázat adaptáció.
A teljes könyvszöveg helyben generálható a megadott PDF-ből, de a generált teljes adat nem kerül GitHubra.

## Futtatás

```bash
npm install
python -m pip install pypdf
npm run extract:book
npm run dev
```

Ha nincs elérhető PDF, az app a `public/data/book.sample.json` demo adattal indul. A teljes helyi adat a `public/data/book.generated.json` fájlba készül, amely gitignore-ban van.

## Fontos parancsok

```bash
npm run dev            # Vite dev szerver
npm run build          # production build
npm run test           # Vitest unit tesztek
npm run test:parser    # Python parser tesztek (unittest)
npm run test:e2e       # Playwright e2e tesztek
npm run validate       # lint + Vitest + Python tesztek + build
```

## PDF feldolgozás

Az extractor alapértelmezetten ezt keresi:

```text
C:\Users\giran\Downloads\A Tűzhegy Varázslója.pdf
```

Egyedi útvonallal:

```bash
python scripts/extract_book.py --pdf "C:\útvonal\konyv.pdf"
```

A script 400 bekezdést állít elő, felismeri a `Ha …, lapozz a X-re` típusú feltételes hivatkozásokat, kibontja az ellenfél stat-sorokat, normalizálja a magyar PDF soft-wrap maradványokat, és külön riportot ír (`extraction-report.json`) az esetleges hiányokról.

## Leadandó tartalom

- Webes játék React/Vite/TypeScript alapon, magyar ékezetes UI-val.
- Helyi PDF-ből előállítható teljes könyvadat, 400 bekezdéssel.
- Szabálykövető játékmotor: 6-os kockás karaktergenerálás, harc támadóerővel, kombat-Szerencse, Szerencse-próba, Ügyesség-próba, élelem, ital, mentés.
- Sötét parázs-vörös fantasy felület, Cinzel + EB Garamond tipográfiával.
- Dokumentáció: `docs/architecture.md`, `docs/ai-hasznalat.md`, `docs/prezentacio-vazlat.md`.

## Szerzői jogi megjegyzés

A teljes eredeti könyvszöveg csak helyi, generált fájlként használatos. Publikus repóba ne kerüljön fel a `book.generated.json`.
