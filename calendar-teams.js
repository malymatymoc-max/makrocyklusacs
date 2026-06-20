function migrateCalendarTeams(nextState = state) {
  const next = { ...blank(), ...(nextState && typeof nextState === "object" ? nextState : {}) };
  const visible = Array.isArray(next.calendarTeamIds) ? next.calendarTeamIds.filter((id) => next.teams.some((team) => team.id === id)) : [];
  next.calendarTeamIds = visible.length ? visible : (next.selectedTeamId ? [next.selectedTeamId] : []);
  return next;
}

const teamScopeNormalizeState = window.normalizeState;
normalizeState = function normalizeCalendarTeamState(nextState) {
  return migrateCalendarTeams(teamScopeNormalizeState(nextState));
};

function visibleTeamIds() {
  const ids = Array.isArray(state.calendarTeamIds) ? state.calendarTeamIds : [];
  return ids.length ? ids : (state.selectedTeamId ? [state.selectedTeamId] : []);
}

function visibleSessions() {
  const teamIds = new Set(visibleTeamIds());
  return state.sessions.filter((session) => teamIds.has(session.teamId) && (!state.selectedSeasonId || session.seasonId === state.selectedSeasonId));
}

function sessionCard(s) {
  const goal = goalById(s.mainGoalId)?.name || "Bez cíle";
  const teamName = state.teams.find((team) => team.id === s.teamId)?.name || "Tým";
  const klass = ["Utkání", "Turnaj"].includes(s.type) ? "match" : "";
  return `<button class="event ${klass} ${s.id === selectedSessionId ? "active" : ""}" data-session="${s.id}" type="button">
    <strong>${esc(s.startTime || "")} ${esc(s.type)}</strong>
    <span>${esc(teamName)} · ${esc(goal)}</span>
    <span>${esc(s.place || "Bez místa")}</span>
  </button>`;
}

function renderCalendarTeamFilter() {
  const host = document.querySelector("#calendarTeamFilter");
  if (!host) return;
  const selected = new Set(visibleTeamIds());
  host.innerHTML = state.teams.length ? state.teams.map((team) => `
    <label class="team-filter-item">
      <input type="checkbox" value="${team.id}" ${selected.has(team.id) ? "checked" : ""} />
      <span>${esc(team.name)}</span>
    </label>
  `).join("") : `<div class="muted">Nejdřív vytvoř tým.</div>`;
  host.querySelectorAll("input").forEach((input) => input.addEventListener("change", () => {
    const checked = [...host.querySelectorAll("input:checked")].map((item) => item.value);
    state.calendarTeamIds = checked.length ? checked : [state.selectedTeamId].filter(Boolean);
    save();
    renderCalendar();
    renderMonth();
  }));
}

function openCalendarSession(id) {
  const session = sessionById(id);
  if (!session) return;
  if (session.teamId !== state.selectedTeamId) {
    state.selectedTeamId = session.teamId;
    state.selectedSeasonId = session.seasonId;
    state.selectedPeriodId = "all";
    if (!visibleTeamIds().includes(session.teamId)) state.calendarTeamIds = [...visibleTeamIds(), session.teamId];
  }
  selectedSessionId = id;
  save();
  render();
  openSessionDialog();
}

function renderCalendar() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  els.weekTitle.textContent = `${long(days[0])} - ${long(days[6])}`;
  els.grid.innerHTML = days
    .map((day) => {
      const key = dateKey(day);
      const daySessions = visibleSessions().filter((s) => s.date === key);
      return `<article class="day" data-date="${key}" title="Dvojklikem vytvoříš novou událost">
        <div class="day-head">${weekday(day)}<span>${long(day)}</span></div>
        <div class="day-events">${daySessions.length ? daySessions.map(sessionCard).join("") : `<div class="empty-day">Bez události<span>Dvojklik pro přidání</span></div>`}</div>
      </article>`;
    })
    .join("");
  $$(".day").forEach((day) => day.addEventListener("dblclick", (event) => {
    if (event.target.closest("[data-session]")) return;
    openNewSessionDialog(day.dataset.date);
  }));
  $$("[data-session]").forEach((btn) => btn.addEventListener("click", () => openCalendarSession(btn.dataset.session)));
}

const calendarTeamsRenderSelectors = window.renderSelectors;
renderSelectors = function renderCalendarTeamSelectors() {
  calendarTeamsRenderSelectors();
  state = migrateCalendarTeams(state);
  if (!visibleTeamIds().includes(state.selectedTeamId) && state.selectedTeamId) {
    state.calendarTeamIds = [...visibleTeamIds(), state.selectedTeamId];
  }
  renderCalendarTeamFilter();
};

try {
  state = migrateCalendarTeams(state);
  save();
  render();
} catch {}
