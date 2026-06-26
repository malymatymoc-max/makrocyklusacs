module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method not allowed");
    return;
  }

  try {
    const requestUrl = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const rawUrl = requestUrl.searchParams.get("url");
    const url = normalizeCalendarUrl(rawUrl);
    const response = await fetch(url, { headers: { Accept: "text/calendar,*/*" } });
    if (!response.ok) throw new Error(`iCal odpověděl ${response.status}`);
    const text = await response.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Odkaz nevrátil platný iCal kalendář");

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(text);
  } catch (error) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(error.message || "iCal se nepodařilo načíst");
  }
};

function normalizeCalendarUrl(rawUrl) {
  const value = String(rawUrl || "").trim().replace(/^webcal:\/\//i, "https://");
  const url = new URL(value);
  const allowedHosts = new Set(["calendar.google.com", "www.google.com"]);
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) {
    throw new Error("Povolený je jen Google Calendar iCal odkaz");
  }
  if (!url.pathname.endsWith(".ics")) {
    throw new Error("Odkaz musí končit na .ics");
  }
  return url.toString();
}
