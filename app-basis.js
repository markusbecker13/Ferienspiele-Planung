/* app-basis.js — kleine Grundbausteine, die vor der App laufen (Schritt 5b aus index.html ausgelagert):
   Hinweise statt alert(), Dialoge statt confirm()/prompt(), Bibliotheken bei Bedarf, Excel-Formelschutz. */
// Urheberhinweis: einzige Stelle für Name und Jahr (Fußzeile unter der Versionsnummer, „Über die App“ in der Verwaltung)
window.APP_URHEBER = { name: 'Markus Becker', jahr: '2026' };
window.APP_VERSIONEN = window.APP_VERSIONEN || {}; window.APP_VERSIONEN.basis = '2026-11-10-8zi';
/* Ferienspiele-Planung — Konzept und Entwicklung: Markus Becker, 2026 */
/* Sichtbare Versionsnummer (fortlaufend, MAJOR.MINOR.PATCH): siehe VERSIONIERUNG.md.
   PATCH (x.y.+1): Fehler behoben, Texte, kleine Optik.  MINOR (x.+1.0): neue Funktion oder Erweiterung.
   MAJOR (+1.0.0): grosser Umbau, nach dem sich Bedienung oder Anmeldung spuerbar aendern.
   Die lange Kennung (Build) bleibt fuer den Dateiabgleich erhalten. */
window.APP_VERSIONEN.anzeige = '2.5.1';
/* Versionsverlauf (nur fuer Konten-Verwalter sichtbar: Verwaltung -> Versionsverlauf).
   BEI JEDER NEUEN VERSION OBEN EINEN EINTRAG ERGAENZEN. Der Smoke-Test prueft, dass der oberste Eintrag zur Anzeige passt.
   Art: 'neu' (neue Funktion), 'geaendert' (Erweiterung/Aenderung), 'behoben' (Fehler behoben), 'text' (Texte/Anleitung). */
window.APP_VERSIONSVERLAUF = [
  { version: '2.5.1', kennung: '8zi', datum: '2026-11-10', punkte: [
    ['neu', 'Urheberhinweis: \u201e\u00a9 2026 Markus Becker\u201c unter der Versionsnummer, \u201e\u00dcber die App\u201c unten in der Verwaltung, Kopfzeile in allen Quelldateien.'],
  ] },
  { version: '2.5.0', kennung: '8zh', datum: '2026-11-10', punkte: [
    ['neu', 'Zur\u00fcck-Kn\u00f6pfe auch oben: Auf langen Seiten (Verwaltung, Fristen, Sitzungen, Meldungen, Anleitung u. a.) steht oben ein kleiner Zur\u00fcck-Knopf, der beim Scrollen am oberen Rand kleben bleibt. Der Knopf unten bleibt unver\u00e4ndert.'],
  ] },
  { version: '2.4.0', kennung: '8zg', datum: '2026-11-10', punkte: [
    ['neu', 'Warnung im Hinweisbanner der Leitung, wenn die t\u00e4glichen Erinnerungen (Zeitplan) l\u00e4nger als 36 Stunden nicht gelaufen sind.'],
    ['neu', 'Der Server merkt sich dazu den Zeitpunkt des letzten Zeitplan-Laufs (neue kleine Tabelle, keine Inhalte). \u201eErinnerungen jetzt pr\u00fcfen\u201c von Hand z\u00e4hlt dabei nicht.'],
  ] },
  { version: '2.3.0', kennung: '8zf', datum: '2026-11-10', punkte: [
    ['neu', 'Klick auf eine Handy-Benachrichtigung \u00f6ffnet die passende Stelle in der App (Frist, Sitzung, Einladung, Aktion, Meldung, Antwort). Ist die App noch nicht angemeldet, geht es nach der Anmeldung dorthin.'],
    ['geaendert', 'Gemischte Erinnerungen (mehrere Arten in einer Nachricht) und Glocken-Hinweise \u00f6ffnen nur die App, ohne bestimmte Seite.'],
  ] },
  { version: '2.2.0', kennung: '8ze', datum: '2026-11-10', punkte: [
    ['neu', 'Versionsverlauf: Konten-Verwalter sehen unter Verwaltung \u2192 Versionsverlauf, was sich in jeder Version ge\u00e4ndert hat.'],
  ] },
  { version: '2.1.0', kennung: '8zd', datum: '2026-11-10', punkte: [
    ['neu', 'Sichtbare Versionsnummer (Seitenleiste, Startmen\u00fc, Team-Bildschirme), Z\u00e4hlweise MAJOR.MINOR.PATCH.'],
  ] },
  { version: '2.0.0', kennung: '8z8 bis 8zc', datum: '2026-11-10', punkte: [
    ['neu', 'Fristen (nur Admins): Frist mit Datum, Wiederholung, mehreren Vorwarnungen, Zust\u00e4ndigen, Notiz und Link; Erledigt-Haken mit Verlauf.'],
    ['neu', 'Handy-Benachrichtigungen (Push) pro Ger\u00e4t einschaltbar, mit Testnachricht; E-Mail als R\u00fcckfall.'],
    ['neu', 'T\u00e4gliche Erinnerungen gegen 7:30 Uhr: Fristen, Sitzungen (Vortag und Sitzungstag), Aktionen (eine Woche und ein Tag vorher), geb\u00fcndelt zu einer Nachricht pro Person.'],
    ['neu', 'Hinweise aufs Handy bei neuen Glocken-Eintr\u00e4gen, neuen Meldungen (Leitung) und Antworten auf Meldungen (neutral, ohne Inhalt).'],
    ['neu', 'Schalter \u201eErinnerungen zus\u00e4tzlich per E-Mail\u201c pro Person.'],
    ['neu', 'Monatskalender f\u00fcr Admins mit Aktionen, Sitzungen und Fristen; Klick auf einen Tag zeigt die Termine darunter.'],
    ['geaendert', 'Fristen ohne g\u00fcltigen Zust\u00e4ndigen (zum Beispiel nach neu angelegtem Konto) gehen an alle Admins.'],
  ] },
  { version: 'Fr\u00fcherer Verlauf: Sicherheit & Notfall, Zugeh\u00f6rigkeiten', kennung: 'bis 8z7', datum: '2026-11', punkte: [
    ['text', 'Nachtr\u00e4glich rekonstruiert aus den Datenbank-Dateien und Sitzungsnotizen; Datum und Reihenfolge sind Anhaltspunkte, keine Buchf\u00fchrung.'],
    ['neu', 'Pers\u00f6nliche Admin-Konten (Migration 77) mit Ger\u00e4teverwaltung, Konten-Verwalter, Protokoll; Datenschutzhinweis mit Kenntnisnahme (78).'],
    ['neu', 'Zugeh\u00f6rigkeiten (79), Oberaktionen (80), PIN-Zur\u00fccksetzen (81), Namenssuche in der Kartei.'],
    ['neu', 'Kinder: Foto-/Video-Zwecke einzeln (82).'],
    ['neu', 'Sicherheit & Notfall: Seiten f\u00fcr das Team, Meldungen (anonym oder mit Namen), Ma\u00dfnahmenplan, Krisenmodus, Risiko-/Potenzialanalyse, L\u00f6schfristen.'],
    ['geaendert', 'Stabilit\u00e4t und Bedienung \u00fcberarbeitet (Schritte 1\u20133, Nov. 2026), Smoke-Test f\u00fcr die Oberfl\u00e4che eingef\u00fchrt; Schriften und Bibliotheken lokal statt \u00fcber CDN.'],
  ] },
  { version: 'Fr\u00fcherer Verlauf: Herbst 2026', kennung: 'Sep\u2013Okt', datum: '2026-09', punkte: [
    ['text', 'Nachtr\u00e4glich rekonstruiert (siehe oben).'],
    ['neu', 'Spiele (69), Quittung mit Unterschrift und E-Mail (70), Geburtsdatum (71) und Vertragsdokumente (72) beim Personal, E-Mail bei Admin-Benachrichtigung (73).'],
    ['neu', 'Dokumente (67/68), offizieller Aktionszeitraum mit Uhrzeit (65/66), Verleih: Vertrags-E-Mail und Artikelgeb\u00fchren (63/64), R\u00fcckgabezustand (75).'],
    ['neu', 'Abrechnung f\u00fcr die Stadt (Generator und Handreichung, Okt.), Kalender-Auswahl und Export (Okt.).'],
    ['geaendert', 'Sicherheitspr\u00fcfung (Audit 13.09.) und Rechte f\u00fcr Dokumente/Spiele (74); Entwurf f\u00fcr eine generische Vereinsversion (76).'],
  ] },
  { version: 'Fr\u00fcherer Verlauf: Ende August 2026', kennung: 'Aug', datum: '2026-08', punkte: [
    ['text', 'Nachtr\u00e4glich rekonstruiert (siehe oben).'],
    ['neu', 'Verleih (52\u201354, 59\u201362), Sitzungen mit Tagesordnung, Anhang und Protokoll (55\u201357), Service Worker und Manifest (App installierbar).'],
    ['neu', 'Newsletter (50/51), Elternzugang pro Aktion (49), Dashboard-Kacheln (46), Aufgabenlisten (44/45), Stundenlohn (47), L\u00f6schfristen in Monaten (48).'],
    ['neu', 'PIN f\u00fcr Personen (28) mit Pepper (42), Personalbedarf (29), Terminanfragen (30/31), globale Einstellungen (32), Feedback (33\u201335), Glocke (36/37), E-Mail-Vorlagen (38/39), Foto-/Video-Einwilligung (41).'],
    ['neu', 'Grundstock (19.08.): Kinder, Gruppen pro Woche, Umfragen, L\u00e4usekontrolle, Hinweise, Personal mit Gehalt und Nachweisen, Fehlversuch-Sperren, Aktionsprotokoll (01\u201327), Mehrfach-Aktionen.'],
  ] },
];
(function(){
  function setzeVersion(){
    try{
      var v = window.APP_VERSIONEN || {};
      document.querySelectorAll('[data-app-version]').forEach(function(el){ el.textContent = 'Version ' + v.anzeige; el.title = 'Build ' + v.basis;
        var u = window.APP_URHEBER || {};
        if(u.name && !(el.nextElementSibling && el.nextElementSibling.classList.contains('app-urheber'))){
          var z = document.createElement('div'); z.className = 'app-urheber'; z.textContent = '\u00a9 ' + u.jahr + ' ' + u.name;
          el.parentNode.insertBefore(z, el.nextSibling);
        }
      });
      document.querySelectorAll('[data-app-ueber]').forEach(function(el){
        var u = window.APP_URHEBER || {};
        if(u.name) el.textContent = '\u00dcber die App: Konzept und Entwicklung: ' + u.name + '. Technische Umsetzung mit KI-Unterst\u00fctzung (Claude, Anthropic).';
      });
    }catch(e){}
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setzeVersion); else setzeVersion();
})();

/* Nicht blockierende Hinweise statt alert()-Popups (Schritt 3d, Etappe 1).
   alert() bleibt als Name erhalten, zeigt aber eine Einblendung unten:
   Klick schliesst sie, Fehlermeldungen bleiben laenger. */
(function(){
  var nativ = window.alert ? window.alert.bind(window) : null;
  var box = null, letzte = {t:'', zeit:0};
  var FEHLER = /fehl|konnte nicht|nicht gespeichert|NICHT|ung\u00fcltig|abgebrochen|unterschiedlich/i;
  function holeBox(){
    if(box && box.isConnected) return box;
    if(!document.body) return null;
    box = document.createElement('div'); box.id = 'hinweisBox';
    box.setAttribute('role','status'); box.setAttribute('aria-live','polite');
    document.body.appendChild(box); return box;
  }
  window.alert = function(msg){
    var text = String(msg === undefined ? '' : msg);
    var b = holeBox();
    if(!b){ if(nativ) nativ(text); return; }
    var jetzt = Date.now();
    if(text === letzte.t && jetzt - letzte.zeit < 1500) return;
    letzte = {t:text, zeit:jetzt};
    var istFehler = FEHLER.test(text);
    var el = document.createElement('div');
    el.className = 'hinweis' + (istFehler ? ' fehler' : '');
    if(istFehler) el.setAttribute('role','alert');
    el.textContent = text;
    var x = document.createElement('span'); x.className='hinweis-x'; x.textContent='\u00d7'; x.setAttribute('aria-label','Schlie\u00dfen');
    el.appendChild(x);
    var weg = function(){ if(el.parentNode) el.parentNode.removeChild(el); };
    el.addEventListener('click', weg);
    while(b.children.length >= 4) b.removeChild(b.firstChild);
    b.appendChild(el);
    var dauer = Math.min(25000, Math.max(istFehler ? 10000 : 5000, 3000 + text.length * 60));
    setTimeout(weg, dauer);
  };
})();

/* Eigene Dialoge statt confirm()/prompt() (Schritt 3d, Etappe 2).
   bestaetigen(text, {ok, abbrechen, gefahr}) -> Promise<boolean>
   eingabe(text, vorgabe)                     -> Promise<string|null>  (null = abgebrochen)
   Escape / Klick daneben = Abbrechen. Bei Loesch-Fragen hat "Abbrechen" den Fokus. */
(function(){
  var offen = null;
  function bauen(text, mitFeld, vorgabe, opt){
    return new Promise(function(fertig){
      var vorher = document.activeElement;
      var ov = document.createElement('div'); ov.id='dlgOverlay';
      var d = document.createElement('div'); d.className='dlg'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal','true');
      var p = document.createElement('p'); p.className='dlg-text'; p.textContent = String(text); d.appendChild(p);
      var feld = null;
      if(mitFeld){ feld = document.createElement('input'); feld.type='text'; feld.value = vorgabe || ''; d.appendChild(feld); }
      var kn = document.createElement('div'); kn.className='dlg-knoepfe';
      var abbr = document.createElement('button'); abbr.type='button'; abbr.className='btn ghost'; abbr.textContent = opt.abbrechen;
      var ok = document.createElement('button'); ok.type='button'; ok.className='btn' + (opt.gefahr ? ' gefahr' : ''); ok.textContent = opt.ok;
      kn.appendChild(abbr); kn.appendChild(ok); d.appendChild(kn); ov.appendChild(d);
      function zu(wert){
        document.removeEventListener('keydown', taste, true);
        if(ov.parentNode) ov.parentNode.removeChild(ov);
        offen = null;
        try{ if(vorher && vorher.focus) vorher.focus(); }catch(e){}
        fertig(wert);
      }
      function taste(e){
        if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); zu(mitFeld ? null : false); }
        else if(e.key === 'Enter' && mitFeld && document.activeElement === feld){ e.preventDefault(); zu(feld.value); }
        else if(e.key === 'Tab'){
          var f = Array.prototype.slice.call(d.querySelectorAll('input,button'));
          var i = f.indexOf(document.activeElement);
          if(e.shiftKey && i <= 0){ e.preventDefault(); f[f.length-1].focus(); }
          else if(!e.shiftKey && i === f.length-1){ e.preventDefault(); f[0].focus(); }
        }
      }
      abbr.addEventListener('click', function(){ zu(mitFeld ? null : false); });
      ok.addEventListener('click', function(){ zu(mitFeld ? feld.value : true); });
      ov.addEventListener('mousedown', function(e){ if(e.target === ov) zu(mitFeld ? null : false); });
      document.addEventListener('keydown', taste, true);
      document.body.appendChild(ov); offen = ov;
      (feld || (opt.gefahr ? abbr : ok)).focus();
      if(feld) feld.select();
    });
  }
  function standardTexte(text, opt){
    opt = opt || {};
    var t = String(text);
    var gefahr = opt.gefahr !== undefined ? opt.gefahr : /l\u00f6sch|unwiderruflich|entfern/i.test(t);
    var okText = opt.ok || (/zur\u00fccksetzen/i.test(t) ? 'Zur\u00fccksetzen' : /widerruf/i.test(t) ? 'Widerrufen' : /l\u00f6sch/i.test(t) ? 'L\u00f6schen' : /entfern/i.test(t) ? 'Entfernen' : /verschick|senden|Mail/i.test(t) ? 'Senden' : 'OK');
    return {ok: okText, abbrechen: opt.abbrechen || 'Abbrechen', gefahr: gefahr};
  }
  window.bestaetigen = function(text, opt){ return bauen(text, false, '', standardTexte(text, opt)); };
  window.eingabe = function(text, vorgabe){ return bauen(text, true, vorgabe, {ok:'OK', abbrechen:'Abbrechen', gefahr:false}); };
})();

/* Bibliotheken erst bei Bedarf laden (Schritt 4): SheetJS (Excel), jsPDF (PDF), mammoth (Word-Vorschau).
   ladeBibliothek('xlsx'|'jspdf'|'mammoth') -> Promise; mehrfach aufrufbar, laedt jede Datei nur einmal. */
(function(){
  var DATEI = {xlsx:'vendor/xlsx.full.min.js', jspdf:'vendor/jspdf.umd.min.js', mammoth:'vendor/mammoth.browser.min.js'};
  var PRUEF = {xlsx:function(){return !!window.XLSX;}, jspdf:function(){return !!(window.jspdf && window.jspdf.jsPDF);}, mammoth:function(){return !!window.mammoth;}};
  var laufend = {};
  window.ladeBibliothek = function(name){
    if(!DATEI[name]) return Promise.reject(new Error('Unbekannte Bibliothek: '+name));
    if(PRUEF[name]()){ if(name==='xlsx' && window.xlsxSchutzAktivieren) window.xlsxSchutzAktivieren(); return Promise.resolve(); }
    if(laufend[name]) return laufend[name];
    laufend[name] = new Promise(function(ok, fehler){
      var sk = document.createElement('script');
      sk.src = DATEI[name];
      sk.onload = function(){
        if(name==='xlsx' && window.xlsxSchutzAktivieren) window.xlsxSchutzAktivieren();
        ok();
      };
      sk.onerror = function(){
        delete laufend[name]; if(sk.parentNode) sk.parentNode.removeChild(sk);
        fehler(new Error('Eine benötigte Programmdatei konnte nicht geladen werden. Bitte Internetverbindung prüfen und erneut versuchen.'));
      };
      document.head.appendChild(sk);
    });
    return laufend[name];
  };
})();

// SICHERHEITS-FIX (Audit 08/2026, Finding 4): Schutz gegen CSV/Excel-
// Formel-Injection. Freitextfelder (Kindernamen, Notizen, Team-Hinweise,
// Feedback-Antworten, ...) landen unverändert in Excel-Exporten. Beginnt
// so ein Wert mit =, +, - oder @ (bzw. Tab/CR), interpretieren Excel/
// LibreOffice ihn beim Öffnen als Formel — potenziell mit Codeausführung
// (z.B. DDE/HYPERLINK-Angriffe). Zentral hier an EINER Stelle behoben,
// statt an jeder einzelnen aoa_to_sheet()-Aufrufstelle im Code: das
// SheetJS-Original wird einmalig umschlossen (Wrapper), sodass jede
// bestehende und künftige Export-Funktion automatisch geschützt ist.
window.xlsxSchutzAktivieren = function () {
  if (!window.XLSX || !XLSX.utils || typeof XLSX.utils.aoa_to_sheet !== 'function') return;
  if (XLSX.utils.aoa_to_sheet.__geschuetzt) return; // nur einmal umschliessen
  const originalAoaToSheet = XLSX.utils.aoa_to_sheet;
  function entschaerfeZelle(wert) {
    if (typeof wert !== 'string') return wert;
    if (/^[=+\-@\t\r]/.test(wert)) return "'" + wert; // führendes Apostroph erzwingt Text statt Formel
    return wert;
  }
  XLSX.utils.aoa_to_sheet = function (rows, opts) {
    const entschaerfteRows = Array.isArray(rows)
      ? rows.map(row => Array.isArray(row) ? row.map(entschaerfeZelle) : row)
      : rows;
    return originalAoaToSheet.call(XLSX.utils, entschaerfteRows, opts);
  };
  XLSX.utils.aoa_to_sheet.__geschuetzt = true;
};
