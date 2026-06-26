(function () {
  const DEFAULT_XPS_URL = "webcal://calendar.google.com/calendar/ical/3740d4abaae966c1ef0f4ba83fc3e5c0a6191c8af530d2ecbcf9efad4f83f471@group.calendar.google.com/public/basic.ics";
  let xpsImportBusy = false;
  let xpsImportMessage = "";

  function normalizeXpsState(nextState = state) {
    return {
      ...nextState,
      xpsFeeds: Array.isArray(nextState.xpsFeeds) ? nextState.xpsFeeds.map((feed) => ({
        id: feed.id || uid("xps"),
        teamId: feed.teamId || "",
        seasonId: feed.seasonId || "",
        url: feed.url || "",
        filterText: feed.filterText || "",
        lastSyncAt: feed.lastSyncAt || "",
        lastResult: feed.lastResult || "",
      })) : [],
      sessions: (nextState.sessions || []).map((session) => ({ ...session })),
    };
  }

  const xpsNormalizeState = window.normalizeState;
  normalizeState = function normalizeStateWithXps(nextState) {
    return normalizeXpsState(xpsNormalizeState(nextState));
  };

  const xpsBlank = window.blank;
  blank = function blankWithXps() {
    return { ...xpsBlank(), xpsFeeds: [] };
  };

  const xpsRenderSetup = window.renderSetup;
  renderSetup = function renderSetupWithXps() {
    xpsRenderSetup();
    renderXpsImport();
  };

  function renderXpsImport() {
    state = normalizeXpsState(state);
    const panel = document.querySelector("[data-section='xps']");
    if (!panel) return;
    const defaultTeamId = state.selectedTeamId || state.teams[0]?.id || "";
    const defaultSeasonId = state.selectedSeasonId || state.seasons[0]?.id || "";
    const feed = state.xpsFeeds[0] || {};
    panel.innerHTML = `
      <div class="setup-head">
        <div><h2>XPS iCal import</h2><p>Jednosměrné načtení událostí z XPS/Google kalendáře do Coach ACS.</p></div>
      </div>
      <form id="xpsImportForm" class="xps-import-form">
        <div class="form-row">
          <label>Kategorie<select name="teamId" required>${state.teams.map((team) => `<option value="${team.id}" ${(feed.teamId || defaultTeamId) === team.id ? "selected" : ""}>${esc(team.name)}</option>`).join("")}</select></label>
          <label>Sezóna<select name="seasonId" required>${state.seasons.map((season) => `<option value="${season.id}" ${(feed.seasonId || defaultSeasonId) === season.id ? "selected" : ""}>${esc(season.name)}</option>`).join("")}</select></label>
        </div>
        <label>iCal odkaz<input name="url" value="${esc(feed.url || DEFAULT_XPS_URL)}" placeholder="webcal://..." required /></label>
        <label>Filtr názvu <input name="filterText" value="${esc(feed.filterText || "")}" placeholder="Volitelné, např. WU9 2017/2018" /></label>
        <div class="xps-import-actions">
          <button class="primary" type="submit" ${xpsImportBusy ? "disabled" : ""}>${xpsImportBusy ? "Načítám..." : "Synchronizovat XPS kalendář"}</button>
          <span class="muted">${esc(xpsImportMessage || feed.lastResult || "Import jen čte iCal. Do XPS se nic nezapisuje.")}</span>
        </div>
      </form>
      ${state.xpsFeeds.length ? `<div class="xps-feed-list">${state.xpsFeeds.map((item) => xpsFeedRow(item)).join("")}</div>` : ""}
    `;

    panel.querySelector("#xpsImportForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      await syncXpsFeed({
        ...(state.xpsFeeds[0] || { id: uid("xps") }),
        teamId: data.teamId,
        seasonId: data.seasonId,
        url: data.url,
        filterText: data.filterText || "",
      });
    });

    panel.querySelectorAll("[data-sync-xps]").forEach((button) => {
      button.addEventListener("click", async () => {
        const feed = state.xpsFeeds.find((item) => item.id === button.dataset.syncXps);
        if (feed) await syncXpsFeed(feed);
      });
    });
    panel.querySelectorAll("[data-delete-xps]").forEach((button) => {
      button.addEventListener("click", () => {
        state.xpsFeeds = state.xpsFeeds.filter((item) => item.id !== button.dataset.deleteXps);
        save();
        render();
      });
    });
  }

  function xpsFeedRow(feed) {
    const teamName = state.teams.find((team) => team.id === feed.teamId)?.name || "Bez týmu";
    const seasonName = state.seasons.find((season) => season.id === feed.seasonId)?.name || "Bez sezóny";
    return `<div class="xps-feed-row">
      <div><strong>${esc(teamName)} · ${esc(seasonName)}</strong><span>${esc(feed.filterText || "Bez filtru názvu")}</span></div>
      <button data-sync-xps="${feed.id}" type="button">Synchronizovat</button>
      <button class="danger subtle-danger" data-delete-xps="${feed.id}" type="button">Smazat</button>
    </div>`;
  }

  async function syncXpsFeed(feed) {
    xpsImportBusy = true;
    xpsImportMessage = "Načítám iCal...";
    renderXpsImport();
    try {
      const text = await fetchIcs(feed.url);
      const events = parseIcs(text)
        .filter((event) => !feed.filterText || `${event.summary} ${event.description}`.toLowerCase().includes(feed.filterText.toLowerCase()))
        .filter((event) => isInsideSeason(event, feed.seasonId));
      const result = importEvents(feed, events);
      feed.lastSyncAt = new Date().toISOString();
      feed.lastResult = `Hotovo: ${result.created} nových, ${result.updated} aktualizovaných, ${events.length} načtených.`;
      state.xpsFeeds = [feed, ...state.xpsFeeds.filter((item) => item.id !== feed.id)];
      save();
      xpsImportMessage = feed.lastResult;
      render();
    } catch (error) {
      xpsImportMessage = `Chyba importu: ${error.message || error}`;
      renderXpsImport();
    } finally {
      xpsImportBusy = false;
      renderXpsImport();
    }
  }

  async function fetchIcs(rawUrl) {
    const normalized = normalizeCalendarUrl(rawUrl);
    const response = await fetch(`/api/xps-ical?url=${encodeURIComponent(normalized)}`, { cache: "no-store" });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || "iCal se nepodařilo načíst");
    }
    return response.text();
  }

  function normalizeCalendarUrl(rawUrl) {
    const value = String(rawUrl || "").trim();
    if (!value) throw new Error("Chybí iCal odkaz");
    return value.replace(/^webcal:\/\//i, "https://");
  }

  function importEvents(feed, events) {
    const result = { created: 0, updated: 0 };
    events.forEach((event) => {
      if (!event.uid || !event.start) return;
      const mapped = eventToSession(feed, event);
      const existing = state.sessions.find((session) => session.source === "xps-ical" && session.sourceUid === event.uid);
      if (existing) {
        Object.assign(existing, {
          ...mapped,
          id: existing.id,
          mainGoalId: existing.mainGoalId || "",
          extraGoalIds: existing.extraGoalIds || [],
          detailIds: existing.detailIds || [],
          goalRatings: existing.goalRatings || {},
          detailRatings: existing.detailRatings || {},
          performanceRating: existing.performanceRating || 0,
          repeatGroupId: existing.repeatGroupId || "",
        });
        result.updated += 1;
      } else {
        state.sessions.push(mapped);
        result.created += 1;
      }
    });
    return result;
  }

  function eventToSession(feed, event) {
    const start = localParts(event.start);
    const end = event.end ? localParts(event.end) : { date: start.date, time: "" };
    return {
      id: uid("session"),
      teamId: feed.teamId,
      seasonId: feed.seasonId,
      date: start.date,
      type: inferEventType(event.summary),
      startTime: start.time,
      endTime: end.date === start.date ? end.time : "",
      place: event.location || "",
      coach: "",
      note: xpsNote(event),
      periodId: periodForImportedDate(feed.teamId, feed.seasonId, start.date),
      mainGoalId: "",
      extraGoalIds: [],
      detailIds: [],
      goalRatings: {},
      detailRatings: {},
      performanceRating: 0,
      repeatGroupId: "",
      source: "xps-ical",
      sourceUid: event.uid,
      sourceFeedId: feed.id,
      sourceCalendarUrl: normalizeCalendarUrl(feed.url),
      sourceSummary: event.summary || "",
      sourceLastModified: event.lastModified || "",
    };
  }

  function inferEventType(summary) {
    const text = stripDiacritics(String(summary || "").toLowerCase());
    if (text.includes("turnaj")) return "Turnaj";
    if (text.includes("utkani") || text.includes("zapasy") || text.includes("zapas")) return "Utkání";
    if (text.includes("skupinovy") || text.includes("skupinov")) return "Skupinový TJ";
    if (text.includes("pohybovy") || text.includes("pohybov")) return "Pohybový TJ";
    if (text.includes("trenink") || text.includes("training")) return "TJ";
    if (text.includes("volno")) return "Volno";
    return "Jiná událost";
  }

  function stripDiacritics(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function isInsideSeason(event, seasonId) {
    const season = state.seasons.find((item) => item.id === seasonId);
    const date = event.start ? localParts(event.start).date : "";
    if (!date || !season) return true;
    if (season.start && date < season.start) return false;
    if (season.end && date > season.end) return false;
    return true;
  }

  function periodForImportedDate(teamId, seasonId, date) {
    return state.periods.find((period) => period.teamId === teamId && period.seasonId === seasonId && date >= period.start && date <= period.end)?.id || "";
  }

  function xpsNote(event) {
    const parts = [`XPS: ${event.summary || "Událost"}`];
    if (event.description) parts.push(event.description);
    return parts.join("\n");
  }

  function parseIcs(text) {
    const unfolded = String(text || "").replace(/\r?\n[ \t]/g, "");
    return unfolded.split("BEGIN:VEVENT").slice(1).map((block) => parseIcsEvent(block.split("END:VEVENT")[0])).filter((event) => event.uid);
  }

  function parseIcsEvent(block) {
    const event = {};
    block.split(/\r?\n/).forEach((line) => {
      const index = line.indexOf(":");
      if (index < 0) return;
      const rawKey = line.slice(0, index);
      const key = rawKey.split(";")[0].toUpperCase();
      const value = decodeIcs(line.slice(index + 1));
      if (key === "UID") event.uid = value;
      if (key === "SUMMARY") event.summary = value;
      if (key === "LOCATION") event.location = value;
      if (key === "DESCRIPTION") event.description = value;
      if (key === "LAST-MODIFIED") event.lastModified = value;
      if (key === "DTSTART") event.start = parseIcsDate(value);
      if (key === "DTEND") event.end = parseIcsDate(value);
    });
    return event;
  }

  function parseIcsDate(value) {
    if (/^\d{8}$/.test(value)) {
      return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T12:00:00`);
    }
    const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
    if (!match) return null;
    const [, year, month, day, hour, minute, second, zulu] = match;
    const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${zulu ? "Z" : ""}`;
    return new Date(iso);
  }

  function localParts(date) {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date).reduce((items, part) => ({ ...items, [part.type]: part.value }), {});
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  }

  function decodeIcs(value) {
    return String(value || "")
      .replace(/\\n/gi, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\")
      .trim();
  }

  window.inferXpsEventType = inferEventType;

  try {
    state = normalizeXpsState(state);
    render();
  } catch {}
})();
