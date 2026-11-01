# Fonts

Self-hosted, no third-party requests. All three are from the Geist family by Vercel and Basement Studio, SIL Open Font License 1.1 (see OFL.txt).

| File | Source face | Notes |
|---|---|---|
| Geist-Variable.woff2 | Geist (sans), `Geist[wght].ttf` | variable weight, body and UI |
| GeistMono-Variable.woff2 | Geist Mono, `GeistMono[wght].ttf` | variable weight, code, labels and data |
| GeistSerif-Regular.woff2 | Geist Serif Regular | display headings only |

- Version: geist-font v1.9.0 (released 2026-10-30)
- Source: https://github.com/vercel/geist-font/releases/tag/v1.9.0
- Fetched: 2026-11-01
- Subset with fonttools `pyftsubset` to Basic Latin, Latin-1, general punctuation and a few arrows and symbols, keeping the variable axes and common layout features, output as woff2.
