(function () {
  const DEFAULT_TEAM_COLORS = ["#007a3d", "#1f6feb", "#8b5cf6", "#d28a16", "#cc3d3d", "#0891b2", "#7c3aed", "#16a34a"];

  function colorForIndex(index) {
    return DEFAULT_TEAM_COLORS[Math.max(0, index) % DEFAULT_TEAM_COLORS.length];
  }

  function cleanColor(value, fallback = DEFAULT_TEAM_COLORS[0]) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
  }

  function teamColor(teamId) {
    if (teamId === "xps_unassigned") return "#8a9490";
    const index = state.teams.findIndex((team) => team.id === teamId);
    return cleanColor(state.teams[index]?.color, colorForIndex(Math.max(0, index)));
  }

  function migrateTeamColors(nextState = state) {
    const next = { ...blank(), ...(nextState && typeof nextState === "object" ? nextState : {}) };
    next.teams = (next.teams || []).map((team, index) => ({ ...team, color: cleanColor(team.color, colorForIndex(index)) }));
    return next;
  }

  const colorNormalizeState = window.normalizeState;
  normalizeState = function normalizeTeamColorState(nextState) {
    return migrateTeamColors(colorNormalizeState(nextState));
  };

  const colorFields = window.fields;
  fields = function fieldsWithTeamColor(type, item) {
    if (type === "team") {
      const fallback = colorForIndex(state.teams.findIndex((team) => team.id === item.id));
      return input("name", "Název týmu", item.name) + input("color", "Barva týmu", cleanColor(item.color, fallback), "color");
    }
    return colorFields(type, item);
  };

  const colorNormalize = window.normalize;
  normalize = function normalizeWithTeamColor(type, data, id) {
    if (type === "team") {
      const fallback = colorForIndex(state.teams.findIndex((team) => team.id === id));
      return { id, name: data.name || "Nový tým", color: cleanColor(data.color, fallback) };
    }
    return colorNormalize(type, data, id);
  };

  const colorDisplay = window.display;
  display = function displayWithTeamColor(row, key) {
    if (key === "color") return cleanColor(row.color);
    return colorDisplay(row, key);
  };

  const colorDisplayCell = window.displayCell;
  displayCell = function displayCellWithTeamColor(row, key) {
    if (key === "color") {
      const value = cleanColor(row.color);
      return `<span class="team-color-preview"><i style="background:${esc(value)}"></i><span>Barva týmu</span></span>`;
    }
    return colorDisplayCell(row, key);
  };

  const colorLabel = window.label;
  label = function labelWithTeamColor(key) {
    if (key === "color") return "Barva";
    return colorLabel(key);
  };

  renderSetup = function renderSetupWithTeamColors() {
    state = migrateTeamColors(state);
    renderSetupTable("teams", "Týmy", state.teams, ["name", "color"]);
    renderSetupTable("seasons", "Sezony", seasons(), ["name"]);
    renderSetupTable("periods", "Fáze v sezoně", periods(), ["phase", "start", "end"]);
    renderSetupTable("goals", "Cíle TJ", teamGoals(), ["name", "phaseIds", "requiredSessions"]);
    renderSetupTable("details", "Detaily TJ", teamDetails(), ["name", "requiredSessions"]);
  };

  const colorSessionCard = window.sessionCard;
  sessionCard = function sessionCardWithTeamColor(session) {
    return colorSessionCard(session).replace(
      '<button class="event',
      `<button style="--team-color:${esc(teamColor(session.teamId))}" class="event`
    );
  };

  renderMonth = function renderMonthWithTeamDots() {
    const start = firstOfMonth(monthCursor);
    const firstGridDay = monday(start);
    const month = start.getMonth();
    els.monthTitle.textContent = new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric" }).format(start);
    els.monthGrid.innerHTML = Array.from({ length: 42 }, (_, index) => {
      const day = addDays(firstGridDay, index);
      const key = dateKey(day);
      const daySessions = visibleSessions().filter((session) => sessionOccursOn(session, key));
      const teamIds = [...new Set(daySessions.map((session) => session.teamId))];
      const isOutside = day.getMonth() !== month;
      const isSelectedWeek = key >= dateKey(weekStart) && key <= dateKey(addDays(weekStart, 6));
      const dots = teamIds.slice(0, 4).map((teamId) => `<i style="background:${esc(teamColor(teamId))}"></i>`).join("");
      return `<button class="month-day ${isOutside ? "outside" : ""} ${isSelectedWeek ? "week-mark" : ""}" data-month-date="${key}" type="button">
        <span>${day.getDate()}</span>${dots ? `<b class="month-team-dots">${dots}</b>` : ""}
      </button>`;
    }).join("");
    $$("[data-month-date]").forEach((btn) => {
      btn.addEventListener("click", () => {
        weekStart = monday(new Date(`${btn.dataset.monthDate}T12:00:00`));
        monthCursor = firstOfMonth(new Date(`${btn.dataset.monthDate}T12:00:00`));
        render();
      });
      btn.addEventListener("dblclick", () => openNewSessionDialog(btn.dataset.monthDate));
    });
  };

  try {
    state = migrateTeamColors(state);
    render();
  } catch {}
})();
