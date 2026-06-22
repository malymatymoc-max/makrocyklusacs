(function () {
  const MATCH_FORMATS = ["2+0", "3+0", "3+1", "4+1", "5+1"];
  let selectedMatchSessionId = "";
  let selectedSlotIndex = -1;

  function migrateMatchdays(nextState = state) {
    const next = { ...blank(), ...(nextState && typeof nextState === "object" ? nextState : {}) };
    next.matchdays = (next.matchdays || []).map((matchday) => normalizeMatchday(matchday));
    return next;
  }

  function normalizeMatchday(matchday) {
    const format = MATCH_FORMATS.includes(matchday.format) ? matchday.format : "4+1";
    const positions = formationPositions(format);
    return {
      id: matchday.id || uid("matchday"),
      sessionId: matchday.sessionId || "",
      teamId: matchday.teamId || "",
      opponent: matchday.opponent || "",
      format,
      partsCount: Math.max(1, Number(matchday.partsCount || 2)),
      partMinutes: Math.max(1, Number(matchday.partMinutes || 12)),
      warningMinutes: Math.max(1, Number(matchday.warningMinutes || 4)),
      fieldPlayerIds: Array.from({ length: positions.length }, (_, index) => matchday.fieldPlayerIds?.[index] || ""),
      benchPlayerIds: Array.isArray(matchday.benchPlayerIds) ? matchday.benchPlayerIds.filter(Boolean) : [],
    };
  }

  function formationPositions(format) {
    const map = {
      "2+0": [{ x: 39, y: 54 }, { x: 61, y: 54 }],
      "3+0": [{ x: 50, y: 34 }, { x: 36, y: 62 }, { x: 64, y: 62 }],
      "3+1": [{ x: 50, y: 88, gk: true }, { x: 38, y: 61 }, { x: 62, y: 61 }, { x: 50, y: 34 }],
      "4+1": [{ x: 50, y: 88, gk: true }, { x: 50, y: 70 }, { x: 34, y: 50 }, { x: 66, y: 50 }, { x: 50, y: 30 }],
      "5+1": [{ x: 50, y: 88, gk: true }, { x: 50, y: 74 }, { x: 28, y: 54 }, { x: 50, y: 54 }, { x: 72, y: 54 }, { x: 50, y: 31 }],
    };
    return map[format] || map["4+1"];
  }

  function matchSessions() {
    return state.sessions
      .filter((session) => session.type === "Utkání")
      .sort((a, b) => `${a.date} ${a.startTime || ""}`.localeCompare(`${b.date} ${b.startTime || ""}`));
  }

  function matchdayForSession(session) {
    if (!session) return null;
    let matchday = state.matchdays.find((item) => item.sessionId === session.id);
    if (!matchday) {
      matchday = normalizeMatchday({
        id: uid("matchday"),
        sessionId: session.id,
        teamId: session.teamId,
        opponent: "",
      });
      state.matchdays.push(matchday);
    }
    return matchday;
  }

  function renderMatchday() {
    const list = document.querySelector("#matchdayList");
    const detail = document.querySelector("#matchdayDetail");
    if (!list || !detail) return;

    const matches = matchSessions();
    if (!matches.length) {
      list.innerHTML = `<div class="muted">Zatím není v kalendáři žádné utkání.</div>`;
      detail.innerHTML = `<div class="matchday-empty"><p>Vytvoř v kalendáři událost typu Utkání a potom ji otevři tady.</p></div>`;
      return;
    }

    if (!matches.some((session) => session.id === selectedMatchSessionId)) selectedMatchSessionId = matches[0].id;
    list.innerHTML = matches.map((session) => matchCard(session)).join("");
    list.querySelectorAll("[data-match-session]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedMatchSessionId = button.dataset.matchSession;
        selectedSlotIndex = -1;
        matchdayForSession(sessionById(selectedMatchSessionId));
        renderMatchday();
      });
    });

    renderMatchDetail(sessionById(selectedMatchSessionId), detail);
  }

  function matchCard(session) {
    const teamItem = state.teams.find((item) => item.id === session.teamId);
    const matchday = state.matchdays.find((item) => item.sessionId === session.id);
    const opponent = matchday?.opponent || "Soupeř není nastavený";
    return `<button class="match-card ${session.id === selectedMatchSessionId ? "active" : ""}" style="--team-color:${esc(teamItem?.color || "#d28a16")}" data-match-session="${session.id}" type="button">
      <strong>${esc(teamItem?.name || "Tým")} vs ${esc(opponent)}</strong>
      <span>${fmtFullDate(session.date)}${session.startTime ? ` · ${esc(session.startTime)}` : ""}</span>
      <span>${esc(session.place || "Bez místa")}</span>
    </button>`;
  }

  function renderMatchDetail(session, host) {
    if (!session) {
      host.innerHTML = `<div class="matchday-empty"><p>Vyber utkání.</p></div>`;
      return;
    }

    const matchday = matchdayForSession(session);
    const teamItem = state.teams.find((item) => item.id === session.teamId);
    const players = window.playersForTeam ? window.playersForTeam(session.teamId) : (state.players || []).filter((player) => player.teamId === session.teamId);
    const positions = formationPositions(matchday.format);
    if (matchday.fieldPlayerIds.length !== positions.length) {
      matchday.fieldPlayerIds = normalizeMatchday(matchday).fieldPlayerIds;
      selectedSlotIndex = -1;
    }

    host.innerHTML = `
      <div class="matchday-dashboard">
        <div class="matchday-header">
          <div>
            <h2>${esc(teamItem?.name || "Tým")} vs ${esc(matchday.opponent || "Soupeř")}</h2>
            <p>${fmtFullDate(session.date)}${session.startTime ? ` · ${esc(session.startTime)}` : ""}${session.place ? ` · ${esc(session.place)}` : ""}</p>
          </div>
          <button class="secondary" data-open-calendar-session="${session.id}" type="button">Otevřít v kalendáři</button>
        </div>
        <div class="matchday-grid">
          <div class="match-settings">
            ${matchSettings(matchday)}
            ${benchPanel(matchday, players)}
          </div>
          <div class="pitch-card">
            <div class="pitch">${pitchSlots(matchday, players, positions)}</div>
            ${playerPicker(matchday, players)}
          </div>
        </div>
      </div>
    `;

    bindMatchdayDetail(host, matchday, session, players);
  }

  function matchSettings(matchday) {
    return `<section class="chooser-block">
      <div class="chooser-title"><strong>Nastavení utkání</strong></div>
      <label>Soupeř<input name="opponent" value="${esc(matchday.opponent)}" placeholder="Název soupeře" /></label>
      <div class="form-row">
        <label>Formát hry<select name="format">${MATCH_FORMATS.map((format) => `<option ${format === matchday.format ? "selected" : ""}>${format}</option>`).join("")}</select></label>
        <label>Počet částí<input name="partsCount" type="number" min="1" value="${esc(matchday.partsCount)}" /></label>
      </div>
      <div class="form-row">
        <label>Minut v části<input name="partMinutes" type="number" min="1" value="${esc(matchday.partMinutes)}" /></label>
        <label>Výstraha po minutách<input name="warningMinutes" type="number" min="1" value="${esc(matchday.warningMinutes)}" /></label>
      </div>
    </section>`;
  }

  function pitchSlots(matchday, players, positions) {
    return positions.map((position, index) => {
      const player = players.find((item) => item.id === matchday.fieldPlayerIds[index]);
      return `<button class="pitch-slot" style="--x:${position.x}%;--y:${position.y}%" data-slot="${index}" type="button">
        <span class="pitch-player">${player ? playerPhoto(player) : (position.gk ? "GK" : "+")}</span>
        <small>${player ? esc(displayPlayerName(player)) : (position.gk ? "brankář" : "volné")}</small>
      </button>`;
    }).join("");
  }

  function benchPanel(matchday, players) {
    const fieldIds = new Set(matchday.fieldPlayerIds.filter(Boolean));
    return `<section class="chooser-block bench-panel">
      <div class="chooser-title"><strong>Střídačka</strong></div>
      <div class="bench-list">
        ${players.length ? players.map((player) => {
          const disabled = fieldIds.has(player.id);
          const active = matchday.benchPlayerIds.includes(player.id);
          return `<button class="bench-player ${active ? "active" : ""}" data-bench-player="${player.id}" ${disabled ? "disabled" : ""} type="button">${esc(displayPlayerName(player))}</button>`;
        }).join("") : `<div class="muted">Nejdřív přidej hráčky v záložce Týmy.</div>`}
      </div>
    </section>`;
  }

  function playerPicker(matchday, players) {
    if (selectedSlotIndex < 0) return `<div class="muted">Klikni na kolečko na hřišti a vyber hráčku.</div>`;
    const usedIds = new Set(matchday.fieldPlayerIds.filter((id, index) => id && index !== selectedSlotIndex));
    return `<section class="chooser-block">
      <div class="chooser-title"><strong>Výběr na pozici</strong><button data-clear-slot="${selectedSlotIndex}" type="button">Vyprázdnit</button></div>
      <div class="player-pick-list">
        ${players.length ? players.map((player) => {
          const disabled = usedIds.has(player.id);
          const active = matchday.fieldPlayerIds[selectedSlotIndex] === player.id;
          return `<button class="player-pick ${active ? "active" : ""}" data-pick-player="${player.id}" ${disabled ? "disabled" : ""} type="button">${esc(displayPlayerName(player))}</button>`;
        }).join("") : `<div class="muted">Nejdřív přidej hráčky v záložce Týmy.</div>`}
      </div>
    </section>`;
  }

  function bindMatchdayDetail(host, matchday, session, players) {
    host.querySelectorAll("input[name], select[name]").forEach((inputEl) => {
      inputEl.addEventListener("change", () => {
        matchday[inputEl.name] = ["partsCount", "partMinutes", "warningMinutes"].includes(inputEl.name)
          ? Math.max(1, Number(inputEl.value || 1))
          : inputEl.value;
        if (inputEl.name === "format") {
          const normalized = normalizeMatchday(matchday);
          Object.assign(matchday, normalized);
          selectedSlotIndex = -1;
        }
        save();
        renderMatchday();
      });
    });
    host.querySelectorAll("[data-slot]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedSlotIndex = Number(button.dataset.slot);
        renderMatchday();
      });
    });
    host.querySelectorAll("[data-pick-player]").forEach((button) => {
      button.addEventListener("click", () => {
        const playerId = button.dataset.pickPlayer;
        matchday.fieldPlayerIds[selectedSlotIndex] = playerId;
        matchday.benchPlayerIds = matchday.benchPlayerIds.filter((id) => id !== playerId);
        save();
        renderMatchday();
      });
    });
    host.querySelector("[data-clear-slot]")?.addEventListener("click", () => {
      matchday.fieldPlayerIds[selectedSlotIndex] = "";
      save();
      renderMatchday();
    });
    host.querySelectorAll("[data-bench-player]").forEach((button) => {
      button.addEventListener("click", () => {
        const playerId = button.dataset.benchPlayer;
        matchday.benchPlayerIds = matchday.benchPlayerIds.includes(playerId)
          ? matchday.benchPlayerIds.filter((id) => id !== playerId)
          : [...matchday.benchPlayerIds, playerId];
        save();
        renderMatchday();
      });
    });
    host.querySelector("[data-open-calendar-session]")?.addEventListener("click", () => {
      if (typeof openCalendarSession === "function") openCalendarSession(session.id);
      showView("calendar");
    });
  }

  function playerPhoto(player) {
    if (player.photoData) return `<img src="${esc(player.photoData)}" alt="" />`;
    return esc((window.playerInitials ? window.playerInitials(player) : initials(player)));
  }

  function initials(player) {
    const first = (player.firstName || "").trim()[0] || "";
    const last = (player.lastName || "").trim()[0] || "";
    return (first + last || "?").toUpperCase();
  }

  function displayPlayerName(player) {
    return window.playerName ? window.playerName(player) : `${player.firstName || ""} ${player.lastName || ""}`.trim() || "Bez jména";
  }

  function fmtFullDate(value) {
    return value ? new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`)) : "";
  }

  const matchdayNormalizeState = window.normalizeState;
  normalizeState = function normalizeMatchdayState(nextState) {
    return migrateMatchdays(matchdayNormalizeState(nextState));
  };

  const matchdayBlank = window.blank;
  blank = function blankWithMatchdays() {
    return { ...matchdayBlank(), matchdays: [] };
  };

  const matchdayRender = window.render;
  render = function renderWithMatchday() {
    matchdayRender();
    renderMatchday();
  };

  window.matchdayForSession = matchdayForSession;

  try {
    state = migrateMatchdays(state);
    render();
  } catch {}
})();
