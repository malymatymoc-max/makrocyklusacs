function migrateCalendarTeams(nextState = state) {
  const next = typeof migrateGlobalSeasons === "function"
    ? migrateGlobalSeasons(nextState)
    : { ...blank(), ...(nextState && typeof nextState === "object" ? nextState : {}) };
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
  return state.sessions.filter((session) => teamIds.has(session.teamId));
}

function sessionCard(s) {
  const teamName = state.teams.find((team) => team.id === s.teamId)?.name || "Tým";
  const klass = ["Utkání", "Turnaj"].includes(s.type) ? "match" : "";
  return `<button class="event ${klass} ${s.id === selectedSessionId ? "active" : ""}" data-session="${s.id}" title="${esc(teamName)}" type="button">
    <strong>${esc(sessionCalendarTitle(s))}</strong>
  </button>`;
}

function seasonOptionsForTeam() {
  return state.seasons;
}

function selectedSeasonForTeam() {
  const current = state.seasons.find((season) => season.id === state.selectedSeasonId);
  return current?.id || seasonOptionsForTeam()[0]?.id || "";
}

function renderHeaderTeamPicker() {
  const host = document.querySelector("#teamMultiSelect");
  if (!host) return;
  const selected = new Set(visibleTeamIds());
  host.innerHTML = state.teams.length ? state.teams.map((team) => `
    <label class="team-pill ${team.id === state.selectedTeamId ? "active" : ""}">
      <input type="checkbox" value="${team.id}" ${selected.has(team.id) ? "checked" : ""} />
      <span>${esc(team.name)}</span>
    </label>
  `).join("") : `<div class="muted">Nejdřív vytvoř tým.</div>`;
  host.querySelectorAll("input").forEach((input) => input.addEventListener("change", () => {
    const checked = [...host.querySelectorAll("input:checked")].map((item) => item.value);
    state.calendarTeamIds = checked.length ? checked : [state.selectedTeamId].filter(Boolean);
    if (!state.calendarTeamIds.includes(state.selectedTeamId)) {
      state.selectedTeamId = state.calendarTeamIds[0] || state.teams[0]?.id || "";
      state.selectedPeriodId = "all";
    }
    if (input.checked) {
      state.selectedTeamId = input.value;
      state.selectedPeriodId = "all";
    }
    save();
    render();
  }));
}

function applyTeamPickerMode(view = "calendar") {
  document.body.dataset.activeView = view;
}

const calendarTeamsShowView = window.showView;
showView = function showViewWithTeamPickerMode(view) {
  calendarTeamsShowView(view);
  applyTeamPickerMode(view);
  if (view === "calendar") renderHeaderTeamPicker();
};

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
      const daySessions = visibleSessions().filter((s) => sessionOccursOn(s, key));
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
  renderHeaderTeamPicker();
};

function fillNewSessionSeasons() {
  const seasonSelect = els.newSessionForm.elements.seasonId;
  const options = seasonOptionsForTeam();
  seasonSelect.innerHTML = options.length ? options.map(option).join("") : `<option value="">Nejdřív vytvoř sezonu</option>`;
  seasonSelect.value = selectedSeasonForTeam();
}

function openNewSessionDialog(date) {
  if (!state.teams.length) {
    showView("setup");
    openDialog("team");
    return;
  }
  els.newSessionForm.reset();
  const teamSelect = els.newSessionForm.elements.teamId;
  teamSelect.innerHTML = state.teams.map(option).join("");
  teamSelect.value = state.selectedTeamId || visibleTeamIds()[0] || state.teams[0]?.id || "";
  fillNewSessionSeasons();
  teamSelect.onchange = () => fillNewSessionSeasons();
  els.newSessionForm.elements.date.value = date;
  els.newSessionForm.elements.type.innerHTML = TYPES.map((type) => `<option>${type}</option>`).join("");
  els.newSessionForm.elements.type.value = "TJ";
  els.newSessionForm.elements.repeatUntil.value = state.seasons.find((season) => season.id === els.newSessionForm.elements.seasonId.value)?.end || date;
  els.newSessionForm.elements.seasonId.onchange = () => {
    els.newSessionForm.elements.repeatUntil.value = state.seasons.find((season) => season.id === els.newSessionForm.elements.seasonId.value)?.end || date;
  };
  els.newSessionEl.showModal();
}

function periodForTeamDate(teamId, seasonId, date) {
  return state.periods.find((period) => period.teamId === teamId && period.seasonId === seasonId && date >= period.start && date <= period.end);
}

function makeSessionForTeam(data) {
  return {
    id: uid("session"),
    teamId: data.teamId,
    seasonId: data.seasonId,
    date: data.date,
    endDate: data.endDate || "",
    type: data.type || "TJ",
    startTime: data.startTime || "",
    endTime: data.endTime || "",
    place: data.place || "",
    coach: data.coach || "",
    note: data.note || "",
    periodId: periodForTeamDate(data.teamId, data.seasonId, data.date)?.id || "",
    mainGoalId: "",
    extraGoalIds: [],
    detailIds: [],
    goalRatings: {},
    detailRatings: {},
    repeatGroupId: data.repeatGroupId || "",
  };
}

function saveNewSessionDialog() {
  const formData = new FormData(els.newSessionForm);
  const data = Object.fromEntries(formData.entries());
  if (!data.teamId || !data.seasonId) return;
  const dates = repeatDates(data.date, formData.has("repeat") ? data.repeatUntil : "");
  const repeatGroupId = dates.length > 1 ? uid("repeat") : "";
  let firstId = "";
  dates.forEach((date) => {
    const session = makeSessionForTeam({
      teamId: data.teamId,
      seasonId: data.seasonId,
      date,
      type: data.type || "TJ",
      startTime: data.startTime || "",
      endTime: data.endTime || "",
      place: data.place || "",
      coach: data.coach || "",
      note: data.note || "",
      repeatGroupId,
    });
    state.sessions.push(session);
    firstId ||= session.id;
  });
  state.selectedTeamId = data.teamId;
  state.selectedSeasonId = data.seasonId;
  state.selectedPeriodId = "all";
  state.calendarTeamIds = [...new Set([...visibleTeamIds(), data.teamId])];
  selectedSessionId = firstId || "";
  if (data.date) {
    weekStart = monday(new Date(`${data.date}T12:00:00`));
    monthCursor = firstOfMonth(new Date(`${data.date}T12:00:00`));
  }
  save();
  els.newSessionEl.close();
  showView("calendar");
  render();
  if (selectedSessionId) openSessionDialog();
}

try {
  state = migrateCalendarTeams(state);
  applyTeamPickerMode("calendar");
  save();
  render();
} catch {}
