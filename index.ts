// ============================================================
// Edge Function: aufgaben-api
// Einzige Tür zu den Daten. Login läuft über die Aktion "login"
// (Passwort → Token). Alle anderen Aktionen verlangen ein gültiges
// Token statt des Passworts selbst. Führt dann die passende
// Datenbank-Aktion aus. Läuft mit dem service_role-key, der
// niemals im Frontend sichtbar ist.
//
// Deploy: supabase functions deploy aufgaben-api
// Secrets vorher setzen (siehe SETUP.md):
//   APP_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   ALLOWED_ORIGIN (z. B. https://deinname.github.io)
// (SUPABASE_URL ist automatisch vorhanden, die anderen drei
//  müssen als Secrets gesetzt werden)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
// Supabase benennt die Keys um: früher "service_role", heute "secret".
// Diese Funktion probiert beide Varianten, damit sie unabhängig davon
// funktioniert, welches Key-System dein Projekt gerade nutzt.
function findeServiceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;

  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysRaw) {
    try {
      const parsed = JSON.parse(secretKeysRaw);
      const ersterKey = Object.values(parsed)[0];
      if (ersterKey) return ersterKey as string;
    } catch {
      // ignorieren, unten wird dann ein Fehler geworfen
    }
  }
  throw new Error(
    "Kein Service-/Secret-Key gefunden. SUPABASE_SERVICE_ROLE_KEY oder SUPABASE_SECRET_KEYS muss gesetzt sein."
  );
}
const serviceRoleKey = findeServiceKey();
const appPassword = Deno.env.get("APP_PASSWORD")!;

// Ohne gesetztes ALLOWED_ORIGIN fällt CORS auf "*" zurück – funktioniert,
// aber der Origin-Schutz greift dann nicht. Wird beim Start geloggt,
// damit das nicht stillschweigend passiert.
const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN");
if (!allowedOrigin) {
  console.warn("ALLOWED_ORIGIN nicht gesetzt – CORS fällt auf '*' zurück.");
}

// Session-Gültigkeit: 90 Tage. Danach muss sich der Nutzer erneut mit
// dem Passwort anmelden. Bei Bedarf anpassen.
const SESSION_GUELTIGKEIT_TAGE = 90;

// Rate-Limiting: maximal 5 Fehlversuche je IP innerhalb von 15 Minuten,
// der 6. Versuch wird abgelehnt, ohne das Passwort überhaupt zu prüfen.
const MAX_FEHLVERSUCHE = 5;
const FEHLVERSUCHE_FENSTER_MINUTEN = 15;

// Google-Kalender-Sync: Secrets für den OAuth-Flow. GOOGLE_REDIRECT_URI
// muss exakt der in der Google Cloud Console hinterlegten Redirect-URI
// entsprechen (die Wurzel-URL des Dashboards).
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
const googleRedirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");
// Eigenes Secret für den automatischen Cron-Sync (nicht das Login-Passwort).
const cronSecret = Deno.env.get("CRON_SECRET");
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";

const supabase = createClient(supabaseUrl, serviceRoleKey);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": allowedOrigin || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function heuteISO() {
  return new Date().toISOString().slice(0, 10);
}

function addTage(datumISO: string, tage: number) {
  const d = new Date(datumISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

// Finanzen-Modul: Spaltennamen der 12 Monate in "fixkosten" (ohne Umlaute,
// damit es gültige SQL-Bezeichner sind). Reihenfolge = Jan…Dez.
const MONATE = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "dez"];

function parseBetrag(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// CSV-Import: Keyword-Zuordnung für automatische Kategorisierung.
// Übernommen aus dem bisherigen Python-Import-Skript.
const AUSGABEN_KEYWORDS: Record<string, string[]> = {
  "Lebensmittel": ["REWE", "EDEKA", "ALDI", "LIDL", "PENNY", "KAUFLAND", "NETTO", "NORMA", "REAL"],
  "Hygiene": ["DM ", "DM-DROGERIE", "ROSSMANN", "BUDNI", "MUELLER", "MÜLLER"],
  "Tanken": ["SHELL", "ARAL", "ESSO", "JET ", "STAR TANK", "TOTAL", "AVIA", "AGIP"],
  "Haus": ["BAUHAUS", "OBI ", "HORNBACH", "TOOM", "HAGEBAU"],
};
const EINNAHMEN_KEYWORDS: Record<string, string[]> = {
  "Gehalt": ["GEHALT", "LOHN", "BEZUEGE", "BEZÜGE"],
  "Rückerstattung": ["ERSTATTUNG", "RUECKZAHLUNG", "RÜCKZAHLUNG", "REFUND", "STORNO"],
};

function guessKategorie(text: string, typ: string): string {
  const textUp = text.toUpperCase();
  const quelle = typ === "einnahme" ? EINNAHMEN_KEYWORDS : AUSGABEN_KEYWORDS;
  for (const [kat, kws] of Object.entries(quelle)) {
    for (const kw of kws) {
      if (textUp.includes(kw)) return kat;
    }
  }
  return "Sonstiges";
}

// Baut aus den Fixkosten-Bezeichnungen eine Liste von Such-Stichwörtern,
// damit importierte Buchungen, die zu einer bekannten Fixkosten-Position
// gehören, übersprungen werden (nicht doppelt zählen).
function fixkostenStichwoerter(fixkosten: { bezeichnung: string }[]): string[] {
  const woerter: string[] = [];
  for (const f of fixkosten) {
    const name = (f.bezeichnung || "").split("(")[0].trim();
    if (name.length >= 4) woerter.push(name.toUpperCase());
  }
  return woerter;
}

function matchtFixkosten(text: string, stichwoerter: string[]): string | null {
  const textUp = text.toUpperCase();
  for (const w of stichwoerter) {
    if (textUp.includes(w)) return w;
  }
  return null;
}

// Schlüssel zur Duplikat-Erkennung: gleiches Datum, gleicher Betrag,
// gleicher (gekürzter) Notiztext.
function buchungSchluessel(datum: string, betrag: number, notiz: string): string {
  return `${datum}|${round2(Math.abs(betrag))}|${(notiz || "").slice(0, 25)}`;
}

// Ermittelt die Client-IP aus den Proxy-Headern. Supabase Edge Functions
// laufen hinter einem Proxy, die echte IP steht in x-forwarded-for
// (erster Eintrag der Liste). Ohne Header wird ein Platzhalter genutzt –
// dann greift das Rate-Limiting global statt pro Client, was im
// Zweifel sicherer ist als gar kein Limit.
function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unbekannt";
}

// Prüft, ob für diese IP das Fehlversuch-Limit erreicht ist.
async function istRateLimitiert(ip: string): Promise<boolean> {
  const seit = new Date(Date.now() - FEHLVERSUCHE_FENSTER_MINUTEN * 60_000).toISOString();
  const { count, error } = await supabase
    .from("login_versuche")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("versucht_am", seit);
  if (error) {
    console.error("Rate-Limit-Check fehlgeschlagen:", error);
    return false; // im Zweifel nicht blockieren, nur loggen
  }
  return (count ?? 0) >= MAX_FEHLVERSUCHE;
}

async function protokolliereFehlversuch(ip: string) {
  try {
    await supabase.from("login_versuche").insert({ ip });
  } catch (e) {
    console.error("Fehlversuch-Log fehlgeschlagen:", e);
  }
}

// Legt eine neue Session an und gibt das Token zurück.
async function erstelleSession(): Promise<string> {
  const laeuftAb = new Date(
    Date.now() + SESSION_GUELTIGKEIT_TAGE * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data, error } = await supabase
    .from("sessions")
    .insert({ laeuft_ab: laeuftAb })
    .select("token")
    .single();
  if (error) throw error;
  return data.token as string;
}

// Prüft ein übergebenes Token gegen die sessions-Tabelle. Läuft eine
// Session ab, wird sie bei der Prüfung direkt mit gelöscht (kein
// separater Cronjob nötig).
async function tokenGueltig(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const { data, error } = await supabase
    .from("sessions")
    .select("laeuft_ab")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return false;
  if (new Date(data.laeuft_ab).getTime() < Date.now()) {
    await supabase.from("sessions").delete().eq("token", token);
    return false;
  }
  return true;
}

// ------------------------------------------------------------
// Google-Kalender-Sync: OAuth-Hilfsfunktionen
// ------------------------------------------------------------

// Baut die Google-Login-URL, zu der das Frontend den Nutzer schickt.
// access_type=offline + prompt=consent sorgen dafür, dass wir bei
// jedem Login ein Refresh-Token bekommen (nicht nur beim allerersten).
function baueGoogleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: googleClientId!,
    redirect_uri: googleRedirectUri!,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Tauscht den von Google zurückgegebenen Autorisierungs-Code gegen
// Access- und Refresh-Token und speichert sie.
async function googleCodeGegenTokenTauschen(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId!,
      client_secret: googleClientSecret!,
      code,
      redirect_uri: googleRedirectUri!,
      grant_type: "authorization_code",
    }),
  });
  const daten = await res.json();
  if (!res.ok) {
    console.error("Google-Token-Austausch fehlgeschlagen:", daten);
    throw new Error(daten.error_description || "Google-Login fehlgeschlagen");
  }
  if (!daten.refresh_token) {
    // Passiert z. B., wenn der Nutzer den Zugriff schon einmal ohne
    // prompt=consent erteilt hatte. Google gibt dann kein neues
    // Refresh-Token aus - der Nutzer müsste den Zugriff in seinem
    // Google-Konto erst widerrufen, bevor ein erneuter Login klappt.
    throw new Error(
      "Kein Refresh-Token von Google erhalten. Bitte den Dashboard-Zugriff " +
      "unter myaccount.google.com/permissions entfernen und erneut verbinden."
    );
  }
  const laeuftAb = new Date(Date.now() + daten.expires_in * 1000).toISOString();
  const { error } = await supabase.from("google_tokens").upsert({
    id: "default",
    access_token: daten.access_token,
    refresh_token: daten.refresh_token,
    laeuft_ab: laeuftAb,
    aktualisiert_am: new Date().toISOString(),
  });
  if (error) throw error;
}

// Liefert ein gültiges Access-Token, erneuert es bei Bedarf über das
// gespeicherte Refresh-Token. Wirft einen Fehler, wenn keine Google-
// Verbindung besteht.
async function googleAccessTokenHolen(): Promise<string> {
  const { data, error } = await supabase
    .from("google_tokens")
    .select("access_token, refresh_token, laeuft_ab")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Keine Google-Verbindung eingerichtet");

  // Etwas Puffer (60 Sek.) vor dem tatsächlichen Ablauf erneuern.
  if (new Date(data.laeuft_ab).getTime() > Date.now() + 60_000) {
    return data.access_token;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId!,
      client_secret: googleClientSecret!,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const neu = await res.json();
  if (!res.ok) {
    console.error("Google-Token-Refresh fehlgeschlagen:", neu);
    throw new Error("Google-Verbindung abgelaufen. Bitte erneut verbinden.");
  }
  const laeuftAb = new Date(Date.now() + neu.expires_in * 1000).toISOString();
  await supabase
    .from("google_tokens")
    .update({ access_token: neu.access_token, laeuft_ab: laeuftAb, aktualisiert_am: new Date().toISOString() })
    .eq("id", "default");
  return neu.access_token;
}

// Feste Zeitzone für alle Termine, da Ein-Personen-App ohne
// Zeitzonen-Auswahl im Frontend.
const GOOGLE_ZEITZONE = "Europe/Berlin";

// Wandelt einen lokalen Termin in ein Google-Calendar-Event um.
function terminZuGoogleEvent(termin: any) {
  // termin.uhrzeit/ende_uhrzeit kommen aus einer Postgres-"time"-Spalte und
  // können je nach Rückgabeformat "HH:MM" oder "HH:MM:SS" sein. Immer auf
  // die ersten 5 Zeichen (HH:MM) kürzen, bevor ":00" angehängt wird – sonst
  // entsteht bei "HH:MM:SS" ein ungültiges "HH:MM:SS:00" und Google lehnt
  // mit 400 Bad Request ab.
  const uhrzeitKurz = termin.uhrzeit ? String(termin.uhrzeit).slice(0, 5) : null;
  const endeUhrzeitKurz = termin.ende_uhrzeit ? String(termin.ende_uhrzeit).slice(0, 5) : null;

  const start = uhrzeitKurz
    ? { dateTime: `${termin.datum}T${uhrzeitKurz}:00`, timeZone: GOOGLE_ZEITZONE }
    : { date: termin.datum };
  let ende: any;
  if (uhrzeitKurz) {
    if (endeUhrzeitKurz) {
      // Liegt die Enduhrzeit (rein als Uhrzeit betrachtet) vor der
      // Startuhrzeit, bedeutet das einen Übertrag über Mitternacht
      // (z. B. Start 22:00, Ende 00:30) – dann gehört das Ende auf den
      // Folgetag, sonst wäre Ende < Start und Google lehnt mit
      // "timeRangeEmpty" ab.
      let endeDatum = termin.datum;
      if (endeUhrzeitKurz <= uhrzeitKurz) {
        const naechsterTag = new Date(`${termin.datum}T00:00:00`);
        naechsterTag.setDate(naechsterTag.getDate() + 1);
        endeDatum = naechsterTag.toISOString().slice(0, 10);
      }
      ende = { dateTime: `${endeDatum}T${endeUhrzeitKurz}:00`, timeZone: GOOGLE_ZEITZONE };
    } else {
      // Keine Enduhrzeit gesetzt: Standard-Dauer 1 Stunde. Reine
      // Zahlen-Arithmetik statt Date-Objekt, damit ein Übertrag über
      // Mitternacht (z. B. Start 23:30) korrekt auf den Folgetag
      // rutscht statt eine Endzeit vor der Startzeit zu erzeugen.
      const [h, m] = uhrzeitKurz.split(":").map(Number);
      let endeStunde = h + 1;
      let endeDatum = termin.datum;
      if (endeStunde >= 24) {
        endeStunde -= 24;
        const naechsterTag = new Date(`${termin.datum}T00:00:00`);
        naechsterTag.setDate(naechsterTag.getDate() + 1);
        endeDatum = naechsterTag.toISOString().slice(0, 10);
      }
      const endeUhrzeit = `${String(endeStunde).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      ende = { dateTime: `${endeDatum}T${endeUhrzeit}:00`, timeZone: GOOGLE_ZEITZONE };
    }
  } else {
    // Google verlangt bei ganztägigen Events ein exklusives Enddatum,
    // also den Folgetag (sonst wird das Event von Google abgelehnt
    // oder als nulltägig interpretiert).
    const folgetag = new Date(`${termin.datum}T00:00:00`);
    folgetag.setDate(folgetag.getDate() + 1);
    ende = { date: folgetag.toISOString().slice(0, 10) };
  }
  return {
    summary: termin.titel,
    description: termin.notiz || undefined,
    start,
    end: ende,
  };
}

// Wandelt ein Google-Calendar-Event in die passenden Spalten für
// die termine-Tabelle um (ohne id/google_event_id, die werden vom
// Aufrufer gesetzt).
function googleEventZuTerminFelder(event: any) {
  const istGanztaegig = !!event.start?.date;
  const datum = istGanztaegig ? event.start.date : event.start.dateTime.slice(0, 10);
  const uhrzeit = istGanztaegig ? null : event.start.dateTime.slice(11, 16);
  const endeUhrzeit = istGanztaegig || !event.end?.dateTime ? null : event.end.dateTime.slice(11, 16);
  return {
    titel: event.summary || "(ohne Titel)",
    datum,
    uhrzeit,
    ende_uhrzeit: endeUhrzeit,
    notiz: event.description || null,
  };
}

// Holt alle Änderungen aus Google Calendar seit dem letzten Sync
// (oder alle Termine der letzten 90 Tage plus Zukunft beim ersten
// Mal). Löst automatisch einen vollständigen Neuabgleich aus, falls
// der gespeicherte Sync-Token von Google als ungültig zurückgewiesen
// wird (Status 410 – z. B. nach sehr langer Sync-Pause).
async function googleEventsAbholen(accessToken: string, syncToken: string | null) {
  const alleEvents: any[] = [];
  let pageToken: string | undefined;
  let neuerSyncToken: string | undefined;
  let brauchtVollenResync = false;

  do {
    const params = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "250" });
    if (pageToken) params.set("pageToken", pageToken);
    if (syncToken && !brauchtVollenResync) {
      params.set("syncToken", syncToken);
    } else {
      const vor90Tagen = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      params.set("timeMin", vor90Tagen);
      params.set("orderBy", "startTime");
    }

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const daten = await res.json();

    if (!res.ok) {
      if (res.status === 410 && syncToken && !brauchtVollenResync) {
        // Sync-Token ungültig geworden: einmal komplett neu von vorn.
        brauchtVollenResync = true;
        pageToken = undefined;
        alleEvents.length = 0;
        continue;
      }
      console.error("Google-Events-Abruf fehlgeschlagen:", daten);
      throw new Error("Google-Kalender-Abruf fehlgeschlagen");
    }

    alleEvents.push(...(daten.items || []));
    pageToken = daten.nextPageToken;
    if (daten.nextSyncToken) neuerSyncToken = daten.nextSyncToken;
  } while (pageToken);

  return { events: alleEvents, neuerSyncToken };
}

async function googleEventErstellen(accessToken: string, termin: any): Promise<string> {
  const eventBody = terminZuGoogleEvent(termin);
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody),
    }
  );
  const daten = await res.json();
  if (!res.ok) {
    console.error("Google-Event-Erstellung fehlgeschlagen:", daten, "gesendet:", eventBody, "termin-id:", termin.id);
    throw new Error("Termin konnte nicht zu Google übertragen werden");
  }
  return daten.id;
}

async function googleEventAktualisieren(accessToken: string, googleEventId: string, termin: any) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(terminZuGoogleEvent(termin)),
    }
  );
  if (!res.ok) {
    const daten = await res.json().catch(() => ({}));
    console.error("Google-Event-Update fehlgeschlagen:", daten);
    // Event existiert bei Google nicht mehr (z. B. dort gelöscht) → nicht
    // hart abbrechen, der Aufrufer kümmert sich um den Sonderfall.
    if (res.status === 404 || res.status === 410) return false;
    // Manche Google-Events (z. B. automatisch aus Kontakten erzeugte
    // Geburtstags-Events) lassen sich grundsätzlich nie per API ändern
    // ("eventTypeRestriction"). Das ist keine vorübergehende Störung,
    // sondern eine dauerhafte Google-Beschränkung – speziell markieren,
    // damit der Aufrufer den Termin dauerhaft von zukünftigen Push-
    // Versuchen ausschließen kann, statt es bei jedem Cron-Lauf erneut
    // (erfolglos) zu versuchen.
    const grund = daten?.error?.errors?.[0]?.reason;
    if (grund === "eventTypeRestriction") {
      throw new Error("EVENT_TYPE_RESTRICTION");
    }
    // Googles Schreib-Quota wurde erreicht (z. B. bei einem großen
    // Nachhol-Batch). Das ist vorübergehend – der Aufrufer soll es nach
    // kurzer Pause erneut versuchen, statt den Termin sofort aufzugeben.
    if (grund === "rateLimitExceeded" || grund === "userRateLimitExceeded" || res.status === 429) {
      throw new Error("RATE_LIMITED");
    }
    throw new Error("Termin-Update konnte nicht zu Google übertragen werden");
  }
  return true;
}

async function googleEventLoeschen(accessToken: string, googleEventId: string) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
  );
  // 404/410 = bei Google ohnehin schon weg, zählt als Erfolg.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const daten = await res.json().catch(() => ({}));
    console.error("Google-Event-Löschung fehlgeschlagen:", daten);
    throw new Error("Termin konnte bei Google nicht gelöscht werden");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Kernstück: gleicht termine ↔ Google Calendar in beide Richtungen ab.
// Konfliktregel: neuere Änderung gewinnt (Vergleich per Zeitstempel).
async function googleSyncDurchfuehren() {
  const diagStart = Date.now();
  console.log("[SYNC] Start");
  const accessToken = await googleAccessTokenHolen();
  console.log(`[SYNC] Access-Token geholt (+${Date.now() - diagStart}ms)`);
  const syncBeginn = new Date().toISOString();

  // Lock: verhindert, dass zwei Sync-Läufe gleichzeitig laufen (z. B.
  // manueller Klick trifft auf einen laufenden Cron-Durchlauf) und
  // dabei doppelte Google-Events anlegen. Ein Lock gilt nach 5 Minuten
  // automatisch als hinfällig (Absicherung gegen einen abgestürzten,
  // nie fertig gewordenen Lauf).
  const fuenfMinutenAlt = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: lockErhalten } = await supabase
    .from("google_sync_status")
    .update({ sync_laeuft_seit: syncBeginn })
    .eq("id", "default")
    .or(`sync_laeuft_seit.is.null,sync_laeuft_seit.lt.${fuenfMinutenAlt}`)
    .select("id");
  if (!lockErhalten || lockErhalten.length === 0) {
    // Zeile existiert evtl. noch gar nicht (allererster Sync) -
    // dann per Upsert anlegen und Lock direkt mit übernehmen.
    const { data: erstAngelegt } = await supabase
      .from("google_sync_status")
      .upsert({ id: "default", sync_laeuft_seit: syncBeginn }, { onConflict: "id", ignoreDuplicates: false })
      .select("id");
    if (!erstAngelegt || erstAngelegt.length === 0) {
      throw new Error("Ein anderer Sync-Durchlauf läuft gerade noch. Bitte in ein paar Minuten erneut versuchen.");
    }
  }

  console.log(`[SYNC] Lock erhalten (+${Date.now() - diagStart}ms)`);

  const { data: statusRow } = await supabase
    .from("google_sync_status")
    .select("sync_token, letzter_sync")
    .eq("id", "default")
    .maybeSingle();
  const alterSyncToken = statusRow?.sync_token || null;
  const letzterSyncVorher = statusRow?.letzter_sync || "1970-01-01T00:00:00.000Z";

  let erstellt = 0, aktualisiert = 0, geloescht = 0;
  const inDieserRundeBearbeitet = new Set<string>();

  try {
    // --- Phase 1: Änderungen von Google abholen und lokal einpflegen ---
    const { events, neuerSyncToken } = await googleEventsAbholen(accessToken, alterSyncToken);
    console.log(`[SYNC] Phase 1a: ${events.length} Google-Events abgeholt (+${Date.now() - diagStart}ms)`);

    // Statt pro Event einzeln nachzufragen (bei vielen Events sehr langsam:
    // N+1-Problem, 500+ Events bedeuten sonst 500+ sequenzielle DB-Anfragen),
    // einmalig alle verknüpften Termine vorladen und danach nur noch
    // gebündelt (batch) schreiben.
    const { data: vorhandene } = await supabase
      .from("termine")
      .select("id, titel, google_event_id, aktualisiert_am")
      .not("google_event_id", "is", null);
    const vorhandeneMap = new Map<string, { id: string; titel: string; aktualisiert_am: string }>();
    for (const t of vorhandene || []) {
      vorhandeneMap.set(t.google_event_id, t);
    }
    console.log(`[SYNC] Phase 1b: ${vorhandeneMap.size} bestehende Termine vorgeladen (+${Date.now() - diagStart}ms)`);

    const idsZumLoeschen: string[] = [];
    const zeilenZumErstellen: any[] = [];
    const zeilenZumAktualisieren: any[] = [];

    for (const event of events) {
      const bestehender = vorhandeneMap.get(event.id);

      if (event.status === "cancelled") {
        if (bestehender) {
          idsZumLoeschen.push(bestehender.id);
          inDieserRundeBearbeitet.add(bestehender.id);
          geloescht++;
        }
        continue;
      }

      const felder = googleEventZuTerminFelder(event);

      if (bestehender) {
        const googleZeit = new Date(event.updated).getTime();
        const lokaleZeit = new Date(bestehender.aktualisiert_am).getTime();
        if (googleZeit > lokaleZeit) {
          zeilenZumAktualisieren.push({ id: bestehender.id, ...felder });
          inDieserRundeBearbeitet.add(bestehender.id);
          aktualisiert++;
        }
        // sonst: lokale Version ist neuer/gleich → wird ggf. in Phase 2 zu Google gepusht
      } else {
        zeilenZumErstellen.push({ ...felder, google_event_id: event.id });
      }
    }
    console.log(`[SYNC] Phase 1c: ${idsZumLoeschen.length} löschen, ${zeilenZumErstellen.length} erstellen, ${zeilenZumAktualisieren.length} aktualisieren, geplant (+${Date.now() - diagStart}ms)`);

    if (idsZumLoeschen.length > 0) {
      await supabase.from("termine").delete().in("id", idsZumLoeschen);
      await logVerlauf("Termin", "gelöscht (Google-Sync)", `${idsZumLoeschen.length} Termin(e)`);
    }
    if (zeilenZumErstellen.length > 0) {
      const { data: neuEingefuegt } = await supabase.from("termine").insert(zeilenZumErstellen).select("id");
      for (const neu of neuEingefuegt || []) {
        inDieserRundeBearbeitet.add(neu.id);
      }
      await logVerlauf("Termin", "importiert (Google-Sync)", `${zeilenZumErstellen.length} Termin(e)`);
    }
    if (zeilenZumAktualisieren.length > 0) {
      await supabase.from("termine").upsert(zeilenZumAktualisieren, { onConflict: "id" });
    }
    console.log(`[SYNC] Phase 1d fertig: Datenbank-Schreibvorgänge abgeschlossen (+${Date.now() - diagStart}ms)`);

    console.log(`[SYNC] Phase 1 gesamt fertig: ${zeilenZumErstellen.length} erstellt, ${zeilenZumAktualisieren.length} aktualisiert, ${idsZumLoeschen.length} gelöscht (+${Date.now() - diagStart}ms)`);

    // --- Phase 2: Lokale Änderungen zu Google pushen ---
    // 2a: Termine, die noch nie mit Google verknüpft waren.
    const { data: unverknuepfte } = await supabase
      .from("termine")
      .select("*")
      .is("google_event_id", null);
    console.log(`[SYNC] Phase 2a: ${unverknuepfte?.length ?? 0} unverknüpfte Termine zu pushen (+${Date.now() - diagStart}ms)`);
    for (const termin of unverknuepfte || []) {
      try {
        const googleId = await googleEventErstellen(accessToken, termin);
        await supabase.from("termine").update({ google_event_id: googleId }).eq("id", termin.id);
        inDieserRundeBearbeitet.add(termin.id);
        erstellt++;
      } catch (fehler) {
        // Ein einzelner fehlerhafter Termin (z. B. ungültige Zeitspanne)
        // darf nicht den kompletten Sync abbrechen – sonst wird
        // letzter_sync/sync_token nie aktualisiert und jeder folgende
        // Cron-Lauf scheitert erneut am selben Termin, in einer Endlosschleife.
        console.error(`[SYNC] Termin ${termin.id} konnte nicht erstellt werden, wird übersprungen:`, fehler);
      }
      // Kleine Pause zwischen den Google-Schreibzugriffen, damit bei
      // größeren Batches nicht Googles Schreib-Quota (rateLimitExceeded)
      // getriggert wird.
      await sleep(120);
    }

    console.log(`[SYNC] Phase 2a fertig (+${Date.now() - diagStart}ms)`);

    // 2b: Verknüpfte Termine, die seit dem letzten Sync lokal geändert
    // wurden (und nicht schon gerade in Phase 1 von Google aktualisiert).
    // PostgREST liefert ohne Pagination standardmäßig maximal 1000 Zeilen
    // pro Anfrage – bei einem großen Nachhol-Batch (z. B. erster Lauf nach
    // längerer Pause) reicht das nicht aus. Deshalb seitenweise abholen,
    // bis eine Seite kürzer als das Limit ist.
    const geaendert: any[] = [];
    {
      const SEITENGROESSE = 1000;
      let von = 0;
      while (true) {
        const { data: seite, error: eSeite } = await supabase
          .from("termine")
          .select("*")
          .not("google_event_id", "is", null)
          .eq("google_kein_push", false)
          .gt("aktualisiert_am", letzterSyncVorher)
          .order("id", { ascending: true })
          .range(von, von + SEITENGROESSE - 1);
        if (eSeite) throw eSeite;
        geaendert.push(...(seite || []));
        if (!seite || seite.length < SEITENGROESSE) break;
        von += SEITENGROESSE;
      }
    }
    console.log(`[SYNC] Phase 2b: ${geaendert.length} geänderte Termine zu pushen (+${Date.now() - diagStart}ms)`);
    for (const termin of geaendert) {
      if (inDieserRundeBearbeitet.has(termin.id)) continue;
      try {
        let erfolgreich: boolean;
        try {
          erfolgreich = await googleEventAktualisieren(accessToken, termin.google_event_id, termin);
        } catch (fehler) {
          // Bei einem vorübergehenden Rate-Limit einmal nach kurzer Pause
          // erneut versuchen, statt den Termin sofort aufzugeben – er
          // würde sonst erst beim nächsten Cron-Takt (in 15 Min.)
          // nachgeholt.
          if (fehler instanceof Error && fehler.message === "RATE_LIMITED") {
            console.log(`[SYNC] Rate-Limit bei Termin ${termin.id}, warte und versuche erneut`);
            await sleep(2000);
            erfolgreich = await googleEventAktualisieren(accessToken, termin.google_event_id, termin);
          } else {
            throw fehler;
          }
        }
        if (erfolgreich) aktualisiert++;
      } catch (fehler) {
        if (fehler instanceof Error && fehler.message === "EVENT_TYPE_RESTRICTION") {
          // Dauerhafte Google-Beschränkung (z. B. automatisches
          // Geburtstags-Event) – künftig nie wieder push-versuchen.
          await supabase.from("termine").update({ google_kein_push: true }).eq("id", termin.id);
          console.log(`[SYNC] Termin ${termin.id} dauerhaft von Google-Push ausgeschlossen (eventTypeRestriction)`);
        } else {
          console.error(`[SYNC] Termin ${termin.id} konnte nicht aktualisiert werden, wird übersprungen:`, fehler);
        }
      }
      // Kleine Pause zwischen den Google-Schreibzugriffen, damit bei
      // größeren Batches nicht erneut die Schreib-Quota getriggert wird.
      await sleep(120);
    }
    console.log(`[SYNC] Phase 2b fertig (+${Date.now() - diagStart}ms)`);

    // --- Phase 3: Lokal gelöschte, verknüpfte Termine bei Google entfernen ---
    const { data: geloeschteEintraege } = await supabase
      .from("geloeschte_google_termine")
      .select("id, google_event_id");
    console.log(`[SYNC] Phase 3: ${geloeschteEintraege?.length ?? 0} zu löschende Termine (+${Date.now() - diagStart}ms)`);
    for (const eintrag of geloeschteEintraege || []) {
      try {
        await googleEventLoeschen(accessToken, eintrag.google_event_id);
        await supabase.from("geloeschte_google_termine").delete().eq("id", eintrag.id);
        geloescht++;
      } catch (fehler) {
        console.error(`[SYNC] Löschung von ${eintrag.google_event_id} fehlgeschlagen, wird übersprungen:`, fehler);
      }
    }
    console.log(`[SYNC] Phase 3 fertig (+${Date.now() - diagStart}ms)`);

    // --- Abschluss: Sync-Stand speichern, Lock freigeben ---
    await supabase.from("google_sync_status").upsert({
      id: "default",
      sync_token: neuerSyncToken || alterSyncToken,
      letzter_sync: syncBeginn,
      sync_laeuft_seit: null,
    });

    return { erstellt, aktualisiert, geloescht };
  } finally {
    // Lock in jedem Fall freigeben, auch bei einem Fehler mittendrin -
    // sonst müsste man nach einem Fehlschlag 5 Minuten warten.
    await supabase
      .from("google_sync_status")
      .update({ sync_laeuft_seit: null })
      .eq("id", "default");
  }
}

// Schreibt einen Eintrag in den Aktivitäts-Verlauf. Fehler dabei werden
// bewusst nur geloggt, nicht nach außen geworfen - der Verlauf ist ein
// "nice to have" und soll nie eine eigentliche Aktion verhindern.
async function logVerlauf(kategorie: string, aktion: string, beschreibung: string) {
  try {
    await supabase.from("verlauf").insert({ kategorie, aktion, beschreibung });
  } catch (e) {
    console.error("Verlauf-Log fehlgeschlagen:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ungültiger Request-Body" }, 400);
  }

  const { action, token } = body;

  // "login" läuft vor der Token-Prüfung: hier wird noch das Passwort
  // geschickt, dafür gibt es im Erfolgsfall ein Token zurück.
  if (action === "login") {
    const ip = clientIp(req);
    if (await istRateLimitiert(ip)) {
      return json({ error: "Zu viele Fehlversuche. Bitte 15 Minuten warten." }, 429);
    }
    if (body.pass !== appPassword) {
      await protokolliereFehlversuch(ip);
      return json({ error: "Falsches Passwort" }, 401);
    }
    try {
      const neuesToken = await erstelleSession();
      return json({ token: neuesToken });
    } catch (err) {
      console.error(err);
      return json({ error: "Serverfehler beim Login" }, 500);
    }
  }

  // "logout" braucht nur ein gültiges Token, um die Session zu löschen.
  if (action === "logout") {
    if (token) {
      await supabase.from("sessions").delete().eq("token", token);
    }
    return json({ ok: true });
  }

  // "google_sync_cron" läuft serverseitig (Postgres-Cron-Job, kein
  // Browser, kein Login-Token) und wird stattdessen über ein eigenes,
  // separates Secret abgesichert – bewusst getrennt vom normalen
  // Token-Login, damit ein abgelaufenes/gelöschtes Login-Token den
  // automatischen Sync nicht stoppen kann.
  if (action === "google_sync_cron") {
    if (!cronSecret || body.cron_secret !== cronSecret) {
      return json({ error: "Ungültiges Cron-Secret" }, 401);
    }
    try {
      const ergebnis = await googleSyncDurchfuehren();
      if (ergebnis.erstellt || ergebnis.aktualisiert || ergebnis.geloescht) {
        await logVerlauf(
          "Google-Sync",
          "automatisch abgeglichen",
          `${ergebnis.erstellt} neu, ${ergebnis.aktualisiert} aktualisiert, ${ergebnis.geloescht} gelöscht`
        );
      }
      return json({ ok: true, ...ergebnis });
    } catch (err: any) {
      console.error("Automatischer Google-Sync fehlgeschlagen:", err);
      return json({ error: err.message || "Sync fehlgeschlagen" }, 500);
    }
  }

  // Alle übrigen Aktionen verlangen ein gültiges Token.
  if (!(await tokenGueltig(token))) {
    return json({ error: "Nicht angemeldet" }, 401);
  }

  try {
    switch (action) {
      case "liste": {
        const { data: projekte, error: e1 } = await supabase
          .from("projekte")
          .select("*")
          .order("name");
        if (e1) throw e1;

        const { data: aufgaben, error: e2 } = await supabase
          .from("aufgaben")
          .select("*")
          .order("erstellt_am", { ascending: false });
        if (e2) throw e2;

        const { data: termine, error: e3 } = await supabase
          .from("termine")
          .select("*")
          .order("datum", { ascending: true });
        if (e3) throw e3;

        const { data: notizen, error: e4 } = await supabase
          .from("notizen")
          .select("*")
          .order("erstellt_am", { ascending: false });
        if (e4) throw e4;

        const { data: links, error: e5 } = await supabase
          .from("links")
          .select("*")
          .order("erstellt_am", { ascending: false });
        if (e5) throw e5;

        const { data: reflexionen, error: e6 } = await supabase
          .from("reflexionen")
          .select("*")
          .order("datum", { ascending: false });
        if (e6) throw e6;

        const { data: einkaufsliste, error: e7 } = await supabase
          .from("einkaufsliste")
          .select("*")
          .order("erstellt_am", { ascending: false });
        if (e7) throw e7;

        const { data: verlauf, error: e8 } = await supabase
          .from("verlauf")
          .select("*")
          .order("erstellt_am", { ascending: false })
          .limit(50);
        if (e8) throw e8;

        const { data: ziele, error: e9 } = await supabase
          .from("ziele")
          .select("*")
          .order("zeitraum_start", { ascending: true });
        if (e9) throw e9;

        const { data: zielSchritte, error: e10 } = await supabase
          .from("ziel_schritte")
          .select("*")
          .order("erstellt_am", { ascending: true });
        if (e10) throw e10;

        const { data: blockzeiten, error: e11 } = await supabase
          .from("blockzeiten")
          .select("*")
          .order("start_zeit", { ascending: true });
        if (e11) throw e11;

        const { data: tagesrahmen, error: e12 } = await supabase
          .from("tagesrahmen")
          .select("*")
          .order("wochentag", { ascending: true });
        if (e12) throw e12;

        const { data: fixkosten, error: e13 } = await supabase
          .from("fixkosten")
          .select("*")
          .order("typ", { ascending: true })
          .order("bezeichnung", { ascending: true });
        if (e13) throw e13;

        const { data: sonderausgaben, error: e14 } = await supabase
          .from("sonderausgaben")
          .select("*")
          .order("erstellt_am", { ascending: true });
        if (e14) throw e14;

        const { data: buchungen, error: e15 } = await supabase
          .from("buchungen")
          .select("*")
          .order("datum", { ascending: false });
        if (e15) throw e15;

        const { data: finanzEinstellungen, error: e16 } = await supabase
          .from("finanz_einstellungen")
          .select("*");
        if (e16) throw e16;

        return json({
          projekte, aufgaben, termine, notizen, links, reflexionen, einkaufsliste, verlauf,
          ziele, ziel_schritte: zielSchritte, blockzeiten, tagesrahmen,
          fixkosten, sonderausgaben, buchungen, finanz_einstellungen: finanzEinstellungen,
        });
      }

      case "wetter_abrufen": {
        const ort = (body.ort || "").trim();
        if (!ort) return json({ error: "Ort fehlt" }, 400);

        // Schritt 1: Ortsname in Koordinaten umwandeln.
        // Open-Meteo: kein API-Key, keine Registrierung, kein Tracking bekannt –
        // deshalb hier ohne zusätzliches Secret/Vault-Eintrag nutzbar.
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ort)}&count=1&language=de&format=json`
        );
        if (!geoRes.ok) return json({ error: "Geocoding-Dienst nicht erreichbar" }, 502);
        const geoDaten = await geoRes.json();
        const treffer = geoDaten?.results?.[0];
        if (!treffer) return json({ error: `Ort "${ort}" nicht gefunden` }, 404);

        // Schritt 2: Vorhersage für die gefundenen Koordinaten holen.
        const wetterRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${treffer.latitude}&longitude=${treffer.longitude}` +
          `&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum` +
          `&timezone=auto&forecast_days=5`
        );
        if (!wetterRes.ok) return json({ error: "Wetterdienst nicht erreichbar" }, 502);
        const wetterDaten = await wetterRes.json();

        const tage = (wetterDaten?.daily?.time || []).map((datum: string, i: number) => ({
          datum,
          code: wetterDaten.daily.weathercode[i],
          min: wetterDaten.daily.temperature_2m_min[i],
          max: wetterDaten.daily.temperature_2m_max[i],
          niederschlag: wetterDaten.daily.precipitation_sum[i],
        }));

        return json({
          ort_gefunden: [treffer.name, treffer.admin1].filter(Boolean).join(", "),
          aktuelle_temperatur: wetterDaten?.current_weather?.temperature ?? null,
          aktueller_code: wetterDaten?.current_weather?.weathercode ?? null,
          tage,
        });
      }

      case "projekt_hinzufuegen": {
        const name = (body.name || "").trim();
        if (!name) return json({ error: "Name fehlt" }, 400);
        const { error } = await supabase
          .from("projekte")
          .insert({ name })
          .select();
        // Duplikate (unique constraint) einfach ignorieren
        if (error && !String(error.message).includes("duplicate")) throw error;
        return json({ ok: true });
      }

      case "projekt_umbenennen": {
        const name = (body.name || "").trim();
        if (!name || !body.id) return json({ error: "Name oder ID fehlt" }, 400);
        const { error } = await supabase
          .from("projekte")
          .update({ name })
          .eq("id", body.id);
        if (error && !String(error.message).includes("duplicate")) throw error;
        if (error) return json({ error: "Ein Projekt mit diesem Namen existiert schon" }, 400);
        return json({ ok: true });
      }

      case "aufgabe_hinzufuegen": {
        const titel = (body.titel || "").trim();
        if (!titel) return json({ error: "Titel fehlt" }, 400);
        const intervall = body.erinnere_alle_tage ? parseInt(body.erinnere_alle_tage, 10) : null;
        const heute = heuteISO();

        const { error } = await supabase.from("aufgaben").insert({
          titel,
          projekt_id: body.projekt_id || null,
          faellig_am: body.faellig_am || null,
          uhrzeit: body.uhrzeit || null,
          ende_uhrzeit: body.ende_uhrzeit || null,
          erinnere_alle_tage: intervall,
          naechste_erinnerung: intervall ? addTage(heute, intervall) : null,
        });
        if (error) throw error;
        await logVerlauf("Aufgabe", "hinzugefügt", titel);
        return json({ ok: true });
      }

      case "aufgabe_umschalten": {
        const { data: current, error: e1 } = await supabase
          .from("aufgaben")
          .select("erledigt, titel")
          .eq("id", body.id)
          .single();
        if (e1) throw e1;

        const { error } = await supabase
          .from("aufgaben")
          .update({ erledigt: !current.erledigt })
          .eq("id", body.id);
        if (error) throw error;
        await logVerlauf("Aufgabe", current.erledigt ? "wieder geöffnet" : "erledigt", current.titel);
        return json({ ok: true });
      }

      case "aufgabe_aktualisieren": {
        const titel = (body.titel || "").trim();
        if (!titel || !body.id) return json({ error: "Titel und ID sind Pflicht" }, 400);

        const { error } = await supabase
          .from("aufgaben")
          .update({
            titel,
            projekt_id: body.projekt_id || null,
            faellig_am: body.faellig_am || null,
            uhrzeit: body.uhrzeit || null,
            ende_uhrzeit: body.ende_uhrzeit || null,
          })
          .eq("id", body.id);
        if (error) throw error;
        await logVerlauf("Aufgabe", "bearbeitet", titel);
        return json({ ok: true });
      }

      case "aufgabe_loeschen": {
        const { data: current } = await supabase.from("aufgaben").select("titel").eq("id", body.id).single();
        const { error } = await supabase.from("aufgaben").delete().eq("id", body.id);
        if (error) throw error;
        if (current) await logVerlauf("Aufgabe", "gelöscht", current.titel);
        return json({ ok: true });
      }

      case "erinnerung_verschieben": {
        const { data: current, error: e1 } = await supabase
          .from("aufgaben")
          .select("erinnere_alle_tage")
          .eq("id", body.id)
          .single();
        if (e1) throw e1;
        if (!current.erinnere_alle_tage) return json({ ok: true });

        const neueErinnerung = addTage(heuteISO(), current.erinnere_alle_tage);
        const { error } = await supabase
          .from("aufgaben")
          .update({ naechste_erinnerung: neueErinnerung })
          .eq("id", body.id);
        if (error) throw error;
        return json({ ok: true });
      }

      // ------------------------------------------------------------
      // Google-Kalender-Sync: Verbindungs-Actions
      // ------------------------------------------------------------
      case "google_auth_start": {
        if (!googleClientId || !googleRedirectUri) {
          return json({ error: "Google-Integration ist serverseitig nicht konfiguriert" }, 500);
        }
        return json({ url: baueGoogleAuthUrl() });
      }

      case "google_auth_callback": {
        if (!body.code) return json({ error: "Kein Code erhalten" }, 400);
        try {
          await googleCodeGegenTokenTauschen(body.code);
        } catch (err: any) {
          return json({ error: err.message || "Google-Login fehlgeschlagen" }, 400);
        }
        await logVerlauf("Google-Sync", "verbunden", "Google-Kalender verknüpft");
        return json({ ok: true });
      }

      case "google_status": {
        const { data } = await supabase
          .from("google_tokens")
          .select("aktualisiert_am")
          .eq("id", "default")
          .maybeSingle();
        const { data: syncStatus } = await supabase
          .from("google_sync_status")
          .select("letzter_sync")
          .eq("id", "default")
          .maybeSingle();
        return json({
          verbunden: !!data,
          verbunden_seit: data?.aktualisiert_am || null,
          letzter_sync: syncStatus?.letzter_sync || null,
        });
      }

      case "google_sync": {
        try {
          const ergebnis = await googleSyncDurchfuehren();
          if (ergebnis.erstellt || ergebnis.aktualisiert || ergebnis.geloescht) {
            await logVerlauf(
              "Google-Sync",
              "abgeglichen",
              `${ergebnis.erstellt} neu, ${ergebnis.aktualisiert} aktualisiert, ${ergebnis.geloescht} gelöscht`
            );
          }
          return json({ ok: true, ...ergebnis });
        } catch (err: any) {
          console.error("Google-Sync fehlgeschlagen:", err);
          return json({ error: err.message || "Google-Sync fehlgeschlagen" }, 500);
        }
      }

      case "google_disconnect": {
        const { data } = await supabase
          .from("google_tokens")
          .select("access_token")
          .eq("id", "default")
          .maybeSingle();
        if (data?.access_token) {
          // Zugriff bei Google selbst widerrufen, nicht nur lokal löschen.
          await fetch("https://oauth2.googleapis.com/revoke", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token: data.access_token }),
          }).catch((e) => console.error("Google-Revoke fehlgeschlagen:", e));
        }
        await supabase.from("google_tokens").delete().eq("id", "default");
        await supabase.from("google_sync_status").delete().eq("id", "default");
        await logVerlauf("Google-Sync", "getrennt", "Google-Kalender-Verknüpfung entfernt");
        return json({ ok: true });
      }

      case "termin_umschalten": {
        const { data: current, error: e1 } = await supabase
          .from("termine")
          .select("erledigt, titel")
          .eq("id", body.id)
          .single();
        if (e1) throw e1;

        const { error } = await supabase
          .from("termine")
          .update({ erledigt: !current.erledigt })
          .eq("id", body.id);
        if (error) throw error;
        await logVerlauf("Termin", current.erledigt ? "wieder geöffnet" : "erledigt", current.titel);
        return json({ ok: true });
      }

      case "termin_hinzufuegen": {
        const titel = (body.titel || "").trim();
        const datum = body.datum || null;
        if (!titel || !datum) return json({ error: "Titel und Datum sind Pflicht" }, 400);

        const { error } = await supabase.from("termine").insert({
          titel,
          datum,
          uhrzeit: body.uhrzeit || null,
          ende_uhrzeit: body.ende_uhrzeit || null,
          notiz: body.notiz || null,
        });
        if (error) throw error;
        await logVerlauf("Termin", "hinzugefügt", `${titel} (${datum})`);
        return json({ ok: true });
      }

      case "termin_aktualisieren": {
        const titel = (body.titel || "").trim();
        if (!titel || !body.id) return json({ error: "Titel und ID sind Pflicht" }, 400);

        const updateData: Record<string, unknown> = {
          titel,
          uhrzeit: body.uhrzeit || null,
          ende_uhrzeit: body.ende_uhrzeit || null,
          notiz: body.notiz || null,
        };
        if (body.datum) updateData.datum = body.datum; // erlaubt Verschieben auf einen anderen Tag

        const { error } = await supabase.from("termine").update(updateData).eq("id", body.id);
        if (error) throw error;
        await logVerlauf("Termin", "bearbeitet", titel);
        return json({ ok: true });
      }

      case "termin_loeschen": {
        const { data: current } = await supabase
          .from("termine")
          .select("titel, google_event_id")
          .eq("id", body.id)
          .single();
        const { error } = await supabase.from("termine").delete().eq("id", body.id);
        if (error) throw error;
        // War der Termin schon mit Google verknüpft, muss der nächste
        // Sync das Event auch dort löschen.
        if (current?.google_event_id) {
          await supabase
            .from("geloeschte_google_termine")
            .insert({ google_event_id: current.google_event_id });
        }
        if (current) await logVerlauf("Termin", "gelöscht", current.titel);
        return json({ ok: true });
      }

      case "notiz_hinzufuegen": {
        const text = (body.text || "").trim();
        if (!text) return json({ error: "Text fehlt" }, 400);

        const { error } = await supabase.from("notizen").insert({
          text,
          projekt_id: body.projekt_id || null,
        });
        if (error) throw error;
        await logVerlauf("Notiz", "hinzugefügt", text.slice(0, 60));
        return json({ ok: true });
      }

      case "notiz_loeschen": {
        const { error } = await supabase.from("notizen").delete().eq("id", body.id);
        if (error) throw error;
        await logVerlauf("Notiz", "gelöscht", "");
        return json({ ok: true });
      }

      case "link_hinzufuegen": {
        const titel = (body.titel || "").trim();
        let url = (body.url || "").trim();
        if (!titel || !url) return json({ error: "Titel und URL sind Pflicht" }, 400);
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;

        const { error } = await supabase.from("links").insert({
          titel,
          url,
          notiz: body.notiz || null,
          projekt_id: body.projekt_id || null,
        });
        if (error) throw error;
        await logVerlauf("Link", "hinzugefügt", titel);
        return json({ ok: true });
      }

      case "link_loeschen": {
        const { data: current } = await supabase.from("links").select("titel").eq("id", body.id).single();
        const { error } = await supabase.from("links").delete().eq("id", body.id);
        if (error) throw error;
        if (current) await logVerlauf("Link", "gelöscht", current.titel);
        return json({ ok: true });
      }

      case "reflexion_hinzufuegen": {
        const text = (body.text || "").trim();
        if (!text) return json({ error: "Text fehlt" }, 400);

        const { error } = await supabase.from("reflexionen").insert({
          text,
          datum: body.datum || heuteISO(),
        });
        if (error) throw error;
        await logVerlauf("Reflexion", "hinzugefügt", text.slice(0, 60));
        return json({ ok: true });
      }

      case "reflexion_aktualisieren": {
        const text = (body.text || "").trim();
        if (!text || !body.id) return json({ error: "Text und ID sind Pflicht" }, 400);

        const { error } = await supabase
          .from("reflexionen")
          .update({
            text,
            datum: body.datum || heuteISO(),
          })
          .eq("id", body.id);
        if (error) throw error;
        await logVerlauf("Reflexion", "bearbeitet", text.slice(0, 60));
        return json({ ok: true });
      }

      case "reflexion_loeschen": {
        const { error } = await supabase.from("reflexionen").delete().eq("id", body.id);
        if (error) throw error;
        await logVerlauf("Reflexion", "gelöscht", "");
        return json({ ok: true });
      }

      case "einkauf_hinzufuegen": {
        const text = (body.text || "").trim();
        if (!text) return json({ error: "Text fehlt" }, 400);

        const { error } = await supabase.from("einkaufsliste").insert({ text });
        if (error) throw error;
        await logVerlauf("Einkauf", "hinzugefügt", text);
        return json({ ok: true });
      }

      case "einkauf_umschalten": {
        const { data: current, error: e1 } = await supabase
          .from("einkaufsliste")
          .select("erledigt, text")
          .eq("id", body.id)
          .single();
        if (e1) throw e1;

        const { error } = await supabase
          .from("einkaufsliste")
          .update({ erledigt: !current.erledigt })
          .eq("id", body.id);
        if (error) throw error;
        await logVerlauf("Einkauf", current.erledigt ? "wieder geöffnet" : "erledigt", current.text);
        return json({ ok: true });
      }

      case "einkauf_loeschen": {
        const { error } = await supabase.from("einkaufsliste").delete().eq("id", body.id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "ziel_hinzufuegen": {
        const titel = (body.titel || "").trim();
        const zeitraumTyp = body.zeitraum_typ;
        const zeitraumStart = body.zeitraum_start;
        if (!titel || !["woche", "monat", "jahr"].includes(zeitraumTyp) || !zeitraumStart) {
          return json({ error: "Titel, Zeitraum-Typ und Zeitraum-Start sind Pflicht" }, 400);
        }

        const { error } = await supabase.from("ziele").insert({
          titel,
          zeitraum_typ: zeitraumTyp,
          zeitraum_start: zeitraumStart,
          uebergeordnetes_ziel_id: body.uebergeordnetes_ziel_id || null,
        });
        if (error) throw error;
        await logVerlauf("Ziel", "hinzugefügt", titel);
        return json({ ok: true });
      }

      case "ziel_loeschen": {
        const { data: current } = await supabase.from("ziele").select("titel").eq("id", body.id).single();
        const { error } = await supabase.from("ziele").delete().eq("id", body.id);
        if (error) throw error;
        if (current) await logVerlauf("Ziel", "gelöscht", current.titel);
        return json({ ok: true });
      }

      case "ziel_schritt_hinzufuegen": {
        const text = (body.text || "").trim();
        if (!text || !body.ziel_id) return json({ error: "Text und Ziel sind Pflicht" }, 400);

        const { error } = await supabase.from("ziel_schritte").insert({
          ziel_id: body.ziel_id,
          text,
        });
        if (error) throw error;
        return json({ ok: true });
      }

      case "ziel_schritt_umschalten": {
        const { data: current, error: e1 } = await supabase
          .from("ziel_schritte")
          .select("erledigt")
          .eq("id", body.id)
          .single();
        if (e1) throw e1;

        const { error } = await supabase
          .from("ziel_schritte")
          .update({ erledigt: !current.erledigt })
          .eq("id", body.id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "ziel_schritt_loeschen": {
        const { error } = await supabase.from("ziel_schritte").delete().eq("id", body.id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "blockzeit_hinzufuegen": {
        const titel = (body.titel || "").trim();
        const start_zeit = body.start_zeit || null;
        const end_zeit = body.end_zeit || null;
        if (!titel || !start_zeit || !end_zeit) {
          return json({ error: "Titel, Start und Ende sind Pflicht" }, 400);
        }

        const { error } = await supabase.from("blockzeiten").insert({
          titel,
          start_zeit,
          end_zeit,
          wochentage: Array.isArray(body.wochentage) && body.wochentage.length > 0 ? body.wochentage : null,
          datum: body.datum || null,
          notiz: body.notiz || null,
        });
        if (error) throw error;
        await logVerlauf("Blockzeit", "hinzugefügt", titel);
        return json({ ok: true });
      }

      case "blockzeit_aktualisieren": {
        const titel = (body.titel || "").trim();
        if (!titel || !body.id) return json({ error: "Titel und ID sind Pflicht" }, 400);

        const { error } = await supabase
          .from("blockzeiten")
          .update({
            titel,
            start_zeit: body.start_zeit || null,
            end_zeit: body.end_zeit || null,
            wochentage: Array.isArray(body.wochentage) && body.wochentage.length > 0 ? body.wochentage : null,
            datum: body.datum || null,
            notiz: body.notiz || null,
          })
          .eq("id", body.id);
        if (error) throw error;
        await logVerlauf("Blockzeit", "bearbeitet", titel);
        return json({ ok: true });
      }

      case "blockzeit_loeschen": {
        const { data: current } = await supabase.from("blockzeiten").select("titel").eq("id", body.id).single();
        const { error } = await supabase.from("blockzeiten").delete().eq("id", body.id);
        if (error) throw error;
        if (current) await logVerlauf("Blockzeit", "gelöscht", current.titel);
        return json({ ok: true });
      }

      case "tagesrahmen_speichern": {
        if (body.wochentag === undefined || body.wochentag === null) {
          return json({ error: "Wochentag fehlt" }, 400);
        }
        const start_zeit = body.start_zeit || null;
        const end_zeit = body.end_zeit || null;
        if (!start_zeit || !end_zeit) return json({ error: "Start und Ende sind Pflicht" }, 400);
        const aktiv = body.aktiv !== false;

        const { error } = await supabase
          .from("tagesrahmen")
          .upsert(
            { wochentag: body.wochentag, start_zeit, end_zeit, aktiv },
            { onConflict: "wochentag" }
          );
        if (error) throw error;
        return json({ ok: true });
      }

      // ============================================================
      // Finanzen-Modul
      // ============================================================
      case "fixkosten_hinzufuegen": {
        const bezeichnung = (body.bezeichnung || "").trim();
        const typ = body.typ;
        if (!bezeichnung || !["ausgabe", "einnahme"].includes(typ)) {
          return json({ error: "Bezeichnung und Typ (ausgabe/einnahme) sind Pflicht" }, 400);
        }
        const row: Record<string, unknown> = {
          bezeichnung,
          typ,
          kategorie: body.kategorie || null,
        };
        for (const m of MONATE) {
          row[m] = parseBetrag(body[m]);
        }
        const { error } = await supabase.from("fixkosten").insert(row);
        if (error) throw error;
        await logVerlauf("Finanzen", "Fixkosten hinzugefügt", bezeichnung);
        return json({ ok: true });
      }

      case "fixkosten_aktualisieren": {
        if (!body.id) return json({ error: "ID fehlt" }, 400);
        const bezeichnung = (body.bezeichnung || "").trim();
        if (!bezeichnung) return json({ error: "Bezeichnung fehlt" }, 400);
        const update: Record<string, unknown> = {
          bezeichnung,
          kategorie: body.kategorie || null,
        };
        for (const m of MONATE) {
          if (body[m] !== undefined) update[m] = parseBetrag(body[m]);
        }
        const { error } = await supabase.from("fixkosten").update(update).eq("id", body.id);
        if (error) throw error;
        await logVerlauf("Finanzen", "Fixkosten bearbeitet", bezeichnung);
        return json({ ok: true });
      }

      case "fixkosten_loeschen": {
        const { data: current } = await supabase.from("fixkosten").select("bezeichnung").eq("id", body.id).single();
        const { error } = await supabase.from("fixkosten").delete().eq("id", body.id);
        if (error) throw error;
        if (current) await logVerlauf("Finanzen", "Fixkosten gelöscht", current.bezeichnung);
        return json({ ok: true });
      }

      case "sonderausgabe_hinzufuegen": {
        const bezeichnung = (body.bezeichnung || "").trim();
        if (!bezeichnung) return json({ error: "Bezeichnung fehlt" }, 400);
        const { error } = await supabase.from("sonderausgaben").insert({
          bezeichnung,
          kategorie: body.kategorie || null,
          betrag: parseBetrag(body.betrag),
          monat: body.monat ? parseInt(body.monat, 10) : null,
          jahr: body.jahr ? parseInt(body.jahr, 10) : new Date().getFullYear(),
          notiz: body.notiz || null,
        });
        if (error) throw error;
        await logVerlauf("Finanzen", "Sonderausgabe hinzugefügt", bezeichnung);
        return json({ ok: true });
      }

      case "sonderausgabe_aktualisieren": {
        if (!body.id) return json({ error: "ID fehlt" }, 400);
        const bezeichnung = (body.bezeichnung || "").trim();
        if (!bezeichnung) return json({ error: "Bezeichnung fehlt" }, 400);
        const { error } = await supabase.from("sonderausgaben").update({
          bezeichnung,
          kategorie: body.kategorie || null,
          betrag: parseBetrag(body.betrag),
          monat: body.monat ? parseInt(body.monat, 10) : null,
          jahr: body.jahr ? parseInt(body.jahr, 10) : new Date().getFullYear(),
          notiz: body.notiz || null,
        }).eq("id", body.id);
        if (error) throw error;
        await logVerlauf("Finanzen", "Sonderausgabe bearbeitet", bezeichnung);
        return json({ ok: true });
      }

      case "sonderausgabe_loeschen": {
        const { data: current } = await supabase.from("sonderausgaben").select("bezeichnung").eq("id", body.id).single();
        const { error } = await supabase.from("sonderausgaben").delete().eq("id", body.id);
        if (error) throw error;
        if (current) await logVerlauf("Finanzen", "Sonderausgabe gelöscht", current.bezeichnung);
        return json({ ok: true });
      }

      case "buchung_hinzufuegen": {
        const datum = body.datum || null;
        const betrag = parseBetrag(body.betrag);
        const typ = body.typ === "einnahme" ? "einnahme" : "ausgabe";
        if (!datum || !betrag) return json({ error: "Datum und Betrag sind Pflicht" }, 400);
        const { error } = await supabase.from("buchungen").insert({
          datum,
          typ,
          kategorie: body.kategorie || "Sonstiges",
          betrag,
          notiz: body.notiz || null,
          herkunft: body.herkunft === "import" ? "import" : "manuell",
        });
        if (error) throw error;
        await logVerlauf(
          "Finanzen",
          typ === "einnahme" ? "Einnahme erfasst" : "Buchung erfasst",
          `${body.kategorie || "Sonstiges"} · ${betrag.toFixed(2)} €`
        );
        return json({ ok: true });
      }

      case "buchung_aktualisieren": {
        if (!body.id) return json({ error: "ID fehlt" }, 400);
        const update: Record<string, unknown> = {};
        if (body.datum) update.datum = body.datum;
        if (body.kategorie) update.kategorie = body.kategorie;
        if (body.typ === "einnahme" || body.typ === "ausgabe") update.typ = body.typ;
        if (body.betrag !== undefined) update.betrag = parseBetrag(body.betrag);
        if (body.notiz !== undefined) update.notiz = body.notiz || null;
        const { error } = await supabase.from("buchungen").update(update).eq("id", body.id);
        if (error) throw error;
        await logVerlauf("Finanzen", "Buchung bearbeitet", "");
        return json({ ok: true });
      }

      case "buchung_loeschen": {
        const { error } = await supabase.from("buchungen").delete().eq("id", body.id);
        if (error) throw error;
        await logVerlauf("Finanzen", "Buchung gelöscht", "");
        return json({ ok: true });
      }

      case "buchungen_batch_import": {
        const zeilen = Array.isArray(body.zeilen) ? body.zeilen : [];
        if (!zeilen.length) return json({ error: "Keine Zeilen übermittelt" }, 400);

        const { data: fixkosten, error: ef } = await supabase.from("fixkosten").select("bezeichnung");
        if (ef) throw ef;
        const fixStichwoerter = fixkostenStichwoerter(fixkosten || []);

        const { data: bestehende, error: eb } = await supabase.from("buchungen").select("datum, betrag, notiz");
        if (eb) throw eb;
        const bestehendeSchluessel = new Set(
          (bestehende || []).map((b: any) => buchungSchluessel(b.datum, Number(b.betrag), b.notiz || ""))
        );

        let importiertAusgaben = 0;
        let importiertEinnahmen = 0;
        let uebersprungenFix = 0;
        let uebersprungenDup = 0;
        let fehlerhaft = 0;
        const fixTreffer: Record<string, number> = {};
        const neueZeilen: Record<string, unknown>[] = [];

        for (const z of zeilen) {
          const datum = typeof z.datum === "string" ? z.datum.slice(0, 10) : null;
          const betrag = parseBetrag(z.betrag);
          const notiz = (z.notiz ?? "").toString().slice(0, 200);
          if (!datum || !betrag) {
            fehlerhaft++;
            continue;
          }

          const typ = betrag > 0 ? "einnahme" : "ausgabe";
          const betragAbs = round2(Math.abs(betrag));

          const treffer = matchtFixkosten(notiz, fixStichwoerter);
          if (treffer) {
            uebersprungenFix++;
            fixTreffer[treffer] = (fixTreffer[treffer] || 0) + 1;
            continue;
          }

          const schluessel = buchungSchluessel(datum, betragAbs, notiz);
          if (bestehendeSchluessel.has(schluessel)) {
            uebersprungenDup++;
            continue;
          }
          bestehendeSchluessel.add(schluessel);

          neueZeilen.push({
            datum,
            betrag: betragAbs,
            typ,
            kategorie: guessKategorie(notiz, typ),
            notiz,
            herkunft: "import",
          });
          if (typ === "einnahme") importiertEinnahmen++;
          else importiertAusgaben++;
        }

        if (neueZeilen.length) {
          const { error: ei } = await supabase.from("buchungen").insert(neueZeilen);
          if (ei) throw ei;
        }

        await logVerlauf(
          "Finanzen",
          "CSV-Import",
          `${importiertAusgaben + importiertEinnahmen} neue Buchungen, ${uebersprungenDup} Duplikate, ${uebersprungenFix} Fixkosten übersprungen`
        );

        return json({
          importiert_ausgaben: importiertAusgaben,
          importiert_einnahmen: importiertEinnahmen,
          uebersprungen_duplikate: uebersprungenDup,
          uebersprungen_fixkosten: uebersprungenFix,
          fehlerhafte_zeilen: fehlerhaft,
          fixkosten_treffer: fixTreffer,
        });
      }

      case "startkapital_speichern": {
        const jahr = body.jahr ? parseInt(body.jahr, 10) : new Date().getFullYear();
        const startKontostand = parseBetrag(body.start_kontostand);
        const { error } = await supabase
          .from("finanz_einstellungen")
          .upsert({ jahr, start_kontostand: startKontostand }, { onConflict: "jahr" });
        if (error) throw error;
        return json({ ok: true });
      }

      case "finanzen_jahresuebersicht": {
        const jahr = body.jahr ? parseInt(body.jahr, 10) : new Date().getFullYear();

        // Die Jahresübersicht (Kontostand-Kette, Diagramme) basiert
        // ausschließlich auf den Buchungen (manuell erfasst + CSV-Import).
        // Fixkosten und Sonderausgaben sind reine Planungs-/Verwaltungs-
        // Tabellen und fließen bewusst NICHT mit ein, damit nichts doppelt
        // gezählt wird (z. B. wenn eine per Fixkosten-Erkennung angelegte
        // Position und die zugrunde liegenden Einzelbuchungen gleichzeitig
        // bestehen).
        const { data: buchungen, error: e3 } = await supabase
          .from("buchungen")
          .select("betrag, datum, typ")
          .gte("datum", `${jahr}-01-01`)
          .lte("datum", `${jahr}-12-31`);
        if (e3) throw e3;

        const { data: einstellung } = await supabase
          .from("finanz_einstellungen")
          .select("start_kontostand")
          .eq("jahr", jahr)
          .maybeSingle();

        const monate = MONATE.map((spalte, i) => {
          const monatNr = i + 1;
          const buchungenMonat = (buchungen || []).filter(
            (b: any) => new Date(b.datum + "T00:00:00Z").getUTCMonth() + 1 === monatNr
          );
          const ausgabenGesamt = buchungenMonat
            .filter((b: any) => b.typ !== "einnahme")
            .reduce((sum: number, b: any) => sum + Number(b.betrag || 0), 0);
          const einnahmenGesamt = buchungenMonat
            .filter((b: any) => b.typ === "einnahme")
            .reduce((sum: number, b: any) => sum + Number(b.betrag || 0), 0);
          return {
            monat: monatNr,
            einnahmen_gesamt: round2(einnahmenGesamt),
            ausgaben_gesamt: round2(ausgabenGesamt),
            differenz: round2(einnahmenGesamt - ausgabenGesamt),
          };
        });

        let laufenderKontostand = Number(einstellung?.start_kontostand || 0);
        const zeilen = monate.map((m) => {
          const startkapital = laufenderKontostand;
          laufenderKontostand = round2(laufenderKontostand + m.differenz);
          return { ...m, startkapital: round2(startkapital), kontostand_ende: laufenderKontostand };
        });

        return json({ jahr, zeilen });
      }

      default:
        return json({ error: "Unbekannte Aktion" }, 400);
    }
  } catch (err) {
    console.error(err);
    return json({ error: "Serverfehler" }, 500);
  }
});
