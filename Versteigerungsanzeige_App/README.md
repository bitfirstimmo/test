# Versteigerungsanzeige App

Eine schlanke Webanwendung für die Anzeige von Höchstgeboten und verbleibender Zeit bei Zwangsversteigerungen.

## Schnellstart

1. `npm install`
2. `cp .env.example .env`
3. `npm run build`
4. `npm start`

Dann sind die Seiten erreichbar unter:

- `http://localhost:3000/steuerung`
- `http://localhost:3000/anzeige`

## Konfiguration

Die wichtigsten Einstellungen sind in `.env` zentral hinterlegt:

- `PUBLIC_APP_URL`: Öffentliche Basisadresse für Links und QR-Code
- `LICENSE_EMAIL`: E-Mail-Adresse für Lizenzanfragen
- `SESSION_LIFETIME_HOURS`: technische Höchstlebensdauer aktiver Sitzungen
- `SESSION_CLEANUP_AFTER_END_HOURS`: Löschungszeit nach Beendigung/Ablauf
- `DEFAULT_SESSION_MINUTES`: Standarddauer neuer Sitzungen
- `MAX_SESSION_MINUTES`: maximal zulässige Dauer

## Sicherheit und Lizenz

- Die Nutzung ist nur nach Bestätigung des Lizenzhinweises erlaubt.
- Die Steuerung ist an einen HttpOnly-Servercookie gebunden.
- Die öffentliche Anzeige arbeitet nur mit dem Sitzungslink oder Session-Key.
- Der Session-Key wird weder in Logs noch in einer öffentlichen Anzeige angezeigt.

## Tests

`npm test`

## Produktvorgaben

Der Code enthält zentrale Platzhalter für die Lizenz-E-Mail und die öffentliche Basisadresse. Für produktive Nutzung muss `PUBLIC_APP_URL` und `LICENSE_EMAIL` entsprechend gesetzt werden.
