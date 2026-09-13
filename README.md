# BidFirst Immobilien-Plattform

Eigenständiger statischer Web-Prototyp für den professionellen Immobilien-Vorverkauf vor einer offiziellen Zwangsversteigerung.

## Start lokal

```powershell
python -m http.server 8000
```

Danach öffnen: http://localhost:8000/

## Dateien

- `index.html`: Marktplatz mit Suche, Filtern, FAQ, Login-Modal und Countdown
- `details.html`: dynamische Detailseite für die Beispielobjekte
- `.github/workflows/pages.yml`: automatische Veröffentlichung über GitHub Pages

## Veröffentlichung

Das Projekt ist für GitHub Pages vorbereitet. Tailwind CSS wird über CDN geladen; es ist kein Build-Schritt erforderlich.
