  // ==========================================================
  // WICHTIG: Diese URL nach dem Deployment der Edge Function
  // aus dem Supabase-Dashboard eintragen (siehe SETUP.md).
  // Beispiel: https://xxxxxxxx.supabase.co/functions/v1/aufgaben-api
  // ==========================================================
  const API_URL = "https://juxoxltaeugsmtvirfcm.supabase.co/functions/v1/bright-endpoint";

  let token = localStorage.getItem("aufgaben-token") || "";
  let projekte = [];
  let aufgaben = [];
  let termine = [];
  let notizen = [];
  let links = [];
  let reflexionen = [];
  let einkaufsliste = [];
  let verlauf = [];
  let ziele = [];
  let zielSchritte = [];
  let planTyp = "woche";
  let planAnker = new Date();
  let zielExpandiert = new Set();
  let calMonat = new Date(); // aktuell angezeigter Monat im Kalender
  let calAusgewaehlterTag = null; // "YYYY-MM-DD" oder null
  let calBearbeiteterTermin = null; // id des gerade bearbeiteten Termins oder null
  let blockzeiten = [];
  let tagesrahmen = [];
  let fixkosten = [];
  let sonderausgaben = [];
  let buchungen = [];
  let finanzEinstellungen = [];
  let finTyp = "fixkosten"; // "fixkosten" | "sonderausgaben"
  let finBearbeitetesFixkosten = null; // id oder null
  let finBearbeiteteSonderausgabe = null; // id oder null
  let finBearbeiteteBuchung = null; // id oder null
  let buchungTypAusgewaehlt = "ausgabe"; // "ausgabe" | "einnahme"
  let buchungKategorieAusgewaehlt = "Lebensmittel";
  const FIN_KAT_AUSGABE = ["Lebensmittel", "Tanken", "Hygiene", "Haus", "Sonstiges"];
  const FIN_KAT_EINNAHME = ["Gehalt", "Rückerstattung", "Geschenk", "Sonstiges"];
  let finBuchMonat = new Date().getMonth() + 1;
  let finBuchJahr = new Date().getFullYear();
  let finUebJahr = new Date().getFullYear();
  let finUebersichtDaten = null; // Cache der letzten API-Antwort
  const CSV_DATUM_SPALTEN = ["Buchungstag", "Valuta", "Datum", "Valutadatum"];
  const CSV_BETRAG_SPALTEN = ["Betrag", "Umsatz", "Betrag (EUR)"];
  const CSV_PARTNER_SPALTEN = ["Zahler/Empfänger", "Auftraggeber/Empfänger", "Empfänger/Zahlungspflichtiger", "Name Zahlungsbeteiligter"];
  const CSV_ZWECK_SPALTEN = ["Verwendungszweck", "Buchungstext"];
  const FIN_MONATE = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "dez"];
  const FIN_MONATSNAMEN_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  let wetterOrt = localStorage.getItem("wetter-ort") || "Erftstadt";
  let wetterDaten = null; // letzte erfolgreiche Antwort vom Server
  let wetterLetzterAbruf = 0; // Timestamp (ms), für einfaches Caching
  const WETTER_CACHE_MS = 30 * 60 * 1000; // 30 Minuten

  async function api(action, extra = {}) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, token, ...extra }),
    });
    if (res.status === 401) {
      localStorage.removeItem("aufgaben-token");
      token = "";
      zeigeLogin("Bitte erneut anmelden.");
      throw new Error("unauthorized");
    }
    if (res.status === 429) {
      const daten = await res.json().catch(() => ({}));
      zeigeLogin(daten.error || "Zu viele Fehlversuche. Bitte kurz warten.");
      throw new Error("rate-limited");
    }
    if (!res.ok) {
      const daten = await res.json().catch(() => ({}));
      throw new Error(daten.error || "Serverfehler");
    }
    return res.json();
  }

  function zeigeLogin(fehler) {
    document.getElementById("app").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("login-error").textContent = fehler || "";
  }

  function zeigeApp() {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    dashboardNameAnzeigen();
    untertitelAnzeigen();
  }

  function dashboardNameAnzeigen() {
    const gespeichert = localStorage.getItem("dashboard-name");
    document.getElementById("brand-name").textContent = gespeichert || "Dashboard";
  }

  window.dashboardNameBearbeiten = function() {
    const aktuell = localStorage.getItem("dashboard-name") || "Dashboard";
    const neu = prompt("Wie soll dein Dashboard heißen?", aktuell);
    if (neu === null || !neu.trim()) return;
    localStorage.setItem("dashboard-name", neu.trim());
    dashboardNameAnzeigen();
  };

  function untertitelAnzeigen() {
    const gespeichert = localStorage.getItem("dashboard-untertitel");
    document.getElementById("brand-sub").textContent = gespeichert || "Aufgaben";
  }

  window.untertitelBearbeiten = function() {
    const aktuell = localStorage.getItem("dashboard-untertitel") || "Aufgaben";
    const neu = prompt("Welcher Untertitel soll neben dem Namen stehen?", aktuell);
    if (neu === null) return;
    localStorage.setItem("dashboard-untertitel", neu.trim());
    untertitelAnzeigen();
  };

  document.getElementById("login-btn").addEventListener("click", anmelden);
  document.getElementById("login-pass").addEventListener("keydown", (e) => {
    if (e.key === "Enter") anmelden();
  });

  document.getElementById("btn-abmelden").addEventListener("click", async () => {
    try {
      await api("logout");
    } catch (e) {
      // Logout soll auch funktionieren, wenn die Session schon ungültig war
    }
    localStorage.removeItem("aufgaben-token");
    token = "";
    document.getElementById("login-pass").value = "";
    zeigeLogin();
  });

  async function anmelden() {
    const eingegebenesPass = document.getElementById("login-pass").value;
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", pass: eingegebenesPass }),
      });
      const daten = await res.json();
      if (!res.ok) {
        zeigeLogin(daten.error || "Anmeldung fehlgeschlagen.");
        return;
      }
      token = daten.token;
      localStorage.setItem("aufgaben-token", token);
      await ladeDaten();
      zeigeApp();
    } catch (e) {
      zeigeLogin("Verbindung fehlgeschlagen.");
    }
  }

  function heuteISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function addTage(datumISO, tage) {
    const d = new Date(datumISO + "T00:00:00");
    d.setDate(d.getDate() + tage);
    return d.toISOString().slice(0, 10);
  }

  function enrich(a) {
    const heute = heuteISO();
    let status = "normal";
    if (a.faellig_am) {
      if (a.faellig_am < heute) status = "ueberfaellig";
      else if (a.faellig_am === heute) status = "heute";
    }
    const erinnerungFaellig = !!(a.naechste_erinnerung && a.naechste_erinnerung <= heute);
    return { ...a, status, erinnerungFaellig };
  }

  async function ladeDaten() {
    const data = await api("liste");
    projekte = data.projekte || [];
    aufgaben = data.aufgaben || [];
    termine = data.termine || [];
    notizen = data.notizen || [];
    links = data.links || [];
    reflexionen = data.reflexionen || [];
    einkaufsliste = data.einkaufsliste || [];
    verlauf = data.verlauf || [];
    ziele = data.ziele || [];
    zielSchritte = data.ziel_schritte || [];
    blockzeiten = data.blockzeiten || [];
    tagesrahmen = data.tagesrahmen || [];
    fixkosten = data.fixkosten || [];
    sonderausgaben = data.sonderausgaben || [];
    buchungen = data.buchungen || [];
    finanzEinstellungen = data.finanz_einstellungen || [];
    render();
    renderKalender();
    renderHeute();
    ladeWetter();
    renderNotizen();
    renderLinks();
    renderReflexionen();
    renderExport();
    renderEinkauf();
    renderVerlauf();
    renderPlanung();
    renderBlockzeiten();
  }

  function badgeHtml(cls, text) {
    return `<span class="badge ${cls}">${text}</span>`;
  }

  function taskHtml(a, done) {
    const projekt = projekte.find((p) => p.id === a.projekt_id);
    let meta = "";
    if (done && projekt) meta += badgeHtml("", projekt.name);
    if (!done && a.faellig_am) {
      const start = a.uhrzeit ? a.uhrzeit.slice(0,5) : "";
      const zeitZusatz = start ? " · " + start + (a.ende_uhrzeit ? "–" + a.ende_uhrzeit.slice(0,5) : "") : "";
      if (a.status === "ueberfaellig") meta += badgeHtml("overdue", "überfällig · " + a.faellig_am + zeitZusatz);
      else if (a.status === "heute") meta += badgeHtml("today", "heute fällig" + zeitZusatz);
      else meta += badgeHtml("", "fällig " + a.faellig_am + zeitZusatz);
    } else if (!done && a.uhrzeit) {
      meta += badgeHtml("", a.uhrzeit.slice(0,5) + (a.ende_uhrzeit ? "–" + a.ende_uhrzeit.slice(0,5) : "") + " Uhr");
    }
    if (!done && a.erinnere_alle_tage) meta += badgeHtml("reminder", "alle " + a.erinnere_alle_tage + " Tage");

    const snoozeBtn = !done && a.erinnerungFaellig
      ? `<button class="task-snooze" onclick="erinnerungVerschieben('${a.id}')" title="Später erneut erinnern">↻</button>`
      : "";

    return `
      <div class="task ${!done ? a.status : ""}">
        <button class="task-check ${done ? "done" : ""}" onclick="umschalten('${a.id}')">${done ? "✓" : ""}</button>
        <div class="task-info">
          <span class="task-titel ${done ? "done" : ""}">${escapeHtml(a.titel)}</span>
          <div class="task-meta">${meta}</div>
        </div>
        ${snoozeBtn}
        <button class="task-delete" onclick="loeschen('${a.id}')">×</button>
      </div>`;
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function render() {
    const select = document.getElementById("aufgabe-projekt");
    select.innerHTML = '<option value="">Ohne Projekt</option>' +
      projekte.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");

    const offen = aufgaben.filter((a) => !a.erledigt).map(enrich);
    const erledigt = aufgaben.filter((a) => a.erledigt);

    const sortiere = (liste) => [...liste].sort((a, b) => {
      const ad = a.faellig_am || "9999-99-99";
      const bd = b.faellig_am || "9999-99-99";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return b.erstellt_am < a.erstellt_am ? -1 : 1;
    });

    const ohneProjekt = sortiere(offen.filter((a) => !a.projekt_id));
    const gruppen = projekte
      .map((p) => ({ projekt: p, liste: sortiere(offen.filter((a) => a.projekt_id === p.id)) }))
      .filter((g) => g.liste.length > 0);

    let html = "";
    if (ohneProjekt.length > 0) {
      html += `<div class="project-heading">Ohne Projekt</div><div class="task-list">${ohneProjekt.map((a) => taskHtml(a, false)).join("")}</div>`;
    }
    for (const g of gruppen) {
      html += `<div class="project-heading">${escapeHtml(g.projekt.name)} <button class="project-edit-btn" onclick="projektUmbenennen('${g.projekt.id}')" title="Projekt umbenennen">✎</button></div><div class="task-list">${g.liste.map((a) => taskHtml(a, false)).join("")}</div>`;
    }
    if (ohneProjekt.length === 0 && gruppen.length === 0) {
      html = '<p class="empty-text">Keine offenen Aufgaben — gut gemacht.</p>';
    }
    document.getElementById("listen-bereich").innerHTML = html;

    const erledigtBereich = document.getElementById("erledigt-bereich");
    if (erledigt.length > 0) {
      erledigtBereich.innerHTML = `
        <button class="link-btn" id="toggle-erledigt">▸ Erledigt (${erledigt.length})</button>
        <div class="task-list hidden" id="erledigt-liste" style="margin-top:0.6rem;">
          ${erledigt.map((a) => taskHtml(a, true)).join("")}
        </div>`;
      document.getElementById("toggle-erledigt").addEventListener("click", (e) => {
        const liste = document.getElementById("erledigt-liste");
        liste.classList.toggle("hidden");
        e.target.textContent = (liste.classList.contains("hidden") ? "▸" : "▾") + ` Erledigt (${erledigt.length})`;
      });
    } else {
      erledigtBereich.innerHTML = "";
    }
  }

  document.getElementById("btn-hinzufuegen").addEventListener("click", aufgabeHinzufuegen);
  document.getElementById("neue-aufgabe").addEventListener("keydown", (e) => {
    if (e.key === "Enter") aufgabeHinzufuegen();
  });

  async function aufgabeHinzufuegen() {
    const titel = document.getElementById("neue-aufgabe").value.trim();
    if (!titel) return;
    const projekt_id = document.getElementById("aufgabe-projekt").value || null;
    const faellig_am = document.getElementById("aufgabe-faellig").value || null;
    const uhrzeit = document.getElementById("aufgabe-uhrzeit").value || null;
    const ende_uhrzeit = document.getElementById("aufgabe-ende").value || null;
    const erinnere_alle_tage = document.getElementById("aufgabe-intervall").value || null;

    await api("aufgabe_hinzufuegen", { titel, projekt_id, faellig_am, uhrzeit, ende_uhrzeit, erinnere_alle_tage });
    document.getElementById("neue-aufgabe").value = "";
    document.getElementById("aufgabe-faellig").value = "";
    document.getElementById("aufgabe-uhrzeit").value = "";
    document.getElementById("aufgabe-ende").value = "";
    document.getElementById("aufgabe-intervall").value = "";
    await ladeDaten();
  }

  document.getElementById("toggle-projekt-form").addEventListener("click", (e) => {
    const form = document.getElementById("projekt-form");
    form.classList.toggle("hidden");
    e.target.textContent = (form.classList.contains("hidden") ? "▸" : "▾") + " Neues Projekt anlegen";
  });

  document.getElementById("btn-projekt-anlegen").addEventListener("click", projektAnlegen);
  document.getElementById("neues-projekt").addEventListener("keydown", (e) => {
    if (e.key === "Enter") projektAnlegen();
  });

  async function projektAnlegen() {
    const name = document.getElementById("neues-projekt").value.trim();
    if (!name) return;
    await api("projekt_hinzufuegen", { name });
    document.getElementById("neues-projekt").value = "";
    await ladeDaten();
  }

  window.projektUmbenennen = async function(id) {
    const projekt = projekte.find((p) => p.id === id);
    if (!projekt) return;
    const neuerName = prompt("Neuer Projektname:", projekt.name);
    if (!neuerName || !neuerName.trim() || neuerName.trim() === projekt.name) return;
    try {
      await api("projekt_umbenennen", { id, name: neuerName.trim() });
      await ladeDaten();
    } catch (e) {
      alert("Umbenennen fehlgeschlagen – existiert der Name schon?");
    }
  };

  async function umschalten(id) {
    await api("aufgabe_umschalten", { id });
    await ladeDaten();
  }

  async function loeschen(id) {
    await api("aufgabe_loeschen", { id });
    await ladeDaten();
  }

  async function erinnerungVerschieben(id) {
    await api("erinnerung_verschieben", { id });
    await ladeDaten();
  }

  // Beim Start: automatisch anmelden, falls Token schon gespeichert
  (async function init() {
    if (token) {
      try {
        await ladeDaten();
        zeigeApp();

        // Falls wir gerade von Googles OAuth-Login zurückkommen
        // (URL enthält ?code=...), den Code gegen ein Google-Token
        // tauschen und die URL danach wieder säubern.
        const urlParams = new URLSearchParams(location.search);
        const googleCode = urlParams.get("code");
        if (googleCode) {
          try {
            await api("google_auth_callback", { code: googleCode });
            alert("Google-Kalender erfolgreich verbunden.");
          } catch (e) {
            alert("Google-Verbindung fehlgeschlagen: " + e.message);
          }
          history.replaceState({}, "", location.pathname);
        }

        // Falls über eine App-Verknüpfung mit ?tab=... geöffnet wurde
        // (z.B. Android-Schnellzugriff "Neue Notiz"), direkt dorthin springen.
        const gewuenschterTab = new URLSearchParams(location.search).get("tab");
        if (gewuenschterTab && document.getElementById("tab-" + gewuenschterTab)) {
          tabWechseln(gewuenschterTab);
        }
        return;
      } catch (e) {
        // Passwort ungültig geworden -> Login zeigen
      }
    }
    zeigeLogin();
  })();

  // Google-Kalender-Sync: Verbinden/Trennen. Vorläufig als einfache
  // Funktionen, bekommen in einer späteren Etappe eine richtige
  // Oberfläche mit Status-Anzeige im Kalender-Tab.
  window.googleVerbinden = async function() {
    try {
      const { url } = await api("google_auth_start");
      location.href = url;
    } catch (e) {
      alert("Konnte Google-Login nicht starten: " + e.message);
    }
  };

  window.googleTrennen = async function() {
    if (!confirm("Google-Kalender-Verknüpfung wirklich entfernen?")) return;
    try {
      await api("google_disconnect");
      alert("Google-Kalender-Verknüpfung entfernt.");
    } catch (e) {
      alert("Fehler beim Trennen: " + e.message);
    }
  };

  window.googleStatusAnzeigen = async function() {
    try {
      const status = await api("google_status");
      alert(status.verbunden
        ? "Verbunden seit: " + status.verbunden_seit
        : "Nicht verbunden.");
    } catch (e) {
      alert("Fehler: " + e.message);
    }
  };

  window.googleSyncJetzt = async function() {
    try {
      const ergebnis = await api("google_sync");
      alert(`Sync fertig: ${ergebnis.erstellt} neu, ${ergebnis.aktualisiert} aktualisiert, ${ergebnis.geloescht} gelöscht.`);
      await ladeDaten();
      render();
    } catch (e) {
      alert("Sync fehlgeschlagen: " + e.message);
    }
  };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // ==========================================================
  // Tabs
  // ==========================================================
  function tabWechseln(aktiv) {
    const tabs = { heute: "tab-heute", aufgaben: "tab-aufgaben", kalender: "tab-kalender", frei: "tab-frei", notizen: "tab-notizen", links: "tab-links", reflexion: "tab-reflexion", export: "tab-export", einkauf: "tab-einkauf", verlauf: "tab-verlauf", planung: "tab-planung", finanzen: "tab-finanzen" };
    const views = { heute: "view-heute", aufgaben: "view-aufgaben", kalender: "view-kalender", frei: "view-frei", notizen: "view-notizen", links: "view-links", reflexion: "view-reflexion", export: "view-export", einkauf: "view-einkauf", verlauf: "view-verlauf", planung: "view-planung", finanzen: "view-finanzen" };
    for (const key in tabs) {
      document.getElementById(tabs[key]).classList.toggle("active", key === aktiv);
      document.getElementById(views[key]).classList.toggle("hidden", key !== aktiv);
    }
    if (aktiv === "kalender") renderKalender();
    if (aktiv === "heute") renderHeute();
    if (aktiv === "planung") renderPlanung();
    if (aktiv === "frei") renderFrei();
    if (aktiv === "finanzen") renderFinanzen();
  }
  document.getElementById("tab-heute").addEventListener("click", () => tabWechseln("heute"));
  document.getElementById("tab-aufgaben").addEventListener("click", () => tabWechseln("aufgaben"));
  document.getElementById("tab-kalender").addEventListener("click", () => tabWechseln("kalender"));
  document.getElementById("tab-frei").addEventListener("click", () => tabWechseln("frei"));
  document.getElementById("tab-notizen").addEventListener("click", () => tabWechseln("notizen"));
  document.getElementById("tab-links").addEventListener("click", () => tabWechseln("links"));
  document.getElementById("tab-reflexion").addEventListener("click", () => tabWechseln("reflexion"));
  document.getElementById("tab-export").addEventListener("click", () => tabWechseln("export"));
  document.getElementById("tab-einkauf").addEventListener("click", () => tabWechseln("einkauf"));
  document.getElementById("tab-verlauf").addEventListener("click", () => tabWechseln("verlauf"));
  document.getElementById("tab-planung").addEventListener("click", () => tabWechseln("planung"));
  document.getElementById("tab-finanzen").addEventListener("click", () => tabWechseln("finanzen"));

  // ==========================================================
  // Wetter (Start-Tab)
  // ==========================================================
  // WMO-Wettercodes (von Open-Meteo) grob zusammengefasst.
  const WETTER_CODES = {
    0: ["☀️", "Klar"], 1: ["🌤️", "Meist klar"], 2: ["⛅", "Teilweise bewölkt"], 3: ["☁️", "Bedeckt"],
    45: ["🌫️", "Nebel"], 48: ["🌫️", "Reifnebel"],
    51: ["🌦️", "Leichter Nieselregen"], 53: ["🌦️", "Nieselregen"], 55: ["🌦️", "Starker Nieselregen"],
    61: ["🌧️", "Leichter Regen"], 63: ["🌧️", "Regen"], 65: ["🌧️", "Starker Regen"],
    71: ["🌨️", "Leichter Schneefall"], 73: ["🌨️", "Schneefall"], 75: ["❄️", "Starker Schneefall"],
    80: ["🌦️", "Regenschauer"], 81: ["🌧️", "Kräftiger Regenschauer"], 82: ["⛈️", "Heftiger Regenschauer"],
    95: ["⛈️", "Gewitter"], 96: ["⛈️", "Gewitter mit Hagel"], 99: ["⛈️", "Starkes Gewitter mit Hagel"],
  };
  function wetterCodeInfo(code) {
    return WETTER_CODES[code] || ["🌡️", "Unbekannt"];
  }
  const WETTER_WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  async function ladeWetter(erzwingen = false) {
    const jetzigerOrt = wetterOrt;
    if (!erzwingen && wetterDaten && Date.now() - wetterLetzterAbruf < WETTER_CACHE_MS) {
      renderWetter();
      return;
    }
    document.getElementById("wetter-bereich").innerHTML = `<div class="wetter-karte wetter-laedt">Wetter wird geladen …</div>`;
    try {
      const daten = await api("wetter_abrufen", { ort: jetzigerOrt });
      // Falls der Ort zwischenzeitlich geändert wurde, veraltete Antwort verwerfen.
      if (jetzigerOrt !== wetterOrt) return;
      wetterDaten = daten;
      wetterLetzterAbruf = Date.now();
      renderWetter();
    } catch (fehler) {
      document.getElementById("wetter-bereich").innerHTML =
        `<div class="wetter-karte wetter-fehler">Wetter konnte nicht geladen werden (${escapeHtml(fehler.message || "Fehler")}).
         <button class="link-btn" onclick="ladeWetter(true)">Erneut versuchen</button></div>`;
    }
  }

  function renderWetter() {
    if (!wetterDaten) return;
    const [aktIcon, aktText] = wetterCodeInfo(wetterDaten.aktueller_code);
    const tage = (wetterDaten.tage || []).slice(0, 5).map((t) => {
      const [icon] = wetterCodeInfo(t.code);
      const datum = new Date(t.datum + "T00:00:00");
      const wochentag = WETTER_WOCHENTAGE[datum.getDay()];
      return `
        <div class="wetter-tag">
          <span class="wetter-tag-name">${wochentag}</span>
          <span class="wetter-tag-icon">${icon}</span>
          <span class="wetter-tag-max">${Math.round(t.max)}°</span>
          <span class="wetter-tag-min">${Math.round(t.min)}°</span>
        </div>`;
    }).join("");

    document.getElementById("wetter-bereich").innerHTML = `
      <div class="wetter-karte">
        <div class="wetter-kopf">
          <div class="wetter-jetzt">
            <span class="wetter-jetzt-icon">${aktIcon}</span>
            <span class="wetter-jetzt-temp">${Math.round(wetterDaten.aktuelle_temperatur)}°</span>
            <span class="wetter-jetzt-text">${aktText}</span>
          </div>
          <div class="wetter-ort-zeile">
            <span>${escapeHtml(wetterDaten.ort_gefunden || wetterOrt)}</span>
            <button class="project-edit-btn" onclick="wetterOrtBearbeiten()" title="Ort ändern">✎</button>
          </div>
        </div>
        <div class="wetter-tage">${tage}</div>
      </div>`;
  }

  window.wetterOrtBearbeiten = function () {
    const neu = prompt("Ort für die Wettervorhersage:", wetterOrt);
    if (neu === null) return;
    const bereinigt = neu.trim();
    if (!bereinigt || bereinigt === wetterOrt) return;
    wetterOrt = bereinigt;
    localStorage.setItem("wetter-ort", wetterOrt);
    ladeWetter(true);
  };

  function renderHeute() {
    const heuteIso = heuteISO();
    const offenEnriched = aufgaben.filter((a) => !a.erledigt).map(enrich);
    const faelligHeute = offenEnriched.filter((a) => a.status === "ueberfaellig" || a.status === "heute");
    const erinnerungenHeute = offenEnriched.filter((a) => a.erinnerungFaellig);
    const termineGanztags = termine
      .filter((t) => t.datum === heuteIso && !t.uhrzeit)
      .sort((a, b) => a.titel.localeCompare(b.titel));
    const einkaufOffen = einkaufsliste.filter((e) => !e.erledigt);

    const jetztDate = new Date();
    const jetztMinuten = jetztDate.getHours() * 60 + jetztDate.getMinutes();
    const jetztLabel = String(jetztDate.getHours()).padStart(2,"0") + ":" + String(jetztDate.getMinutes()).padStart(2,"0");
    const heuteWtIndex = wochentagIndex(jetztDate);
    const rahmen = freiRahmenFuerWochentag(heuteWtIndex);
    const heuteEintraege = freiTagEintraege(heuteIso, heuteWtIndex);

    let html = "";

    if (termineGanztags.length > 0) {
      html += `<div class="jetzt-naechster" style="margin-top:0;">Ganztägig: <strong>${termineGanztags.map((t) => escapeHtml(t.titel)).join(", ")}</strong></div>`;
    }

    // ---- Jetzt-Zeitleiste ----
    if (rahmen.aktiv && heuteEintraege) {
      const rStart = zeitZuMinuten(rahmen.start_zeit);
      const rEnde = zeitZuMinuten(rahmen.end_zeit);
      const spanne = Math.max(1, rEnde - rStart);
      const segmente = heuteEintraege.map((e) => {
        const s = Math.max(rStart, zeitZuMinuten(e.start));
        const en = Math.min(rEnde, zeitZuMinuten(e.ende));
        if (en <= s) return "";
        const breite = ((en - s) / spanne) * 100;
        const art = e.art === "frei" ? "frei" : (e.art === "erledigt" ? "erledigt" : "belegt");
        return `<div class="jetzt-segment ${art}" style="width:${breite}%;" title="${e.start}–${e.ende}${e.titel ? " · " + escapeHtml(e.titel) : ""}"></div>`;
      }).join("");
      const markerPos = Math.min(100, Math.max(0, ((jetztMinuten - rStart) / spanne) * 100));
      const markerSichtbar = jetztMinuten >= rStart && jetztMinuten <= rEnde;

      const naechsterTermin = heuteEintraege.find((e) => e.typ === "Termin" && e.art !== "erledigt" && zeitZuMinuten(e.ende) > jetztMinuten);

      html += `
        <div class="jetzt-leiste-wrap">
          <div class="jetzt-leiste-kopf">
            <span class="jetzt-leiste-titel">Heute</span>
            <span class="jetzt-leiste-zeit">${jetztLabel} Uhr</span>
          </div>
          <div class="jetzt-leiste" onclick="heuteFreiOeffnen()" style="cursor:pointer;">
            ${segmente}
            ${markerSichtbar ? `<div class="jetzt-marker" style="left:${markerPos}%;"></div>` : ""}
          </div>
          <div class="jetzt-leiste-labels"><span>${rahmen.start_zeit}</span><span>${rahmen.end_zeit}</span></div>
          <div class="jetzt-naechster">${naechsterTermin ? `Nächster Termin: <strong>${naechsterTermin.start} · ${escapeHtml(naechsterTermin.titel)}</strong>` : "Kein weiterer Termin heute."}</div>
        </div>`;
    }

    // ---- Kacheln ----
    const TYP_LABEL = { woche: "Woche", monat: "Monat", jahr: "Jahr" };
    const aktuelleZiele = ["woche", "monat", "jahr"].flatMap((typ) => {
      const startIso = dateToISO(periodStart(typ, new Date()));
      return ziele.filter((z) => z.zeitraum_typ === typ && z.zeitraum_start === startIso);
    });

    const aufgabenZahl = faelligHeute.length + erinnerungenHeute.length;

    html += `<div class="start-kachel-grid">
      <button class="start-kachel mod-aufgaben" onclick="tabWechseln('aufgaben')">
        <span class="start-kachel-zahl">${aufgabenZahl}</span>
        <span class="start-kachel-label">${aufgabenZahl === 1 ? "Aufgabe fällig" : "Aufgaben fällig"}</span>
      </button>
      <button class="start-kachel mod-planung" onclick="tabWechseln('planung')">
        <span class="start-kachel-zahl">${aktuelleZiele.length}</span>
        <span class="start-kachel-label">aktive Ziele</span>
      </button>
      <button class="start-kachel mod-einkauf" onclick="tabWechseln('einkauf')">
        <span class="start-kachel-zahl">${einkaufOffen.length}</span>
        <span class="start-kachel-label">${einkaufOffen.length === 1 ? "Artikel offen" : "Artikel offen"}</span>
      </button>
    </div>`;

    if (aktuelleZiele.length > 0) {
      html += `<div class="project-heading">Ziele</div><div class="ziel-kachel-grid">` +
        aktuelleZiele.map((z) => {
          const schritte = zielSchritte.filter((s) => s.ziel_id === z.id);
          const erledigtCount = schritte.filter((s) => s.erledigt).length;
          return `
            <button class="ziel-kachel" onclick="zielKachelKlick('${z.id}')">
              <span class="ziel-kachel-typ">${TYP_LABEL[z.zeitraum_typ]}</span>
              <span class="ziel-kachel-titel">${escapeHtml(z.titel)}</span>
              <span class="ziel-kachel-fortschritt">${schritte.length > 0 ? erledigtCount + " / " + schritte.length + " Schritte" : "keine Schritte"}</span>
            </button>`;
        }).join("") +
        `</div>`;
    }

    if (termineGanztags.length === 0 && !(rahmen.aktiv && heuteEintraege) && aufgabenZahl === 0 && einkaufOffen.length === 0 && aktuelleZiele.length === 0) {
      html = '<p class="empty-text">Nichts Dringendes für heute — guter Tag.</p>';
    }

    document.getElementById("heute-bereich").innerHTML = html;
  }

  // ==========================================================
  // Kalender
  // ==========================================================
  const MONATSNAMEN = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  const TAGLABEL = ["Mo","Di","Mi","Do","Fr","Sa","So"];

  function dateToISO(d) {
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }

  function termineAmTag(isoDatum) {
    return termine.filter((t) => t.datum === isoDatum).sort((a,b) => (a.uhrzeit||"99:99").localeCompare(b.uhrzeit||"99:99"));
  }

  document.getElementById("cal-prev").addEventListener("click", () => {
    calMonat.setMonth(calMonat.getMonth() - 1);
    renderKalender();
  });
  document.getElementById("cal-next").addEventListener("click", () => {
    calMonat.setMonth(calMonat.getMonth() + 1);
    renderKalender();
  });

  function renderKalender() {
    document.getElementById("cal-monat-label").textContent =
      MONATSNAMEN[calMonat.getMonth()] + " " + calMonat.getFullYear();

    const jahr = calMonat.getFullYear();
    const monat = calMonat.getMonth();
    const ersterTag = new Date(jahr, monat, 1);
    const anzahlTage = new Date(jahr, monat + 1, 0).getDate();
    // Montag = 0 ... Sonntag = 6
    const startOffset = (ersterTag.getDay() + 6) % 7;
    const heuteIso = dateToISO(new Date());

    let html = TAGLABEL.map((l) => `<div class="cal-daylabel">${l}</div>`).join("");
    for (let i = 0; i < startOffset; i++) html += `<div class="cal-day empty"></div>`;

    for (let tag = 1; tag <= anzahlTage; tag++) {
      const iso = dateToISO(new Date(jahr, monat, tag));
      const anzahl = termineAmTag(iso).length;
      const classes = ["cal-day"];
      if (iso === heuteIso) classes.push("today");
      if (iso === calAusgewaehlterTag) classes.push("selected");
      html += `<div class="${classes.join(" ")}" onclick="calTagAuswaehlen('${iso}')">
        <span>${tag}</span>
        ${anzahl > 0 ? '<span class="dot"></span>' : ""}
      </div>`;
    }
    document.getElementById("cal-grid").innerHTML = html;

    renderUpcoming();
    renderCalDayPanel();
  }

  function renderUpcoming() {
    const heuteIso = dateToISO(new Date());
    const kommende = termine
      .filter((t) => t.datum >= heuteIso)
      .sort((a,b) => (a.datum + (a.uhrzeit||"99:99")).localeCompare(b.datum + (b.uhrzeit||"99:99")))
      .slice(0, 5);

    if (kommende.length === 0) {
      document.getElementById("upcoming-bereich").innerHTML = "";
      return;
    }
    const html = kommende.map((t) => `
      <div class="upcoming-item">
        <span class="upcoming-datum">${formatDatumKurz(t.datum)}${t.uhrzeit ? " · " + t.uhrzeit.slice(0,5) + (t.ende_uhrzeit ? "–" + t.ende_uhrzeit.slice(0,5) : "") : ""}</span>
        <span>${escapeHtml(t.titel)}</span>
      </div>`).join("");
    document.getElementById("upcoming-bereich").innerHTML =
      `<div class="project-heading">Nächste Termine</div><div class="upcoming-list">${html}</div>`;
  }

  function formatDatumKurz(iso) {
    const [j,m,t] = iso.split("-");
    return t + "." + m + ".";
  }

  window.calTagAuswaehlen = function(iso) {
    calAusgewaehlterTag = (calAusgewaehlterTag === iso) ? null : iso;
    renderKalender();
  };

  function renderCalDayPanel() {
    const panel = document.getElementById("cal-day-panel");
    if (!calAusgewaehlterTag) { panel.innerHTML = ""; return; }

    const liste = termineAmTag(calAusgewaehlterTag);
    const [j,m,t] = calAusgewaehlterTag.split("-");
    const titel = `${t}. ${MONATSNAMEN[parseInt(m,10)-1]} ${j}`;

    // Falls der gerade bearbeitete Termin nicht mehr auf diesem Tag ist
    // (z.B. Tag gewechselt), Bearbeitungsmodus verlassen.
    const bearbeiteterTermin = calBearbeiteterTermin
      ? liste.find((t) => t.id === calBearbeiteterTermin)
      : null;
    if (calBearbeiteterTermin && !bearbeiteterTermin) calBearbeiteterTermin = null;

    const itemsHtml = liste.length === 0
      ? `<p class="empty-text" style="margin:0 0 0.6rem;">Noch keine Termine an diesem Tag.</p>`
      : liste.map((t) => `
          <div class="termin-item">
            <span class="termin-zeit">${t.uhrzeit ? t.uhrzeit.slice(0,5) + (t.ende_uhrzeit ? "–" + t.ende_uhrzeit.slice(0,5) : "") : ""}</span>
            <span class="termin-titel">${escapeHtml(t.titel)}${t.notiz ? `<span class="termin-notiz">${escapeHtml(t.notiz)}</span>` : ""}</span>
            <button class="task-snooze" onclick="terminBearbeitenStart('${t.id}')" title="Bearbeiten">✎</button>
            <button class="task-delete" onclick="terminLoeschen('${t.id}')">×</button>
          </div>`).join("");

    const formTitel = bearbeiteterTermin ? "Termin bearbeiten" : "";
    const buttonLabel = bearbeiteterTermin ? "Speichern" : "Eintragen";
    const abbrechenHtml = bearbeiteterTermin
      ? `<button class="btn-secondary" id="btn-termin-abbrechen">Abbrechen</button>`
      : "";

    panel.innerHTML = `
      <div class="cal-day-panel">
        <h3>${titel}</h3>
        ${itemsHtml}
        ${formTitel ? `<div class="project-heading" style="margin:1rem 0 0.4rem;">${formTitel}</div>` : ""}
        <div class="termin-form">
          <input type="text" id="termin-titel" placeholder="Titel" value="${bearbeiteterTermin ? escapeAttr(bearbeiteterTermin.titel) : ""}">
          <input type="time" id="termin-uhrzeit" style="width:8rem;" title="Beginn (optional)" value="${bearbeiteterTermin && bearbeiteterTermin.uhrzeit ? bearbeiteterTermin.uhrzeit.slice(0,5) : ""}">
          <input type="time" id="termin-ende" style="width:8rem;" title="Ende (optional)" value="${bearbeiteterTermin && bearbeiteterTermin.ende_uhrzeit ? bearbeiteterTermin.ende_uhrzeit.slice(0,5) : ""}">
          <input type="text" id="termin-notiz" placeholder="Notiz (optional)" value="${bearbeiteterTermin && bearbeiteterTermin.notiz ? escapeAttr(bearbeiteterTermin.notiz) : ""}">
          <button class="btn-primary" id="btn-termin-hinzufuegen">${buttonLabel}</button>
          ${abbrechenHtml}
        </div>
      </div>`;

    document.getElementById("btn-termin-hinzufuegen").addEventListener("click", bearbeiteterTermin ? terminAktualisieren : terminHinzufuegen);
    document.getElementById("termin-titel").addEventListener("keydown", (e) => {
      if (e.key === "Enter") (bearbeiteterTermin ? terminAktualisieren : terminHinzufuegen)();
    });
    if (bearbeiteterTermin) {
      document.getElementById("btn-termin-abbrechen").addEventListener("click", () => {
        calBearbeiteterTermin = null;
        renderCalDayPanel();
      });
    }
  }

  window.terminBearbeitenStart = function(id) {
    calBearbeiteterTermin = id;
    renderCalDayPanel();
  };

  async function terminHinzufuegen() {
    const titel = document.getElementById("termin-titel").value.trim();
    if (!titel || !calAusgewaehlterTag) return;
    const uhrzeit = document.getElementById("termin-uhrzeit").value || null;
    const ende_uhrzeit = document.getElementById("termin-ende").value || null;
    const notiz = document.getElementById("termin-notiz").value.trim() || null;

    await api("termin_hinzufuegen", { titel, datum: calAusgewaehlterTag, uhrzeit, ende_uhrzeit, notiz });
    await ladeDaten();
    renderKalender();
  }

  async function terminAktualisieren() {
    const id = calBearbeiteterTermin;
    const titel = document.getElementById("termin-titel").value.trim();
    if (!titel || !id) return;
    const uhrzeit = document.getElementById("termin-uhrzeit").value || null;
    const ende_uhrzeit = document.getElementById("termin-ende").value || null;
    const notiz = document.getElementById("termin-notiz").value.trim() || null;

    await api("termin_aktualisieren", { id, titel, uhrzeit, ende_uhrzeit, notiz });
    calBearbeiteterTermin = null;
    await ladeDaten();
    renderKalender();
  }

  window.terminLoeschen = async function(id) {
    if (calBearbeiteterTermin === id) calBearbeiteterTermin = null;
    await api("termin_loeschen", { id });
    await ladeDaten();
    renderKalender();
  };

  // ==========================================================
  // Blockzeiten ("nicht stören" – wiederkehrend oder einmalig)
  // ==========================================================
  let blockzeitBearbeiteterId = null;

  document.getElementById("toggle-blockzeit-form").addEventListener("click", (e) => {
    const form = document.getElementById("blockzeit-form");
    form.classList.toggle("hidden");
    e.target.textContent = (form.classList.contains("hidden") ? "▸" : "▾") + " Neue Blockzeit anlegen";
  });

  document.querySelectorAll('input[name="blockzeit-art"]').forEach((radio) => {
    radio.addEventListener("change", blockzeitArtUmschalten);
  });

  function blockzeitArtUmschalten() {
    const wiederkehrend = document.getElementById("blockzeit-art-wiederkehrend").checked;
    document.getElementById("blockzeit-wochentage-row").classList.toggle("hidden", !wiederkehrend);
    document.getElementById("blockzeit-datum-row").classList.toggle("hidden", wiederkehrend);
  }

  function renderBlockzeitWochentage() {
    const row = document.getElementById("blockzeit-wochentage-row");
    row.innerHTML = TAGLABEL.map((label, i) => `
      <label style="display:flex; align-items:center; gap:0.25rem; font-size:0.82rem;">
        <input type="checkbox" class="blockzeit-wochentag-cb" value="${i}"> ${label}
      </label>`).join("");
  }
  renderBlockzeitWochentage();

  document.getElementById("btn-blockzeit-anlegen").addEventListener("click", blockzeitSpeichern);
  document.getElementById("btn-blockzeit-abbrechen").addEventListener("click", blockzeitFormZuruecksetzen);

  function blockzeitFormZuruecksetzen() {
    blockzeitBearbeiteterId = null;
    document.getElementById("blockzeit-titel").value = "";
    document.getElementById("blockzeit-start").value = "";
    document.getElementById("blockzeit-ende").value = "";
    document.getElementById("blockzeit-notiz").value = "";
    document.getElementById("blockzeit-datum").value = "";
    document.getElementById("blockzeit-art-wiederkehrend").checked = true;
    document.querySelectorAll(".blockzeit-wochentag-cb").forEach((cb) => { cb.checked = false; });
    blockzeitArtUmschalten();
    document.getElementById("btn-blockzeit-anlegen").textContent = "Anlegen";
    document.getElementById("btn-blockzeit-abbrechen").classList.add("hidden");
  }

  window.blockzeitBearbeitenStart = function(id) {
    const b = blockzeiten.find((bb) => bb.id === id);
    if (!b) return;
    blockzeitBearbeiteterId = id;
    document.getElementById("blockzeit-form").classList.remove("hidden");
    document.getElementById("toggle-blockzeit-form").textContent = "▾ Neue Blockzeit anlegen";
    document.getElementById("blockzeit-titel").value = b.titel;
    document.getElementById("blockzeit-start").value = b.start_zeit ? b.start_zeit.slice(0,5) : "";
    document.getElementById("blockzeit-ende").value = b.end_zeit ? b.end_zeit.slice(0,5) : "";
    document.getElementById("blockzeit-notiz").value = b.notiz || "";
    document.querySelectorAll(".blockzeit-wochentag-cb").forEach((cb) => { cb.checked = false; });
    if (b.datum) {
      document.getElementById("blockzeit-art-einmalig").checked = true;
      document.getElementById("blockzeit-datum").value = b.datum;
    } else {
      document.getElementById("blockzeit-art-wiederkehrend").checked = true;
      document.querySelectorAll(".blockzeit-wochentag-cb").forEach((cb) => {
        cb.checked = (b.wochentage || []).includes(parseInt(cb.value, 10));
      });
    }
    blockzeitArtUmschalten();
    document.getElementById("btn-blockzeit-anlegen").textContent = "Speichern";
    document.getElementById("btn-blockzeit-abbrechen").classList.remove("hidden");
    document.getElementById("blockzeit-titel").scrollIntoView({ behavior: "smooth", block: "center" });
  };

  async function blockzeitSpeichern() {
    const titel = document.getElementById("blockzeit-titel").value.trim();
    const start_zeit = document.getElementById("blockzeit-start").value;
    const end_zeit = document.getElementById("blockzeit-ende").value;
    if (!titel || !start_zeit || !end_zeit) return;

    const wiederkehrend = document.getElementById("blockzeit-art-wiederkehrend").checked;
    let wochentage = null;
    let datum = null;
    if (wiederkehrend) {
      wochentage = Array.from(document.querySelectorAll(".blockzeit-wochentag-cb:checked")).map((cb) => parseInt(cb.value, 10));
      if (wochentage.length === 0) { alert("Bitte mindestens einen Wochentag auswählen."); return; }
    } else {
      datum = document.getElementById("blockzeit-datum").value;
      if (!datum) { alert("Bitte ein Datum auswählen."); return; }
    }
    const notiz = document.getElementById("blockzeit-notiz").value.trim() || null;

    if (blockzeitBearbeiteterId) {
      await api("blockzeit_aktualisieren", { id: blockzeitBearbeiteterId, titel, start_zeit, end_zeit, wochentage, datum, notiz });
    } else {
      await api("blockzeit_hinzufuegen", { titel, start_zeit, end_zeit, wochentage, datum, notiz });
    }
    blockzeitFormZuruecksetzen();
    await ladeDaten();
  }

  window.blockzeitLoeschen = async function(id) {
    if (blockzeitBearbeiteterId === id) blockzeitFormZuruecksetzen();
    await api("blockzeit_loeschen", { id });
    await ladeDaten();
  };

  function blockzeitWiederholungText(b) {
    if (b.datum) return "einmalig · " + formatDatumKurz(b.datum);
    if (b.wochentage && b.wochentage.length > 0) {
      const sortiert = [...b.wochentage].sort((x, y) => x - y);
      return sortiert.map((i) => TAGLABEL[i]).join(", ");
    }
    return "";
  }

  function renderBlockzeiten() {
    const bereich = document.getElementById("blockzeiten-liste");
    if (blockzeiten.length === 0) {
      bereich.innerHTML = '<p class="empty-text">Noch keine Blockzeiten.</p>';
      return;
    }
    const sortiert = [...blockzeiten].sort((a, b) => (a.start_zeit || "").localeCompare(b.start_zeit || ""));
    bereich.innerHTML = sortiert.map((b) => `
      <div class="termin-item">
        <span class="termin-zeit">${b.start_zeit ? b.start_zeit.slice(0,5) : ""}${b.end_zeit ? "–" + b.end_zeit.slice(0,5) : ""}</span>
        <span class="termin-titel">${escapeHtml(b.titel)}<span class="termin-notiz">${blockzeitWiederholungText(b)}${b.notiz ? " · " + escapeHtml(b.notiz) : ""}</span></span>
        <button class="task-snooze" onclick="blockzeitBearbeitenStart('${b.id}')" title="Bearbeiten">✎</button>
        <button class="task-delete" onclick="blockzeitLoeschen('${b.id}')">×</button>
      </div>`).join("");
  }

  // ==========================================================
  // Frei – Zeitleiste mit Lücken-Berechnung
  //
  // Was blockiert Zeit:
  // - Termine MIT Uhrzeit (ganztägige Termine ohne Uhrzeit nicht)
  // - offene Aufgaben MIT Uhrzeit (erledigte nicht)
  // - Blockzeiten (wiederkehrend oder einmalig)
  // Fehlt bei einem Termin/einer Aufgabe die Endzeit, werden
  // pauschal 30 Minuten ab Beginn blockiert.
  // Ist für einen Wochentag noch kein Zeitrahmen gespeichert,
  // wird 08:00–20:00 als Vorschlag angezeigt (erst gültig, wenn
  // du auf "Speichern" tippst).
  // ==========================================================
  const WOCHENTAGSNAMEN = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
  let freiTag = new Date();
  let freiAusgewaehlteLuecke = null;
  let freiFormularTyp = "termin";
  let freiBearbeiteterTermin = null;
  let freiBearbeiteteAufgabe = null;

  function wochentagIndex(d) {
    return (d.getDay() + 6) % 7; // 0=Mo … 6=So
  }
  function zeitZuMinuten(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }
  function minutenZuZeit(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  document.getElementById("frei-prev").addEventListener("click", () => {
    freiTag.setDate(freiTag.getDate() - 1);
    freiFormularSchliessen();
    renderFrei();
  });
  document.getElementById("frei-next").addEventListener("click", () => {
    freiTag.setDate(freiTag.getDate() + 1);
    freiFormularSchliessen();
    renderFrei();
  });
  document.getElementById("btn-frei-rahmen-speichern").addEventListener("click", freiRahmenSpeichern);

  function freiRahmenFuerWochentag(wtIndex) {
    const eintrag = tagesrahmen.find((r) => r.wochentag === wtIndex);
    if (eintrag) {
      return { start_zeit: eintrag.start_zeit.slice(0,5), end_zeit: eintrag.end_zeit.slice(0,5), aktiv: eintrag.aktiv };
    }
    return { start_zeit: "08:00", end_zeit: "20:00", aktiv: true }; // Vorschlag, noch nicht gespeichert
  }

  async function freiRahmenSpeichern() {
    const wochentag = wochentagIndex(freiTag);
    const start_zeit = document.getElementById("frei-rahmen-start").value;
    const end_zeit = document.getElementById("frei-rahmen-ende").value;
    const aktiv = document.getElementById("frei-rahmen-aktiv").checked;
    if (!start_zeit || !end_zeit) return;
    await api("tagesrahmen_speichern", { wochentag, start_zeit, end_zeit, aktiv });
    await ladeDaten();
    renderFrei();
  }

  function freiBusyBloecke(tagIso, wtIndex) {
    const bloecke = [];

    termine.filter((t) => t.datum === tagIso && t.uhrzeit).forEach((t) => {
      const start = t.uhrzeit.slice(0,5);
      const ende = t.ende_uhrzeit ? t.ende_uhrzeit.slice(0,5) : minutenZuZeit(zeitZuMinuten(start) + 30);
      bloecke.push({ start, ende, titel: t.titel, typ: "Termin", id: t.id, erledigt: !!t.erledigt });
    });

    aufgaben.filter((a) => a.faellig_am === tagIso && a.uhrzeit).forEach((a) => {
      const start = a.uhrzeit.slice(0,5);
      const ende = a.ende_uhrzeit ? a.ende_uhrzeit.slice(0,5) : minutenZuZeit(zeitZuMinuten(start) + 30);
      bloecke.push({ start, ende, titel: a.titel, typ: "Aufgabe", id: a.id, erledigt: !!a.erledigt });
    });

    blockzeiten.forEach((b) => {
      const trifftZu = (b.datum && b.datum === tagIso) || (!b.datum && b.wochentage && b.wochentage.includes(wtIndex));
      if (trifftZu) {
        bloecke.push({ start: b.start_zeit.slice(0,5), ende: b.end_zeit.slice(0,5), titel: b.titel, typ: "Blockzeit", erledigt: false });
      }
    });

    return bloecke.sort((a, b) => zeitZuMinuten(a.start) - zeitZuMinuten(b.start));
  }

  function freiLueckenBerechnen(rahmenStart, rahmenEnde, bloecke) {
    const rStart = zeitZuMinuten(rahmenStart);
    const rEnde = zeitZuMinuten(rahmenEnde);
    if (rEnde <= rStart) return [];

    const intervalle = bloecke
      .map((b) => [Math.max(rStart, zeitZuMinuten(b.start)), Math.min(rEnde, zeitZuMinuten(b.ende))])
      .filter(([s, e]) => e > s)
      .sort((a, b) => a[0] - b[0]);

    const verschmolzen = [];
    for (const [s, e] of intervalle) {
      if (verschmolzen.length > 0 && s <= verschmolzen[verschmolzen.length - 1][1]) {
        verschmolzen[verschmolzen.length - 1][1] = Math.max(verschmolzen[verschmolzen.length - 1][1], e);
      } else {
        verschmolzen.push([s, e]);
      }
    }

    const luecken = [];
    let cursor = rStart;
    for (const [s, e] of verschmolzen) {
      if (s > cursor) luecken.push([cursor, s]);
      cursor = Math.max(cursor, e);
    }
    if (cursor < rEnde) luecken.push([cursor, rEnde]);

    return luecken.map(([s, e]) => ({ start: minutenZuZeit(s), ende: minutenZuZeit(e) }));
  }

  // Liefert die belegten Blöcke + Lücken eines Tages chronologisch gemischt,
  // oder null, wenn für diesen Wochentag kein Zeitrahmen aktiv ist.
  function freiTagEintraege(tagIso, wtIndex) {
    const rahmen = freiRahmenFuerWochentag(wtIndex);
    if (!rahmen.aktiv) return null;
    const bloecke = freiBusyBloecke(tagIso, wtIndex);
    // Erledigt = nur abgehakt, blockiert aber weiterhin die Zeit (keine zusätzliche Lücke).
    const luecken = freiLueckenBerechnen(rahmen.start_zeit, rahmen.end_zeit, bloecke);
    return [
      ...bloecke.map((b) => ({ ...b, art: b.erledigt ? "erledigt" : "belegt" })),
      ...luecken.map((l) => ({ start: l.start, ende: l.ende, art: "frei" })),
    ].sort((a, b) => zeitZuMinuten(a.start) - zeitZuMinuten(b.start));
  }

  function renderFrei() {
    const iso = dateToISO(freiTag);
    const wtIndex = wochentagIndex(freiTag);

    document.getElementById("frei-tag-label").textContent = WOCHENTAGSNAMEN[wtIndex] + ", " + formatDatumLang(iso);

    const rahmen = freiRahmenFuerWochentag(wtIndex);
    document.getElementById("frei-rahmen-aktiv").checked = rahmen.aktiv;
    document.getElementById("frei-rahmen-start").value = rahmen.start_zeit;
    document.getElementById("frei-rahmen-ende").value = rahmen.end_zeit;

    const timelineEl = document.getElementById("frei-timeline");
    const eintraege = freiTagEintraege(iso, wtIndex);

    if (!eintraege) {
      timelineEl.innerHTML = '<p class="empty-text">Für diesen Wochentag ist kein Zeitrahmen aktiv.</p>';
      freiFormularSchliessen();
      return;
    }

    if (eintraege.length === 0) {
      timelineEl.innerHTML = '<p class="empty-text">Kein Zeitrahmen für diesen Tag eingestellt.</p>';
      return;
    }

    timelineEl.innerHTML = eintraege.map((e) => {
      if (e.art === "frei") {
        return `
          <div class="frei-item frei-luecke" onclick="freiLueckeAuswaehlen('${e.start}','${e.ende}')">
            <span class="frei-zeit">${e.start}–${e.ende}</span>
            <span class="frei-label">frei</span>
            <span class="frei-plus">+</span>
          </div>`;
      }
      const istErledigt = e.art === "erledigt";
      const checkboxHtml = e.typ === "Termin"
        ? `<button class="task-check ${istErledigt ? "done" : ""}" onclick="freiTerminUmschalten('${e.id}')" title="Erledigt">${istErledigt ? "✓" : ""}</button>`
        : e.typ === "Aufgabe"
        ? `<button class="task-check ${istErledigt ? "done" : ""}" onclick="freiAufgabeUmschalten('${e.id}')" title="Erledigt">${istErledigt ? "✓" : ""}</button>`
        : `<span style="width:1.4rem; flex-shrink:0;"></span>`;
      return `
        <div class="frei-item frei-belegt${istErledigt ? " frei-erledigt" : ""}">
          ${checkboxHtml}
          <span class="frei-zeit">${e.start}–${e.ende}</span>
          <span class="frei-label">${escapeHtml(e.titel)}<span class="frei-typ">${e.typ}</span></span>
          ${e.typ === "Termin" ? `<button class="task-snooze" onclick="freiTerminBearbeitenStart('${e.id}')" title="Bearbeiten">✎</button>` : ""}
          ${e.typ === "Termin" ? `<button class="task-delete" onclick="freiTerminEntfernen('${e.id}')" title="Entfernen">×</button>` : ""}
          ${e.typ === "Aufgabe" ? `<button class="task-snooze" onclick="freiAufgabeBearbeitenStart('${e.id}')" title="Bearbeiten">✎</button>` : ""}
          ${e.typ === "Aufgabe" ? `<button class="task-delete" onclick="freiAufgabeEntfernen('${e.id}')" title="Entfernen">×</button>` : ""}
        </div>`;
    }).join("");
  }

  window.freiTerminUmschalten = async function(id) {
    await api("termin_umschalten", { id });
    await ladeDaten();
    renderFrei();
  };

  window.freiAufgabeUmschalten = async function(id) {
    await api("aufgabe_umschalten", { id });
    await ladeDaten();
    renderFrei();
  };

  window.freiTerminEntfernen = async function(id) {
    if (freiBearbeiteterTermin === id) freiFormularSchliessen();
    await api("termin_loeschen", { id });
    await ladeDaten();
    renderFrei();
  };

  window.freiAufgabeEntfernen = async function(id) {
    await api("aufgabe_loeschen", { id });
    await ladeDaten();
    renderFrei();
  };

  window.freiLueckeAuswaehlen = function(start, ende) {
    freiBearbeiteterTermin = null;
    freiBearbeiteteAufgabe = null;
    freiAusgewaehlteLuecke = { start, ende };
    freiFormularTyp = "termin";
    renderFreiFormular();
    document.getElementById("frei-formular-bereich").scrollIntoView({ behavior: "smooth", block: "center" });
  };

  function freiFormularSchliessen() {
    freiAusgewaehlteLuecke = null;
    freiBearbeiteterTermin = null;
    freiBearbeiteteAufgabe = null;
    document.getElementById("frei-formular-bereich").innerHTML = "";
  }

  window.freiTerminBearbeitenStart = function(id) {
    freiAusgewaehlteLuecke = null;
    freiBearbeiteteAufgabe = null;
    freiBearbeiteterTermin = id;
    renderFreiTerminFormular();
    document.getElementById("frei-formular-bereich").scrollIntoView({ behavior: "smooth", block: "center" });
  };

  function renderFreiTerminFormular() {
    const bereich = document.getElementById("frei-formular-bereich");
    const t = termine.find((tt) => tt.id === freiBearbeiteterTermin);
    if (!t) { bereich.innerHTML = ""; return; }

    bereich.innerHTML = `
      <div class="cal-day-panel">
        <div class="project-heading" style="margin:0 0 0.6rem;">Termin verschieben / bearbeiten</div>
        <div class="row">
          <input type="text" id="frei-termin-titel" placeholder="Titel" value="${escapeAttr(t.titel)}">
        </div>
        <div class="row">
          <input type="date" id="frei-termin-datum" value="${t.datum}">
          <input type="time" id="frei-termin-start" style="width:8rem;" value="${t.uhrzeit ? t.uhrzeit.slice(0,5) : ""}">
          <input type="time" id="frei-termin-ende" style="width:8rem;" value="${t.ende_uhrzeit ? t.ende_uhrzeit.slice(0,5) : ""}">
        </div>
        <div class="row">
          <input type="text" id="frei-termin-notiz" placeholder="Notiz (optional)" value="${t.notiz ? escapeAttr(t.notiz) : ""}">
        </div>
        <div class="row">
          <button class="btn-primary" id="btn-frei-termin-speichern">Speichern</button>
          <button class="btn-secondary" id="btn-frei-termin-abbrechen">Abbrechen</button>
        </div>
      </div>`;

    document.getElementById("btn-frei-termin-speichern").addEventListener("click", freiTerminSpeichern);
    document.getElementById("btn-frei-termin-abbrechen").addEventListener("click", freiFormularSchliessen);
  }

  async function freiTerminSpeichern() {
    const id = freiBearbeiteterTermin;
    const titel = document.getElementById("frei-termin-titel").value.trim();
    if (!titel || !id) return;
    const datum = document.getElementById("frei-termin-datum").value || null;
    const uhrzeit = document.getElementById("frei-termin-start").value || null;
    const ende_uhrzeit = document.getElementById("frei-termin-ende").value || null;
    const notiz = document.getElementById("frei-termin-notiz").value.trim() || null;

    await api("termin_aktualisieren", { id, titel, datum, uhrzeit, ende_uhrzeit, notiz });
    freiFormularSchliessen();
    await ladeDaten();
    if (datum && datum !== dateToISO(freiTag)) freiTag = new Date(datum + "T00:00:00");
    renderFrei();
  }

  window.freiAufgabeBearbeitenStart = function(id) {
    freiAusgewaehlteLuecke = null;
    freiBearbeiteterTermin = null;
    freiBearbeiteteAufgabe = id;
    renderFreiAufgabeFormular();
    document.getElementById("frei-formular-bereich").scrollIntoView({ behavior: "smooth", block: "center" });
  };

  function renderFreiAufgabeFormular() {
    const bereich = document.getElementById("frei-formular-bereich");
    const a = aufgaben.find((aa) => aa.id === freiBearbeiteteAufgabe);
    if (!a) { bereich.innerHTML = ""; return; }

    const projektOptions = '<option value="">Ohne Projekt</option>' +
      projekte.map((p) => `<option value="${p.id}" ${p.id === a.projekt_id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("");

    bereich.innerHTML = `
      <div class="cal-day-panel">
        <div class="project-heading" style="margin:0 0 0.6rem;">Aufgabe verschieben / bearbeiten</div>
        <div class="row">
          <input type="text" id="frei-aufgabe-titel" placeholder="Titel" value="${escapeAttr(a.titel)}">
          <select id="frei-aufgabe-projekt">${projektOptions}</select>
        </div>
        <div class="row">
          <input type="date" id="frei-aufgabe-datum" value="${a.faellig_am || ""}">
          <input type="time" id="frei-aufgabe-start" style="width:8rem;" value="${a.uhrzeit ? a.uhrzeit.slice(0,5) : ""}">
          <input type="time" id="frei-aufgabe-ende" style="width:8rem;" value="${a.ende_uhrzeit ? a.ende_uhrzeit.slice(0,5) : ""}">
        </div>
        <div class="row">
          <button class="btn-primary" id="btn-frei-aufgabe-speichern">Speichern</button>
          <button class="btn-secondary" id="btn-frei-aufgabe-abbrechen">Abbrechen</button>
        </div>
      </div>`;

    document.getElementById("btn-frei-aufgabe-speichern").addEventListener("click", freiAufgabeSpeichern);
    document.getElementById("btn-frei-aufgabe-abbrechen").addEventListener("click", freiFormularSchliessen);
  }

  async function freiAufgabeSpeichern() {
    const id = freiBearbeiteteAufgabe;
    const titel = document.getElementById("frei-aufgabe-titel").value.trim();
    if (!titel || !id) return;
    const projekt_id = document.getElementById("frei-aufgabe-projekt").value || null;
    const faellig_am = document.getElementById("frei-aufgabe-datum").value || null;
    const uhrzeit = document.getElementById("frei-aufgabe-start").value || null;
    const ende_uhrzeit = document.getElementById("frei-aufgabe-ende").value || null;

    await api("aufgabe_aktualisieren", { id, titel, projekt_id, faellig_am, uhrzeit, ende_uhrzeit });
    freiFormularSchliessen();
    await ladeDaten();
    if (faellig_am && faellig_am !== dateToISO(freiTag)) freiTag = new Date(faellig_am + "T00:00:00");
    renderFrei();
  }

  function renderFreiFormular() {
    const bereich = document.getElementById("frei-formular-bereich");
    if (!freiAusgewaehlteLuecke) { bereich.innerHTML = ""; return; }

    const { start, ende } = freiAusgewaehlteLuecke;
    const projektOptions = '<option value="">Ohne Projekt</option>' +
      projekte.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");

    bereich.innerHTML = `
      <div class="cal-day-panel">
        <div class="project-heading" style="margin:0 0 0.6rem;">${start}–${ende} eintragen</div>
        <div class="row" style="align-items:center;">
          <label style="display:flex; align-items:center; gap:0.3rem; font-size:0.85rem;">
            <input type="radio" name="frei-typ" id="frei-typ-termin" ${freiFormularTyp === "termin" ? "checked" : ""}> Termin
          </label>
          <label style="display:flex; align-items:center; gap:0.3rem; font-size:0.85rem;">
            <input type="radio" name="frei-typ" id="frei-typ-aufgabe" ${freiFormularTyp === "aufgabe" ? "checked" : ""}> Aufgabe
          </label>
        </div>
        <div class="row">
          <input type="text" id="frei-titel" placeholder="Titel">
          <input type="time" id="frei-start" style="width:8rem;" value="${start}">
          <input type="time" id="frei-ende" style="width:8rem;" value="${ende}">
        </div>
        ${freiFormularTyp === "aufgabe" ? `<div class="row"><select id="frei-projekt">${projektOptions}</select></div>` : ""}
        <div class="row">
          <button class="btn-primary" id="btn-frei-eintragen">Eintragen</button>
          <button class="btn-secondary" id="btn-frei-abbrechen">Abbrechen</button>
        </div>
      </div>`;

    document.getElementById("frei-typ-termin").addEventListener("change", () => { freiFormularTyp = "termin"; renderFreiFormular(); });
    document.getElementById("frei-typ-aufgabe").addEventListener("change", () => { freiFormularTyp = "aufgabe"; renderFreiFormular(); });
    document.getElementById("btn-frei-eintragen").addEventListener("click", freiEintragen);
    document.getElementById("btn-frei-abbrechen").addEventListener("click", freiFormularSchliessen);
  }

  async function freiEintragen() {
    const titel = document.getElementById("frei-titel").value.trim();
    if (!titel) return;
    const iso = dateToISO(freiTag);
    const start = document.getElementById("frei-start").value || freiAusgewaehlteLuecke.start;
    const ende = document.getElementById("frei-ende").value || null;

    if (freiFormularTyp === "termin") {
      await api("termin_hinzufuegen", { titel, datum: iso, uhrzeit: start, ende_uhrzeit: ende, notiz: null });
    } else {
      const projekt_id = document.getElementById("frei-projekt").value || null;
      await api("aufgabe_hinzufuegen", { titel, projekt_id, faellig_am: iso, uhrzeit: start, ende_uhrzeit: ende, erinnere_alle_tage: null });
    }
    freiFormularSchliessen();
    await ladeDaten();
    renderFrei();
  }

  // ==========================================================
  // Notizen
  // ==========================================================
  function renderNotizen() {
    const select = document.getElementById("notiz-projekt");
    select.innerHTML = '<option value="">Ohne Projekt</option>' +
      projekte.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");

    const bereich = document.getElementById("notizen-bereich");
    if (notizen.length === 0) {
      bereich.innerHTML = '<p class="empty-text">Noch keine Notizen.</p>';
      return;
    }
    const html = notizen.map((n) => {
      const projekt = projekte.find((p) => p.id === n.projekt_id);
      const datum = new Date(n.erstellt_am).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
      return `
        <div class="notiz-item">
          <div style="flex:1;">
            <span class="notiz-text">${escapeHtml(n.text)}</span>
            <span class="notiz-meta">${datum}${projekt ? " · " + escapeHtml(projekt.name) : ""}</span>
          </div>
          <button class="task-delete" onclick="notizLoeschen('${n.id}')">×</button>
        </div>`;
    }).join("");
    bereich.innerHTML = `<div class="notiz-list">${html}</div>`;
  }

  document.getElementById("btn-notiz-hinzufuegen").addEventListener("click", notizHinzufuegen);
  document.getElementById("neue-notiz").addEventListener("keydown", (e) => {
    if (e.key === "Enter") notizHinzufuegen();
  });

  async function notizHinzufuegen() {
    const text = document.getElementById("neue-notiz").value.trim();
    if (!text) return;
    const projekt_id = document.getElementById("notiz-projekt").value || null;
    await api("notiz_hinzufuegen", { text, projekt_id });
    document.getElementById("neue-notiz").value = "";
    await ladeDaten();
  }

  window.notizLoeschen = async function(id) {
    await api("notiz_loeschen", { id });
    await ladeDaten();
  };

  // ==========================================================
  // Links
  // ==========================================================
  function linkHtml(l) {
    return `
      <div class="link-item">
        <div style="flex:1; min-width:0;">
          <a class="link-titel" href="${escapeAttr(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.titel)}</a>
          <span class="link-url">${escapeHtml(l.url)}</span>
          ${l.notiz ? `<span class="link-notiz">${escapeHtml(l.notiz)}</span>` : ""}
        </div>
        <button class="task-delete" onclick="linkLoeschen('${l.id}')">×</button>
      </div>`;
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function renderLinks() {
    const select = document.getElementById("link-projekt");
    select.innerHTML = '<option value="">Ohne Projekt</option>' +
      projekte.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");

    const ohneProjekt = links.filter((l) => !l.projekt_id);
    const gruppen = projekte
      .map((p) => ({ projekt: p, liste: links.filter((l) => l.projekt_id === p.id) }))
      .filter((g) => g.liste.length > 0);

    let html = "";
    if (ohneProjekt.length > 0) {
      html += `<div class="project-heading">Ohne Projekt</div><div class="task-list">${ohneProjekt.map(linkHtml).join("")}</div>`;
    }
    for (const g of gruppen) {
      html += `<div class="project-heading">${escapeHtml(g.projekt.name)}</div><div class="task-list">${g.liste.map(linkHtml).join("")}</div>`;
    }
    if (links.length === 0) {
      html = '<p class="empty-text">Noch keine Links gespeichert.</p>';
    }
    document.getElementById("links-bereich").innerHTML = html;
  }

  document.getElementById("btn-link-hinzufuegen").addEventListener("click", linkHinzufuegen);
  document.getElementById("neuer-link-titel").addEventListener("keydown", (e) => {
    if (e.key === "Enter") linkHinzufuegen();
  });
  document.getElementById("neuer-link-url").addEventListener("keydown", (e) => {
    if (e.key === "Enter") linkHinzufuegen();
  });

  async function linkHinzufuegen() {
    const titel = document.getElementById("neuer-link-titel").value.trim();
    const url = document.getElementById("neuer-link-url").value.trim();
    if (!titel || !url) return;
    const notiz = document.getElementById("neuer-link-notiz").value.trim() || null;
    const projekt_id = document.getElementById("link-projekt").value || null;

    await api("link_hinzufuegen", { titel, url, notiz, projekt_id });
    document.getElementById("neuer-link-titel").value = "";
    document.getElementById("neuer-link-url").value = "";
    document.getElementById("neuer-link-notiz").value = "";
    await ladeDaten();
  }

  window.linkLoeschen = async function(id) {
    await api("link_loeschen", { id });
    await ladeDaten();
  };

  // ==========================================================
  // Reflexion
  // ==========================================================
  document.getElementById("reflex-datum").value = heuteISO();
  let reflexBearbeiteterId = null;

  function formatDatumLang(iso) {
    const [j, m, t] = iso.split("-");
    const monate = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
    return `${parseInt(t,10)}. ${monate[parseInt(m,10)-1]} ${j}`;
  }

  function renderReflexionen() {
    const bereich = document.getElementById("reflexion-bereich");
    if (reflexionen.length === 0) {
      bereich.innerHTML = '<p class="empty-text">Noch keine Einträge.</p>';
      return;
    }
    bereich.innerHTML = reflexionen.map((r) => `
      <div class="reflex-item">
        <div class="reflex-datum">
          <span>${formatDatumLang(r.datum)}</span>
          <span>
            <button class="task-snooze" style="padding:0.2rem 0.5rem;" onclick="reflexionBearbeitenStart('${r.id}')" title="Bearbeiten">✎</button>
            <button class="task-delete" style="font-size:1rem;" onclick="reflexionLoeschen('${r.id}')">×</button>
          </span>
        </div>
        <div class="reflex-text">${escapeHtml(r.text)}</div>
      </div>`).join("");
  }

  function reflexFormZuruecksetzen() {
    reflexBearbeiteterId = null;
    document.getElementById("reflex-text").value = "";
    document.getElementById("reflex-datum").value = heuteISO();
    document.getElementById("btn-reflex-hinzufuegen").textContent = "Eintragen";
    document.getElementById("btn-reflex-abbrechen").classList.add("hidden");
  }

  window.reflexionBearbeitenStart = function(id) {
    const r = reflexionen.find((rr) => rr.id === id);
    if (!r) return;
    reflexBearbeiteterId = id;
    document.getElementById("reflex-datum").value = r.datum;
    document.getElementById("reflex-text").value = r.text;
    document.getElementById("btn-reflex-hinzufuegen").textContent = "Speichern";
    document.getElementById("btn-reflex-abbrechen").classList.remove("hidden");
    document.getElementById("reflex-text").scrollIntoView({ behavior: "smooth", block: "center" });
  };

  document.getElementById("btn-reflex-hinzufuegen").addEventListener("click", reflexSpeichern);
  document.getElementById("btn-reflex-abbrechen").addEventListener("click", reflexFormZuruecksetzen);

  async function reflexSpeichern() {
    const text = document.getElementById("reflex-text").value.trim();
    if (!text) return;
    const datum = document.getElementById("reflex-datum").value || heuteISO();

    if (reflexBearbeiteterId) {
      await api("reflexion_aktualisieren", { id: reflexBearbeiteterId, text, datum });
    } else {
      await api("reflexion_hinzufuegen", { text, datum });
    }
    reflexFormZuruecksetzen();
    await ladeDaten();
  }

  window.reflexionLoeschen = async function(id) {
    if (reflexBearbeiteterId === id) reflexFormZuruecksetzen();
    await api("reflexion_loeschen", { id });
    await ladeDaten();
  };

  // ==========================================================
  // Export (Excel & Word) – läuft komplett im Browser
  // ==========================================================
  function fA() {
    return aufgaben.map((a) => {
      const p = projekte.find((pr) => pr.id === a.projekt_id);
      return {
        Titel: a.titel,
        Projekt: p ? p.name : "",
        Erledigt: a.erledigt ? "Ja" : "Nein",
        "Fällig am": a.faellig_am || "",
        Beginn: a.uhrzeit ? a.uhrzeit.slice(0, 5) : "",
        Ende: a.ende_uhrzeit ? a.ende_uhrzeit.slice(0, 5) : "",
        "Erinnerung alle X Tage": a.erinnere_alle_tage || "",
        "Erstellt am": a.erstellt_am ? a.erstellt_am.slice(0, 10) : "",
      };
    });
  }
  function fT() {
    return termine.map((t) => ({
      Titel: t.titel,
      Datum: t.datum,
      Beginn: t.uhrzeit ? t.uhrzeit.slice(0, 5) : "",
      Ende: t.ende_uhrzeit ? t.ende_uhrzeit.slice(0, 5) : "",
      Notiz: t.notiz || "",
    }));
  }
  function fN() {
    return notizen.map((n) => {
      const p = projekte.find((pr) => pr.id === n.projekt_id);
      return {
        Text: n.text,
        Projekt: p ? p.name : "",
        "Erstellt am": n.erstellt_am ? n.erstellt_am.slice(0, 10) : "",
      };
    });
  }
  function fL() {
    return links.map((l) => {
      const p = projekte.find((pr) => pr.id === l.projekt_id);
      return {
        Titel: l.titel,
        URL: l.url,
        Notiz: l.notiz || "",
        Projekt: p ? p.name : "",
      };
    });
  }
  function fR() {
    return reflexionen.map((r) => ({
      Datum: r.datum,
      Text: r.text,
    }));
  }
  function fE() {
    return einkaufsliste.map((e) => ({
      Artikel: e.text,
      Erledigt: e.erledigt ? "Ja" : "Nein",
      "Erstellt am": e.erstellt_am ? e.erstellt_am.slice(0, 10) : "",
    }));
  }
  function fV() {
    return verlauf.map((v) => ({
      Zeitpunkt: v.erstellt_am ? new Date(v.erstellt_am).toLocaleString("de-DE") : "",
      Kategorie: v.kategorie,
      Aktion: v.aktion,
      Beschreibung: v.beschreibung || "",
    }));
  }
  function fZ() {
    const TYP_LABEL = { woche: "Woche", monat: "Monat", jahr: "Jahr" };
    return ziele.map((z) => {
      const schritte = zielSchritte.filter((s) => s.ziel_id === z.id);
      const erledigtCount = schritte.filter((s) => s.erledigt).length;
      const parent = z.uebergeordnetes_ziel_id ? ziele.find((p) => p.id === z.uebergeordnetes_ziel_id) : null;
      return {
        Titel: z.titel,
        Zeitraum: TYP_LABEL[z.zeitraum_typ] || z.zeitraum_typ,
        "Zeitraum-Start": z.zeitraum_start,
        "Übergeordnetes Ziel": parent ? parent.titel : "",
        Fortschritt: schritte.length > 0 ? `${erledigtCount}/${schritte.length}` : "keine Schritte",
      };
    });
  }

  const EXPORT_KATEGORIEN = [
    { id: "aufgaben", name: "Aufgaben", daten: fA },
    { id: "termine", name: "Termine", daten: fT },
    { id: "notizen", name: "Notizen", daten: fN },
    { id: "links", name: "Links", daten: fL },
    { id: "reflexion", name: "Reflexion", daten: fR },
    { id: "einkauf", name: "Einkaufsliste", daten: fE },
    { id: "verlauf", name: "Verlauf", daten: fV },
    { id: "ziele", name: "Ziele", daten: fZ },
  ];

  function downloadDatei(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function tabelleAlsHtml(titel, daten) {
    if (daten.length === 0) return `<h2>${escapeHtml(titel)}</h2><p>Keine Einträge.</p>`;
    const spalten = Object.keys(daten[0]);
    let html = `<h2>${escapeHtml(titel)}</h2><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px;">`;
    html += `<tr>${spalten.map((s) => `<th style="background:#eee;text-align:left;">${escapeHtml(s)}</th>`).join("")}</tr>`;
    for (const row of daten) {
      html += `<tr>${spalten.map((s) => `<td>${escapeHtml(String(row[s] ?? ""))}</td>`).join("")}</tr>`;
    }
    html += `</table>`;
    return html;
  }

  function wordDokument(titel, innerHtml) {
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><title>${escapeHtml(titel)}</title></head>
      <body>${innerHtml}</body></html>`;
  }

  window.exportExcel = function(kategorieId) {
    if (typeof XLSX === "undefined") { alert("Export-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen."); return; }
    const k = EXPORT_KATEGORIEN.find((k) => k.id === kategorieId);
    const daten = k.daten();
    const ws = XLSX.utils.json_to_sheet(daten.length ? daten : [{ Hinweis: "Keine Einträge" }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, k.name.slice(0, 31));
    XLSX.writeFile(wb, `${k.name}.xlsx`);
  };

  window.exportWord = function(kategorieId) {
    const k = EXPORT_KATEGORIEN.find((k) => k.id === kategorieId);
    const html = wordDokument(k.name, tabelleAlsHtml(k.name, k.daten()));
    downloadDatei(`${k.name}.doc`, html, "application/msword");
  };

  window.exportAllesExcel = function() {
    if (typeof XLSX === "undefined") { alert("Export-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen."); return; }
    const wb = XLSX.utils.book_new();
    for (const k of EXPORT_KATEGORIEN) {
      const daten = k.daten();
      const ws = XLSX.utils.json_to_sheet(daten.length ? daten : [{ Hinweis: "Keine Einträge" }]);
      XLSX.utils.book_append_sheet(wb, ws, k.name.slice(0, 31));
    }
    XLSX.writeFile(wb, "dashboard-export.xlsx");
  };

  window.exportAllesWord = function() {
    const teile = EXPORT_KATEGORIEN.map((k) => tabelleAlsHtml(k.name, k.daten())).join("<br>");
    const html = wordDokument("Dashboard Export", `<h1>Dashboard Export</h1>${teile}`);
    downloadDatei("dashboard-export.doc", html, "application/msword");
  };

  function renderExport() {
    let html = `
      <div class="export-row export-alle">
        <span class="export-name">Alles</span>
        <div class="export-buttons">
          <button onclick="exportAllesExcel()">Excel</button>
          <button onclick="exportAllesWord()">Word</button>
        </div>
      </div>`;
    for (const k of EXPORT_KATEGORIEN) {
      html += `
        <div class="export-row">
          <span class="export-name">${escapeHtml(k.name)}</span>
          <div class="export-buttons">
            <button onclick="exportExcel('${k.id}')">Excel</button>
            <button onclick="exportWord('${k.id}')">Word</button>
          </div>
        </div>`;
    }
    document.getElementById("export-liste").innerHTML = html;
  }

  // ==========================================================
  // Einkaufsliste
  // ==========================================================
  function renderEinkauf() {
    const offen = einkaufsliste.filter((e) => !e.erledigt);
    const erledigt = einkaufsliste.filter((e) => e.erledigt);

    let html = "";
    if (offen.length === 0 && erledigt.length === 0) {
      html = '<p class="empty-text">Nichts auf der Liste.</p>';
    } else {
      html += '<div class="task-list">' + offen.map((e) => `
        <div class="task">
          <button class="task-check" onclick="einkaufUmschalten('${e.id}')"></button>
          <div class="task-info"><span class="task-titel">${escapeHtml(e.text)}</span></div>
          <button class="task-delete" onclick="einkaufLoeschen('${e.id}')">×</button>
        </div>`).join("") + '</div>';

      if (erledigt.length > 0) {
        html += `<div class="project-heading" style="margin-top:1.4rem;">Erledigt (${erledigt.length})</div><div class="task-list">` +
          erledigt.map((e) => `
            <div class="task">
              <button class="task-check done" onclick="einkaufUmschalten('${e.id}')">✓</button>
              <div class="task-info"><span class="task-titel done">${escapeHtml(e.text)}</span></div>
              <button class="task-delete" onclick="einkaufLoeschen('${e.id}')">×</button>
            </div>`).join("") + '</div>';
      }
    }
    document.getElementById("einkauf-bereich").innerHTML = html;
  }

  document.getElementById("btn-einkauf-hinzufuegen").addEventListener("click", einkaufHinzufuegen);
  document.getElementById("neuer-einkauf").addEventListener("keydown", (e) => {
    if (e.key === "Enter") einkaufHinzufuegen();
  });

  async function einkaufHinzufuegen() {
    const text = document.getElementById("neuer-einkauf").value.trim();
    if (!text) return;
    await api("einkauf_hinzufuegen", { text });
    document.getElementById("neuer-einkauf").value = "";
    await ladeDaten();
  }

  window.einkaufUmschalten = async function(id) {
    await api("einkauf_umschalten", { id });
    await ladeDaten();
  };

  window.einkaufLoeschen = async function(id) {
    await api("einkauf_loeschen", { id });
    await ladeDaten();
  };

  // ==========================================================
  // Verlauf
  // ==========================================================
  function renderVerlauf() {
    const bereich = document.getElementById("verlauf-bereich");
    if (verlauf.length === 0) {
      bereich.innerHTML = '<p class="empty-text">Noch keine Aktivitäten aufgezeichnet.</p>';
      return;
    }
    bereich.innerHTML = verlauf.map((v) => {
      const dt = new Date(v.erstellt_am);
      const zeit = dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " · " +
        dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      return `
        <div class="verlauf-item">
          <span class="verlauf-zeit">${zeit}</span>
          <span class="verlauf-text"><span class="verlauf-kategorie">${escapeHtml(v.kategorie)}</span> ${escapeHtml(v.aktion)}${v.beschreibung ? ": " + escapeHtml(v.beschreibung) : ""}</span>
        </div>`;
    }).join("");
  }

  // ==========================================================
  // Planung (Wochen-, Monats-, Jahresziele)
  // ==========================================================
  function wochenStart(d) {
    const tag = (d.getDay() + 6) % 7; // Montag = 0
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    start.setDate(start.getDate() - tag);
    return start;
  }
  function monatStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function jahrStart(d) { return new Date(d.getFullYear(), 0, 1); }

  function periodStart(typ, anker) {
    if (typ === "woche") return wochenStart(anker);
    if (typ === "monat") return monatStart(anker);
    return jahrStart(anker);
  }
  function periodEnd(typ, start) {
    if (typ === "woche") {
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return end;
    }
    if (typ === "monat") return new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return new Date(start.getFullYear(), 11, 31);
  }
  function planAnkerVerschieben(richtung) {
    const a = new Date(planAnker);
    if (planTyp === "woche") {
      a.setDate(a.getDate() + richtung * 7);
    } else if (planTyp === "monat") {
      // Erst auf Tag 1 setzen, dann Monat wechseln - verhindert, dass z.B.
      // der 31. beim Sprung in einen kürzeren Monat (Februar) überläuft.
      a.setDate(1);
      a.setMonth(a.getMonth() + richtung);
    } else {
      a.setDate(1);
      a.setFullYear(a.getFullYear() + richtung);
    }
    planAnker = a;
  }
  function planLabel(typ, start, end) {
    if (typ === "jahr") return String(start.getFullYear());
    if (typ === "monat") return MONATSNAMEN[start.getMonth()] + " " + start.getFullYear();
    const fmt = (d) => d.getDate() + "." + (d.getMonth() + 1) + ".";
    return "Woche vom " + fmt(start) + "–" + fmt(end) + " " + end.getFullYear();
  }
  function uebergeordneterTyp(typ) {
    if (typ === "woche") return "monat";
    if (typ === "monat") return "jahr";
    return null;
  }

  ["woche", "monat", "jahr"].forEach((t) => {
    document.getElementById("plantyp-" + t).addEventListener("click", () => {
      planTyp = t;
      renderPlanung();
    });
  });
  document.getElementById("plan-prev").addEventListener("click", () => {
    planAnkerVerschieben(-1);
    renderPlanung();
  });
  document.getElementById("plan-next").addEventListener("click", () => {
    planAnkerVerschieben(1);
    renderPlanung();
  });
  document.getElementById("toggle-ziel-form").addEventListener("click", (e) => {
    const form = document.getElementById("ziel-form");
    form.classList.toggle("hidden");
    e.target.textContent = (form.classList.contains("hidden") ? "▸" : "▾") + " Neues Ziel für diesen Zeitraum";
  });
  document.getElementById("btn-ziel-anlegen").addEventListener("click", zielAnlegen);
  document.getElementById("neues-ziel").addEventListener("keydown", (e) => {
    if (e.key === "Enter") zielAnlegen();
  });

  async function zielAnlegen() {
    const titel = document.getElementById("neues-ziel").value.trim();
    if (!titel) return;
    const start = periodStart(planTyp, planAnker);
    const startIso = dateToISO(start);
    const uebergeordnetesZielId = document.getElementById("ziel-uebergeordnet").value || null;
    await api("ziel_hinzufuegen", {
      titel,
      zeitraum_typ: planTyp,
      zeitraum_start: startIso,
      uebergeordnetes_ziel_id: uebergeordnetesZielId,
    });
    document.getElementById("neues-ziel").value = "";
    await ladeDaten();
  }

  window.zielLoeschen = async function(id) {
    await api("ziel_loeschen", { id });
    await ladeDaten();
  };

  window.zielSchrittHinzufuegen = async function(zielId, inputEl) {
    const text = inputEl.value.trim();
    if (!text) return;
    await api("ziel_schritt_hinzufuegen", { ziel_id: zielId, text });
    await ladeDaten();
  };

  window.heuteFreiOeffnen = function() {
    freiTag = new Date();
    tabWechseln("frei");
  };

  window.zielKachelKlick = function(id) {
    const z = ziele.find((zz) => zz.id === id);
    if (!z) return;
    planTyp = z.zeitraum_typ;
    planAnker = new Date(z.zeitraum_start + "T00:00:00");
    zielExpandiert.add(id);
    tabWechseln("planung");
    requestAnimationFrame(() => {
      const el = document.getElementById("ziel-" + id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  window.zielKarteUmschalten = function(id) {
    if (zielExpandiert.has(id)) zielExpandiert.delete(id);
    else zielExpandiert.add(id);
    renderPlanung();
  };

  window.zielSchrittUmschalten = async function(id) {
    await api("ziel_schritt_umschalten", { id });
    await ladeDaten();
  };

  window.zielSchrittLoeschen = async function(id) {
    await api("ziel_schritt_loeschen", { id });
    await ladeDaten();
  };

  function zielKarteHtml(z) {
    const schritte = zielSchritte.filter((s) => s.ziel_id === z.id);
    const erledigtCount = schritte.filter((s) => s.erledigt).length;
    const parent = z.uebergeordnetes_ziel_id ? ziele.find((p) => p.id === z.uebergeordnetes_ziel_id) : null;
    const offen = zielExpandiert.has(z.id);

    return `
      <div class="ziel-card" id="ziel-${z.id}">
        <div class="ziel-kopf">
          <button class="ziel-toggle" onclick="zielKarteUmschalten('${z.id}')" title="${offen ? "Einklappen" : "Ausklappen"}">${offen ? "▾" : "▸"}</button>
          <span class="ziel-titel" onclick="zielKarteUmschalten('${z.id}')" style="cursor:pointer;">${escapeHtml(z.titel)}</span>
          <span class="ziel-fortschritt">${schritte.length > 0 ? erledigtCount + "/" + schritte.length : ""}</span>
          <button class="task-delete" onclick="zielLoeschen('${z.id}')">×</button>
        </div>
        ${parent ? `<div class="ziel-uebergeordnet">→ ${escapeHtml(parent.titel)}</div>` : ""}
        <div class="ziel-details ${offen ? "" : "hidden"}">
          <div class="ziel-schritte">
            ${schritte.map((s) => `
              <div class="ziel-schritt">
                <button class="task-check ${s.erledigt ? "done" : ""}" onclick="zielSchrittUmschalten('${s.id}')">${s.erledigt ? "✓" : ""}</button>
                <span class="ziel-schritt-text ${s.erledigt ? "done" : ""}">${escapeHtml(s.text)}</span>
                <button class="task-delete" style="margin-left:auto;" onclick="zielSchrittLoeschen('${s.id}')">×</button>
              </div>`).join("")}
          </div>
          <div class="ziel-schritt-add">
            <input type="text" placeholder="Schritt hinzufügen …" onkeydown="if(event.key==='Enter') zielSchrittHinzufuegen('${z.id}', this)">
            <button onclick="zielSchrittHinzufuegen('${z.id}', this.previousElementSibling)">+</button>
          </div>
        </div>
      </div>`;
  }

  function renderPlanung() {
    const start = periodStart(planTyp, planAnker);
    const end = periodEnd(planTyp, start);
    const startIso = dateToISO(start);
    const endIso = dateToISO(end);

    document.getElementById("plan-zeitraum-label").textContent = planLabel(planTyp, start, end);

    ["woche", "monat", "jahr"].forEach((t) => {
      document.getElementById("plantyp-" + t).classList.toggle("active", t === planTyp);
    });

    const parentTyp = uebergeordneterTyp(planTyp);
    const parentSelect = document.getElementById("ziel-uebergeordnet");
    if (!parentTyp) {
      parentSelect.innerHTML = '<option value="">Kein übergeordnetes Ziel</option>';
      parentSelect.disabled = true;
    } else {
      parentSelect.disabled = false;
      const parentZiele = ziele.filter((z) => z.zeitraum_typ === parentTyp);
      parentSelect.innerHTML = '<option value="">Kein übergeordnetes Ziel</option>' +
        parentZiele.map((z) => `<option value="${z.id}">${escapeHtml(z.titel)}</option>`).join("");
    }

    const zieleHier = ziele.filter((z) => z.zeitraum_typ === planTyp && z.zeitraum_start === startIso);
    const zieleBereich = document.getElementById("ziele-bereich");
    zieleBereich.innerHTML = zieleHier.length === 0
      ? '<p class="empty-text">Noch keine Ziele für diesen Zeitraum.</p>'
      : zieleHier.map(zielKarteHtml).join("");

    const termineImZeitraum = termine
      .filter((t) => t.datum >= startIso && t.datum <= endIso)
      .sort((a, b) => (a.datum + (a.uhrzeit || "99:99")).localeCompare(b.datum + (b.uhrzeit || "99:99")));
    const aufgabenImZeitraum = aufgaben
      .filter((a) => !a.erledigt && a.faellig_am && a.faellig_am >= startIso && a.faellig_am <= endIso)
      .map(enrich)
      .sort((a, b) => a.faellig_am.localeCompare(b.faellig_am));

    let overviewHtml = `<div class="plan-overview-heading">In diesem Zeitraum</div>`;
    if (termineImZeitraum.length === 0 && aufgabenImZeitraum.length === 0) {
      overviewHtml += '<p class="empty-text">Keine Termine oder fälligen Aufgaben in diesem Zeitraum.</p>';
    } else {
      if (termineImZeitraum.length > 0) {
        overviewHtml += '<div class="upcoming-list" style="margin-bottom:1rem;">' +
          termineImZeitraum.map((t) => `
            <div class="upcoming-item">
              <span class="upcoming-datum">${formatDatumKurz(t.datum)}${t.uhrzeit ? " · " + t.uhrzeit.slice(0,5) + (t.ende_uhrzeit ? "–" + t.ende_uhrzeit.slice(0,5) : "") : ""}</span>
              <span>${escapeHtml(t.titel)}</span>
            </div>`).join("") + '</div>';
      }
      if (aufgabenImZeitraum.length > 0) {
        overviewHtml += '<div class="task-list">' +
          aufgabenImZeitraum.map((a) => taskHtml(a, false)).join("") + '</div>';
      }
    }
    document.getElementById("plan-overview-bereich").innerHTML = overviewHtml;
  }

  // ==========================================================
  // Finanzen-Modul: Fixkosten + Sonderausgaben
  // ==========================================================
  function finEuro(n) {
    return Number(n || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  }
  function finZahl(v) {
    if (v === null || v === undefined || v === "") return 0;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  ["fixkosten", "sonderausgaben", "buchungen", "uebersicht"].forEach((t) => {
    document.getElementById("fintyp-" + t).addEventListener("click", () => {
      finTyp = t;
      document.getElementById("fintyp-fixkosten").classList.toggle("active", t === "fixkosten");
      document.getElementById("fintyp-sonderausgaben").classList.toggle("active", t === "sonderausgaben");
      document.getElementById("fintyp-buchungen").classList.toggle("active", t === "buchungen");
      document.getElementById("fintyp-uebersicht").classList.toggle("active", t === "uebersicht");
      document.getElementById("fin-fixkosten-bereich").classList.toggle("hidden", t !== "fixkosten");
      document.getElementById("fin-sonderausgaben-bereich").classList.toggle("hidden", t !== "sonderausgaben");
      document.getElementById("fin-buchungen-bereich").classList.toggle("hidden", t !== "buchungen");
      document.getElementById("fin-uebersicht-bereich").classList.toggle("hidden", t !== "uebersicht");
      renderFinanzen();
    });
  });

  function renderFinanzen() {
    if (finTyp === "fixkosten") renderFinFixkosten();
    else if (finTyp === "sonderausgaben") renderFinSonderausgaben();
    else if (finTyp === "buchungen") renderFinBuchungen();
    else renderFinUebersicht();
  }

  function fixkostenZeileHtml(f, istBearbeitet) {
    const summe = FIN_MONATE.reduce((s, m) => s + finZahl(f[m]), 0);
    if (istBearbeitet) {
      return `
        <tr data-fk-id="${f.id}">
          <td class="fin-bez"><input type="text" id="fk-bez-${f.id}" value="${escapeAttr(f.bezeichnung)}"></td>
          ${FIN_MONATE.map((m) => `<td><input type="number" step="0.01" id="fk-${m}-${f.id}" value="${finZahl(f[m])}"></td>`).join("")}
          <td>${finEuro(summe)}</td>
          <td>
            <button class="fin-loesch-btn" onclick="fixkostenSpeichern('${f.id}')" title="Speichern">✓</button>
            <button class="fin-loesch-btn" onclick="fixkostenBearbeitenAbbrechen()" title="Abbrechen">×</button>
          </td>
        </tr>`;
    }
    return `
      <tr data-fk-id="${f.id}">
        <td class="fin-bez" style="cursor:pointer;" onclick="fixkostenBearbeitenStart('${f.id}')">${escapeHtml(f.bezeichnung)}</td>
        ${FIN_MONATE.map((m) => `<td>${finZahl(f[m]) ? finEuro(f[m]) : "–"}</td>`).join("")}
        <td><strong>${finEuro(summe)}</strong></td>
        <td><button class="fin-loesch-btn" onclick="fixkostenLoeschen('${f.id}')" title="Löschen">×</button></td>
      </tr>`;
  }

  function fixkostenTabelleHtml(typ, titel) {
    const zeilen = fixkosten.filter((f) => f.typ === typ);
    const summenProMonat = FIN_MONATE.map((m) => zeilen.reduce((s, f) => s + finZahl(f[m]), 0));
    const summeGesamt = summenProMonat.reduce((s, x) => s + x, 0);
    return `
      <div class="fin-tabelle-wrap">
        <table class="fin-tabelle">
          <thead>
            <tr>
              <th class="fin-bez-th">${titel}</th>
              ${FIN_MONATSNAMEN_KURZ.map((m) => `<th>${m}</th>`).join("")}
              <th>Summe</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${zeilen.length
              ? zeilen.map((f) => fixkostenZeileHtml(f, f.id === finBearbeitetesFixkosten)).join("")
              : `<tr><td class="fin-bez" colspan="14"><span class="empty-text">Noch keine Einträge.</span></td></tr>`}
            <tr class="fin-tabelle-summe">
              <td class="fin-bez">Summe ${titel}</td>
              ${summenProMonat.map((s) => `<td>${finEuro(s)}</td>`).join("")}
              <td>${finEuro(summeGesamt)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>`;
  }

  function renderFinFixkosten() {
    const el = document.getElementById("fin-fixkosten-bereich");
    el.innerHTML = `
      ${fixkostenTabelleHtml("ausgabe", "Fixkosten")}
      ${fixkostenTabelleHtml("einnahme", "Feste Einnahmen")}

      <button class="link-btn" id="toggle-fixkosten-form">▸ Neue Position anlegen</button>
      <div class="row hidden fin-neu-form" id="fixkosten-form" style="margin-top:0.6rem;">
        <select id="neue-fk-typ">
          <option value="ausgabe">Ausgabe</option>
          <option value="einnahme">Einnahme</option>
        </select>
        <input type="text" id="neue-fk-bezeichnung" placeholder="Bezeichnung">
        <input type="number" step="0.01" id="neue-fk-betrag" placeholder="Betrag/Monat">
        <button class="btn-primary" id="btn-fixkosten-anlegen">Anlegen</button>
      </div>
    `;
    document.getElementById("toggle-fixkosten-form").addEventListener("click", () => {
      document.getElementById("fixkosten-form").classList.toggle("hidden");
    });
    document.getElementById("btn-fixkosten-anlegen").addEventListener("click", fixkostenHinzufuegen);
  }

  async function fixkostenHinzufuegen() {
    const bezeichnung = document.getElementById("neue-fk-bezeichnung").value.trim();
    if (!bezeichnung) return;
    const typ = document.getElementById("neue-fk-typ").value;
    const betrag = document.getElementById("neue-fk-betrag").value;
    const zahlung = {};
    FIN_MONATE.forEach((m) => { zahlung[m] = betrag; });
    await api("fixkosten_hinzufuegen", { bezeichnung, typ, ...zahlung });
    await ladeDaten();
    renderFinanzen();
  }

  window.fixkostenBearbeitenStart = function (id) {
    finBearbeitetesFixkosten = id;
    renderFinFixkosten();
  };
  window.fixkostenBearbeitenAbbrechen = function () {
    finBearbeitetesFixkosten = null;
    renderFinFixkosten();
  };
  window.fixkostenSpeichern = async function (id) {
    const bezeichnung = document.getElementById("fk-bez-" + id).value.trim();
    if (!bezeichnung) return;
    const zahlung = { id, bezeichnung };
    FIN_MONATE.forEach((m) => { zahlung[m] = document.getElementById("fk-" + m + "-" + id).value; });
    await api("fixkosten_aktualisieren", zahlung);
    finBearbeitetesFixkosten = null;
    await ladeDaten();
    renderFinanzen();
  };
  window.fixkostenLoeschen = async function (id) {
    await api("fixkosten_loeschen", { id });
    await ladeDaten();
    renderFinanzen();
  };

  function sonderausgabeKarteHtml(s) {
    const bearbeitet = s.id === finBearbeiteteSonderausgabe;
    if (bearbeitet) {
      return `
        <div class="fin-card">
          <div class="fin-card-info">
            <input type="text" id="sa-bez-${s.id}" value="${escapeAttr(s.bezeichnung)}" style="margin-bottom:0.4rem;">
            <div class="row" style="margin-bottom:0;">
              <input type="number" step="0.01" id="sa-betrag-${s.id}" value="${finZahl(s.betrag)}" placeholder="Betrag">
              <select id="sa-monat-${s.id}">
                <option value="">(kein Monat)</option>
                ${FIN_MONATSNAMEN_KURZ.map((m, i) => `<option value="${i + 1}" ${s.monat === i + 1 ? "selected" : ""}>${m}</option>`).join("")}
              </select>
              <input type="text" id="sa-notiz-${s.id}" value="${escapeAttr(s.notiz || "")}" placeholder="Notiz (optional)">
            </div>
          </div>
          <button class="fin-loesch-btn" onclick="sonderausgabeSpeichern('${s.id}')" title="Speichern">✓</button>
          <button class="fin-loesch-btn" onclick="sonderausgabeBearbeitenAbbrechen()" title="Abbrechen">×</button>
        </div>`;
    }
    const monatLabel = s.monat ? FIN_MONATSNAMEN_KURZ[s.monat - 1] + " " + s.jahr : String(s.jahr);
    return `
      <div class="fin-card">
        <div class="fin-card-info" style="cursor:pointer;" onclick="sonderausgabeBearbeitenStart('${s.id}')">
          <div class="fin-card-titel">${escapeHtml(s.bezeichnung)}</div>
          <div class="fin-card-meta">${monatLabel}${s.notiz ? " · " + escapeHtml(s.notiz) : ""}</div>
        </div>
        <div class="fin-betrag">${finEuro(s.betrag)}</div>
        <button class="fin-loesch-btn" onclick="sonderausgabeLoeschen('${s.id}')" title="Löschen">×</button>
      </div>`;
  }

  function renderFinSonderausgaben() {
    const el = document.getElementById("fin-sonderausgaben-bereich");
    const jahr = new Date().getFullYear();
    const zeilen = sonderausgaben.filter((s) => Number(s.jahr) === jahr);
    const summe = zeilen.reduce((s, x) => s + finZahl(x.betrag), 0);
    el.innerHTML = `
      <div class="fin-summary-row">
        <div class="fin-summary-item">
          <div class="fin-summary-label">Summe ${jahr}</div>
          <div class="fin-summary-value">${finEuro(summe)}</div>
        </div>
      </div>
      ${zeilen.length ? zeilen.map(sonderausgabeKarteHtml).join("") : '<p class="empty-text">Noch keine Sonderausgaben für dieses Jahr.</p>'}

      <button class="link-btn" id="toggle-sonderausgabe-form" style="margin-top:0.8rem;">▸ Neue Sonderausgabe anlegen</button>
      <div class="row hidden fin-neu-form" id="sonderausgabe-form" style="margin-top:0.6rem;">
        <input type="text" id="neue-sa-bezeichnung" placeholder="Bezeichnung">
        <input type="number" step="0.01" id="neue-sa-betrag" placeholder="Betrag">
        <select id="neue-sa-monat">
          <option value="">(kein Monat)</option>
          ${FIN_MONATSNAMEN_KURZ.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("")}
        </select>
        <input type="text" id="neue-sa-notiz" placeholder="Notiz (optional)">
        <button class="btn-primary" id="btn-sonderausgabe-anlegen">Anlegen</button>
      </div>
    `;
    document.getElementById("toggle-sonderausgabe-form").addEventListener("click", () => {
      document.getElementById("sonderausgabe-form").classList.toggle("hidden");
    });
    document.getElementById("btn-sonderausgabe-anlegen").addEventListener("click", sonderausgabeHinzufuegen);
  }

  async function sonderausgabeHinzufuegen() {
    const bezeichnung = document.getElementById("neue-sa-bezeichnung").value.trim();
    if (!bezeichnung) return;
    const betrag = document.getElementById("neue-sa-betrag").value;
    const monat = document.getElementById("neue-sa-monat").value;
    const notiz = document.getElementById("neue-sa-notiz").value.trim();
    await api("sonderausgabe_hinzufuegen", { bezeichnung, betrag, monat, notiz, jahr: new Date().getFullYear() });
    await ladeDaten();
    renderFinanzen();
  }

  window.sonderausgabeBearbeitenStart = function (id) {
    finBearbeiteteSonderausgabe = id;
    renderFinSonderausgaben();
  };
  window.sonderausgabeBearbeitenAbbrechen = function () {
    finBearbeiteteSonderausgabe = null;
    renderFinSonderausgaben();
  };
  window.sonderausgabeSpeichern = async function (id) {
    const s = sonderausgaben.find((x) => x.id === id);
    const bezeichnung = document.getElementById("sa-bez-" + id).value.trim();
    if (!bezeichnung) return;
    const betrag = document.getElementById("sa-betrag-" + id).value;
    const monat = document.getElementById("sa-monat-" + id).value;
    const notiz = document.getElementById("sa-notiz-" + id).value.trim();
    await api("sonderausgabe_aktualisieren", { id, bezeichnung, betrag, monat, notiz, jahr: s ? s.jahr : new Date().getFullYear() });
    finBearbeiteteSonderausgabe = null;
    await ladeDaten();
    renderFinanzen();
  };
  window.sonderausgabeLoeschen = async function (id) {
    await api("sonderausgabe_loeschen", { id });
    await ladeDaten();
    renderFinanzen();
  };

  // ==========================================================
  // Finanzen-Modul: Buchungen (Schnellerfassung, Liste, CSV-Import)
  // ==========================================================
  const MONATSNAMEN_FIN = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  function heuteISOFin() {
    return new Date().toISOString().slice(0, 10);
  }

  window.buchungTypWaehlen = function (typ) {
    buchungTypAusgewaehlt = typ;
    buchungKategorieAusgewaehlt = (typ === "einnahme" ? FIN_KAT_EINNAHME : FIN_KAT_AUSGABE)[0];
    renderFinBuchungen();
  };
  window.buchungKategorieWaehlen = function (kat) {
    buchungKategorieAusgewaehlt = kat;
    renderFinBuchungen();
  };
  window.finBuchungMonatVerschieben = function (delta) {
    finBuchMonat += delta;
    if (finBuchMonat < 1) { finBuchMonat = 12; finBuchJahr--; }
    if (finBuchMonat > 12) { finBuchMonat = 1; finBuchJahr++; }
    renderFinBuchungen();
  };

  function renderFinBuchungen() {
    const el = document.getElementById("fin-buchungen-bereich");
    const istAktuellerMonat = finBuchMonat === new Date().getMonth() + 1 && finBuchJahr === new Date().getFullYear();

    const buchungenMonat = buchungen
      .filter((b) => {
        const [j, m] = (b.datum || "").split("-");
        return Number(j) === finBuchJahr && Number(m) === finBuchMonat;
      })
      .sort((a, b) => b.datum.localeCompare(a.datum));

    const summeAusgaben = buchungenMonat.filter((b) => b.typ !== "einnahme").reduce((s, b) => s + finZahl(b.betrag), 0);
    const summeEinnahmen = buchungenMonat.filter((b) => b.typ === "einnahme").reduce((s, b) => s + finZahl(b.betrag), 0);

    const listeHtml = buchungenMonat.length
      ? buchungenMonat.map((b) => {
          const istEinnahme = b.typ === "einnahme";
          if (b.id === finBearbeiteteBuchung) {
            return `
              <div class="fin-card" data-buchung-id="${b.id}">
                <div class="fin-card-info">
                  <div class="row" style="margin-bottom:0.4rem;">
                    <input type="date" id="edit-buchung-datum-${b.id}" value="${b.datum}">
                    <input type="number" step="0.01" id="edit-buchung-betrag-${b.id}" value="${finZahl(b.betrag)}">
                  </div>
                  <div class="row" style="margin-bottom:0;">
                    <select id="edit-buchung-typ-${b.id}">
                      <option value="ausgabe" ${!istEinnahme ? "selected" : ""}>Ausgabe</option>
                      <option value="einnahme" ${istEinnahme ? "selected" : ""}>Einnahme</option>
                    </select>
                    <input type="text" id="edit-buchung-kategorie-${b.id}" value="${escapeAttr(b.kategorie || "")}" placeholder="Kategorie">
                    <input type="text" id="edit-buchung-notiz-${b.id}" value="${escapeAttr(b.notiz || "")}" placeholder="Notiz">
                  </div>
                </div>
                <button class="fin-loesch-btn" onclick="buchungAktualisieren('${b.id}')" title="Speichern">✓</button>
                <button class="fin-loesch-btn" onclick="buchungBearbeitenAbbrechen()" title="Abbrechen">×</button>
              </div>`;
          }
          return `
            <div class="fin-card" data-buchung-id="${b.id}">
              <div class="fin-card-info" style="cursor:pointer;" onclick="buchungBearbeitenStart('${b.id}')">
                <div class="fin-card-titel">${escapeHtml(b.kategorie || "Sonstiges")}</div>
                <div class="fin-card-meta">${formatDatumKurz(b.datum)}${b.herkunft === "import" ? " · Import" : ""}</div>
                ${b.notiz ? `<div class="fin-buchung-notiz">${escapeHtml(b.notiz)}</div>` : ""}
              </div>
              <div class="fin-betrag ${istEinnahme ? "fin-betrag-einnahme" : ""}">${istEinnahme ? "+" : "−"}${finEuro(b.betrag)}</div>
              <button class="fin-loesch-btn" onclick="buchungLoeschen('${b.id}')" title="Löschen">×</button>
            </div>`;
        }).join("")
      : `<p class="empty-text">Keine Buchungen in ${MONATSNAMEN_FIN[finBuchMonat - 1]} ${finBuchJahr}.</p>`;

    const kategorien = buchungTypAusgewaehlt === "einnahme" ? FIN_KAT_EINNAHME : FIN_KAT_AUSGABE;

    el.innerHTML = `
      <div class="fin-quick-form">
        <div class="plan-typ-tabs">
          <button type="button" class="plan-typ-btn ${buchungTypAusgewaehlt === "ausgabe" ? "active" : ""}" onclick="buchungTypWaehlen('ausgabe')">Ausgabe</button>
          <button type="button" class="plan-typ-btn ${buchungTypAusgewaehlt === "einnahme" ? "active" : ""}" onclick="buchungTypWaehlen('einnahme')">Einnahme</button>
        </div>

        <input type="number" step="0.01" id="neue-buchung-betrag" class="fin-quick-betrag" placeholder="0,00 €" inputmode="decimal">

        <div class="fin-kat-grid">
          ${kategorien.map((k) => `
            <button type="button" class="fin-kat-btn ${k === buchungKategorieAusgewaehlt ? "active" : ""}"
              onclick="buchungKategorieWaehlen('${escapeAttr(k)}')">${escapeHtml(k)}</button>
          `).join("")}
        </div>

        <div class="row">
          <input type="date" id="neue-buchung-datum" value="${heuteISOFin()}">
          <input type="text" id="neue-buchung-notiz" placeholder="Notiz (optional)">
        </div>

        <button class="btn-primary fin-quick-save" id="btn-buchung-speichern">Speichern</button>
      </div>

      <button class="fin-csv-btn" id="btn-csv-import">⇪ CSV importieren</button>
      <input type="file" id="csv-import-input" accept=".csv" class="hidden">

      <div class="fin-summary-row">
        <div class="fin-summary-item">
          <div class="fin-summary-label">Ausgaben</div>
          <div class="fin-summary-value">${finEuro(summeAusgaben)}</div>
        </div>
        <div class="fin-summary-item">
          <div class="fin-summary-label">Einnahmen</div>
          <div class="fin-summary-value">${finEuro(summeEinnahmen)}</div>
        </div>
      </div>

      <div class="cal-header">
        <div class="cal-nav"><button onclick="finBuchungMonatVerschieben(-1)">‹</button></div>
        <h2>${MONATSNAMEN_FIN[finBuchMonat - 1]} ${finBuchJahr}${istAktuellerMonat ? " · aktuell" : ""}</h2>
        <div class="cal-nav"><button onclick="finBuchungMonatVerschieben(1)">›</button></div>
      </div>

      ${listeHtml}
    `;

    document.getElementById("btn-buchung-speichern").addEventListener("click",
      finBearbeiteteBuchung ? () => buchungAktualisieren(finBearbeiteteBuchung) : buchungHinzufuegen);

    document.getElementById("btn-csv-import").addEventListener("click", () => {
      document.getElementById("csv-import-input").click();
    });
    document.getElementById("csv-import-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      const btn = document.getElementById("btn-csv-import");
      btn.textContent = "Importiere …";
      btn.disabled = true;
      try {
        await csvImportieren(file);
      } catch (err) {
        console.error(err);
        alert("Import fehlgeschlagen: " + (err.message || err));
      } finally {
        btn.textContent = "⇪ CSV importieren";
        btn.disabled = false;
      }
    });
  }

  async function buchungHinzufuegen() {
    const betragFeld = document.getElementById("neue-buchung-betrag");
    const betrag = betragFeld.value;
    if (!betrag || finZahl(betrag) <= 0) { betragFeld.focus(); return; }
    const datum = document.getElementById("neue-buchung-datum").value || heuteISOFin();
    const notiz = document.getElementById("neue-buchung-notiz").value.trim();
    await api("buchung_hinzufuegen", {
      datum, betrag, notiz,
      typ: buchungTypAusgewaehlt,
      kategorie: buchungKategorieAusgewaehlt,
    });
    await ladeDaten();
    renderFinanzen();
  }

  window.buchungBearbeitenStart = function (id) {
    finBearbeiteteBuchung = id;
    renderFinBuchungen();
  };
  window.buchungBearbeitenAbbrechen = function () {
    finBearbeiteteBuchung = null;
    renderFinBuchungen();
  };
  window.buchungAktualisieren = async function (id) {
    const datum = document.getElementById("edit-buchung-datum-" + id).value;
    const betrag = document.getElementById("edit-buchung-betrag-" + id).value;
    const typ = document.getElementById("edit-buchung-typ-" + id).value;
    const kategorie = document.getElementById("edit-buchung-kategorie-" + id).value.trim();
    const notiz = document.getElementById("edit-buchung-notiz-" + id).value.trim();
    await api("buchung_aktualisieren", { id, datum, betrag, typ, kategorie, notiz });
    finBearbeiteteBuchung = null;
    await ladeDaten();
    renderFinanzen();
  };
  window.buchungLoeschen = async function (id) {
    await api("buchung_loeschen", { id });
    await ladeDaten();
    renderFinanzen();
  };

  // ---- CSV-Import ----
  function findeSpalte(header, aliase) {
    for (const alias of aliase) {
      const idx = header.findIndex((h) => h.trim().toLowerCase() === alias.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  }

  function parseCsvText(text) {
    const erstenZeilen = text.split(/\r?\n/).slice(0, 5).join("\n");
    const anzahlSemikolon = (erstenZeilen.match(/;/g) || []).length;
    const anzahlKomma = (erstenZeilen.match(/,/g) || []).length;
    const trenner = anzahlSemikolon >= anzahlKomma ? ";" : ",";

    const zeilen = text.split(/\r?\n/).filter((z) => z.trim().length > 0);
    const parseZeile = (z) => z.split(trenner).map((f) => f.trim().replace(/^"|"$/g, ""));

    const header = parseZeile(zeilen[0]);
    const rows = zeilen.slice(1).map(parseZeile);
    return { header, rows };
  }

  function parseCsvBetrag(raw) {
    let s = (raw || "").trim();
    if (!s) return null;
    if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if (s.includes(",")) s = s.replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function parseCsvDatum(raw) {
    const s = (raw || "").trim();
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
    if (m) return `20${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  }

  function liesCsvDatei(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
      reader.onload = () => {
        const buffer = reader.result;
        const bytes = new Uint8Array(buffer);
        // UTF-8-BOM prüfen
        const hatBom = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
        try {
          const utf8Text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
          resolve(hatBom ? utf8Text.slice(1) : utf8Text);
        } catch {
          // Kein gültiges UTF-8 -> vermutlich Windows-1252 (typisch für Bank-Exporte)
          resolve(new TextDecoder("windows-1252").decode(buffer));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  async function csvImportieren(file) {
    const text = await liesCsvDatei(file);
    const { header, rows } = parseCsvText(text);

    const idxDatum = findeSpalte(header, CSV_DATUM_SPALTEN);
    const idxBetrag = findeSpalte(header, CSV_BETRAG_SPALTEN);
    const idxPartner = findeSpalte(header, CSV_PARTNER_SPALTEN);
    const idxZweck = findeSpalte(header, CSV_ZWECK_SPALTEN);

    if (idxDatum === -1 || idxBetrag === -1) {
      alert("Datum- oder Betrag-Spalte wurde in der CSV nicht gefunden.\n\nGefundene Spalten: " + header.join(", "));
      return;
    }

    const zeilen = [];
    let nichtLesbar = 0;
    for (const r of rows) {
      const datum = parseCsvDatum(r[idxDatum]);
      const betrag = parseCsvBetrag(r[idxBetrag]);
      if (!datum || betrag === null || betrag === 0) { nichtLesbar++; continue; }
      const partner = idxPartner !== -1 ? (r[idxPartner] || "").trim() : "";
      const zweck = idxZweck !== -1 ? (r[idxZweck] || "").trim() : "";
      const notiz = `${partner} ${zweck}`.trim().slice(0, 200);
      zeilen.push({ datum, betrag, notiz });
    }

    if (!zeilen.length) {
      alert("Keine verwertbaren Buchungen in der Datei gefunden.");
      return;
    }

    const ergebnis = await api("buchungen_batch_import", { zeilen });

    let meldung = "Import abgeschlossen\n\n" +
      `Neue Ausgaben: ${ergebnis.importiert_ausgaben}\n` +
      `Neue Einnahmen: ${ergebnis.importiert_einnahmen}\n` +
      `Bereits vorhanden (Duplikate): ${ergebnis.uebersprungen_duplikate}\n` +
      `Als Fixkosten erkannt & übersprungen: ${ergebnis.uebersprungen_fixkosten}\n` +
      (nichtLesbar ? `Nicht lesbare Zeilen: ${nichtLesbar}\n` : "");

    const treffer = Object.entries(ergebnis.fixkosten_treffer || {});
    if (treffer.length) {
      treffer.sort((a, b) => b[1] - a[1]);
      meldung += "\nErkannte Fixkosten (Beispiele):\n" + treffer.slice(0, 8).map(([k, v]) => `  ${k}: ${v}x`).join("\n");
    }
    alert(meldung);

    await ladeDaten();

    const kandidaten = erkennKandidatenFin(buchungen);
    if (kandidaten.length) {
      zeigeErkennungsModal(kandidaten);
    } else {
      renderFinanzen();
    }
  }

  // ---- Wiederkehrend-Erkennung (portiert aus erkennung.py) ----
  const FIN_NOISE_WORDS = [
    "KARTENZAHLUNG", "LASTSCHRIFT", "UEBERWEISUNG", "ÜBERWEISUNG",
    "GUTSCHRIFT", "DAUERAUFTRAG", "ECHTZEITUEBERWEISUNG", "SEPA",
  ];

  function finNormalizeKey(notiz) {
    let text = (notiz || "").toUpperCase();
    FIN_NOISE_WORDS.forEach((w) => { text = text.split(w).join(" "); });
    text = text.replace(/[0-9]+/g, " ");
    text = text.replace(/[^A-ZÄÖÜẞ\s]/g, " ");
    text = text.replace(/\s+/g, " ").trim();
    return text.split(" ").filter(Boolean).slice(0, 4).join(" ");
  }

  function finMedian(zahlen) {
    const sortiert = [...zahlen].sort((a, b) => a - b);
    const mitte = Math.floor(sortiert.length / 2);
    return sortiert.length % 2 !== 0 ? sortiert[mitte] : (sortiert[mitte - 1] + sortiert[mitte]) / 2;
  }

  function erkennKandidatenFin(alleBuchungen, minMonate = 2, varianzSchwelle = 0.2) {
    const gruppen = new Map();
    for (const b of alleBuchungen) {
      const schluesselText = finNormalizeKey(b.notiz);
      if (!schluesselText) continue;
      const key = (b.typ || "ausgabe") + "|" + schluesselText;
      if (!gruppen.has(key)) gruppen.set(key, []);
      gruppen.get(key).push(b);
    }

    const kandidaten = [];
    for (const [key, eintraege] of gruppen.entries()) {
      const typ = key.split("|")[0];
      const monate = new Set(eintraege.map((e) => (e.datum || "").slice(0, 7)).filter(Boolean));
      if (monate.size < minMonate) continue;

      const betraege = eintraege.map((e) => finZahl(e.betrag)).filter((b) => b);
      if (!betraege.length) continue;
      const median = finMedian(betraege);
      const spanne = median ? (Math.max(...betraege) - Math.min(...betraege)) / median : 0;

      const notizCounts = new Map();
      eintraege.forEach((e) => {
        const n = (e.notiz || "").trim();
        notizCounts.set(n, (notizCounts.get(n) || 0) + 1);
      });
      let bezeichnungVorschlag = "";
      let bestCount = 0;
      for (const [n, c] of notizCounts.entries()) {
        if (c > bestCount) { bestCount = c; bezeichnungVorschlag = n; }
      }
      bezeichnungVorschlag = (bezeichnungVorschlag || key).slice(0, 60);

      kandidaten.push({
        typ,
        bezeichnungVorschlag,
        anzahlMonate: monate.size,
        anzahlBuchungen: eintraege.length,
        betragMedian: Math.round(median * 100) / 100,
        variabel: spanne > varianzSchwelle,
        buchungIds: eintraege.map((e) => e.id).filter(Boolean),
        ausgewaehlt: true,
      });
    }

    kandidaten.sort((a, b) => b.anzahlMonate - a.anzahlMonate || a.bezeichnungVorschlag.localeCompare(b.bezeichnungVorschlag));
    return kandidaten;
  }

  let finErkennungKandidaten = [];
  let finBuchungenLoeschenNachUebernahme = true;

  function zeigeErkennungsModal(kandidaten) {
    finErkennungKandidaten = kandidaten;
    const overlay = document.createElement("div");
    overlay.className = "fin-modal-overlay";
    overlay.id = "fin-erkennung-overlay";
    document.body.appendChild(overlay);
    renderErkennungsModal();
  }

  function renderErkennungsModal() {
    const overlay = document.getElementById("fin-erkennung-overlay");
    if (!overlay) return;
    overlay.innerHTML = `
      <div class="fin-modal">
        <div class="fin-modal-kopf">
          <h2>Wiederkehrende Buchungen erkannt</h2>
          <p class="hero-text" style="margin:0;">${finErkennungKandidaten.length} Kandidat(en) gefunden – als Fixkosten übernehmen?</p>
        </div>
        <div class="fin-modal-body">
          ${finErkennungKandidaten.map((k, i) => `
            <div class="fin-kandidat">
              <input type="checkbox" ${k.ausgewaehlt ? "checked" : ""} onchange="finKandidatUmschalten(${i})">
              <div class="fin-kandidat-felder">
                <input type="text" id="fin-kand-bez-${i}" value="${escapeAttr(k.bezeichnungVorschlag)}">
                <div class="row">
                  <select id="fin-kand-typ-${i}">
                    <option value="ausgabe" ${k.typ === "ausgabe" ? "selected" : ""}>Ausgabe</option>
                    <option value="einnahme" ${k.typ === "einnahme" ? "selected" : ""}>Einnahme</option>
                  </select>
                  <input type="number" step="0.01" id="fin-kand-betrag-${i}" value="${k.betragMedian}" style="width:7rem;">
                </div>
                <div class="fin-kandidat-meta">
                  ${k.anzahlBuchungen}× über ${k.anzahlMonate} Monate${k.variabel ? " · Betrag schwankt" : ""}
                </div>
              </div>
            </div>
          `).join("")}
        </div>
        <div class="fin-modal-fuss">
          <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.85rem; color:var(--ink-dim);">
            <input type="checkbox" id="fin-erkennung-loeschen" ${finBuchungenLoeschenNachUebernahme ? "checked" : ""}>
            Einzelbuchungen danach löschen
          </label>
          <div style="display:flex; gap:0.5rem;">
            <button class="link-btn" id="fin-erkennung-verwerfen">Verwerfen</button>
            <button class="btn-primary" id="fin-erkennung-uebernehmen">Übernehmen</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("fin-erkennung-loeschen").addEventListener("change", (e) => {
      finBuchungenLoeschenNachUebernahme = e.target.checked;
    });
    document.getElementById("fin-erkennung-verwerfen").addEventListener("click", schliesseErkennungsModal);
    document.getElementById("fin-erkennung-uebernehmen").addEventListener("click", erkennungUebernehmen);
  }

  window.finKandidatUmschalten = function (i) {
    finErkennungKandidaten[i].ausgewaehlt = !finErkennungKandidaten[i].ausgewaehlt;
  };

  function schliesseErkennungsModal() {
    const overlay = document.getElementById("fin-erkennung-overlay");
    if (overlay) overlay.remove();
    finErkennungKandidaten = [];
    renderFinanzen();
  }

  async function erkennungUebernehmen() {
    const ausgewaehlte = finErkennungKandidaten.filter((k) => k.ausgewaehlt);
    let angelegt = 0;
    let geloescht = 0;

    for (let i = 0; i < finErkennungKandidaten.length; i++) {
      const k = finErkennungKandidaten[i];
      if (!k.ausgewaehlt) continue;
      const bezeichnung = document.getElementById("fin-kand-bez-" + i).value.trim();
      const typ = document.getElementById("fin-kand-typ-" + i).value;
      const betrag = document.getElementById("fin-kand-betrag-" + i).value;
      if (!bezeichnung) continue;

      const zahlung = { bezeichnung, typ };
      FIN_MONATE.forEach((m) => { zahlung[m] = betrag; });
      await api("fixkosten_hinzufuegen", zahlung);
      angelegt++;

      if (finBuchungenLoeschenNachUebernahme) {
        for (const id of k.buchungIds) {
          await api("buchung_loeschen", { id });
          geloescht++;
        }
      }
    }

    schliesseErkennungsModal();
    await ladeDaten();
    renderFinanzen();
    alert(`${angelegt} Fixkosten-Position(en) angelegt` + (geloescht ? `, ${geloescht} Einzelbuchung(en) gelöscht.` : "."));
  }

  // ==========================================================
  // Finanzen-Modul: Jahresübersicht (Kontostand-Kette + Charts)
  // ==========================================================
  window.finUebJahrVerschieben = function (delta) {
    finUebJahr += delta;
    renderFinUebersicht();
  };

  async function renderFinUebersicht() {
    const el = document.getElementById("fin-uebersicht-bereich");
    el.innerHTML = `<p class="empty-text">Lade Jahresübersicht …</p>`;

    const einstellung = finanzEinstellungen.find((e) => Number(e.jahr) === finUebJahr);
    const startkapital = einstellung ? finZahl(einstellung.start_kontostand) : 0;

    let daten;
    try {
      daten = await api("finanzen_jahresuebersicht", { jahr: finUebJahr });
    } catch (err) {
      el.innerHTML = `<p class="empty-text">Übersicht konnte nicht geladen werden.</p>`;
      return;
    }
    finUebersichtDaten = daten;
    const zeilen = daten.zeilen || [];

    const jahresEinnahmen = zeilen.reduce((s, z) => s + finZahl(z.einnahmen_gesamt), 0);
    const jahresAusgaben = zeilen.reduce((s, z) => s + finZahl(z.ausgaben_gesamt), 0);
    const kontostandEnde = zeilen.length ? zeilen[zeilen.length - 1].kontostand_ende : startkapital;

    el.innerHTML = `
      <div class="cal-header">
        <div class="cal-nav"><button onclick="finUebJahrVerschieben(-1)">‹</button></div>
        <h2>${finUebJahr}</h2>
        <div class="cal-nav"><button onclick="finUebJahrVerschieben(1)">›</button></div>
      </div>

      <div class="fin-startkapital-row">
        Startkapital ${finUebJahr}:
        <input type="number" step="0.01" id="fin-startkapital-input" value="${startkapital}">
        <button class="link-btn" id="fin-startkapital-speichern">speichern</button>
      </div>

      <div class="fin-summary-row">
        <div class="fin-summary-item">
          <div class="fin-summary-label">Einnahmen ${finUebJahr}</div>
          <div class="fin-summary-value">${finEuro(jahresEinnahmen)}</div>
        </div>
        <div class="fin-summary-item">
          <div class="fin-summary-label">Ausgaben ${finUebJahr}</div>
          <div class="fin-summary-value">${finEuro(jahresAusgaben)}</div>
        </div>
        <div class="fin-summary-item">
          <div class="fin-summary-label">Kontostand Ende ${finUebJahr}</div>
          <div class="fin-summary-value">${finEuro(kontostandEnde)}</div>
        </div>
      </div>

      <div class="fin-chart-wrap">
        <h3>Einnahmen &amp; Ausgaben pro Monat</h3>
        ${finChartEinnahmenAusgaben(zeilen)}
        <div class="fin-chart-legende">
          <span><span class="fin-legende-punkt" style="background:#2f9e6f;"></span>Einnahmen</span>
          <span><span class="fin-legende-punkt" style="background:var(--mod-finanzen);"></span>Ausgaben</span>
        </div>
      </div>

      <div class="fin-chart-wrap">
        <h3>Kontostand-Verlauf</h3>
        ${finChartKontostand(zeilen, startkapital)}
      </div>

      <div class="fin-chart-wrap">
        <h3>Ausgaben nach Kategorie (${finUebJahr})</h3>
        ${finChartKategorien(finUebJahr)}
      </div>

      <div class="fin-tabelle-wrap">
        <table class="fin-tabelle">
          <thead>
            <tr>
              <th class="fin-bez-th">Monat</th>
              <th>Einnahmen</th>
              <th>Ausgaben</th>
              <th>Differenz</th>
              <th>Kontostand Ende</th>
            </tr>
          </thead>
          <tbody>
            ${zeilen.map((z) => `
              <tr>
                <td class="fin-bez">${FIN_MONATSNAMEN_KURZ[z.monat - 1]}</td>
                <td>${finEuro(z.einnahmen_gesamt)}</td>
                <td>${finEuro(z.ausgaben_gesamt)}</td>
                <td style="${z.differenz < 0 ? "color:var(--overdue-text);" : ""}">${finEuro(z.differenz)}</td>
                <td><strong>${finEuro(z.kontostand_ende)}</strong></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById("fin-startkapital-speichern").addEventListener("click", async () => {
      const wert = document.getElementById("fin-startkapital-input").value;
      await api("startkapital_speichern", { jahr: finUebJahr, start_kontostand: wert });
      await ladeDaten();
      renderFinUebersicht();
    });
  }

  function finChartEinnahmenAusgaben(zeilen) {
    const breite = 700, hoehe = 220, unten = 30, oben = 12, linksrand = 6;
    const maxWert = Math.max(1, ...zeilen.map((z) => Math.max(finZahl(z.einnahmen_gesamt), finZahl(z.ausgaben_gesamt))));
    const gruppenBreite = (breite - linksrand * 2) / 12;
    const balkenBreite = gruppenBreite * 0.32;

    let balken = "";
    zeilen.forEach((z, i) => {
      const x0 = linksrand + i * gruppenBreite + gruppenBreite * 0.14;
      const hE = ((hoehe - oben - unten) * finZahl(z.einnahmen_gesamt)) / maxWert;
      const hA = ((hoehe - oben - unten) * finZahl(z.ausgaben_gesamt)) / maxWert;
      balken += `<rect x="${x0}" y="${hoehe - unten - hE}" width="${balkenBreite}" height="${hE}" fill="#2f9e6f" rx="1.5"></rect>`;
      balken += `<rect x="${x0 + balkenBreite + 2}" y="${hoehe - unten - hA}" width="${balkenBreite}" height="${hA}" fill="var(--mod-finanzen)" rx="1.5"></rect>`;
      balken += `<text x="${x0 + balkenBreite}" y="${hoehe - 10}" font-size="9" fill="var(--ink-dim)" text-anchor="middle">${FIN_MONATSNAMEN_KURZ[i]}</text>`;
    });

    return `<svg viewBox="0 0 ${breite} ${hoehe}" style="width:100%; height:auto; display:block;">
      <line x1="0" y1="${hoehe - unten}" x2="${breite}" y2="${hoehe - unten}" stroke="var(--border)" stroke-width="1"></line>
      ${balken}
    </svg>`;
  }

  function finChartKontostand(zeilen, startkapital) {
    const breite = 700, hoehe = 200, unten = 24, oben = 16;
    const werte = [startkapital, ...zeilen.map((z) => finZahl(z.kontostand_ende))];
    const minWert = Math.min(0, ...werte);
    const maxWert = Math.max(1, ...werte);
    const spanne = maxWert - minWert || 1;
    const schrittX = (breite - 20) / (werte.length - 1 || 1);
    const yVon = (w) => oben + (hoehe - oben - unten) * (1 - (w - minWert) / spanne);

    const punkte = werte.map((w, i) => `${10 + i * schrittX},${yVon(w).toFixed(1)}`).join(" ");
    const nullY = yVon(0).toFixed(1);

    const labels = ["Start", ...zeilen.map((z) => FIN_MONATSNAMEN_KURZ[z.monat - 1])];
    let labelSvg = "";
    werte.forEach((w, i) => {
      if (i % 2 === 0 || werte.length <= 7) {
        labelSvg += `<text x="${10 + i * schrittX}" y="${hoehe - 6}" font-size="9" fill="var(--ink-dim)" text-anchor="middle">${labels[i]}</text>`;
      }
    });

    return `<svg viewBox="0 0 ${breite} ${hoehe}" style="width:100%; height:auto; display:block;">
      <line x1="0" y1="${nullY}" x2="${breite}" y2="${nullY}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"></line>
      <polyline points="${punkte}" fill="none" stroke="var(--accent)" stroke-width="2"></polyline>
      ${werte.map((w, i) => `<circle cx="${10 + i * schrittX}" cy="${yVon(w).toFixed(1)}" r="2.6" fill="var(--accent)"></circle>`).join("")}
      ${labelSvg}
    </svg>`;
  }

  function finChartKategorien(jahr) {
    const summenProKategorie = {};
    buchungen
      .filter((b) => b.typ !== "einnahme" && (b.datum || "").slice(0, 4) === String(jahr))
      .forEach((b) => {
        const kat = b.kategorie || "Sonstiges";
        summenProKategorie[kat] = (summenProKategorie[kat] || 0) + finZahl(b.betrag);
      });

    const eintraege = Object.entries(summenProKategorie).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!eintraege.length) return `<p class="empty-text">Keine Ausgaben-Buchungen für ${jahr}.</p>`;

    const breite = 700;
    const zeilenHoehe = 26;
    const hoehe = eintraege.length * zeilenHoehe + 10;
    const maxWert = Math.max(...eintraege.map(([, w]) => w));
    const labelBreite = 130;
    const balkenMax = breite - labelBreite - 60;

    const balken = eintraege.map(([kat, wert], i) => {
      const y = i * zeilenHoehe + 6;
      const b = (balkenMax * wert) / maxWert;
      return `
        <text x="0" y="${y + 13}" font-size="10" fill="var(--ink)">${escapeHtml(kat.length > 16 ? kat.slice(0, 15) + "…" : kat)}</text>
        <rect x="${labelBreite}" y="${y}" width="${Math.max(2, b)}" height="16" rx="3" fill="var(--mod-finanzen)"></rect>
        <text x="${labelBreite + b + 6}" y="${y + 13}" font-size="10" fill="var(--ink-dim)">${finEuro(wert)}</text>
      `;
    }).join("");

    return `<svg viewBox="0 0 ${breite} ${hoehe}" style="width:100%; height:auto; display:block;">${balken}</svg>`;
  }

