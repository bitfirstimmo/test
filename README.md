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
- `import_zvg.py`: Testimport der Zwangsversteigerungen eines Amtsgerichts in SQLite

## Veröffentlichung

Das Projekt ist für GitHub Pages vorbereitet. Tailwind CSS wird über CDN geladen; es ist kein Build-Schritt erforderlich.

## Datenimport von Drittseiten

Das Beispielobjekt aus immobilienpool.de ist als redaktionell gekennzeichneter Datensatz mit Originalquelle und Link zur amtlichen Bekanntmachung eingebunden.

Eine vollständige automatische Übernahme aller Zwangsversteigerungsobjekte sollte erst mit einer ausdrücklichen Datenfreigabe, einem offiziellen Feed oder einer API des Anbieters umgesetzt werden. Für den produktiven Betrieb gehört der Import auf einen Server oder in einen geplanten GitHub-Action-Job; dort können Quellen, Dubletten, Änderungen, Ablaufdaten und die rechtlich erforderliche Kennzeichnung geprüft werden. GitHub Pages selbst ist nur eine statische Auslieferung und kann fremde Seiten nicht zuverlässig oder rechtssicher live spiegeln.

## Testimport Amtsgericht Peine

Der Import ruft nur die öffentlich verlinkten Zwangsversteigerungs-Detailseiten des Amtsgerichts Peine ab und speichert sie dedupliziert in SQLite. Der Ansprechpartner-/Gläubigertext wird separat gespeichert und kann gezielt gefiltert werden.

```powershell
python import_zvg.py --database data/zvg.sqlite3 --delay 0.5
```

Nur Datensätze mit befülltem Kontaktfeld anzeigen:

```powershell
python -c "import sqlite3; db=sqlite3.connect('data/zvg.sqlite3'); print(*db.execute(\"SELECT title, source_url, contact FROM foreclosure_properties WHERE TRIM(contact) <> ''\"), sep='\\n')"
```

Weitere Amtsgerichte können später über ihren relativen Pfad importiert werden, zum Beispiel `--court-path /amtsgerichte/hannover.XXXX/zwangsversteigerungen`.
