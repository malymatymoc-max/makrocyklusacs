(function () {
  const MATCH_FORMATS = ["2+0", "3+0", "3+1", "4+1", "5+1"];
  let selectedMatchSessionId = "";
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
      currentPart: Math.max(1, Number(matchday.currentPart || 1)),
      timerRemaining: Number.isFinite(Number(matchday.timerRemaining)) ? Number(matchday.timerRemaining) : Math.max(1, Number(matchday.partMinutes || 12)) * 60,
      timerRunning: Boolean(matchday.timerRunning),
      timerStartedAt: Number(matchday.timerStartedAt || 0),
      shots: Math.max(0, Number(matchday.shots || 0)),
      goals: Array.isArray(matchday.goals) ? matchday.goals.map((goal) => ({
        id: goal.id || uid("goal"),
        side: goal.side === "opponent" ? "opponent" : "own",
        playerId: goal.playerId || "",
        ownGoal: Boolean(goal.ownGoal),
        part: Math.max(1, Number(goal.part || 1)),
        second: Math.max(0, Number(goal.second || 0)),
      })) : [],
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
    const layout = document.querySelector(".matchday-layout");
    layout?.classList.toggle("live-mode", liveMode);
    document.body.classList.toggle("matchday-live-active", liveMode && document.body.dataset.activeView === "matchday");
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
            <h2>${esc(teamItem?.name || "Tým")} vs ${esc(matchday.opponent || "Soupeř")}</h2>
            <p>${fmtFullDate(session.date)}${session.startTime ? ` · ${esc(session.startTime)}` : ""}${session.place ? ` · ${esc(session.place)}` : ""}</p>
          </div>
          <div class="matchday-header-actions">
            <button class="primary" data-live-mode="open" type="button">Spustit zápas</button>
            <button class="secondary" data-open-calendar-session="${session.id}" type="button">Otevřít v kalendáři</button>
          </div>
        </div>
        ${liveDashboard(matchday, teamItem, players)}
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
      return `<button class="pitch-slot ${selectedSlotIndex === index ? "active" : ""}" style="--x:${position.x}%;--y:${position.y}%" data-slot="${index}" type="button">
        <span class="pitch-player">${player ? playerPhoto(player) : (position.gk ? "GK" : "+")}</span>
        <small>${player ? esc(displayPlayerName(player)) : (position.gk ? "brankář" : "volné")}</small>
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
    return `<button class="bench-slot ${selectedBenchIndex === index ? "active" : ""}" data-bench-slot="${index}" type="button">
      <span class="bench-circle">${player ? playerPhoto(player) : "+"}</span>
      <small>${player ? esc(displayPlayerName(player)) : "volné"}</small>
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
    host.querySelectorAll("input[name], select[name]").forEach((inputEl) => {
      inputEl.addEventListener("change", () => {
        matchday[inputEl.name] = ["partsCount", "partMinutes", "warningMinutes"].includes(inputEl.name)
          ? Math.max(1, Number(inputEl.value || 1))
          : inputEl.value;
        if (inputEl.name === "partMinutes" && !matchday.timerRunning) matchday.timerRemaining = Math.max(1, Number(inputEl.value || 1)) * 60;
        if (inputEl.name === "partsCount") matchday.currentPart = Math.min(matchday.currentPart, matchday.partsCount);
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
        selectedSlotIndex = Number(button.dataset.slot);
        selectedBenchIndex = -1;
        renderMatchday();
      });
    });
    host.querySelectorAll("[data-bench-slot]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedBenchIndex = Number(button.dataset.benchSlot);
        selectedSlotIndex = -1;
        renderMatchday();
      });
    });
    host.querySelectorAll("[data-pick-player]").forEach((button) => {
      button.addEventListener("click", () => {
        const playerId = button.dataset.pickPlayer;
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

  function liveDashboard(matchday, teamItem, players) {
    const score = scoreLine(matchday);
    const roster = selectedRoster(matchday, players);
    return `<section class="live-panel">
      <div class="scoreboard">
        <div><small>${esc(teamItem?.name || "My")}</small><strong>${score.own}</strong></div>
        <span>:</span>
        <div><small>${esc(matchday.opponent || "Soupeř")}</small><strong>${score.opponent}</strong></div>
      </div>
      <div class="timer-box">
        <span>Část ${matchday.currentPart}/${matchday.partsCount}</span>
        <strong>${formatClock(currentRemaining(matchday))}</strong>
        <div class="timer-actions">
          <button class="secondary" data-timer="${matchday.timerRunning ? "pause" : "start"}" type="button">${matchday.timerRunning ? "Pauza" : "Start"}</button>
          <button class="secondary" data-timer="reset" type="button">Reset</button>
          <button class="secondary" data-timer="next" type="button">Další část</button>
        </div>
      </div>
      <div class="shot-box">
        <span>Střely</span>
        <strong>${matchday.shots}</strong>
        <div class="timer-actions">
          <button class="secondary" data-shot="-1" type="button">-</button>
          <button class="primary" data-shot="1" type="button">+ střela</button>
        </div>
      </div>
      <div class="goal-box">
        <strong>Gól ${esc(teamItem?.name || "náš tým")}</strong>
        <div class="goal-buttons">
          <button class="mini" data-open-goal-picker type="button" ${roster.length ? "" : "disabled"}>Vybrat střelkyni</button>
        </div>
        <button class="danger subtle-danger" data-goal-side="opponent" type="button">Gól ${esc(matchday.opponent || "soupeř")}</button>
      </div>
      <div class="goal-log">
        <strong>Průběh utkání</strong>
        ${matchday.goals.length ? [...matchday.goals].reverse().map((goal) => goalLogItem(goal, matchday, players, teamItem)).join("") : `<div class="muted">Zatím bez gólů.</div>`}
      </div>
    </section>`;
  }

  function liveMatchScreen(session, matchday, teamItem, players, positions) {
    const score = scoreLine(matchday);
    const roster = selectedRoster(matchday, players);
    const fieldCount = matchday.fieldPlayerIds.filter(Boolean).length;
    const benchCount = matchday.benchPlayerIds.filter(Boolean).length;
    return `<div class="match-live-screen">
      <div class="match-live-top">
        <button class="secondary live-back" data-live-mode="close" type="button">← Příprava</button>
        <div class="live-score-card">
          <small>${esc(teamItem?.name || "My")}</small>
          <strong>${score.own}</strong>
        </div>
        <span class="live-score-separator">:</span>
        <div class="live-score-card">
          <small>${esc(matchday.opponent || "Soupeř")}</small>
          <strong>${score.opponent}</strong>
        </div>
        <button class="primary live-goal-button" data-open-goal-picker type="button" ${roster.length ? "" : "disabled"}>Gól ${esc(teamItem?.name || "tým")}</button>
        <button class="secondary live-goal-button" data-goal-side="opponent" type="button">Gól ${esc(matchday.opponent || "soupeř")}</button>
      </div>

      <div class="match-live-clock">
        <div>
          <span>Část ${matchday.currentPart}/${matchday.partsCount}</span>
          <strong>${formatClock(currentRemaining(matchday))}</strong>
        </div>
        <div class="live-clock-actions">
          <button class="primary" data-timer="${matchday.timerRunning ? "pause" : "start"}" type="button">${matchday.timerRunning ? "Pauza" : "Start"}</button>
          <button class="secondary" data-timer="reset" type="button">Reset části</button>
          <button class="secondary" data-timer="next" type="button">Další část</button>
        </div>
        <div class="live-shot-control">
          <button class="secondary" data-shot="-1" type="button">−</button>
          <strong>${matchday.shots}</strong>
          <span>střel</span>
          <button class="primary" data-shot="1" type="button">+</button>
        </div>
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
            ${matchday.goals.length ? [...matchday.goals].reverse().map((goal) => goalLogItem(goal, matchday, players, teamItem)).join("") : `<div class="muted">Zatím bez gólů.</div>`}
          </div>
        </section>
      </div>
      ${goalPickerOpen ? goalPicker(matchday, teamItem, players) : ""}
    </div>`;
  }

  function goalPicker(matchday, teamItem, players) {
    const roster = selectedRoster(matchday, players);
    return `<div class="goal-picker-backdrop">
      <section class="goal-picker-modal">
        <div class="chooser-title"><strong>Kdo dal gól ${esc(teamItem?.name || "náš tým")}?</strong><button data-close-goal-picker type="button">×</button></div>
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
    matchday.goals.push({ id: uid("goal"), side, playerId, ownGoal, part: matchday.currentPart, second: elapsed });
    goalPickerOpen = false;
    save();
    renderMatchday();
  }

  function goalLogItem(goal, matchday, players, teamItem) {
    const player = players.find((item) => item.id === goal.playerId);
    const label = goal.side === "opponent"
      ? `Gól ${matchday.opponent || "soupeř"}`
      : goal.ownGoal ? `Vlastní gól soupeře` : `Gól ${displayPlayerName(player || {})}`;
    return `<div class="goal-log-row">
      <span>${goal.part}. část · ${formatClock(goal.second)} · ${esc(label)}</span>
      <button data-remove-goal="${goal.id}" type="button">×</button>
    </div>`;
  }

  function scoreLine(matchday) {
    return matchday.goals.reduce((score, goal) => {
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
      startTicker();
    }
    if (action === "pause") {
      matchday.timerRunning = false;
      matchday.timerStartedAt = 0;
    }
    if (action === "reset") {
      matchday.timerRunning = false;
      matchday.timerStartedAt = 0;
      matchday.timerRemaining = matchday.partMinutes * 60;
    }
    if (action === "next") {
      matchday.timerRunning = false;
      matchday.timerStartedAt = 0;
      matchday.currentPart = Math.min(matchday.partsCount, matchday.currentPart + 1);
      matchday.timerRemaining = matchday.partMinutes * 60;
    }
    save();
    renderMatchday();
  }

  function syncTimer(matchday) {
    if (!matchday.timerRunning) return;
    const elapsed = Math.floor((Date.now() - matchday.timerStartedAt) / 1000);
    matchday.timerRemaining = Math.max(0, matchday.timerRemaining - elapsed);
    matchday.timerStartedAt = Date.now();
    if (matchday.timerRemaining <= 0) {
      matchday.timerRunning = false;
      matchday.timerStartedAt = 0;
      save();
    }
  }

  function currentRemaining(matchday) {
    if (!matchday.timerRunning) return Math.max(0, Number(matchday.timerRemaining || 0));
    const elapsed = Math.floor((Date.now() - matchday.timerStartedAt) / 1000);
    return Math.max(0, Number(matchday.timerRemaining || 0) - elapsed);
  }

  function startTicker() {
    if (matchdayTicker) return;
    matchdayTicker = window.setInterval(() => {
      const session = sessionById(selectedMatchSessionId);
      const matchday = state.matchdays.find((item) => item.sessionId === session?.id);
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
