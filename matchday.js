(function () {
  const MATCH_FORMATS = ["2+0", "3+0", "3+1", "4+1", "5+1"];
  let selectedMatchSessionId = "";
  let selectedMatchdayId = "";
  let selectedSlotIndex = -1;
  let selectedBenchIndex = -1;
  let matchdayTicker = 0;
  let liveMode = false;
  let goalPickerOpen = false;

  function migrateMatchdays(nextState = state) {
    const next = { ...blank(), ...(nextState && typeof nextState === "object" ? nextState : {}) };
    next.matchdays = (next.matchdays || []).map((matchday) => normalizeMatchday(matchday));
    return next;
  }

  function normalizeMatchday(matchday) {
    const format = MATCH_FORMATS.includes(matchday.format) ? matchday.format : "4+1";
    const positions = formationPositions(format);
    const partSeconds = Math.max(1, Number(matchday.partMinutes || 12)) * 60;
    const timerRemaining = Number.isFinite(Number(matchday.timerRemaining)) ? Number(matchday.timerRemaining) : partSeconds;
    const timerRunning = Boolean(matchday.timerRunning);
    const timerEndsAt = Number(matchday.timerEndsAt || 0) || (timerRunning && matchday.timerStartedAt ? Number(matchday.timerStartedAt) + timerRemaining * 1000 : 0);
    return {
      id: matchday.id || uid("matchday"),
      sessionId: matchday.sessionId || "",
      teamId: matchday.teamId || "",
      dashboardName: matchday.dashboardName || "",
      opponent: matchday.opponent || "",
      format,
      partsCount: Math.max(1, Number(matchday.partsCount || 2)),
      partMinutes: Math.max(1, Number(matchday.partMinutes || 12)),
      warningMinutes: Math.max(1, Number(matchday.warningMinutes || 4)),
      fieldPlayerIds: Array.from({ length: positions.length }, (_, index) => matchday.fieldPlayerIds?.[index] || ""),
      benchPlayerIds: Array.isArray(matchday.benchPlayerIds) ? matchday.benchPlayerIds.filter(Boolean) : [],
      tournamentName: matchday.tournamentName || "",
      tournamentOpponents: Array.isArray(matchday.tournamentOpponents) ? matchday.tournamentOpponents.filter(Boolean) : [],
      currentGame: Math.max(1, Number(matchday.currentGame || 1)),
      currentPart: Math.max(1, Number(matchday.currentPart || 1)),
      timerRemaining,
      timerRunning,
      timerStartedAt: Number(matchday.timerStartedAt || 0),
      timerEndsAt,
      playerTimes: normalizePlayerTimes(matchday.playerTimes),
      playerTimeSyncedAt: Number(matchday.playerTimeSyncedAt || 0),
      shots: Math.max(0, Number(matchday.shots || 0)),
      goals: Array.isArray(matchday.goals) ? matchday.goals.map((goal) => ({
        id: goal.id || uid("goal"),
        side: goal.side === "opponent" ? "opponent" : "own",
        playerId: goal.playerId || "",
        ownGoal: Boolean(goal.ownGoal),
        part: Math.max(1, Number(goal.part || 1)),
        second: Math.max(0, Number(goal.second || 0)),
        gameIndex: Math.max(1, Number(goal.gameIndex || 1)),
      })) : [],
    };
  }

  function normalizePlayerTimes(value) {
    return Object.entries(value && typeof value === "object" ? value : {}).reduce((times, [playerId, item]) => {
      if (!playerId) return times;
      times[playerId] = {
        field: Math.max(0, Number(item?.field || 0)),
        bench: Math.max(0, Number(item?.bench || 0)),
      };
      return times;
    }, {});
  }

  function formationPositions(format) {
    const map = {
      "2+0": [{ x: 39, y: 54 }, { x: 61, y: 54 }],
      "3+0": [{ x: 50, y: 34 }, { x: 36, y: 62 }, { x: 64, y: 62 }],
      "3+1": [{ x: 50, y: 88, gk: true }, { x: 38, y: 61 }, { x: 62, y: 61 }, { x: 50, y: 34 }],
      "4+1": [{ x: 50, y: 86, gk: true }, { x: 50, y: 64 }, { x: 34, y: 44 }, { x: 66, y: 44 }, { x: 50, y: 22 }],
      "5+1": [{ x: 50, y: 86, gk: true }, { x: 50, y: 66 }, { x: 28, y: 47 }, { x: 50, y: 47 }, { x: 72, y: 47 }, { x: 50, y: 22 }],
    };
    return map[format] || map["4+1"];
  }

  function matchSessions() {
    return state.sessions
      .filter((session) => ["Utkání", "Turnaj"].includes(session.type))
      .sort((a, b) => `${a.date} ${a.startTime || ""}`.localeCompare(`${b.date} ${b.startTime || ""}`));
  }

  function matchdayForSession(session) {
    if (!session) return null;
    let matchday = selectedMatchdayId ? state.matchdays.find((item) => item.id === selectedMatchdayId && item.sessionId === session.id) : null;
    if (!matchday) matchday = state.matchdays.find((item) => item.sessionId === session.id);
    if (!matchday) {
      matchday = normalizeMatchday({
        id: uid("matchday"),
        sessionId: session.id,
        teamId: session.teamId,
        dashboardName: defaultDashboardName(session, 1),
        opponent: "",
      });
      state.matchdays.push(matchday);
    }
    selectedMatchdayId = matchday.id;
    return matchday;
  }

  function matchdaysForSession(session) {
    if (!session) return [];
    matchdayForSession(session);
    return state.matchdays.filter((item) => item.sessionId === session.id);
  }

  function createMatchdayDashboard(session) {
    const existing = matchdaysForSession(session);
    const source = existing[0] || {};
    const matchday = normalizeMatchday({
      id: uid("matchday"),
      sessionId: session.id,
      teamId: session.teamId,
      dashboardName: defaultDashboardName(session, existing.length + 1),
      opponent: source.opponent || "",
      tournamentName: source.tournamentName || "",
      tournamentOpponents: source.tournamentOpponents || [],
      format: source.format || "4+1",
      partsCount: source.partsCount || 2,
      partMinutes: source.partMinutes || 12,
      warningMinutes: source.warningMinutes || 4,
      currentGame: source.currentGame || 1,
    });
    state.matchdays.push(matchday);
    selectedMatchdayId = matchday.id;
    clearRosterSelection();
    goalPickerOpen = false;
    save();
    renderMatchday();
  }

  function defaultDashboardName(session, index) {
    const teamItem = state.teams.find((item) => item.id === session?.teamId);
    return index === 1 ? (teamItem?.name || "Tým") : `${teamItem?.name || "Tým"} ${index}`;
  }

  function renderMatchday() {
    const list = document.querySelector("#matchdayList");
    const detail = document.querySelector("#matchdayDetail");
    if (!list || !detail) return;

    const matches = matchSessions();
    const layout = document.querySelector(".matchday-layout");
    layout?.classList.toggle("live-mode", liveMode);
    document.body.classList.toggle("matchday-live-active", liveMode && document.body.dataset.activeView === "matchday");
    if (!matches.length) {
      list.innerHTML = `<div class="muted">Zatím není v kalendáři žádné utkání ani turnaj.</div>`;
      detail.innerHTML = `<div class="matchday-empty"><p>Vytvoř v kalendáři událost typu Utkání nebo Turnaj a potom ji otevři tady.</p></div>`;
      return;
    }

    if (!matches.some((session) => session.id === selectedMatchSessionId)) selectedMatchSessionId = matches[0].id;
    list.innerHTML = matches.map((session) => matchCard(session)).join("");
    list.querySelectorAll("[data-match-session]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedMatchSessionId = button.dataset.matchSession;
        selectedMatchdayId = "";
        selectedSlotIndex = -1;
        selectedBenchIndex = -1;
        liveMode = false;
        goalPickerOpen = false;
        matchdayForSession(sessionById(selectedMatchSessionId));
        renderMatchday();
      });
    });

    renderMatchDetail(sessionById(selectedMatchSessionId), detail);
  }

  function matchCard(session) {
    const teamItem = state.teams.find((item) => item.id === session.teamId);
    const dashboards = state.matchdays.filter((item) => item.sessionId === session.id);
    const matchday = dashboards[0];
    const opponent = session.type === "Turnaj" ? (matchday?.tournamentName || "Turnaj není nastavený") : (matchday?.opponent || "Soupeř není nastavený");
    return `<button class="match-card ${session.id === selectedMatchSessionId ? "active" : ""}" style="--team-color:${esc(teamItem?.color || "#d28a16")}" data-match-session="${session.id}" type="button">
      <strong>${esc(teamItem?.name || "Tým")} · ${esc(opponent)}</strong>
      <span>${fmtFullDate(session.date)}${session.startTime ? ` · ${esc(session.startTime)}` : ""}</span>
      <span>${esc(session.place || "Bez místa")}${dashboards.length > 1 ? ` · ${dashboards.length} týmy` : ""}</span>
    </button>`;
  }

  function renderMatchDetail(session, host) {
    if (!session) {
      host.innerHTML = `<div class="matchday-empty"><p>Vyber utkání.</p></div>`;
      return;
    }

    const matchday = matchdayForSession(session);
    const dashboards = matchdaysForSession(session);
    const teamItem = state.teams.find((item) => item.id === session.teamId);
    const players = window.playersForTeam ? window.playersForTeam(session.teamId) : (state.players || []).filter((player) => player.teamId === session.teamId);
    const positions = formationPositions(matchday.format);
    const opponentLabel = activeOpponent(matchday, session);
    const displayTeamName = matchday.dashboardName || teamItem?.name || "Tým";
    syncTimer(matchday);
    if (matchday.timerRunning) startTicker();
    if (matchday.fieldPlayerIds.length !== positions.length) {
      matchday.fieldPlayerIds = normalizeMatchday(matchday).fieldPlayerIds;
      selectedSlotIndex = -1;
      selectedBenchIndex = -1;
    }

    if (liveMode) {
      host.innerHTML = liveMatchScreen(session, matchday, teamItem, players, positions);
      bindMatchdayDetail(host, matchday, session, players);
      return;
    }

    host.innerHTML = `
      <div class="matchday-dashboard">
        <div class="matchday-header">
          <div>
            <h2>${esc(displayTeamName)} vs ${esc(opponentLabel)}</h2>
            <p>${fmtFullDate(session.date)}${session.startTime ? ` · ${esc(session.startTime)}` : ""}${session.place ? ` · ${esc(session.place)}` : ""}</p>
          </div>
          <div class="matchday-header-actions">
            <button class="primary" data-live-mode="open" type="button">Spustit zápas</button>
            <button class="secondary" data-open-calendar-session="${session.id}" type="button">Otevřít v kalendáři</button>
          </div>
        </div>
        ${dashboardSwitcher(session, dashboards, matchday)}
        <div class="matchday-grid">
          <div class="match-settings">
            ${matchSettings(matchday, session)}
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

  function dashboardSwitcher(session, dashboards, activeMatchday) {
    return `<section class="dashboard-switcher">
      <div>
        <strong>Týmy pro tuto událost</strong>
        <span>${dashboards.length} dashboard${dashboards.length === 1 ? "" : "y"}</span>
      </div>
      <div class="dashboard-tabs">
        ${dashboards.map((item, index) => `<button class="${item.id === activeMatchday.id ? "active" : ""}" data-matchday-dashboard="${item.id}" type="button">${esc(item.dashboardName || defaultDashboardName(session, index + 1))}</button>`).join("")}
        <button class="add-dashboard" data-add-dashboard type="button">+ tým</button>
      </div>
    </section>`;
  }

  function matchSettings(matchday, session) {
    if (session?.type === "Turnaj") {
      return `<section class="chooser-block">
        <div class="chooser-title"><strong>Nastavení turnaje</strong></div>
        <label>Název týmu v události<input name="dashboardName" value="${esc(matchday.dashboardName)}" placeholder="Např. WU9 bílá" /></label>
        <label>Název turnaje<input name="tournamentName" value="${esc(matchday.tournamentName)}" placeholder="Např. Turnaj ABC Braník" /></label>
        <label>Soupeři<textarea name="tournamentOpponents" rows="4" placeholder="Každý soupeř na nový řádek">${esc(matchday.tournamentOpponents.join("\n"))}</textarea></label>
        <div class="form-row">
          <label>Formát hry<select name="format">${MATCH_FORMATS.map((format) => `<option ${format === matchday.format ? "selected" : ""}>${format}</option>`).join("")}</select></label>
          <label>Minut v zápase<input name="partMinutes" type="number" min="1" value="${esc(matchday.partMinutes)}" /></label>
        </div>
        <div class="form-row">
          <label>Aktuální zápas<input name="currentGame" type="number" min="1" value="${esc(matchday.currentGame)}" /></label>
          <label>Výstraha po minutách<input name="warningMinutes" type="number" min="1" value="${esc(matchday.warningMinutes)}" /></label>
        </div>
      </section>`;
    }
    return `<section class="chooser-block">
      <div class="chooser-title"><strong>Nastavení utkání</strong></div>
      <label>Název týmu v události<input name="dashboardName" value="${esc(matchday.dashboardName)}" placeholder="Např. WU9 bílá" /></label>
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
      const time = player ? formatClock(playerAreaSeconds(matchday, player.id, "field")) : "";
      return `<button class="pitch-slot ${selectedSlotIndex === index ? "active" : ""}" style="--x:${position.x}%;--y:${position.y}%" data-slot="${index}" type="button">
        <span class="pitch-player">${player ? playerPhoto(player) : (position.gk ? "GK" : "+")}</span>
        <small>${player ? esc(displayPlayerName(player)) : (position.gk ? "brankář" : "volné")}</small>
        ${player ? `<span class="player-time">${time}</span>` : ""}
      </button>`;
    }).join("");
  }

  function benchPanel(matchday, players) {
    const slotCount = Math.max(8, matchday.benchPlayerIds.length + 1);
    return `<section class="chooser-block bench-panel">
      <div class="chooser-title"><strong>Střídačka</strong></div>
      <div class="bench-list">
        ${players.length ? Array.from({ length: slotCount }, (_, index) => benchSlot(matchday, players, index)).join("") : `<div class="muted">Nejdřív přidej hráčky v záložce Týmy.</div>`}
      </div>
    </section>`;
  }

  function benchSlot(matchday, players, index) {
    const player = players.find((item) => item.id === matchday.benchPlayerIds[index]);
    const time = player ? formatClock(playerAreaSeconds(matchday, player.id, "bench")) : "";
    return `<button class="bench-slot ${selectedBenchIndex === index ? "active" : ""}" data-bench-slot="${index}" type="button">
      <span class="bench-circle">${player ? playerPhoto(player) : "+"}</span>
      <small>${player ? esc(displayPlayerName(player)) : "volné"}</small>
      ${player ? `<span class="player-time bench-time">${time}</span>` : ""}
    </button>`;
  }

  function playerPicker(matchday, players) {
    const isFieldPick = selectedSlotIndex >= 0;
    const isBenchPick = selectedBenchIndex >= 0;
    if (!isFieldPick && !isBenchPick) return `<div class="muted">Klikni na kolečko na hřišti nebo na střídačce a vyber hráčku.</div>`;
    const currentId = isFieldPick ? matchday.fieldPlayerIds[selectedSlotIndex] : matchday.benchPlayerIds[selectedBenchIndex];
    const usedIds = new Set([
      ...matchday.fieldPlayerIds.filter((id, index) => id && (!isFieldPick || index !== selectedSlotIndex)),
      ...matchday.benchPlayerIds.filter((id, index) => id && (!isBenchPick || index !== selectedBenchIndex)),
    ]);
    return `<section class="chooser-block">
      <div class="chooser-title"><strong>${isFieldPick ? "Výběr na hřiště" : "Výběr na střídačku"}</strong><button data-clear-pick type="button">Odebrat</button></div>
      <div class="player-pick-list">
        ${players.length ? players.map((player) => {
          const disabled = usedIds.has(player.id);
          const active = currentId === player.id;
          return `<button class="player-pick ${active ? "active" : ""}" data-pick-player="${player.id}" ${disabled ? "disabled" : ""} type="button">${esc(displayPlayerName(player))}</button>`;
        }).join("") : `<div class="muted">Nejdřív přidej hráčky v záložce Týmy.</div>`}
      </div>
    </section>`;
  }

  function bindMatchdayDetail(host, matchday, session, players) {
    host.querySelectorAll("[data-matchday-dashboard]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedMatchdayId = button.dataset.matchdayDashboard;
        clearRosterSelection();
        goalPickerOpen = false;
        liveMode = false;
        renderMatchday();
      });
    });
    host.querySelector("[data-add-dashboard]")?.addEventListener("click", () => createMatchdayDashboard(session));
    host.querySelectorAll("[data-live-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        liveMode = button.dataset.liveMode === "open";
        goalPickerOpen = false;
        selectedSlotIndex = -1;
        selectedBenchIndex = -1;
        renderMatchday();
      });
    });
    host.querySelector("[data-open-goal-picker]")?.addEventListener("click", () => {
      goalPickerOpen = true;
      renderMatchday();
    });
    host.querySelectorAll("[data-close-goal-picker]").forEach((button) => {
      button.addEventListener("click", () => {
        goalPickerOpen = false;
        renderMatchday();
      });
    });
    host.querySelectorAll("input[name], select[name], textarea[name]").forEach((inputEl) => {
      inputEl.addEventListener("change", () => {
        if (inputEl.name === "tournamentOpponents") {
          matchday.tournamentOpponents = inputEl.value.split("\n").map((item) => item.trim()).filter(Boolean);
          matchday.currentGame = Math.min(Math.max(1, matchday.currentGame), Math.max(1, matchday.tournamentOpponents.length));
        } else {
          matchday[inputEl.name] = ["partsCount", "partMinutes", "warningMinutes", "currentGame"].includes(inputEl.name)
          ? Math.max(1, Number(inputEl.value || 1))
          : inputEl.value;
        }
        if (inputEl.name === "partMinutes" && !matchday.timerRunning) {
          matchday.timerRemaining = Math.max(1, Number(inputEl.value || 1)) * 60;
          matchday.timerEndsAt = 0;
        }
        if (inputEl.name === "partsCount") matchday.currentPart = Math.min(matchday.currentPart, matchday.partsCount);
        if (inputEl.name === "currentGame") matchday.currentGame = Math.min(Math.max(1, matchday.currentGame), Math.max(1, matchday.tournamentOpponents.length || matchday.currentGame));
        if (inputEl.name === "format") {
          const normalized = normalizeMatchday(matchday);
          Object.assign(matchday, normalized);
          selectedSlotIndex = -1;
          selectedBenchIndex = -1;
        }
        save();
        renderMatchday();
      });
    });
    host.querySelectorAll("[data-slot]").forEach((button) => {
      button.addEventListener("click", () => {
        handleRosterSlotClick(matchday, "field", Number(button.dataset.slot));
      });
    });
    host.querySelectorAll("[data-bench-slot]").forEach((button) => {
      button.addEventListener("click", () => {
        handleRosterSlotClick(matchday, "bench", Number(button.dataset.benchSlot));
      });
    });
    host.querySelectorAll("[data-pick-player]").forEach((button) => {
      button.addEventListener("click", () => {
        const playerId = button.dataset.pickPlayer;
        syncPlayerTimes(matchday);
        if (selectedSlotIndex >= 0) {
          matchday.fieldPlayerIds[selectedSlotIndex] = playerId;
          matchday.benchPlayerIds = matchday.benchPlayerIds.filter((id) => id !== playerId);
        }
        if (selectedBenchIndex >= 0) {
          matchday.benchPlayerIds[selectedBenchIndex] = playerId;
          matchday.fieldPlayerIds = matchday.fieldPlayerIds.map((id) => id === playerId ? "" : id);
        }
        matchday.benchPlayerIds = trimTrailingEmpty(matchday.benchPlayerIds);
        save();
        renderMatchday();
      });
    });
    host.querySelector("[data-clear-pick]")?.addEventListener("click", () => {
      syncPlayerTimes(matchday);
      if (selectedSlotIndex >= 0) matchday.fieldPlayerIds[selectedSlotIndex] = "";
      if (selectedBenchIndex >= 0) matchday.benchPlayerIds[selectedBenchIndex] = "";
      matchday.benchPlayerIds = trimTrailingEmpty(matchday.benchPlayerIds);
      save();
      renderMatchday();
    });
    host.querySelector("[data-open-calendar-session]")?.addEventListener("click", () => {
      if (typeof openCalendarSession === "function") openCalendarSession(session.id);
      showView("calendar");
    });
    host.querySelector("[data-export-report]")?.addEventListener("click", () => openMatchReport(session, matchday, players));
    host.querySelectorAll("[data-timer]").forEach((button) => {
      button.addEventListener("click", () => handleTimer(matchday, button.dataset.timer));
    });
    host.querySelectorAll("[data-shot]").forEach((button) => {
      button.addEventListener("click", () => {
        matchday.shots = Math.max(0, Number(matchday.shots || 0) + Number(button.dataset.shot));
        save();
        renderMatchday();
      });
    });
    host.querySelectorAll("[data-goal-side]").forEach((button) => {
      button.addEventListener("click", () => {
        addGoal(matchday, button.dataset.goalSide, button.dataset.goalPlayer || "", button.dataset.ownGoal === "true");
      });
    });
    host.querySelectorAll("[data-remove-goal]").forEach((button) => {
      button.addEventListener("click", () => {
        matchday.goals = matchday.goals.filter((goal) => goal.id !== button.dataset.removeGoal);
        save();
        renderMatchday();
      });
    });
  }

  function handleRosterSlotClick(matchday, targetArea, targetIndex) {
    const current = selectedRosterSlot();
    if (current && current.area === targetArea && current.index === targetIndex) {
      clearRosterSelection();
      renderMatchday();
      return;
    }

    if (current) {
      const currentPlayerId = rosterSlotValue(matchday, current);
      if (currentPlayerId) {
        syncPlayerTimes(matchday);
        const target = { area: targetArea, index: targetIndex };
        const targetPlayerId = rosterSlotValue(matchday, target);
        setRosterSlotValue(matchday, current, targetPlayerId);
        setRosterSlotValue(matchday, target, currentPlayerId);
        matchday.benchPlayerIds = trimTrailingEmpty(matchday.benchPlayerIds);
        clearRosterSelection();
        save();
        renderMatchday();
        return;
      }
    }

    selectedSlotIndex = targetArea === "field" ? targetIndex : -1;
    selectedBenchIndex = targetArea === "bench" ? targetIndex : -1;
    renderMatchday();
  }

  function selectedRosterSlot() {
    if (selectedSlotIndex >= 0) return { area: "field", index: selectedSlotIndex };
    if (selectedBenchIndex >= 0) return { area: "bench", index: selectedBenchIndex };
    return null;
  }

  function rosterSlotValue(matchday, slot) {
    return slot.area === "field" ? matchday.fieldPlayerIds[slot.index] || "" : matchday.benchPlayerIds[slot.index] || "";
  }

  function setRosterSlotValue(matchday, slot, playerId) {
    if (slot.area === "field") matchday.fieldPlayerIds[slot.index] = playerId || "";
    else matchday.benchPlayerIds[slot.index] = playerId || "";
  }

  function clearRosterSelection() {
    selectedSlotIndex = -1;
    selectedBenchIndex = -1;
  }

  function liveMatchScreen(session, matchday, teamItem, players, positions) {
    const gameIndex = session.type === "Turnaj" ? matchday.currentGame : 1;
    const score = scoreLine(matchday, gameIndex);
    const roster = selectedRoster(matchday, players);
    const fieldCount = matchday.fieldPlayerIds.filter(Boolean).length;
    const benchCount = matchday.benchPlayerIds.filter(Boolean).length;
    const opponent = activeOpponent(matchday, session);
    const totalGames = Math.max(1, matchday.tournamentOpponents.length || 1);
    const displayTeamName = matchday.dashboardName || teamItem?.name || "Tým";
    return `<div class="match-live-screen">
      <div class="match-live-toolbar">
        <button class="secondary live-back" data-live-mode="close" type="button">← Příprava</button>
        <div class="live-match-title">
          <h1>${esc(displayTeamName)} vs ${esc(opponent)}</h1>
          <p>${esc(session.type)} · ${fmtFullDate(session.date)}${session.startTime ? ` · ${esc(session.startTime)}` : ""}${session.place ? ` · ${esc(session.place)}` : ""}</p>
        </div>
        <button class="secondary live-report-button" data-export-report type="button">Export PDF</button>
      </div>

      <div class="match-live-controls">
        <section class="live-control-card live-score-card">
          <div><small>${esc(displayTeamName)}</small><strong>${score.own}</strong></div>
          <span>:</span>
          <div><small>${esc(opponent)}</small><strong>${score.opponent}</strong></div>
        </section>
        <section class="live-control-card live-clock-card">
          <span>${session.type === "Turnaj" ? `Zápas ${matchday.currentGame}/${totalGames}` : `Část ${matchday.currentPart}/${matchday.partsCount}`}</span>
          <strong>${formatClock(currentRemaining(matchday))}</strong>
          <div class="live-clock-actions">
            <button class="primary" data-timer="${matchday.timerRunning ? "pause" : "start"}" type="button">${matchday.timerRunning ? "Pauza" : "Start"}</button>
            <button class="secondary" data-timer="reset" type="button">Reset</button>
            <button class="secondary" data-timer="${session.type === "Turnaj" ? "next-match" : "next"}" type="button">${session.type === "Turnaj" ? "Další zápas" : "Další část"}</button>
          </div>
        </section>
        <section class="live-control-card live-shots-card">
          <span>Střely</span>
          <strong>${matchday.shots}</strong>
          <div class="live-shot-control">
            <button class="secondary" data-shot="-1" type="button">−</button>
            <button class="primary" data-shot="1" type="button">+ střela</button>
          </div>
        </section>
        <section class="live-control-card live-goals-card">
          <span>Góly</span>
          <button class="primary live-goal-button" data-open-goal-picker type="button" ${roster.length ? "" : "disabled"}>Gól ${esc(displayTeamName)}</button>
          <button class="danger subtle-danger live-goal-button" data-goal-side="opponent" type="button">Gól ${esc(opponent)}</button>
        </section>
      </div>

      <div class="match-live-body">
        <section class="live-lineup-card">
          <div class="live-section-head">
            <div><h2>Sestava</h2><p>${fieldCount}/${positions.length} na hřišti · ${benchCount} na střídačce</p></div>
          </div>
          <div class="live-lineup-grid">
            <div class="pitch live-pitch">${pitchSlots(matchday, players, positions)}</div>
            <aside class="live-bench">
              <div class="live-section-head"><div><h3>Střídačka</h3><p>Jen hráčky vybrané pro utkání.</p></div></div>
              <div class="bench-list live-bench-list">${Array.from({ length: Math.max(6, matchday.benchPlayerIds.length + 1) }, (_, index) => benchSlot(matchday, players, index)).join("")}</div>
              ${playerPicker(matchday, players)}
            </aside>
          </div>
        </section>

        <section class="live-log-card">
          <div class="live-section-head"><div><h3>Průběh utkání</h3><p>Góly můžeš křížkem opravit.</p></div></div>
          <div class="goal-log live-goal-log">
            ${goalsForGame(matchday, gameIndex).length ? goalsForGame(matchday, gameIndex).reverse().map((goal) => goalLogItem(goal, matchday, players, teamItem, session)).join("") : `<div class="muted">Zatím bez gólů.</div>`}
          </div>
        </section>
      </div>
      ${goalPickerOpen ? goalPicker(matchday, displayTeamName, players) : ""}
    </div>`;
  }

  function goalPicker(matchday, displayTeamName, players) {
    const roster = selectedRoster(matchday, players);
    return `<div class="goal-picker-backdrop">
      <section class="goal-picker-modal">
        <div class="chooser-title"><strong>Kdo dal gól ${esc(displayTeamName || "náš tým")}?</strong><button data-close-goal-picker type="button">×</button></div>
        <div class="goal-picker-list">
          ${roster.map((player) => `<button class="goal-player-button" data-goal-side="own" data-goal-player="${player.id}" type="button"><span class="bench-circle">${playerPhoto(player)}</span><strong>${esc(displayPlayerName(player))}</strong></button>`).join("")}
          <button class="goal-player-button" data-goal-side="own" data-own-goal="true" type="button"><span class="bench-circle">VG</span><strong>Vlastní gól soupeře</strong></button>
        </div>
      </section>
    </div>`;
  }

  function selectedRoster(matchday, players) {
    const ids = [...new Set([...matchday.fieldPlayerIds, ...matchday.benchPlayerIds].filter(Boolean))];
    return ids.map((id) => players.find((player) => player.id === id)).filter(Boolean);
  }

  function addGoal(matchday, side, playerId = "", ownGoal = false) {
    const elapsed = Math.max(0, matchday.partMinutes * 60 - currentRemaining(matchday));
    matchday.goals.push({ id: uid("goal"), side, playerId, ownGoal, part: matchday.currentPart, second: elapsed, gameIndex: matchday.currentGame || 1 });
    goalPickerOpen = false;
    save();
    renderMatchday();
  }

  function goalLogItem(goal, matchday, players, teamItem, session) {
    const player = players.find((item) => item.id === goal.playerId);
    const opponent = opponentForGame(matchday, session, goal.gameIndex || 1);
    const label = goal.side === "opponent"
      ? `Gól ${opponent}`
      : goal.ownGoal ? `Vlastní gól soupeře` : `Gól ${displayPlayerName(player || {})}`;
    return `<div class="goal-log-row">
      <span>${session?.type === "Turnaj" ? `${goal.gameIndex || 1}. zápas` : `${goal.part}. část`} · ${formatClock(goal.second)} · ${esc(label)}</span>
      <button data-remove-goal="${goal.id}" type="button">×</button>
    </div>`;
  }

  function scoreLine(matchday, gameIndex = 1) {
    return goalsForGame(matchday, gameIndex).reduce((score, goal) => {
      if (goal.side === "opponent") score.opponent += 1;
      else score.own += 1;
      return score;
    }, { own: 0, opponent: 0 });
  }

  function handleTimer(matchday, action) {
    syncTimer(matchday);
    if (action === "start" && matchday.timerRemaining > 0) {
      matchday.timerRunning = true;
      matchday.timerStartedAt = Date.now();
      matchday.timerEndsAt = Date.now() + Math.max(0, Number(matchday.timerRemaining || 0)) * 1000;
      matchday.playerTimeSyncedAt = Date.now();
      startTicker();
    }
    if (action === "pause") {
      syncPlayerTimes(matchday);
      matchday.timerRemaining = currentRemaining(matchday);
      matchday.timerRunning = false;
      matchday.timerStartedAt = 0;
      matchday.timerEndsAt = 0;
      matchday.playerTimeSyncedAt = 0;
    }
    if (action === "reset") {
      syncPlayerTimes(matchday);
      matchday.timerRunning = false;
      matchday.timerStartedAt = 0;
      matchday.timerEndsAt = 0;
      matchday.timerRemaining = matchday.partMinutes * 60;
      matchday.playerTimeSyncedAt = 0;
    }
    if (action === "next") {
      syncPlayerTimes(matchday);
      matchday.timerRunning = false;
      matchday.timerStartedAt = 0;
      matchday.timerEndsAt = 0;
      matchday.currentPart = Math.min(matchday.partsCount, matchday.currentPart + 1);
      matchday.timerRemaining = matchday.partMinutes * 60;
      matchday.playerTimeSyncedAt = 0;
    }
    if (action === "next-match") {
      syncPlayerTimes(matchday);
      matchday.timerRunning = false;
      matchday.timerStartedAt = 0;
      matchday.timerEndsAt = 0;
      matchday.currentGame = Math.min(Math.max(1, matchday.tournamentOpponents.length || matchday.currentGame), matchday.currentGame + 1);
      matchday.timerRemaining = matchday.partMinutes * 60;
      matchday.playerTimeSyncedAt = 0;
    }
    save();
    renderMatchday();
  }

  function goalsForGame(matchday, gameIndex = 1) {
    return (matchday.goals || []).filter((goal) => Math.max(1, Number(goal.gameIndex || 1)) === gameIndex);
  }

  function activeOpponent(matchday, session) {
    return opponentForGame(matchday, session, session?.type === "Turnaj" ? matchday.currentGame : 1);
  }

  function opponentForGame(matchday, session, gameIndex = 1) {
    if (session?.type === "Turnaj") return matchday.tournamentOpponents[Math.max(0, gameIndex - 1)] || `Soupeř ${gameIndex}`;
    return matchday.opponent || "Soupeř";
  }

  function openMatchReport(session, matchday, players) {
    const teamItem = state.teams.find((item) => item.id === session.teamId);
    const displayTeamName = matchday.dashboardName || teamItem?.name || "Tým";
    const roster = selectedRoster(matchday, players);
    const title = session.type === "Turnaj"
      ? `${displayTeamName} · ${matchday.tournamentName || "Turnaj"}`
      : `${displayTeamName} vs ${activeOpponent(matchday, session)}`;
    const games = session.type === "Turnaj"
      ? Array.from({ length: Math.max(1, matchday.tournamentOpponents.length || matchday.currentGame || 1) }, (_, index) => index + 1)
      : [1];
    const goalCounts = roster.map((player) => ({
      player,
      goals: (matchday.goals || []).filter((goal) => goal.side === "own" && goal.playerId === player.id).length,
    }));
    const report = window.open("", "_blank");
    if (!report) return;
    report.document.write(`<!doctype html><html lang="cs"><head><meta charset="utf-8" />
      <title>${esc(title)}</title>
      <style>
        body{font-family:Inter,Arial,sans-serif;margin:0;color:#14211b;background:#f4f6f4}
        .page{max-width:980px;margin:0 auto;padding:34px}
        h1{font-size:34px;margin:0 0 6px} h2{font-size:20px;margin:26px 0 10px}
        p{color:#66756d;margin:0 0 16px}.score{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:20px 0}
        .card{border:1px solid #dfe6e1;border-radius:10px;background:#fff;padding:18px}
        .result{font-size:44px;font-weight:900}.muted{color:#66756d}
        table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #dfe6e1;border-radius:10px;overflow:hidden}
        th,td{text-align:left;border-bottom:1px solid #dfe6e1;padding:10px 12px}th{font-size:12px;color:#66756d;text-transform:uppercase}
        @media print{body{background:#fff}.page{padding:0}.no-print{display:none}}
      </style></head><body><main class="page">
        <button class="no-print" onclick="window.print()" style="float:right;min-height:38px;padding:0 14px;border-radius:8px;border:1px solid #dfe6e1;background:#007a3d;color:#fff;font-weight:900">Tisk / uložit PDF</button>
        <h1>${esc(title)}</h1>
        <p>${fmtFullDate(session.date)}${session.startTime ? ` · ${esc(session.startTime)}` : ""}${session.place ? ` · ${esc(session.place)}` : ""}</p>
        <section class="score">
          ${games.map((gameIndex) => {
            const score = scoreLine(matchday, gameIndex);
            return `<div class="card"><div class="muted">${esc(displayTeamName)}${session.type === "Turnaj" ? ` · ${gameIndex}. zápas` : ""} · ${esc(opponentForGame(matchday, session, gameIndex))}</div><div class="result">${score.own}:${score.opponent}</div></div>`;
          }).join("")}
        </section>
        <h2>Hráčky</h2>
        <table><thead><tr><th>Hráčka</th><th>Góly</th></tr></thead><tbody>
          ${goalCounts.length ? goalCounts.map(({ player, goals }) => `<tr><td>${esc(displayPlayerName(player))}</td><td>${goals}</td></tr>`).join("") : `<tr><td colspan="2">Bez vybrané soupisky.</td></tr>`}
        </tbody></table>
        <h2>Průběh</h2>
        <table><thead><tr><th>Čas</th><th>Událost</th></tr></thead><tbody>
          ${(matchday.goals || []).length ? [...matchday.goals].sort((a, b) => (a.gameIndex || 1) - (b.gameIndex || 1) || a.second - b.second).map((goal) => {
            const player = players.find((item) => item.id === goal.playerId);
            const label = goal.side === "opponent" ? `Gól ${opponentForGame(matchday, session, goal.gameIndex || 1)}` : goal.ownGoal ? "Vlastní gól soupeře" : `Gól ${displayPlayerName(player || {})}`;
            return `<tr><td>${session.type === "Turnaj" ? `${goal.gameIndex || 1}. zápas` : `${goal.part}. část`} · ${formatClock(goal.second)}</td><td>${esc(label)}</td></tr>`;
          }).join("") : `<tr><td colspan="2">Bez zapsaných gólů.</td></tr>`}
        </tbody></table>
      </main></body></html>`);
    report.document.close();
    report.focus();
  }

  function syncTimer(matchday) {
    if (!matchday.timerRunning) return;
    if (!matchday.timerEndsAt) matchday.timerEndsAt = Date.now() + Math.max(0, Number(matchday.timerRemaining || 0)) * 1000;
    syncPlayerTimes(matchday);
    matchday.timerRemaining = currentRemaining(matchday);
    if (matchday.timerRemaining <= 0) {
      matchday.timerRunning = false;
      matchday.timerStartedAt = 0;
      matchday.timerEndsAt = 0;
      matchday.playerTimeSyncedAt = 0;
      save();
    }
  }

  function syncPlayerTimes(matchday) {
    if (!matchday.playerTimes) matchday.playerTimes = {};
    if (!matchday.timerRunning) return;
    const now = Date.now();
    const endAt = Number(matchday.timerEndsAt || 0) || now;
    const lastSync = Number(matchday.playerTimeSyncedAt || matchday.timerStartedAt || now);
    const effectiveNow = Math.min(now, endAt);
    const elapsed = Math.max(0, Math.floor((effectiveNow - lastSync) / 1000));
    if (!elapsed) {
      matchday.playerTimeSyncedAt = effectiveNow;
      return;
    }
    rosterAreaEntries(matchday).forEach(({ playerId, area }) => {
      if (!matchday.playerTimes[playerId]) matchday.playerTimes[playerId] = { field: 0, bench: 0 };
      matchday.playerTimes[playerId][area] = Math.max(0, Number(matchday.playerTimes[playerId][area] || 0)) + elapsed;
    });
    matchday.playerTimeSyncedAt = effectiveNow;
  }

  function rosterAreaEntries(matchday) {
    const seen = new Set();
    const field = matchday.fieldPlayerIds.filter(Boolean).map((playerId) => ({ playerId, area: "field" }));
    const bench = matchday.benchPlayerIds.filter(Boolean).map((playerId) => ({ playerId, area: "bench" }));
    return [...field, ...bench].filter(({ playerId }) => {
      if (seen.has(playerId)) return false;
      seen.add(playerId);
      return true;
    });
  }

  function playerAreaSeconds(matchday, playerId, area) {
    const base = Math.max(0, Number(matchday.playerTimes?.[playerId]?.[area] || 0));
    if (!matchday.timerRunning || !isPlayerCurrentlyInArea(matchday, playerId, area)) return base;
    const now = Date.now();
    const endAt = Number(matchday.timerEndsAt || 0) || now;
    const lastSync = Number(matchday.playerTimeSyncedAt || matchday.timerStartedAt || now);
    return base + Math.max(0, Math.floor((Math.min(now, endAt) - lastSync) / 1000));
  }

  function isPlayerCurrentlyInArea(matchday, playerId, area) {
    return area === "field" ? matchday.fieldPlayerIds.includes(playerId) : matchday.benchPlayerIds.includes(playerId);
  }

  function currentRemaining(matchday) {
    if (!matchday.timerRunning) return Math.max(0, Number(matchday.timerRemaining || 0));
    const endsAt = Number(matchday.timerEndsAt || 0) || Date.now() + Math.max(0, Number(matchday.timerRemaining || 0)) * 1000;
    return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  }

  function startTicker() {
    if (matchdayTicker) return;
    matchdayTicker = window.setInterval(() => {
      const session = sessionById(selectedMatchSessionId);
      const matchday = selectedMatchdayId
        ? state.matchdays.find((item) => item.id === selectedMatchdayId && item.sessionId === session?.id)
        : state.matchdays.find((item) => item.sessionId === session?.id);
      if (!matchday?.timerRunning) {
        window.clearInterval(matchdayTicker);
        matchdayTicker = 0;
        return;
      }
      renderMatchday();
    }, 1000);
  }

  function formatClock(seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds || 0)));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  }

  function playerPhoto(player) {
    if (player.photoData) return `<img src="${esc(player.photoData)}" alt="" />`;
    return esc((window.playerInitials ? window.playerInitials(player) : initials(player)));
  }

  function trimTrailingEmpty(items) {
    const next = [...items];
    while (next.length && !next[next.length - 1]) next.pop();
    return next;
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
    if (document.body.dataset.activeView !== "matchday") {
      document.body.classList.remove("matchday-live-active");
    }
    renderMatchday();
  };

  window.matchdayForSession = matchdayForSession;

  try {
    state = migrateMatchdays(state);
    render();
  } catch {}
})();
