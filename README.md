# Einkaufsliste

Eine mobile Einkaufsliste, die ohne Konto und ohne Server nutzbar ist. Listen werden lokal im Browser gespeichert. Wer eine Liste teilt, synchronisiert sie Ende-zu-Ende-verschlüsselt mit anderen Geräten.

## Funktionen

- Mehrere Listen mit Einträgen, Überschriften und Trennlinien; sortieren, abhaken und durchsuchen.
- Mobile Bedienung mit 100-%- und 150-%-Ansicht sowie einklappbarer Eingabeleiste.
- Lokale Speicherung in IndexedDB. Private Listen benötigen keine Netzwerkverbindung.
- Freigabe per QR-Code oder Link. Einladungen sind zehn Minuten gültig und einmalig. Teilnehmende können die gemeinsame Liste bearbeiten.
- Nur Besitzer können weitere Personen einladen, Freigaben beenden oder serverseitig löschen. Bereits synchronisierte Gerätekopien lassen sich nicht zurückrufen.
- Besitzer können eine Sicherung exportieren und auf derselben API-Adresse wiederherstellen.

## Technik

### Architektur und Synchronisierung

Das Frontend besteht aus `index.html`, `style.css` und `app.js` ohne Build- oder Laufzeitabhängigkeiten im Browser. Private Listen bleiben in IndexedDB. Es gibt keine Benutzerkonten, Analyse-Skripte oder Hintergrund-Synchronisierung.

Die API in `server/api.mjs` wird entweder vom Node.js-Adapter (`server/server.mjs`) mit CouchDB oder vom Cloudflare-Worker (`worker/index.js`) mit D1 verwendet. Beide nutzen dasselbe API-Protokoll. CouchDB beziehungsweise D1 speichern Freigaben, Chiffrate und Revisionsnummern; CouchDB ist nicht öffentlich erreichbar.

Nur die ausgewählte geteilte Liste synchronisiert, solange die App sichtbar ist: kurz nach einer Änderung und danach regelmäßig. Bedingte Revisionsschreibvorgänge verhindern blindes Überschreiben. Bei parallelen Änderungen vereinigt der Client die Stände anhand logischer Zähler und zufälliger Gleichstandsmarken. Löschmarker verhindern, dass alte Offline-Kopien gelöschte Einträge wiederherstellen.

Die API stellt Freigaben unter `/api/shares` bereit: Registrierung, Einladungsstatus und -einlösung, bedingtes Lesen und Schreiben des Chiffrats sowie Widerruf. Sie prüft Besitzer- und Teilnehmerrechte über Bearer-Tokens; bei getrennter Frontend-Origin greift die explizite CORS-Freigabe.

### Verschlüsselung und Freigaben

Die Verschlüsselung findet im Browser mit Web Crypto statt. Für jede Freigabe erzeugt die App unabhängige zufällige 256-Bit-Werte für Kennung, Listenschlüssel, Besitzer-Token und Teilnehmer-Token. Der Listeninhalt wird mit AES-256-GCM verschlüsselt. Jede Verschlüsselung nutzt einen neuen 96-Bit-IV und einen 128-Bit-Authentifizierungstag; zusätzliche authentifizierte Daten binden das Chiffrat an Protokollversion und Freigabekennung.

Das Chiffrat enthält Listenname, Einträge und Typen, Häkchen, Reihenfolge sowie Konflikt- und Löschmetadaten. Der Server erhält weder den Klartext noch den Listenschlüssel. Er speichert die Besitzer-, Teilnehmer- und Einladungstokens nur als SHA-256-Hashes. Kennungen, Einladungsstatus, Revisionen und Zeitpunkte bleiben Server-Metadaten.

Ein QR-Link enthält im URL-Fragment die Freigabe- und Einladungskennung, ein einmaliges Einlösungstoken sowie einen Paketschlüssel. Fragmente werden nicht an den Webserver übertragen. Das Schlüsselpaket mit Listenschlüssel und Teilnehmer-Token wird separat mit AES-GCM verschlüsselt; das Besitzer-Token wird nicht weitergegeben. Der Server bestätigt die Einlösung atomar und erlaubt Wiederholungen derselben Anfrage nach einem Antwortverlust.

Die lokale IndexedDB ist nicht durch die App verschlüsselt. Eine Besitzer-Sicherung enthält Schlüssel und Zugangstokens und muss wie ein Passwort geschützt werden. HTTPS schützt die Verbindung, ersetzt aber nicht den Schutz des Geräts und der Sicherungsdatei.

## Deployment

### Docker Compose auf einem eigenen Server

Voraussetzungen: Docker Engine mit Compose, eine Domain mit A/AAAA-Eintrag auf den Server und von außen erreichbare Ports 80 und 443. Caddy beschafft und erneuert das HTTPS-Zertifikat automatisch. Die Anwendung ist danach unter `https://<DOMAIN>/` erreichbar; Frontend und API nutzen dieselbe Origin.

```sh
cp .env.example .env
```

`.env` anpassen: `DOMAIN` ist der Hostname ohne `https://`, etwa `einkaufsliste.example.org`. `COUCHDB_USER` und ein unabhängiges `COUCHDB_PASSWORD` mit mindestens 32 Zeichen setzen. Die Datei enthält Zugangsdaten und sollte nur für den Betreiber lesbar sein. Danach:

```sh
chmod 600 .env
docker compose config --quiet
docker compose up --build -d
```

Compose startet CouchDB, die API und Caddy. Nur Caddy veröffentlicht Ports; CouchDB liegt in einem internen Docker-Netz. Die API läuft unprivilegiert mit schreibgeschütztem Dateisystem. Compose prüft CouchDB über `/_up` und die API über `/healthz`. Beim D1-Worker prüft `/healthz` zusätzlich, ob die migrierte Tabelle verfügbar ist.

Für ein separat gehostetes Frontend die API-Origin im App-Link angeben, z. B. `https://frontend.example.org/?api=https%3A%2F%2Feinkaufsliste.example.org`, und `ALLOWED_APP_ORIGINS=https://frontend.example.org` in `.env` setzen. Mehrere Origins werden kommasepariert angegeben. Ohne diese Einstellung nimmt die API nur gleich-originige Browserzugriffe an. Falls der Frontend-Host eine eigene Content-Security-Policy setzt, muss dessen `connect-src` die API-Origin erlauben. QR- und Einladungslinks übernehmen die API-Origin automatisch.

CouchDB schreibt Daten dateiintern append-only und gewinnt ungenutzten Platz durch automatische Smoosh-Kompaktierung zurück. Der Disk-Monitor stoppt interaktive Schreibvorgänge ab 85 % belegtem Speicher, damit Platz für Kompaktierung bleibt. CouchDB-Daten liegen im benannten Volume `couch-data`; Caddy-Zertifikate und Konfiguration in `caddy-data` und `caddy-config`. `.env`, Daten-Volume und Besitzer-Sicherungen getrennt sichern. `docker compose down` erhält die Volumes; `docker compose down -v` löscht sie.

### Cloudflare Worker mit D1

Der alternative Worker-Einstieg ist `worker/index.js`; `.openai/hosting.json` deklariert die D1-Bindung `DB`. Der Build bündelt Worker, API, D1-Adapter und Frontend in `dist/`. Mit Node.js 24 und npm lässt sich das Artefakt erzeugen und validieren:

```sh
npm ci
npm run build
npm run validate
```

Beim Sites-Deployment `PUBLIC_ORIGIN` auf die HTTPS-Origin setzen, D1 als `DB` anbinden und die versionierten Migrationen aus `drizzle/` anwenden lassen. `ALLOWED_APP_ORIGINS` bleibt leer, wenn Frontend und API dieselbe Origin haben; getrennte Frontends müssen dort ausdrücklich freigegeben werden.

### Entwicklung und Quellcode

`npm run check` prüft `app.js` mit TypeScript im strikten JavaScript-Modus. Für `npm run check` und `npm test` zuerst `npm ci` und `npm ci --prefix server` ausführen. Der Docker-Build verwendet die Dateien im Repository und braucht im Container keine zusätzlichen npm-Pakete für die API.
