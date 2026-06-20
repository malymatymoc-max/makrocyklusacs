function fulfillmentGoalIds(scope) {
  return scope === "season" ? state.goals.map((goal) => goal.id) : periodById(scope)?.goalIds || [];
}

function renderFulfillment() {
  const scope = els.scope.value || "season";
  const goalIds = fulfillmentGoalIds(scope);
  const detailIds = [...new Set(goalIds.flatMap((id) => goalById(id)?.detailIds || []))];
  const cards = [
    ...goalIds.map((id) => circleCard(goalById(id)?.name || "", completion("goal", id), "Cíl TJ")),
    ...detailIds.map((id) => circleCard(detailById(id)?.name || "", completion("detail", id), "Detail")),
  ];
  els.fulfillment.innerHTML = cards.length ? cards.join("") : `<div class="muted">Zatím nejsou vytvořené cíle ani navázané detaily.</div>`;
}

function progress() {
  const goalIds = new Set(state.goals.map((goal) => goal.id));
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
  renderStats();
  renderFulfillment();
} catch {}
