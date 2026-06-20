function migrateTeamScopedLibrary(nextState = state) {
  const next = { ...blank(), ...(nextState && typeof nextState === "object" ? nextState : {}) };
  const fallbackTeamId = next.selectedTeamId || next.teams?.[0]?.id || "";
  next.goals = (next.goals || []).map((goal) => ({ ...goal, teamId: goal.teamId || fallbackTeamId }));
  next.details = (next.details || []).map((detail) => ({ ...detail, teamId: detail.teamId || fallbackTeamId }));
  return next;
}

const phaseNormalizeState = normalizeState;
function normalizeState(nextState) {
  return migrateTeamScopedLibrary(phaseNormalizeState(nextState));
}

function teamGoals() {
  return state.goals.filter((goal) => goal.teamId === state.selectedTeamId);
}

function teamDetails() {
  return state.details.filter((detail) => detail.teamId === state.selectedTeamId);
}

function renderGoalSelect(s) {
  const suggested = suggestedGoalsForSession(s);
  const other = teamGoals().filter((goal) => !suggested.some((item) => item.id === goal.id));
  els.mainGoal.innerHTML = `<option value="">Vyber hlavní cíl</option>
    ${suggested.length ? `<optgroup label="Doporučené">${suggested.map(option).join("")}</optgroup>` : ""}
    ${other.length ? `<optgroup label="Ostatní">${other.map(option).join("")}</optgroup>` : ""}`;
  els.mainGoal.value = s.mainGoalId || "";
}

function renderExtraGoals(s) {
  els.extraGoals.innerHTML = teamGoals().length ? teamGoals()
    .filter((goal) => goal.id !== s.mainGoalId)
    .map((goal) => chip(goal, s.extraGoalIds.includes(goal.id), "extra-goal"))
    .join("") : `<div class="muted">Nejdřív vytvoř cíle pro tento tým.</div>`;
  $$("[data-extra-goal]").forEach((btn) => btn.addEventListener("click", () => toggleSessionArray("extraGoalIds", btn.dataset.extraGoal)));
}

function renderDetails(s) {
  const suggested = suggestedDetailsForSession(s);
  const other = teamDetails().filter((detail) => !suggested.some((item) => item.id === detail.id));
  const html = [
    suggested.length ? `<div class="muted">Doporučené podle cíle</div>${suggested.map((detail) => chip(detail, s.detailIds.includes(detail.id), "detail")).join("")}` : "",
    other.length ? `<div class="muted">Další z knihovny týmu</div>${other.map((detail) => chip(detail, s.detailIds.includes(detail.id), "detail")).join("")}` : "",
  ].join("");
  els.details.innerHTML = html || `<div class="muted">Nejdřív vytvoř detaily pro tento tým.</div>`;
  $$("[data-detail]").forEach((btn) => btn.addEventListener("click", () => toggleSessionArray("detailIds", btn.dataset.detail)));
}

function renderSetup() {
  state = migrateTeamScopedLibrary(state);
  renderSetupTable("teams", "Týmy", state.teams, ["name"]);
  renderSetupTable("seasons", "Sezony", seasons(), ["name"]);
  renderSetupTable("periods", "Fáze v sezoně", periods(), ["phase", "start", "end"]);
  renderSetupTable("goals", "Cíle TJ", teamGoals(), ["name", "phaseIds"]);
  renderSetupTable("details", "Detaily TJ", teamDetails(), ["name"]);
}

function fields(type, item) {
  if (type === "team") return input("name", "Název týmu", item.name);
  if (type === "season") return input("name", "Název sezony", item.name) + input("start", "Začátek", item.start, "date") + input("end", "Konec", item.end, "date");
  if (type === "period") return input("start", "Od", item.start, "date") + input("end", "Do", item.end, "date") + select("phase", "Fáze", PHASES, item.phase);
  if (type === "goal") return input("name", "Název cíle", item.name) + phaseMulti(item.phaseIds || []) + multi("detailIds", "Doporučené detaily k tomuto cíli", teamDetails(), item.detailIds || [], "Zaškrtni detaily, které se mají u tohoto cíle trenérovi nabízet.");
  if (type === "detail") return input("name", "Název detailu", item.name);
  return "";
}

function normalize(type, data, id) {
  if (type === "team") return { id, name: data.name || "Nový tým" };
  if (type === "season") return { id, teamId: state.selectedTeamId, name: data.name || "Nová sezona", start: data.start || "", end: data.end || "" };
  if (type === "period") return { id, teamId: state.selectedTeamId, seasonId: state.selectedSeasonId, name: data.phase || "Období", start: data.start || "", end: data.end || "", phase: data.phase || "", goalIds: [] };
  if (type === "goal") return { id, teamId: state.selectedTeamId, name: data.name || "Nový cíl", phaseIds: split(data.phaseIds), detailIds: split(data.detailIds) };
  if (type === "detail") return { id, teamId: state.selectedTeamId, name: data.name || "Nový detail" };
  return {};
}

function suggestedGoalsForSession(s) {
  const period = periodById(s.periodId) || periodForDate(s.date);
  return period?.phase ? teamGoals().filter((goal) => split(goal.phaseIds).includes(period.phase)) : teamGoals();
}

function suggestedDetailsForSession(s) {
  const goalIds = [s.mainGoalId, ...s.extraGoalIds].filter(Boolean);
  const ids = new Set(goalIds.flatMap((id) => goalById(id)?.detailIds || []));
  return teamDetails().filter((detail) => ids.has(detail.id));
}

function renderFulfillment() {
  const scope = els.scope.value || "season";
  const period = periodById(scope);
  const goalIds = scope === "season"
    ? teamGoals().map((goal) => goal.id)
    : teamGoals().filter((goal) => split(goal.phaseIds).includes(period?.phase)).map((goal) => goal.id);
  const detailIds = [...new Set(goalIds.flatMap((id) => goalById(id)?.detailIds || []))];
  const cards = [
    ...goalIds.map((id) => circleCard(goalById(id)?.name || "", completion("goal", id), "Cíl TJ")),
    ...detailIds.map((id) => circleCard(detailById(id)?.name || "", completion("detail", id), "Detail")),
  ];
  els.fulfillment.innerHTML = cards.length ? cards.join("") : `<div class="muted">Zatím nejsou vytvořené cíle pro vybraný tým.</div>`;
}

function progress() {
  const goalIds = new Set(teamGoals().map((goal) => goal.id));
  const detailIds = new Set([...goalIds].flatMap((id) => goalById(id)?.detailIds || []));
  return {
    totalGoals: goalIds.size,
    doneGoals: [...goalIds].filter((id) => completion("goal", id) >= 99.9).length,
    totalDetails: detailIds.size,
    doneDetails: [...detailIds].filter((id) => completion("detail", id) >= 99.9).length,
    periodsWithTraining: periods().filter((period) => sessions().some((session) => session.date >= period.start && session.date <= period.end)).length,
  };
}

try {
  state = migrateTeamScopedLibrary(state);
  save();
  render();
} catch {}
