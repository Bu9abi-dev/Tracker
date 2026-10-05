/**
 * Portfolio dashboard — Google Apps Script web app (bound to your tracker Sheet).
 *
 * Serves the Sheet as JSON to the dashboard's server and saves what you add in
 * the app (entries, new portfolios, confirmed statement holdings). Every request
 * must carry the secret token stored in Script Properties as API_TOKEN.
 *
 * Deploy: Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * After editing this file later: Deploy → Manage deployments → ✏️ Edit →
 * Version: New version → Deploy (this keeps the same URL).
 *
 * Requests (POST, JSON body — the token is never put in the URL):
 *   { token, action: "list" }
 *   { token, action: "add", entry: { id, portfolioId, date, invested, value, notes } }
 *   { token, action: "createPortfolio", portfolio: { id, name, shortName, description, status, ownership, includeInPersonal, managedFor, color, tab } }
 *   { token, action: "saveStatement", statement: { id, portfolioId, statementDate, savedAt, fileName, broker, accountHint, reportedTotalUsd, holdings: [...] } }
 *
 * Tabs this script manages (created automatically the first time):
 *   "Portfolios" — one row per portfolio (the app's list). You can rename or archive here.
 *   "Statements" and "Holdings" — holdings you confirmed from uploaded statements.
 * Your portfolio tabs (P1, P2, …) keep their layout: the header row (Date, Invested,
 * Value, …, Notes) is found automatically, and new entries go into the first empty
 * row so your formula columns keep working.
 */

var CONFIG = {
  REGISTRY_SHEET: "Portfolios",
  STATEMENTS_SHEET: "Statements",
  HOLDINGS_SHEET: "Holdings",

  // Used once, to fill the Portfolios tab the first time. Tab names match your Sheet.
  SEED: [
    ["P1", "Flexible / Active Trading", "Active", "Stocks on IBKR", "active", "personal", "yes", "", "P1 (STOCKS ONLY IBKR)", "--chart-1", ""],
    ["P2", "Mother's House Portfolio", "Mother's House", "Managed for my mother — not my money", "active", "managed", "no", "Mother", "P2 HOUSE", "--chart-3", ""],
    ["P3", "Crypto DCA", "Crypto", "Crypto on OKX", "active", "personal", "yes", "", "P3 Crypto (OKX)", "--chart-2", ""],
    ["P4", "Real Estate", "Real Estate", "Planned — not active yet", "planned", "personal", "no", "", "P4", "--chart-4", ""],
    ["P5", "Retirement", "Retirement", "Archived — merged into P1 in Aug 2026", "archived", "personal", "no", "", "P5", "--chart-5", ""],
  ],

  REGISTRY_HEADERS: ["Id", "Name", "Short name", "Description", "Status", "Ownership", "In Personal", "Managed for", "Tab", "Color", "Account"],
  STATEMENT_HEADERS: ["Id", "Portfolio", "Statement date", "Saved at", "File", "Broker", "Account", "Reported total (USD)"],
  HOLDING_HEADERS: ["Statement", "Portfolio", "Symbol", "Name", "Type", "Sector", "Quantity", "Price (USD)", "Value (USD)", "Cost (USD)"],

  // Snapshot tab headers are matched case-insensitively by prefix ("Invested (USD)" matches "invested").
  // The first match wins, so "Invested (USD)" is used rather than "Invested (AED)".
  HEADERS: { date: ["date"], invested: ["invested"], value: ["value", "current value"], notes: ["notes", "note"] },

  MAX_NOTES: 500,
  MAX_HOLDINGS: 500,
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
    if (body.action === "add") return json_(withLock_(function () { return add_(body.entry); }));
    if (body.action === "createPortfolio") return json_(withLock_(function () { return createPortfolio_(body.portfolio); }));
    if (body.action === "saveStatement") return json_(withLock_(function () { return saveStatement_(body.statement); }));
    return json_({ ok: false, error: "Unknown action" });
  } catch (err) {
    // Message only — no stack traces or sheet contents.
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

// --- Read ----------------------------------------------------------------------

function list_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = timeZone_(ss);
  var registry = readRegistry_(ss);
  var portfolios = {};
  registry.forEach(function (p) {
    if (!p.id || !p.tab) return;
    var sheet = ss.getSheetByName(p.tab);
    if (!sheet) return; // e.g. a planned portfolio without a tab yet
    var t = readSnapshotTable_(sheet, tz);
    portfolios[p.id] = t.rows
      .filter(function (r) {
        return !isBlank_(r.cells[t.cols.date]) || !isBlank_(r.cells[t.cols.invested]) || !isBlank_(r.cells[t.cols.value]) || (t.cols.notes >= 0 && !isBlank_(r.cells[t.cols.notes]));
      })
      .map(function (r) {
        return {
          row: r.row,
          date: r.cells[t.cols.date],
          invested: r.cells[t.cols.invested], // raw number or text — the dashboard cleans and flags it
          value: r.cells[t.cols.value],
          notes: t.cols.notes >= 0 ? r.cells[t.cols.notes] : "",
        };
      });
  });
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    registry: registry,
    portfolios: portfolios,
    statements: readFixed_(ss, CONFIG.STATEMENTS_SHEET, ["id", "portfolioId", "statementDate", "savedAt", "fileName", "broker", "accountHint", "reportedTotalUsd"], tz),
    holdings: readFixed_(ss, CONFIG.HOLDINGS_SHEET, ["statementId", "portfolioId", "symbol", "name", "assetType", "sector", "quantity", "priceUsd", "valueUsd", "costBasisUsd"], tz),
  };
}

/** The Portfolios tab as objects (created and seeded on first use). */
function readRegistry_(ss) {
  var sheet = ensureSheet_(ss, CONFIG.REGISTRY_SHEET, CONFIG.REGISTRY_HEADERS, CONFIG.SEED);
  var values = sheet.getDataRange().getValues();
  var header = (values[0] || []).map(norm_);
  var col = function (name) {
    return header.indexOf(norm_(name));
  };
  var keys = { id: "Id", name: "Name", shortName: "Short name", description: "Description", status: "Status", ownership: "Ownership", includeInPersonal: "In Personal", managedFor: "Managed for", tab: "Tab", color: "Color", accountHint: "Account" };
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var o = {};
    Object.keys(keys).forEach(function (k) {
      var c = col(keys[k]);
      o[k] = c >= 0 ? values[i][c] : "";
    });
    if (String(o.id).trim()) out.push(o);
  }
  return out;
}

/** Finds the header row (the first of rows 1–10 with a "Date" cell) and the needed columns. */
function readSnapshotTable_(sheet, tz) {
  var values = sheet.getDataRange().getValues();
  var headerIndex = -1;
  for (var i = 0; i < Math.min(10, values.length); i++) {
    if (values[i].some(function (c) { return norm_(c).indexOf("date") === 0; })) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex < 0) throw new Error('Tab "' + sheet.getName() + '" needs a header row with Date, Invested and Value');
  var header = values[headerIndex].map(norm_);
  var cols = {};
  Object.keys(CONFIG.HEADERS).forEach(function (key) {
    cols[key] = header.findIndex(function (h) {
      return CONFIG.HEADERS[key].some(function (name) { return h.indexOf(name) === 0; });
    });
  });
  if (cols.date < 0 || cols.invested < 0 || cols.value < 0) {
    throw new Error('Tab "' + sheet.getName() + '" needs Date, Invested and Value headers');
  }
  var rows = [];
  for (var r = headerIndex + 1; r < values.length; r++) {
    rows.push({ row: r + 1, cells: values[r].map(function (c) { return cellOut_(c, tz); }) });
  }
  return { headerRow: headerIndex + 1, cols: cols, rows: rows };
}

function readFixed_(ss, name, keys, tz) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    if (isBlank_(values[i][0])) continue;
    var o = {};
    keys.forEach(function (k, j) { o[k] = cellOut_(values[i][j], tz); });
    out.push(o);
  }
  return out;
}

// --- Write: snapshot entry -------------------------------------------------------

function add_(entry) {
  var e = validateEntry_(entry);
  if (seen_("entry:" + e.id)) return { ok: true, duplicate: true }; // double tap / retry
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var p = findRegistry_(ss, e.portfolioId);
  if (!p) throw new Error("Unknown portfolio");
  var sheet = mustSheet_(ss, p.tab);
  var t = readSnapshotTable_(sheet, timeZone_(ss));
  // First empty row after the last row with data — formula columns are pre-filled, so only touch our cells.
  var last = t.headerRow;
  t.rows.forEach(function (r) {
    if (!isBlank_(r.cells[t.cols.date]) || !isBlank_(r.cells[t.cols.invested]) || !isBlank_(r.cells[t.cols.value])) last = r.row;
  });
  var row = last + 1;
  var parts = e.date.split("-");
  sheet.getRange(row, t.cols.date + 1).setValue(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  sheet.getRange(row, t.cols.invested + 1).setValue(e.invested);
  sheet.getRange(row, t.cols.value + 1).setValue(e.value);
  if (t.cols.notes >= 0 && e.notes) sheet.getRange(row, t.cols.notes + 1).setValue(safeText_(e.notes));
  remember_("entry:" + e.id);
  return { ok: true, row: row };
}

function validateEntry_(entry) {
  if (!entry || typeof entry !== "object") throw new Error("Missing entry");
  var id = String(entry.id || "");
  if (!/^[\w-]{8,64}$/.test(id)) throw new Error("Invalid id");
  var date = String(entry.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");
  var invested = Number(entry.invested);
  var value = Number(entry.value);
  if (!isFinite(invested) || !isFinite(value) || value < 0) throw new Error("Invalid amounts");
  return { id: id, portfolioId: String(entry.portfolioId || ""), date: date, invested: invested, value: value, notes: String(entry.notes || "").slice(0, CONFIG.MAX_NOTES) };
}

// --- Write: new portfolio ----------------------------------------------------------

function createPortfolio_(p) {
  if (!p || typeof p !== "object") throw new Error("Missing portfolio");
  var id = String(p.id || "").toUpperCase();
  if (!/^[A-Z0-9_-]{1,12}$/.test(id)) throw new Error("Invalid id");
  var name = String(p.name || "").trim().slice(0, 60);
  var tab = String(p.tab || id).replace(/[\[\]*?:\/\\]/g, " ").trim().slice(0, 90);
  if (!name || !tab) throw new Error("Missing name");
  var managed = p.ownership === "managed";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (findRegistry_(ss, id)) return { ok: true, duplicate: true };
  if (ss.getSheetByName(tab)) throw new Error('A tab called "' + tab + '" already exists');

  // New tab laid out like your first portfolio tab (formulas kept, data and charts cleared).
  var template = null;
  readRegistry_(ss).some(function (r) {
    template = ss.getSheetByName(String(r.tab));
    return !!template;
  });
  var sheet;
  if (template) {
    sheet = template.copyTo(ss).setName(tab);
    sheet.getCharts().forEach(function (c) { sheet.removeChart(c); });
    var t = readSnapshotTable_(sheet, timeZone_(ss));
    var lastRow = sheet.getLastRow();
    if (lastRow > t.headerRow) {
      [t.cols.date, t.cols.invested, t.cols.value, t.cols.notes].forEach(function (c) {
        if (c >= 0) sheet.getRange(t.headerRow + 1, c + 1, lastRow - t.headerRow, 1).clearContent();
      });
    }
    sheet.getRange(1, 1).setValue(safeText_(name));
  } else {
    sheet = ss.insertSheet(tab);
    sheet.getRange(1, 1).setValue(safeText_(name));
    sheet.getRange(2, 1).setValue("Exchange Rate: 1 USD = 3.67 AED (fixed)");
    sheet.getRange(3, 1, 1, 4).setValues([["Date", "Invested (USD)", "Value (USD)", "Notes"]]).setFontWeight("bold");
  }

  var registry = ensureSheet_(ss, CONFIG.REGISTRY_SHEET, CONFIG.REGISTRY_HEADERS, CONFIG.SEED);
  registry.appendRow([
    id,
    safeText_(name),
    safeText_(String(p.shortName || name).slice(0, 24)),
    safeText_(String(p.description || "").slice(0, 120)),
    p.status === "planned" ? "planned" : "active",
    managed ? "managed" : "personal",
    !managed && p.includeInPersonal === true ? "yes" : "no",
    managed ? safeText_(String(p.managedFor || "").slice(0, 40)) : "",
    tab,
    /^--chart-\d$/.test(String(p.color)) ? p.color : "",
    "",
  ]);
  return { ok: true };
}

// --- Write: confirmed statement holdings ---------------------------------------------

function saveStatement_(s) {
  if (!s || typeof s !== "object") throw new Error("Missing statement");
  var id = String(s.id || "");
  if (!/^[\w-]{8,64}$/.test(id)) throw new Error("Invalid id");
  var portfolioId = String(s.portfolioId || "").toUpperCase();
  var date = String(s.statementDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid statement date");
  var holdings = Array.isArray(s.holdings) ? s.holdings.slice(0, CONFIG.MAX_HOLDINGS) : [];
  if (!holdings.length) throw new Error("No holdings");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var p = findRegistry_(ss, portfolioId);
  if (!p) throw new Error("Unknown portfolio");

  var statements = ensureSheet_(ss, CONFIG.STATEMENTS_SHEET, CONFIG.STATEMENT_HEADERS);
  var existing = statements.getLastRow() > 1 ? statements.getRange(2, 1, statements.getLastRow() - 1, 1).getValues() : [];
  if (existing.some(function (r) { return String(r[0]) === id; })) return { ok: true, duplicate: true };

  var num = function (v) {
    var n = Number(v);
    return v === null || v === undefined || v === "" || !isFinite(n) ? "" : n;
  };
  statements.appendRow([
    id,
    portfolioId,
    "'" + date, // keep as plain text so it isn't shifted by time zones
    "'" + String(s.savedAt || new Date().toISOString()),
    safeText_(String(s.fileName || "").slice(0, 120)),
    safeText_(String(s.broker || "").slice(0, 60)),
    safeText_(String(s.accountHint || "").slice(0, 40)),
    num(s.reportedTotalUsd),
  ]);
  var rows = holdings.map(function (h) {
    var value = Number(h && h.valueUsd);
    if (!isFinite(value) || value < 0) throw new Error("Invalid holding value");
    return [
      id,
      portfolioId,
      safeText_(String(h.symbol || "").slice(0, 24)),
      safeText_(String(h.name || "").slice(0, 120)),
      safeText_(String(h.assetType || "other").slice(0, 12)),
      safeText_(String(h.sector || "Other").slice(0, 40)),
      num(h.quantity),
      num(h.priceUsd),
      value,
      num(h.costBasisUsd),
    ];
  });
  var hs = ensureSheet_(ss, CONFIG.HOLDINGS_SHEET, CONFIG.HOLDING_HEADERS);
  hs.getRange(hs.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

  // Remember which account this portfolio's statements come from (used to catch wrong uploads).
  if (!String(p.accountHint || "").trim() && s.accountHint) setRegistryCell_(ss, portfolioId, "Account", safeText_(String(s.accountHint).slice(0, 40)));
  return { ok: true };
}

// --- Helpers -------------------------------------------------------------------------

function findRegistry_(ss, id) {
  var key = String(id || "").toUpperCase();
  var found = null;
  readRegistry_(ss).some(function (r) {
    if (String(r.id).trim().toUpperCase() === key) found = r;
    return !!found;
  });
  return found;
}

function setRegistryCell_(ss, id, headerName, value) {
  var sheet = ss.getSheetByName(CONFIG.REGISTRY_SHEET);
  var values = sheet.getDataRange().getValues();
  var col = values[0].map(norm_).indexOf(norm_(headerName));
  if (col < 0) return;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim().toUpperCase() === id) {
      sheet.getRange(i + 1, col + 1).setValue(value);
      return;
    }
  }
}

function ensureSheet_(ss, name, headers, seedRows) {
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  sheet.setFrozenRows(1);
  if (seedRows && seedRows.length) sheet.getRange(2, 1, seedRows.length, seedRows[0].length).setValues(seedRows);
  return sheet;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function seen_(key) {
  return !!CacheService.getScriptCache().get(key);
}

function remember_(key) {
  CacheService.getScriptCache().put(key, "1", 21600);
}

/** Dates as calendar dates in the spreadsheet's time zone — no UTC shift. */
/** Some Sheets (e.g. converted from Excel) have no time zone set; fall back so dates still read. */
function timeZone_(ss) {
  return ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone() || "Etc/UTC";
}

function cellOut_(c, tz) {
  return Object.prototype.toString.call(c) === "[object Date]" ? Utilities.formatDate(c, tz, "yyyy-MM-dd") : c;
}

function norm_(v) {
  return String(v === null || v === undefined ? "" : v).trim().toLowerCase();
}

function isBlank_(v) {
  return v === null || v === undefined || String(v).trim() === "";
}

/** Stop text being interpreted as a formula (formula injection). */
function safeText_(s) {
  s = String(s);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty("API_TOKEN");
  if (!expected || expected.length < 32 || typeof token !== "string") return false;
  // Constant-time comparison.
  var diff = token.length ^ expected.length;
  for (var i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (token.charCodeAt(i % (token.length || 1)) || 0);
  return diff === 0;
}

function mustSheet_(ss, name) {
  var sheet = ss.getSheetByName(String(name));
  if (!sheet) throw new Error('Tab "' + name + '" not found');
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run once from the editor (choose generateToken → Run). It creates a random
 * API_TOKEN, saves it in Script Properties and shows it so you can copy it into
 * Vercel as APPS_SCRIPT_TOKEN. Running it again rotates the token.
 * It also creates the Portfolios tab, so you can check it straight away.
 */
function generateToken() {
  var bytes = [];
  for (var i = 0; i < 3; i++) bytes = bytes.concat(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random() + Date.now()));
  var token = Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "").slice(0, 48);
  PropertiesService.getScriptProperties().setProperty("API_TOKEN", token);
  readRegistry_(SpreadsheetApp.getActiveSpreadsheet());
  try {
    SpreadsheetApp.getUi().alert("Your token (copy it into Vercel as APPS_SCRIPT_TOKEN):\n\n" + token);
  } catch (err) {
    Logger.log("API_TOKEN saved. View it in Project Settings → Script properties.");
  }
}
