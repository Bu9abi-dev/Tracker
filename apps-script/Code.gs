/**
 * Portfolio dashboard — Google Apps Script web app.
 *
 * Serves your Google Sheet as JSON to the dashboard's server, and appends new
 * snapshots from the dashboard's "Add entry" form. Every request must carry
 * the secret token (stored in Script Properties as API_TOKEN).
 *
 * Deploy: Deploy → New deployment → Web app → Execute as: Me,
 *         Who has access: Anyone. See README › "Deploy the Apps Script".
 *
 * Requests (POST, body is JSON — the token is never put in the URL):
 *   { "token": "...", "action": "list" }
 *   { "token": "...", "action": "add", "entry": { id, portfolioId, date, invested, value, notes } }
 */

var CONFIG = {
  // "tabs":      one sheet (tab) per portfolio with columns Date | Invested (USD) | Value (USD) | Notes.
  // "responses": a single sheet (e.g. your Google Form responses) with a Portfolio column whose
  //              answers start with the portfolio id, e.g. "P1 — Active Trading".
  MODE: "tabs",

  // Portfolio id → tab name (MODE "tabs"). Keep ids in sync with config/portfolios.ts.
  TABS: { P1: "P1", P2: "P2", P3: "P3", P4: "P4", P5: "P5" },

  // Sheet name for MODE "responses".
  RESPONSES_SHEET: "Form Responses 1",

  // Header names are matched case-insensitively by prefix, so "Invested (USD)" matches "invested".
  HEADERS: {
    date: ["date"],
    invested: ["invested"],
    value: ["value", "current value"],
    notes: ["notes", "note"],
    portfolio: ["portfolio"],
    timestamp: ["timestamp"],
  },

  MAX_NOTES: 500,
};

// --- Entry points -------------------------------------------------------------

function doGet() {
  // Reads go through POST so the token never appears in a URL or access log.
  return json_({ ok: false, error: "Use POST" });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!checkToken_(body.token)) return json_({ ok: false, error: "Unauthorized" });
    if (body.action === "list") return json_(list_());
    if (body.action === "add") return json_(add_(body.entry));
    return json_({ ok: false, error: "Unknown action" });
  } catch (err) {
    // Message only — no stack traces or sheet contents.
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

// --- Read ----------------------------------------------------------------------

function list_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var portfolios = {};

  if (CONFIG.MODE === "responses") {
    var sheet = mustSheet_(ss, CONFIG.RESPONSES_SHEET);
    var t = readTable_(sheet, tz);
    if (t.cols.portfolio < 0) throw new Error("Responses sheet needs a Portfolio column");
    t.rows.forEach(function (r) {
      var id = portfolioIdFrom_(r.cells[t.cols.portfolio]);
      if (!id) return;
      (portfolios[id] = portfolios[id] || []).push(toRow_(r, t.cols));
    });
  } else {
    Object.keys(CONFIG.TABS).forEach(function (id) {
      var sheet = ss.getSheetByName(CONFIG.TABS[id]);
      if (!sheet) return; // e.g. a planned portfolio without a tab yet
      var t = readTable_(sheet, tz);
      portfolios[id] = t.rows.map(function (r) {
        return toRow_(r, t.cols);
      });
    });
  }
  return { ok: true, generatedAt: new Date().toISOString(), portfolios: portfolios };
}

function readTable_(sheet, tz) {
  var values = sheet.getDataRange().getValues();
  var header = (values[0] || []).map(function (h) {
    return String(h).trim().toLowerCase();
  });
  var cols = {};
  Object.keys(CONFIG.HEADERS).forEach(function (key) {
    cols[key] = header.findIndex(function (h) {
      return CONFIG.HEADERS[key].some(function (name) {
        return h.indexOf(name) === 0;
      });
    });
  });
  if (cols.date < 0 || cols.invested < 0 || cols.value < 0) {
    throw new Error('Sheet "' + sheet.getName() + '" needs Date, Invested and Value headers');
  }
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    rows.push({
      row: i + 1,
      cells: values[i].map(function (c) {
        // Dates as calendar dates in the spreadsheet's time zone — no UTC shift.
        return Object.prototype.toString.call(c) === "[object Date]" ? Utilities.formatDate(c, tz, "yyyy-MM-dd") : c;
      }),
    });
  }
  return { cols: cols, rows: rows };
}

function toRow_(r, cols) {
  return {
    row: r.row,
    date: r.cells[cols.date],
    invested: r.cells[cols.invested], // raw number or text — the dashboard cleans and flags it
    value: r.cells[cols.value],
    notes: cols.notes >= 0 ? r.cells[cols.notes] : "",
  };
}

function portfolioIdFrom_(answer) {
  var m = /^\s*(P\d+)\b/i.exec(String(answer || ""));
  return m ? m[1].toUpperCase() : null;
}

// --- Write ---------------------------------------------------------------------

function add_(entry) {
  var e = validateEntry_(entry);
  var cache = CacheService.getScriptCache();
  var key = "entry:" + e.id;
  if (cache.get(key)) return { ok: true, duplicate: true }; // double tap / retry

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (cache.get(key)) return { ok: true, duplicate: true };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet =
      CONFIG.MODE === "responses" ? mustSheet_(ss, CONFIG.RESPONSES_SHEET) : mustSheet_(ss, CONFIG.TABS[e.portfolioId]);
    var t = readTable_(sheet, ss.getSpreadsheetTimeZone());
    var width = sheet.getLastColumn();
    var row = [];
    for (var i = 0; i < width; i++) row.push("");
    var parts = e.date.split("-");
    row[t.cols.date] = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    row[t.cols.invested] = e.invested;
    row[t.cols.value] = e.value;
    if (t.cols.notes >= 0) row[t.cols.notes] = safeText_(e.notes);
    if (CONFIG.MODE === "responses") {
      row[t.cols.portfolio] = e.portfolioId;
      if (t.cols.timestamp >= 0) row[t.cols.timestamp] = new Date();
    }
    sheet.appendRow(row);
    cache.put(key, "1", 21600);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function validateEntry_(entry) {
  if (!entry || typeof entry !== "object") throw new Error("Missing entry");
  var id = String(entry.id || "");
  if (!/^[\w-]{8,64}$/.test(id)) throw new Error("Invalid id");
  var portfolioId = String(entry.portfolioId || "");
  if (!Object.prototype.hasOwnProperty.call(CONFIG.TABS, portfolioId)) throw new Error("Unknown portfolio");
  var date = String(entry.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");
  var invested = Number(entry.invested);
  var value = Number(entry.value);
  if (!isFinite(invested) || !isFinite(value) || value < 0) throw new Error("Invalid amounts");
  var notes = String(entry.notes || "").slice(0, CONFIG.MAX_NOTES);
  return { id: id, portfolioId: portfolioId, date: date, invested: invested, value: value, notes: notes };
}

/** Stop text being interpreted as a formula (formula injection). */
function safeText_(s) {
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

// --- Helpers -------------------------------------------------------------------

function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty("API_TOKEN");
  if (!expected || expected.length < 32 || typeof token !== "string") return false;
  // Constant-time comparison.
  var diff = token.length ^ expected.length;
  for (var i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (token.charCodeAt(i % (token.length || 1)) || 0);
  return diff === 0;
}

function mustSheet_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" not found');
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run once from the editor (select generateToken → Run). It creates a random
 * API_TOKEN, saves it in Script Properties and shows it once so you can copy
 * it into Vercel as APPS_SCRIPT_TOKEN. Running it again rotates the token.
 */
function generateToken() {
  var bytes = [];
  for (var i = 0; i < 3; i++) bytes = bytes.concat(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random() + Date.now()));
  var token = Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "").slice(0, 48);
  PropertiesService.getScriptProperties().setProperty("API_TOKEN", token);
  try {
    SpreadsheetApp.getUi().alert("New API token (copy it to Vercel as APPS_SCRIPT_TOKEN):\n\n" + token);
  } catch (err) {
    // No UI when run outside the spreadsheet: read it from Project Settings → Script properties instead.
    Logger.log("API_TOKEN saved. View it in Project Settings → Script properties.");
  }
}
