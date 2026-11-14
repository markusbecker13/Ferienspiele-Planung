# CLAUDE.md – Ferienspiele-Planung (AWO Jugendwerk Erftstadt)

Diese Datei wird von Claude Code bei jedem Start gelesen. Sie fasst die festen Regeln des Projekts zusammen.
Quelle: Projektwissen/Gedächtnis (Stand 14.11.2026). Bei Widerspruch zum tatsächlichen Code gilt der Code – und Markus bekommt einen Hinweis.

## Projekt

- Webapp „Ferienspiele-Planung" für den AWO Jugendwerk Erftstadt: Ferienspiele, Tagesfahrten, Wochenendfahrten, interne Events; Anmeldungen, Team, Verleih, Sitzungen, Newsletter, Fristen, Statistik, Dokumente, Spielekartei.
- Entwickler/Admin: Markus Becker (ehrenamtlicher Geschäftsführer). Ideen von ihm, Code mit KI. Urheberhinweis „© Markus Becker" in App und Quelltext-Kopfzeilen beibehalten. Keine Lizenzaussage in der App.
- Die App läuft **nicht** unter der Marke „zwischenkaffeeundchaos".
- Sprache: **Deutsch** für alles (App-Texte, Variablennamen, SQL-Kommentare, Doku, Antworten). Kompakt und entscheidungsfreudig antworten.
- Markus arbeitet ausschließlich unter Kubuntu Linux. Keine Windows-/Mac-only-Werkzeuge vorschlagen.

## Architektur

- Frontend: Vanilla JS/HTML (`index.html`, `app.js`, `app-basis.js`, `style.css`, `service-worker.js`, `manifest.json`), gehostet auf GitHub Pages (Repo `markusbecker13/Ferienspiele-Planung`).
- Backend: Deno/TypeScript-Edge-Function auf Supabase (Projekt `qfgqmznpgnluocpxwrgh`). Dateiname im Repo bitte prüfen (`index.ts` bzw. `eltern-portal_index_*.ts`).
- Datenbank: PostgreSQL (Supabase), fortlaufend nummerierte SQL-Migrationen.
- E-Mail: Resend, Domain `awo-jugendwerk-erftstadt-planung.org` (Cloudflare-DNS).
- Bibliotheken lokal eingebunden (kein Google Fonts/CDN): jsPDF, SheetJS, mammoth.js, pptxgenjs.
- Rollen: Admin (persönliche Konten, Konten-Verwalter = Markus), Team (Gemeinschaftspasswort + persönliche PIN), Eltern (Gemeinschaftspasswort, Zugriffsschranke pro Aktion), Mitglieder (Gemeinschaftspasswort + PIN).
- Datenzugriff: Tabellen für anon/authenticated gesperrt (RLS an), **alle Zugriffe laufen über die Edge Function**. Zustand pro Aktion in `aktion_state` (JSONB) mit optimistischer Sperre über die Spalte `version` (409 bei Konflikt).

## Oberste Regel: Datenschutz

- Alles mit DSGVO im Hintergrund. Datenschutz und Datensicherheit haben oberste Priorität.
- **Keine Gesundheits- und Notfalldaten** (Allergien, Medikamente, Notfallkontakte) erfassen. Solche Felder nie vorschlagen.
- Keine echten Personen-/Kinderdaten, Exporte, Datenbank-Dumps oder Schlüssel ins Repo. `.env`, Service-Role-Key, VAPID-Schlüssel, `PIN_PEPPER` u. ä. stehen in `.gitignore`.
- Sicherheitsmerkmale nicht abschwächen: zeitkonstanter Passwortvergleich, allgemeine Fehlermeldungen an Clients, HMAC-PIN-Hashing mit Pepper, signierter `personToken` (16 h), 8-MB-PDF-Limit (Client und Server).
- Offene Datenschutzthemen liegen beim Datenschutzbeauftragten (Fragenliste in `claude/Fragenliste_Datenschutzbeauftragter_KOMPLETT.md`). Nichts als „datenschutzrechtlich geklärt" darstellen.

## Deployment (Reihenfolge ist unveränderlich)

1. SQL-Migration
2. Edge Function (komplett ersetzen, nicht teilweise)
3. Frontend (`index.html` und zugehörige Dateien)

Nie überspringen oder umdrehen.

- Migrationsnummern sind fortlaufend und werden **nie wiederverwendet**. Ist eine Migration schon eingespielt, kommt für Folgeänderungen eine neue Nummer.
- Edge Function wird derzeit über das Supabase-Dashboard eingespielt (nicht per CLI), Frontend über GitHub (bisher Web-Upload). Umstellung auf CLI/Git-Push nur nach Absprache mit Markus.
- Vor dem Test prüfen, dass die eingespielten Dateien zur beabsichtigten Version passen (bisher per MD5 gegen die Raw-GitHub-URL; Dateiverwechslungen sind schon mehrfach vorgekommen).
- Frontend-Pakete für Markus **nur als ZIP** liefern, nicht zusätzlich die Einzeldateien.
- Zu größeren Ausgaben (Recherche, Auswertungen) immer zusätzlich eine `.md`-Datei zum Herunterladen.

## Prüfung vor jeder Lieferung

- TypeScript: `tsc --noEmit` (Deno-spezifische Fehlalarme herausfiltern).
- Frontend-JS: `node --check` auf jeder JS-Datei bzw. auf dem extrahierten `<script>`-Block.
- Smoke-Test: `smoke-test-ui.js` (und `smoke-test.js`, falls vorhanden) ausführen. Er prüft u. a., dass der oberste Versionsverlauf-Eintrag zur sichtbaren Nummer passt.
- Markus testet auf Samsung-Handybrowser und Firefox Desktop und bestätigt jede Funktion kurz („super", „funktioniert", „erledigt"), bevor es weitergeht.

## Versionierung (Details: `VERSIONIERUNG.md`)

- Sichtbare Version MAJOR.MINOR.PATCH steht in `app-basis.js` (`window.APP_VERSIONEN.anzeige`).
- Bei jeder Änderung: neuen Eintrag oben in `window.APP_VERSIONSVERLAUF` (`app-basis.js`) und Tabelle in `VERSIONIERUNG.md` ergänzen.
- Lange Build-Kennung zusätzlich an 4 Stellen: `index.html` (meta app-version), `app.js`, `app-basis.js`, Cache-Name in `service-worker.js`.
- PATCH = Fehler/Texte/Optik, MINOR = neue Funktion, MAJOR = großer Umbau mit spürbarer Änderung für alle.
- Versionsverlauf in der App ist nur für Konten-Verwalter sichtbar.

## Bekannte technische Stolperfallen

- **z-index:** Neue Overlays/Dialoge brauchen `z-index: 1000+`, sonst liegen sie unter `.lockscreen` (999) und sind unsichtbar.
- **Lockscreen-Elemente** immer mit `display: 'grid'` einblenden, nie `'flex'`.
- **personId/teamPersonId:** Team-Aktionen dürfen `personId` nicht als Feld für aktionsinterne IDs nutzen (überschreibt das automatisch gesetzte `teamPersonId` für `requireAktionZugriff`). Eigene Feldnamen verwenden (`vfPersonId`, `antwortPersonId` …).
- **TDZ:** Variablen, die beim Start über `unlockApp()` (Auto-Login/localStorage) gelesen werden, ganz oben im Skript deklarieren.
- Es gibt keine „quick-worker"-Funktion; E-Mail-Versand läuft direkt in der `eltern-portal`-Edge-Function.

## Arbeitsweise

- Funktionen werden **erst besprochen und geklärt, dann gebaut**. Rückfragen vorab stellen.
- Nach jeder Session pflegen, ohne Aufforderung: `Bedienungsanleitung_App.md`, Planungsliste (`Planungsliste_Ferienspiele-Planung.md`), `App_Architektur_Uebersicht.md` (bei Architekturänderung) und eine Session-Zusammenfassung als `.md` für die Projektübergabe.
- Unsicheres klar benennen statt raten. Rechtliche, steuerliche und datenschutzrechtliche Aussagen als Faktenlage zur eigenen Entscheidung formulieren und auf fachliche Absicherung (Datenschutzbeauftragter) hinweisen.

## Aktueller Stand (bitte beim Start gegen den Code prüfen)

- Live laut Projektwissen: persönliche Admin-Konten mit Protokoll, Fristen-Modul, Handy-Benachrichtigungen/Erinnerungen, Foto-Erlaubnis pro Zweck, Versionsverlauf. Aktuelle Version laut `VERSIONIERUNG.md`: 2.5.2 (Stand 11.11.2026).
- In Arbeit/geplant: Bereich Beschwerde-/Feedback-/Risiko-/Sicherheits-/Notfall-/Krisenmanagement; Auslöser für Benachrichtigungen (Paket 3); Abschalten des alten Admin-Gemeinschaftspassworts (Schritt E, nach Test auf Android/iPhone).
- Zu klären mit Datenschutzbeauftragtem: Löschfristen, E-Mail-Speicherung Team, Resend-AV-Vertrag/Region, Umzug der Konten (Supabase/Resend/GitHub) in die Organisation des Jugendwerks.
