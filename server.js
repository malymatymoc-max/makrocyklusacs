const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 4174);
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || ROOT;
const DATA_FILE = path.join(DATA_DIR, "shared-state.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function blankState() {
  return {
    teams: [],
    seasons: [],
    periods: [],
    goals: [],
    details: [],
    sessions: [],
    players: [],
    matchdays: [],
    xpsFeeds: [],
    selectedTeamId: "",
    selectedSeasonId: "",
    selectedPeriodId: "all",
  };
}

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { updatedAt: 0, state: blankState() };
  }
}

function writeStore(state) {
  const store = { updatedAt: Date.now(), state: sanitizeState(state) };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  return store;
}

function sanitizeState(state) {
  return {
    ...blankState(),
    ...(state && typeof state === "object" ? state : {}),
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function serveFile(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const cleanPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(ROOT, cleanPath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=60",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.url.startsWith("/api/state")) {
    if (req.method === "GET") {
      sendJson(res, 200, readStore());
      return;
    }

    if (req.method === "PUT") {
      try {
        const body = await readBody(req);
        const payload = body ? JSON.parse(body) : {};
        sendJson(res, 200, writeStore(payload.state));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (req.url.startsWith("/api/xps-ical")) {
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);
      const calendarUrl = normalizeCalendarUrl(requestUrl.searchParams.get("url"));
      const response = await fetch(calendarUrl, { headers: { Accept: "text/calendar,*/*" } });
      if (!response.ok) throw new Error(`iCal odpověděl ${response.status}`);
      const text = await response.text();
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Odkaz nevrátil platný iCal kalendář");
      res.writeHead(200, {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(text);
    } catch (error) {
      sendJson(res, 400, { error: error.message || "iCal se nepodařilo načíst" });
    }
    return;
  }

  serveFile(req, res);
});

function normalizeCalendarUrl(rawUrl) {
  const value = String(rawUrl || "").trim().replace(/^webcal:\/\//i, "https://");
  const url = new URL(value);
  const allowedHosts = new Set(["calendar.google.com", "www.google.com"]);
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) throw new Error("Povolený je jen Google Calendar iCal odkaz");
  if (!url.pathname.endsWith(".ics")) throw new Error("Odkaz musí končit na .ics");
  return url.toString();
}

server.listen(PORT, HOST, () => {
  console.log(`Makrocyklus shared app: http://${HOST}:${PORT}`);
});
