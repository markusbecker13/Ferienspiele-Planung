/* app-basis.js — kleine Grundbausteine, die vor der App laufen (Schritt 5b aus index.html ausgelagert):
   Hinweise statt alert(), Dialoge statt confirm()/prompt(), Bibliotheken bei Bedarf, Excel-Formelschutz. */
window.APP_VERSIONEN = window.APP_VERSIONEN || {}; window.APP_VERSIONEN.basis = '2026-11-09-8y';

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
