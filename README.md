# Einkaufsliste

Statische mobile Einkaufsliste mit IndexedDB. Ohne Freigabe bleiben Listen, Namen, Elemente, Reihenfolge und Häkchen ausschließlich im Browser. Das Frontend besteht aus `index.html`, `style.css` und `app.js`; es benötigt weder einen Build noch eine Node.js-Laufzeit im Browser. `app.js` wird mit JSDoc-Typen und TypeScripts strikter JavaScript-Prüfung geprüft.

Optionales Teilen wird auf Sites durch einen Cloudflare Worker mit privater D1-Datenbank bereitgestellt. Derselbe Worker liefert die drei statischen Frontend-Dateien und die API unter derselben HTTPS-Adresse aus. Die vorkonfigurierte API-Adresse erlaubt auch ein getrennt auf eigenem Webspace ausgeliefertes Frontend; Datenbank-Zugangsdaten gelangen nicht in den Browser. Der bisherige Node.js-/CouchDB-Betrieb bleibt als optionale Alternative erhalten; beide Varianten verwenden denselben API-Kern. Alle Skripte und die QR-Bibliothek werden lokal ausgeliefert; es gibt keine CDNs, Konten, Nutzer-IDs, Geräte-IDs, Analyse-Skripte oder Hintergrundsynchronisierung.

## Bedienung

- Listen anlegen und im Dropdown auswählen; Text, Elementtyp und Position bearbeiten. Sortierung per Griff oder Tastatur. Die Suche bleibt zwischen „Alle abhaken“ und dem 100/150-Prozent-Schalter.
- **Listenoptionen → Liste teilen → QR-Code erzeugen**. Der QR-Code gilt zehn Minuten und kann einmal angenommen werden. Alternativ den geheimen Link kopieren.
- Empfänger öffnet den Link mit der Smartphone-Kamera und bestätigt **Liste übernehmen**. Die Geheimnisse werden sofort aus der Adresszeile entfernt. Vor dem Bestätigen wird keine Einladung eingelöst.
- Beim ersten Teilen müssen beide Apps geöffnet und online sein. Bis der Besitzer den ersten Inhalt hochgeladen hat, zeigt der Empfänger **Warte auf Besitzer**. In diesem Zustand sind Änderungen gesperrt.
- Für jede weitere Person erzeugt der Besitzer einen neuen QR-Code. Ein neuer Code ersetzt den vorherigen unbenutzten Code. Abbrechen einer Einladung entzieht bereits aufgenommenen Teilnehmern keinen Zugriff.
- Alle Teilnehmer dürfen Inhalt, Namen, Häkchen und Reihenfolge ändern. Teilnehmer löschen ausschließlich ihre lokale Kopie oder behalten sie über **Freigabe ansehen → Als private Kopie behalten** ohne weiteren Sync.
- Nur Besitzer sehen **Freigabe beenden** und **Für alle löschen**. Beide benötigen eine Serverbestätigung. „Freigabe beenden“ behält die lokale Liste, „Für alle löschen“ entfernt danach auch die lokale Besitzerliste. Bereits entschlüsselte Kopien auf anderen Geräten bleiben erhalten.
- Erneutes Teilen erzeugt neue Kennung, Schlüssel und Tokens. Gewünschte Personen müssen erneut eingeladen werden. Einzelne Teilnehmer werden in dieser Version durch Beenden und erneutes Teilen ausgeschlossen.

## Besitzer-Sicherung

Nach dem ersten Inhaltsupload kann der Besitzer über die Listenoptionen eine JSON-Sicherung herunterladen. Die Datei enthält Listenschlüssel, Serverkennung und beide Zugangstokens und ist **wie ein Passwort aufzubewahren**. Sie enthält keine noch nicht synchronisierten lokalen Änderungen.

**Besitzer-Sicherung importieren** ist auch ohne vorhandene Liste erreichbar. Import ist nur auf derselben Serveradresse möglich; die Adresse aus der Datei wird niemals ungeprüft für Netzwerkzugriffe verwendet. Die App prüft Besitzer- und Teilnehmerzugriff und entschlüsselt den Serverstand, bevor sie ihn lokal installiert. Eine bereits vorhandene Kopie wird vereinigt, nicht ersetzt. Nach Beenden und erneutem Teilen ist eine neue Sicherung erforderlich. Ohne lokale Schlüssel oder Sicherung kann der Server nichts wiederherstellen.

## Standardbetrieb auf Sites: Worker und D1

Sites-Adresse: https://einkaufsliste-sync-f6c82a.sven38419.chatgpt.site (Zugriff entsprechend der Sites-Freigabe).

`.openai/hosting.json` bindet diese Anwendung an ihre Site und deklariert D1 als `DB`. Sites provisioniert und verbindet die Datenbank. Es werden keine CouchDB-Instanz und kein Docker-Container auf Sites benötigt.

`server/api.mjs` enthält die plattformunabhängige Fetch-API. `server/d1.mjs` speichert Freigaben als JSON-Dokumente mit separater Revision. Ein atomisches bedingtes SQL-Update verhindert verlorene Änderungen und doppelte Einlösungen. Sicherheitsabfragen lesen mit D1-Sessions vom Primary. Die Tabelle `shares` enthält nur zufällige Kennungen, Berechtigungshashes, Einladungsstatus und Chiffrate.

```sh
npm ci
npm run build
npm run validate
```

Der Build bündelt API, D1-Adapter und die unveränderten drei Frontend-Dateien zu einem eigenständigen Worker-ES-Modul unter `dist/server/index.js`. Es gibt keine extern geladenen Anwendungsskripte, keine React-App und keinen Frontend-Build im Browser. `worker/index.js` ist der Einstieg; `scripts/build-worker.mjs` erstellt das Artefakt. Die Datenbank wird ausschließlich durch die versionierten SQL-Migrationen unter `drizzle/` angelegt, niemals während eines API-Aufrufs.

Bei Schemaänderungen `db/schema.ts` bearbeiten, `npm run db:generate` ausführen und erzeugte SQL-/Metadaten prüfen und committen. Angewendete Migrationen sind unveränderlich; Sites wendet neue Migrationen vor der Worker-Veröffentlichung an. GitHub bleibt der Ursprung dieses Repositorys; die Sites-Veröffentlichung erhält einen zusätzlichen, von Sites verwalteten Quellstand.

`PUBLIC_ORIGIN` wird in Sites auf die HTTPS-Adresse der Anwendung gesetzt. Das Frontend liest die API-Origin aus dem Meta-Element `shopping-api-origin` in `index.html`. API-Pfade gehen ausschließlich an diese konfigurierte Origin. Bei getrenntem Frontend werden keine Cookies mitgesendet. Plattform-Cookies werden nur bei gleicher Origin verwendet, damit auch eine private Sites-Veröffentlichung funktioniert. Die Listen-API speichert oder verwendet keine von Sites weitergereichten Nutzeridentitäten. Browser-Schlüssel, Besitzer- und Teilnehmer-Tokens werden niemals als Sites-Umgebungsvariablen benötigt.

Neue Sites starten privat. Eine private Site verlangt den Plattform-Login und ist zunächst nur für den Besitzer erreichbar. Teilen ohne Plattform-Login erfordert eine ausdrücklich freigegebene öffentliche Site; einzelne Listen bleiben durch Tokens und Ende-zu-Ende-Verschlüsselung geschützt. Es wird kein Plattform-Zugangstoken im Browsercode hinterlegt.

`GET /healthz` prüft bei D1 auch, dass die migrierte Tabelle verfügbar ist, und antwortet mit `{ "ok": true, "storage": "d1" }`. Die API veröffentlicht weder SQL-Zugang noch eine Liste vorhandener Freigaben. Größenlimits bleiben unverändert. Die flüchtigen Anfragelimits gelten auf Sites pro Worker-Isolate und sind kein globales, über alle Edge-Standorte koordiniertes Limit.

## Frontend auf sorgenfrey.de oder eigenem Webspace

Die drei Dateien `index.html`, `style.css` und `app.js` können unverändert gemeinsam nach `https://sorgenfrey.de/einkaufsliste/` kopiert werden. In `index.html` steht bereits:

```html
<meta name="shopping-api-origin" content="https://einkaufsliste-sync-f6c82a.sven38419.chatgpt.site">
```

`PUBLIC_ORIGIN` bleibt die Sites-Adresse. Die zusätzliche Sites-Umgebungsvariable `ALLOWED_APP_ORIGINS=https://sorgenfrey.de` erlaubt API-Zugriffe gezielt von deinem Webspace. Weitere Frontend-Origins können bei Bedarf als kommagetrennte vollständige Origins ergänzt werden; ein Pfad gehört nicht in diese Liste. Nicht aufgeführte fremde Origins erhalten keine CORS-Freigabe.

Die API unterstützt OPTIONS-Vorabfragen und gibt ETag und `X-Share-Revision` für zugelassene Frontends frei. Die Berechtigungsprüfung über die geheimen Listentokens bleibt für alle Daten- und Verwaltungsaktionen unverändert erforderlich. Fremde Cookies werden nicht übertragen, und es werden keine Nutzerkonten eingeführt. Private Listen bleiben in der IndexedDB der Frontend-Adresse gespeichert; beim Kopieren neuer Dateien auf denselben Webspace müssen Browserdaten weder gelöscht noch exportiert werden.

Ein noch nicht registrierter Freigabeversuch gegen einen rein statischen Webserver wird beim erneuten Teilen auf die konfigurierte API umgestellt. Listeninhalt, Schlüssel und Einladungskennung bleiben dabei erhalten. Bereits registrierte Freigaben werden aus Sicherheitsgründen nicht still auf einen anderen Backend-Server übertragen. Sicherungen sind an die API-Adresse gebunden, nicht an den Host der Frontend-Dateien.

Die Einladungslinks verwenden weiterhin die Adresse des gerade geöffneten Frontends, einschließlich `/einkaufsliste/`; Empfänger öffnen somit dieselbe App und nutzen deren konfigurierte API. Nach dem Ersetzen der drei Dateien die Seite neu laden. Der Script-Link enthält für diese Änderung eine neue Cache-Kennung.

Für den optionalen eigenen Node.js-/CouchDB-Server kann `shopping-api-origin` auf die eigene API-Origin gesetzt oder für dieselbe Origin leer gelassen werden. `ALLOWED_APP_ORIGINS` wird auch vom Node-Adapter unterstützt. Die Sicherheitsheader des jeweiligen Frontend-Hosts müssen bei eigener CSP die konfigurierte API als `connect-src` erlauben.

## Optionaler eigener Server mit Node.js, CouchDB und HTTPS

Voraussetzungen: Docker Engine mit Compose, eine eigene Domain mit A/AAAA-Eintrag auf den Server und erreichbare Ports 80/443. Das folgende Beispiel ist für einen einzelnen Server vorgesehen.

```sh
cp .env.example .env
# DOMAIN und COUCHDB_USER setzen, COUCHDB_PASSWORD durch ein langes,
# unabhängiges Zufallspasswort ersetzen (z.B. openssl rand -hex 32).
chmod 600 .env
docker compose config --quiet
docker compose up --build -d
```

Caddy beschafft das HTTPS-Zertifikat automatisch. Nur Caddy veröffentlicht Ports. API und CouchDB haben keine Host-Portfreigabe; CouchDB liegt zusätzlich in einem internen Docker-Netz. Für die Datenbank setzt die API `_security` auf Administratorzugriff. CouchDB-Zugangsdaten werden nur den beiden Backend-Containern gegeben und gehören nie in Frontend-Dateien oder Git.

Benannte Volumes behalten CouchDB-Daten und Zertifikate über Container-Neustarts. `docker compose down` behält Volumes; **`down -v` löscht sie**. Für den Betrieb `.env`, CouchDB-Volume und Besitzer-Sicherungen getrennt sichern. Server-Backups enthalten Chiffrate und Berechtigungshashes, keine Entschlüsselungsschlüssel. Die Major-Tags in Compose regelmäßig aktualisieren und für kontrollierte Produktions-Releases auf geprüfte Image-Digests festlegen.

Die API läuft unter einem unprivilegierten Benutzer mit schreibgeschütztem Containerdateisystem. Sie braucht keine npm-Laufzeitabhängigkeiten. `PUBLIC_ORIGIN` ist verpflichtend; im Produktionsmodus sind HTTPS und ein unabhängiges CouchDB-Passwort mit mindestens 32 Zeichen erforderlich; Compose setzt es auf die HTTPS-Domain. `TRUST_PROXY=1` ist nur zulässig, wenn die API ausschließlich über den vorgeschalteten vertrauenswürdigen Proxy erreichbar ist. Caddy setzt die Weiterleitungsheader; die API verwendet die letzte Adresse ausschließlich für flüchtige Anfragelimits.

Für eine lokale Entwicklung gegen eine separat bereitgestellte CouchDB:

```sh
COUCHDB_URL=http://127.0.0.1:5984 \
COUCHDB_USER=shopping_admin COUCHDB_PASSWORD='lokales-testpasswort' \
PUBLIC_ORIGIN=http://127.0.0.1:8080 node server/server.mjs
```

Dann `http://127.0.0.1:8080/` öffnen. Web Crypto ist auf localhost erlaubt; Einladungen zwischen echten Mobiltelefonen benötigen die gemeinsam erreichbare HTTPS-Domain. Bereits geöffnete Apps bleiben bei Verbindungsausfall nutzbar. Der lokale Stand und ausstehende Änderungen bleiben auch über einen Neustart erhalten; das erneute Laden der App-Dateien ohne Netz wird ohne Service Worker nicht garantiert. Es gibt bewusst keinen Hintergrund-Sync.

## Protokoll und Verschlüsselung

Je Freigabe erzeugt der Browser vier voneinander unabhängige 256-Bit-Zufallswerte: öffentliche Serverkennung, AES-Schlüssel, Teilnehmer-Token und Besitzer-Token. Bearer-Tokens werden mit SHA-256 gehasht gespeichert und zeitkonstant verglichen. Durch das Raten einer Kennung erhält man keine Leserechte oder Löschrechte.

Name, Elemente, Typen, Reihenfolge, Häkchen und Konfliktmetadaten werden vollständig im Browser mit AES-256-GCM verschlüsselt. Jede Verschlüsselung verwendet einen neuen zufälligen 96-Bit-IV und einen 128-Bit-Authentifizierungstag. Die Zusatzdaten binden Inhalt an `einkaufsliste/content/1/<Freigabekennung>`, Einladungen an `einkaufsliste/invitation/1/<Freigabekennung>/<Einladungskennung>`.

Eine Einladung hat eigenes Einlösungstoken und eigenen Paketschlüssel. Der QR-Link enthält hinter `#einladung=` nur Freigabekennung, Einladungskennung, Einlösungstoken und Paketschlüssel. Das Fragment wird nicht an den Webserver gesendet. Die API erhält nur den Hash des Einlösungstokens und das mit dem Paketschlüssel verschlüsselte Paket aus Listenschlüssel und Teilnehmer-Token. Das Besitzer-Token wird nie geteilt.

Vor der Einladungseinlösung gibt es auf dem Server nur Metadaten und das verschlüsselte Schlüsselpaket, **keinen Listeninhalt**. Eine gültige atomare Einlösung bestätigt die Aktivierung dauerhaft. Danach darf ausschließlich der Besitzer den ersten Inhalt hochladen. Das Ablaufen oder Ersetzen eines schon eingelösten QR-Codes macht die erfolgte Annahme nicht rückgängig. Abgelaufene, ersetzte oder abgebrochene *unbenutzte* Einladungen können keine Aktivierung auslösen.

Der Empfänger speichert vor dem Einlösen eine zufällige Anfragekennung dauerhaft in IndexedDB und verwendet sie auch beim erneuten Öffnen desselben QR-Links wieder. Nach Antwortverlust liefert derselbe Claim dasselbe Paket, auch nach Ablaufen des QR-Codes. Bereits verbrauchte Einladungen lassen sich mit einer anderen Anfragekennung nicht übernehmen. Bei einem neuen QR-Code oder Abbruch werden erfolgreiche Empfangsbelege für Wiederholungen bis zu 24 Stunden zugelassen. Beim nächsten Verwalten werden abgelaufene Belege entfernt; es bleiben maximal 128 solcher Belege gespeichert. Das sind einmalige Einladungsbelege, keine dauerhaften Gerätekennungen.

## Synchronisierung und Konflikte

IndexedDB-Version 2 erweitert Version 1 um Freigaben, Sync-Metadaten und Einladungen; alte Listen bleiben privat. Lokale Änderung, Konfliktmetadaten und ausstehender Status werden in derselben IndexedDB-Transaktion gespeichert. Auch mehrere Tabs können so keine lokale Änderung blind überschreiben.

Nur die ausgewählte geteilte Liste synchronisiert bei sichtbarer App: 300 ms nach lokalen Änderungen, sonst alle drei Sekunden sowie unmittelbar nach Wiederverbindung oder Rückkehr. Beim Verstecken oder Wechseln werden Anfragen abgebrochen. Fehler verwenden Wiederholungsabstände von drei bis maximal 60 Sekunden.

Die verschlüsselte Struktur verwendet logische Zähler und pro Änderung einen zufälligen Gleichstandsentscheid. Die Geräteuhr entscheidet keine Inhaltskonflikte. Name, Inhalt/Typ pro Element, Checkboxzustand und gemeinsame Reihenfolge sind getrennte Register. Element-IDs vereinigen unabhängige Ergänzungen; verschlüsselte Löschmarker verhindern die Wiederherstellung aus alten Offline-Kopien. Die gewinnende Reihenfolge wird um weitere lebende IDs deterministisch ergänzt. Löschmarker bleiben erhalten und zählen gegen die Größenbegrenzung.

Bedingte Revisionszugriffe über D1 beziehungsweise CouchDB verhindern blindes Überschreiben. `X-Share-Revision` transportiert die unveränderte Datenbankrevision unabhängig von einer durch Proxies oder gzip abgeschwächten ETag-Angabe. Der Client bevorzugt diesen Header und normalisiert alte schwache ETags; die API prüft weiterhin die genaue Datenbankrevision vor jedem Schreiben. Bei 409 liest die App erneut, entschlüsselt, vereinigt mit dem neuesten lokalen Stand und versucht nochmals zu schreiben. Ein Upload bestätigt nur genau den gesendeten Stand. Änderungen währenddessen bleiben ausstehend. Ein unveränderter Klartext wird nicht erneut verschlüsselt und hochgeladen.

## API

Alle Antworten verwenden `Cache-Control: no-store`. Bearer-Tokens stehen ausschließlich im Authorization-Header, nie in Pfad oder Query. Es gibt keine öffentliche Suche nach Freigaben und keine direkte CouchDB-Schnittstelle im Proxy.

| Methode | Pfad | Berechtigung / Verhalten |
| --- | --- | --- |
| POST | `/api/shares` | Besitzer-Token; `{id,memberHash}`, nur Metadaten, idempotent |
| POST | `/api/shares/:id/invitation` | Besitzer; `{id,claimHash,box}`, ersetzt unbenutzte Einladung |
| GET / DELETE | `/api/shares/:id/invitation` | Besitzer; Status oder Abbruch |
| POST | `/api/shares/:id/claim` | Einlösungstoken; `{invitationId,requestId}`, einmalig/idempotent |
| GET | `/api/shares/:id/content` | Besitzer oder Teilnehmer; 202 beim Warten, sonst Chiffrat + ETag |
| PUT | `/api/shares/:id/content` | Erstupload: Besitzer + bestätigte Annahme + `If-None-Match: *`; danach `If-Match: <ETag>` |
| DELETE | `/api/shares/:id` | Nur Besitzer; dauerhaft sperren, idempotent |

Der Sperrmarker bleibt gespeichert; eine alte Freigabekennung kann nicht neu angelegt werden. Falsche Zugangstokens erhalten eine einheitliche 404-Antwort. Alte gültige Zugänge erhalten nach Sperrung 410. Content-Hülle: `{v:1,iv:<base64url>,ct:<base64url>}`. Größenlimits: 2 MiB HTTP-Body, maximal 1.400.000 Base64url-Zeichen im Inhaltschiffrat, 4.096 im Einladungspaket, 10.000 Elemente einschließlich Löschmarkern im entschlüsselten Dokument. Fehler lassen die lokale Kopie bestehen.

Flüchtige Limits pro IP (auf Sites pro Worker-Isolate): 600 API-Anfragen/Minute und 30 neue Freigaben/Stunde; maximal 10.000 flüchtige Limit-Einträge. Diese Grenzen ersetzen bei öffentlichem Betrieb keinen Schutz gegen verteilten Missbrauch. Caddy-Accesslogs sind nicht aktiviert. Die API protokolliert keine Anfrageadressen, Header, Bodies, Schlüssel oder Tokens.

## Prüfung

Node.js 24 und npm sind nur für Backend-Builds, Entwicklung und Prüfungen erforderlich:

```sh
npm ci
npm ci --prefix server
npm run build
npm run validate
npm run check
npm test
```

Die Tests laden exakt den Protokoll-, IndexedDB- und Sync-Code aus `app.js`, verwenden voneinander unabhängige IndexedDB-Instanzen und echte lokale HTTP-Anfragen. Der gebaute Worker wird zusätzlich in Miniflare/workerd mit echter lokaler D1-Emulation geprüft: Migration, atomische Revisionen, parallele Claims, drei unabhängige Browser-Speicher, Wiederherstellung, Sperrung und Auslieferung der Frontend-Dateien. Für den optionalen CouchDB-Betrieb prüft ein begrenzter CouchDB-HTTP-Testadapter den Repository-Vertrag und Revisionkonflikte. **Dieser Adapter ist kein echter CouchDB-Server.** Der Docker-Produktionspfad muss zusätzlich auf einem Docker-berechtigten Host geprüft werden. Ein unabhängiger QR-Decoder prüft den eingebundenen Generator.

Abgedeckt werden unter anderem ausstehende/abgelaufene/abgebrochene Einladungen, erster Upload, parallele Claims, Antwortverlust, drei Geräte, falsche Tokens/Schlüssel und veränderte Chiffrate, Offline-Speicherung, Änderungen während Uploads, Löschmarker, parallele Sortierungen, Tab-Konkurrenz, Sichtbarkeit/Abbruch/Backoff, Sperren/erneutes Teilen und Besitzer-Wiederherstellung.

Prüfstand nach der Sites-Portierung: 33 automatisierte Tests einschließlich echter lokaler Worker-/D1-Emulation, strikte TypeScript-Prüfung und `docker compose --env-file .env.example config --quiet` erfolgreich. Die lokale Browser-Prüfung mit getrennten Ursprüngen bestätigte QR-Annahme, Wartestatus, Änderungen in beide Richtungen, 320/390 Pixel und serverbestätigten Entzug bei erhaltenen lokalen Kopien. Der echte Containerstart konnte mangels Docker-Daemon-Berechtigung nicht durchgeführt werden.

Browser-Smokecheck: private Liste bearbeiten, QR im zweiten Speicher öffnen, Fragmententfernung und Bestätigung prüfen, Wartestatus vor Erstupload, Änderungen in beide Richtungen, 320/390-Pixel-Portrait, 100/150 Prozent, Suche und einklappbare Eingabe. Physische Smartphone-Kamera und reale mobile Chrome-/Safari-/Firefox-Versionen separat prüfen; automatisierte Tests und die lokale Browser-Vorschau ersetzen diese Geräteprüfung nicht.

## Vertrauensgrenzen

Der QR-Code ist ein Zugangsschlüssel: Wer ihn kopiert und zuerst einlöst, kann Zugriff erhalten. Teilnehmer können alles bearbeiten und bereits entschlüsselte Inhalte kopieren. Der Server kann IP-Adressen, Zeitpunkte und Datenmengen technisch sehen; er kennt keine Klartextlisten oder Entschlüsselungsschlüssel. Ein bösartiger Server kann Inhalte zurückhalten oder ältere gültige Chiffrate wiedergeben, aber ohne Schlüssel keine authentischen neuen Klartexte erzeugen. Manipulierter Anwendungscode, Browser-Erweiterungen oder kompromittierte Geräte könnten Schlüssel stehlen. IndexedDB ist durch diese Erweiterung nicht zusätzlich verschlüsselt. Das ist eine technische Umsetzung, keine externe Sicherheitszertifizierung.

QR-Generator: [Project Nayuki, Version 1.8.0](https://github.com/nayuki/QR-Code-generator/tree/v1.8.0/typescript-javascript), MIT-Lizenz im eingebundenen Code in `app.js`. Der ursprüngliche TypeScript-Code wurde strikt geprüft und einmalig als ES2022-JavaScript kompiliert; keine Laufzeitdownloads oder dynamische Codeauswertung.
