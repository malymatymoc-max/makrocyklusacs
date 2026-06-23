const PHASES = ["ÚF na OP", "ÚF na ÚP", "OF na ÚP", "OF na OP"];

function migratePhaseModel(nextState = state) {
  const next = typeof migrateGlobalSeasons === "function"
    ? migrateGlobalSeasons(nextState)
    : { ...blank(), ...(nextState && typeof nextState === "object" ? nextState : {}) };
  next.selectedPeriodId = "all";
  next.goals = (next.goals || []).map((goal) => {
    const phaseIds = new Set(split(goal.phaseIds));
    (next.periods || []).forEach((period) => {
      if ((period.goalIds || []).includes(goal.id) && period.phase) phaseIds.add(period.phase);
    });
    return { ...goal, phaseIds: [...phaseIds] };
  });
  next.periods = (next.periods || []).map((period) => ({
    ...period,
    name: period.phase || period.name || "Období",
    goalIds: [],
  }));
  next.sessions = (next.sessions || []).map((session) => ["Utkání", "Turnaj"].includes(session.type)
    ? {
      ...session,
      mainGoalId: "",
      extraGoalIds: [],
      detailIds: [],
      goalRatings: {},
      detailRatings: {},
      performanceRating: Math.max(0, Number(session.performanceRating || 0)),
    }
    : { ...session, performanceRating: Math.max(0, Number(session.performanceRating || 0)) });
  return next;
}

function normalizeState(nextState) {
  return migratePhaseModel(nextState);
}

function renderSelectors() {
  state = migratePhaseModel(state);
  els.team.innerHTML = `<option value="">Vyber tým</option>${state.teams.map(option).join("")}`;
  els.team.value = state.selectedTeamId;
  els.season.innerHTML = `<option value="">Vyber sezonu</option>${seasons().map(option).join("")}`;
  els.season.value = state.selectedSeasonId;
  if (els.period) {
    els.period.innerHTML = `<option value="all">Všechna období</option>`;
    els.period.value = "all";
  }
  const teamName = team()?.name || "bez týmu";
  const seasonName = season()?.name || "bez sezony";
  els.contextLine.textContent = `${teamName} · ${seasonName}`;
}

function renderSetup() {
  renderSetupTable("teams", "Týmy", state.teams, ["name"]);
  renderSetupTable("seasons", "Sezony", seasons(), ["name"]);
  renderSetupTable("periods", "Fáze v sezoně", periods(), ["phase", "start", "end"]);
  renderSetupTable("goals", "Cíle TJ", state.goals, ["name", "phaseIds"]);
  renderSetupTable("details", "Detaily TJ", state.details, ["name"]);
}

function renderFulfillmentScope() {
  els.scope.innerHTML = `<option value="season">Celá sezona</option>${periods().map((period) => `<option value="${period.id}">${esc(period.phase || "Bez fáze")} · ${fmt(period.start)}-${fmt(period.end)}</option>`).join("")}`;
  if (!els.scope.value) els.scope.value = "season";
}

function renderFulfillment() {
  const scope = els.scope.value || "season";
  const period = periodById(scope);
  const goalIds = scope === "season"
    ? state.goals.map((goal) => goal.id)
    : state.goals.filter((goal) => split(goal.phaseIds).includes(period?.phase)).map((goal) => goal.id);
  const detailIds = [...new Set(goalIds.flatMap((id) => goalById(id)?.detailIds || []))];
  const matchStats = matchPerformanceStats(scope);
  const cards = [
    ...goalIds.map((id) => circleCard(goalById(id)?.name || "", completion("goal", id), "Cíl TJ")),
    ...detailIds.map((id) => circleCard(detailById(id)?.name || "", completion("detail", id), "Detail")),
    ...(matchStats.count ? [circleCard("Průměr výkonu", matchStats.average * 10, `${matchStats.count} utkání/turnajů`)] : []),
  ];
  els.fulfillment.innerHTML = cards.length ? cards.join("") : `<div class="muted">Zatím nejsou vytvořené cíle pro vybranou fázi.</div>`;
}

function fields(type, item) {
  if (type === "team") return input("name", "Název týmu", item.name);
  if (type === "season") return input("name", "Název sezony", item.name) + input("start", "Začátek", item.start, "date") + input("end", "Konec", item.end, "date");
  if (type === "period") return input("start", "Od", item.start, "date") + input("end", "Do", item.end, "date") + select("phase", "Fáze", PHASES, item.phase);
  if (type === "goal") return input("name", "Název cíle", item.name) + phaseMulti(item.phaseIds || []) + multi("detailIds", "Doporučené detaily k tomuto cíli", state.details, item.detailIds || [], "Zaškrtni detaily, které se mají u tohoto cíle trenérovi nabízet. Detail může být zaškrtnutý u více cílů.");
  if (type === "detail") return input("name", "Název detailu", item.name);
  return "";
}

function phaseMulti(values) {
  return `<fieldset class="check-list"><legend>Fáze, ve kterých se má cíl nabízet</legend>
    ${PHASES.map((phase) => `<label><input type="checkbox" name="phaseIds" value="${phase}" ${values.includes(phase) ? "checked" : ""} /> <span>${phase}</span></label>`).join("")}
  </fieldset>`;
}

function saveDialog() {
  const formData = new FormData(els.dialogForm);
  const data = Object.fromEntries(formData.entries());
  data.goalIds = formData.getAll("goalIds");
  data.detailIds = formData.getAll("detailIds");
  data.phaseIds = formData.getAll("phaseIds");
  const item = normalize(dialog.type, data, dialog.id || uid(dialog.type));
  const list = collection(dialog.type);
  if (dialog.id) Object.assign(list.find((x) => x.id === dialog.id), item);
  else list.push(item);
  if (dialog.type === "team" && !state.selectedTeamId) state.selectedTeamId = item.id;
  if (dialog.type === "season" && !state.selectedSeasonId) state.selectedSeasonId = item.id;
  state = migratePhaseModel(state);
  save();
  els.dialogEl.close();
  render();
}

function normalize(type, data, id) {
  if (type === "team") return { id, name: data.name || "Nový tým" };
  if (type === "season") return { id, name: data.name || "Nová sezona", start: data.start || "", end: data.end || "" };
  if (type === "period") return { id, teamId: state.selectedTeamId, seasonId: state.selectedSeasonId, name: data.phase || "Období", start: data.start || "", end: data.end || "", phase: data.phase || "", goalIds: [] };
  if (type === "goal") return { id, name: data.name || "Nový cíl", phaseIds: split(data.phaseIds), detailIds: split(data.detailIds) };
  if (type === "detail") return { id, name: data.name || "Nový detail" };
  return {};
}

function suggestedGoalsForSession(s) {
  const period = periodById(s.periodId) || periodForDate(s.date);
  return period?.phase ? state.goals.filter((goal) => split(goal.phaseIds).includes(period.phase)) : state.goals;
}

function visibleSessions() {
  return sessions();
}

function label(key) {
  return ({ name: "Název", phase: "Fáze", phaseIds: "Fáze", start: "Od", end: "Do" })[key] || key;
}

function display(row, key) {
  if (key === "start" || key === "end") return fmt(row[key]);
  if (key === "phaseIds") return split(row[key]).join(", ");
  return row[key] || "";
}

try {
  const periodFilter = document.querySelector("#periodSelect")?.closest("label");
  if (periodFilter) periodFilter.remove();
  state = migratePhaseModel(state);
  save();
  render();
} catch {}
