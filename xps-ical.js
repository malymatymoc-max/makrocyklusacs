(function () {
  const DEFAULT_XPS_URL = "webcal://calendar.google.com/calendar/ical/3740d4abaae966c1ef0f4ba83fc3e5c0a6191c8af530d2ecbcf9efad4f83f471@group.calendar.google.com/public/basic.ics";
  const AUTO_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
  let xpsImportBusy = false;
  let xpsImportMessage = "";
  let xpsAutoSyncStarted = false;

  function normalizeXpsState(nextState = state) {
    return {
      ...nextState,
      xpsFeeds: Array.isArray(nextState.xpsFeeds) ? nextState.xpsFeeds.map((feed) => ({
        id: feed.id || uid("xps"),
        teamId: feed.teamId || "",
        url: feed.url || "",
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
    const feed = state.xpsFeeds[0] || {};
    panel.innerHTML = `
      <div class="setup-head">
        <div><h2>XPS iCal import</h2><p>Jednosměrné načtení událostí z XPS/Google kalendáře do Coach ACS. Aplikace je sama zkontroluje zhruba dvakrát denně při používání.</p></div>
        <button id="syncAllXpsSetup" class="primary" type="button" ${xpsImportBusy || !state.xpsFeeds.length ? "disabled" : ""}>${xpsImportBusy ? "Synchronizuji..." : "Synchronizovat vše"}</button>
      </div>
      <form id="xpsImportForm" class="xps-import-form">
        <label>Kategorie<select name="teamId" required>${state.teams.map((team) => `<option value="${team.id}" ${(feed.teamId || defaultTeamId) === team.id ? "selected" : ""}>${esc(team.name)}</option>`).join("")}</select></label>
        <label>iCal odkaz<input name="url" value="${esc(feed.url || DEFAULT_XPS_URL)}" placeholder="webcal://..." required /></label>
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
        url: data.url,
      });
    });

    panel.querySelector("#syncAllXpsSetup")?.addEventListener("click", () => syncAllXpsFeeds());
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
    return `<div class="xps-feed-row">
      <div><strong>${esc(teamName)}</strong><span>${esc(shortUrl(feed.url))}</span></div>
      <button data-sync-xps="${feed.id}" type="button">Synchronizovat</button>
      <button class="danger subtle-danger" data-delete-xps="${feed.id}" type="button">Smazat</button>
    </div>`;
  }

  async function syncXpsFeed(feed, options = {}) {
    const shouldFocus = options.focus !== false;
    const silent = Boolean(options.silent);
    if (!silent) {
      xpsImportBusy = true;
      xpsImportMessage = "Načítám iCal...";
      renderXpsImport();
    }
    try {
      const text = await fetchIcs(feed.url);
      const events = parseIcs(text);
      const result = importEvents(feed, events);
      if (shouldFocus) focusImportedSessions(feed, result.sessions);
      feed.lastSyncAt = new Date().toISOString();
      feed.lastResult = `Hotovo: ${result.created} nových, ${result.updated} aktualizovaných, ${events.length} načtených.${shouldFocus ? " Kalendář je přepnutý na importovaný tým." : ""}`;
      state.xpsFeeds = [feed, ...state.xpsFeeds.filter((item) => item.id !== feed.id)];
      save();
      xpsImportMessage = feed.lastResult;
      if (!silent) render();
      return result;
    } catch (error) {
      if (silent) {
        console.warn("[Coach ACS] Automatická XPS synchronizace selhala", error);
      } else {
        xpsImportMessage = `Chyba importu: ${error.message || error}`;
        renderXpsImport();
      }
      throw error;
    } finally {
      if (!silent) {
        xpsImportBusy = false;
        renderXpsImport();
      }
    }
  }

  async function syncAllXpsFeeds(options = {}) {
    state = normalizeXpsState(state);
    const feeds = state.xpsFeeds.filter((feed) => feed.teamId && feed.url);
    if (!feeds.length || xpsImportBusy) {
      if (!feeds.length) xpsImportMessage = "Nejdřív přidej alespoň jeden iCal odkaz.";
      renderXpsImport();
      return;
    }
    xpsImportBusy = true;
    xpsImportMessage = options.automatic ? "Automaticky kontroluji XPS kalendáře..." : "Synchronizuji všechny XPS kalendáře...";
    updateQuickSyncButton(true);
    renderXpsImport();
    const summary = { created: 0, updated: 0, loaded: 0, failed: 0 };
    for (const feed of feeds) {
      try {
        const result = await syncXpsFeed(feed, { focus: false, silent: true });
        summary.created += result.created || 0;
        summary.updated += result.updated || 0;
        summary.loaded += result.sessions?.length || 0;
      } catch {
        summary.failed += 1;
      }
    }
    xpsImportBusy = false;
    xpsImportMessage = `Synchronizace hotová: ${summary.created} nových, ${summary.updated} aktualizovaných${summary.failed ? `, ${summary.failed} chyba` : ""}.`;
    updateQuickSyncButton(false);
    render();
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
    const result = { created: 0, updated: 0, sessions: [] };
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
        result.sessions.push(existing);
        result.updated += 1;
      } else {
        state.sessions.push(mapped);
        result.sessions.push(mapped);
        result.created += 1;
      }
    });
    return result;
  }

  function focusImportedSessions(feed, importedSessions) {
    const sessions = (importedSessions || []).filter((session) => session.teamId === feed.teamId && session.date);
    state.selectedTeamId = feed.teamId;
    state.calendarTeamIds = [...new Set([feed.teamId, ...(Array.isArray(state.calendarTeamIds) ? state.calendarTeamIds : [])])];
    const target = nearestSession(sessions);
    if (target) {
      state.selectedSeasonId = target.seasonId || state.selectedSeasonId;
      selectedSessionId = target.id;
      weekStart = monday(new Date(`${target.date}T12:00:00`));
      monthCursor = firstOfMonth(new Date(`${target.date}T12:00:00`));
    }
    state.selectedPeriodId = "all";
  }

  function nearestSession(sessions) {
    const today = todayKey();
    return sessions
      .slice()
      .sort((a, b) => {
        const aFuture = a.date >= today ? 0 : 1;
        const bFuture = b.date >= today ? 0 : 1;
        if (aFuture !== bFuture) return aFuture - bFuture;
        return aFuture === 0 ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
      })[0] || null;
  }

  function eventToSession(feed, event) {
    const start = localParts(event.start);
    const end = event.end ? localParts(event.end) : { date: start.date, time: "" };
    const endDate = calendarDisplayEndDate(start.date, end.date, event.endAllDay);
    const seasonId = seasonIdForImportedDate(start.date);
    return {
      id: uid("session"),
      teamId: feed.teamId,
      seasonId,
      date: start.date,
      endDate: endDate === start.date ? "" : endDate,
      type: inferEventType(event.summary),
      startTime: start.time,
      endTime: end.date === start.date ? end.time : "",
      place: event.location || "",
      coach: "",
      note: xpsNote(event),
      periodId: periodForImportedDate(feed.teamId, seasonId, start.date),
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

  function seasonIdForImportedDate(date) {
    return state.seasons.find((season) => (!season.start || date >= season.start) && (!season.end || date <= season.end))?.id ||
      state.selectedSeasonId ||
      state.seasons[0]?.id ||
      "";
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
      if (key === "DTSTART") {
        event.startAllDay = /^\d{8}$/.test(value);
        event.start = parseIcsDate(value);
      }
      if (key === "DTEND") {
        event.endAllDay = /^\d{8}$/.test(value);
        event.end = parseIcsDate(value);
      }
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

  function calendarDisplayEndDate(startDate, endDate, endAllDay) {
    if (!endDate || endDate < startDate) return startDate;
    if (endAllDay && endDate > startDate) return dateKey(addDays(new Date(`${endDate}T12:00:00`), -1));
    return endDate;
  }

  function decodeIcs(value) {
    return String(value || "")
      .replace(/\\n/gi, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\")
      .trim();
  }

  function shortUrl(value) {
    const url = normalizeCalendarUrl(value || "");
    return url.replace(/^https:\/\/calendar\.google\.com\/calendar\/ical\//, "Google Calendar / ");
  }

  window.inferXpsEventType = inferEventType;

  function updateQuickSyncButton(isBusy = xpsImportBusy) {
    document.querySelectorAll("[data-sync-all-xps]").forEach((button) => {
      button.disabled = isBusy;
      button.textContent = isBusy ? "Synchronizuji..." : button.classList.contains("sync-all-xps-button") ? "Sync kalendáře" : "Synchronizovat kalendáře";
    });
  }

  function needsAutoSync(feed) {
    if (!feed?.teamId || !feed?.url) return false;
    const lastSync = Date.parse(feed.lastSyncAt || "");
    return !lastSync || Date.now() - lastSync >= AUTO_SYNC_INTERVAL_MS;
  }

  function runAutoXpsSync() {
    state = normalizeXpsState(state);
    if (!state.xpsFeeds.some(needsAutoSync)) return;
    syncAllXpsFeeds({ automatic: true });
  }

  function startAutoXpsSync() {
    if (xpsAutoSyncStarted) return;
    xpsAutoSyncStarted = true;
    document.querySelectorAll("[data-sync-all-xps]").forEach((button) => {
      button.addEventListener("click", () => syncAllXpsFeeds());
    });
    updateQuickSyncButton(false);
    window.setTimeout(runAutoXpsSync, 2500);
    window.setInterval(runAutoXpsSync, 60 * 60 * 1000);
  }

  try {
    state = normalizeXpsState(state);
    if (window.COACH_ACS_UNLOCKED) startAutoXpsSync();
    else window.addEventListener("coach-acs-unlocked", startAutoXpsSync, { once: true });
    render();
  } catch {}
})();
