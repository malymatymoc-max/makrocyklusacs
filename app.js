const STORAGE_KEY = "makrocyklus-mvp-v1";
const AUTH_KEY = "coach-acs-auth-v1";
const AUTH_HASH = "79f981ce9f204697408b9b441fc00567731d7dd824003915b22bfff85cd6815e";
const TYPES = ["TJ", "Skupinový TJ", "Pohybový TJ", "Utkání", "Turnaj", "Jiná událost", "Volno"];
const SYNC_URL = "/api/state";
const SUPABASE_STATE_ID = "main";
const SUPABASE_URL = window.MAKROCYCLE_SUPABASE_URL || "";
const SUPABASE_KEY = window.MAKROCYCLE_SUPABASE_KEY || "";

const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let state = load();
let weekStart = monday(new Date());
let monthCursor = firstOfMonth(new Date());
let selectedSessionId = "";
let dialog = { type: "", id: "" };
let remoteUpdatedAt = 0;
let remoteEnabled = false;
let applyingRemote = false;
let saveTimer = 0;
let syncProvider = "local";
let appStarted = false;

const els = {
  team: $("#teamSelect"),
  season: $("#seasonSelect"),
  period: $("#periodSelect"),
  weekTitle: $("#weekTitle"),
  monthTitle: $("#monthTitle"),
  contextLine: $("#contextLine"),
  grid: $("#calendarGrid"),
  monthGrid: $("#monthGrid"),
  form: $("#sessionForm"),
  hint: $("#editorHint"),
  mainGoal: $("#mainGoalSelect"),
  extraGoals: $("#extraGoalChips"),
  details: $("#detailChips"),
  ratings: $("#ratings"),
  sessionTitle: $("#sessionDialogTitle"),
  ratingTitle: $("#ratingBlockTitle"),
  stats: $("#progressStrip"),
  syncStatus: $("#syncStatus"),
  scope: $("#fulfillmentScope"),
  fulfillment: $("#fulfillmentGrid"),
  dialogEl: $("#dialog"),
  dialogForm: $("#dialogForm"),
  dialogTitle: $("#dialogTitle"),
  dialogBody: $("#dialogBody"),
  dialogDelete: $("#dialogDelete"),
  newSessionEl: $("#newSessionDialog"),
  newSessionForm: $("#newSessionForm"),
  sessionEl: $("#sessionDialog"),
  deleteSeries: $("#deleteSeries"),
  authForm: $("#authForm"),
  authPassword: $("#authPassword"),
  authError: $("#authError"),
  logoutDevice: $("#logoutDevice"),
};

init();

function init() {
  bind();
  bindAuth();
  if (isAuthorizedDevice()) unlockApp();
  else lockApp();
}

function bindAuth() {
  els.authForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (els.authError) els.authError.textContent = "";
    const password = els.authPassword?.value || "";
    if (!window.crypto?.subtle) {
      if (els.authError) els.authError.textContent = "Pro ověření je potřeba otevřít aplikaci přes zabezpečenou adresu https.";
      return;
    }
    const hash = await sha256(password);
    if (hash !== AUTH_HASH) {
      if (els.authError) els.authError.textContent = "Heslo nesedí. Zkus ho prosím znovu.";
      els.authPassword?.select();
      return;
    }
    localStorage.setItem(AUTH_KEY, AUTH_HASH);
    if (els.authPassword) els.authPassword.value = "";
    unlockApp();
  });

  els.logoutDevice?.addEventListener("click", () => {
    localStorage.removeItem(AUTH_KEY);
    window.location.reload();
  });
}

function isAuthorizedDevice() {
  return localStorage.getItem(AUTH_KEY) === AUTH_HASH;
}

function lockApp() {
  window.COACH_ACS_UNLOCKED = false;
  document.body.classList.add("auth-locked");
  window.setTimeout(() => els.authPassword?.focus(), 50);
}

function unlockApp() {
  window.COACH_ACS_UNLOCKED = true;
  document.body.classList.remove("auth-locked");
  if (appStarted) return;
  appStarted = true;
  render();
  startSync();
  registerServiceWorker();
  window.dispatchEvent(new CustomEvent("coach-acs-unlocked"));
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bind() {
  $$(".nav-btn").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));
  $("#prevWeek").addEventListener("click", () => {
    weekStart = addDays(weekStart, -7);
    monthCursor = firstOfMonth(weekStart);
    render();
  });
  $("#nextWeek").addEventListener("click", () => {
    weekStart = addDays(weekStart, 7);
    monthCursor = firstOfMonth(weekStart);
    render();
  });
  $("#todayBtn").addEventListener("click", () => {
    weekStart = monday(new Date());
    monthCursor = firstOfMonth(new Date());
    render();
  });
  $("#prevMonth").addEventListener("click", () => {
    monthCursor = addMonths(monthCursor, -1);
    renderMonth();
  });
  $("#nextMonth").addEventListener("click", () => {
    monthCursor = addMonths(monthCursor, 1);
    renderMonth();
  });
  $("#newSession").addEventListener("click", () => openNewSessionDialog(dateKey(new Date())));
  $("#quickSession").addEventListener("click", () => openNewSessionDialog(dateKey(new Date())));
  $("#deleteSession").addEventListener("click", deleteSelectedSession);
  els.deleteSeries.addEventListener("click", deleteSelectedSeries);
  els.team.addEventListener("change", () => {
    state.selectedTeamId = els.team.value;
    state.selectedPeriodId = "all";
    selectedSessionId = "";
    save();
    render();
  });
  els.season.addEventListener("change", () => {
    state.selectedSeasonId = els.season.value;
    state.selectedPeriodId = "all";
    selectedSessionId = "";
    save();
    render();
  });
  els.period.addEventListener("change", () => {
    state.selectedPeriodId = els.period.value;
    save();
    render();
  });
  els.scope.addEventListener("change", () => renderFulfillment());
  els.form.addEventListener("input", updateSession);
  els.mainGoal.addEventListener("change", updateMainGoal);
  $("[data-create='goal']").addEventListener("click", () => openEntityFromSession("goal"));
  $("[data-create='detail']").addEventListener("click", () => openEntityFromSession("detail"));
  els.newSessionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveNewSessionDialog();
  });
  $("#newSessionClose").addEventListener("click", () => els.newSessionEl.close());
  $("#newSessionCancel").addEventListener("click", () => els.newSessionEl.close());
  $("#sessionClose").addEventListener("click", () => els.sessionEl.close());
  $("#sessionDone").addEventListener("click", () => els.sessionEl.close());
  els.dialogForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveDialog();
  });
  $("#dialogSave").addEventListener("click", saveDialog);
  $("#dialogClose").addEventListener("click", () => els.dialogEl.close());
  $("#dialogCancel").addEventListener("click", () => els.dialogEl.close());
  els.dialogDelete.addEventListener("click", deleteDialogEntity);
}

function render() {
  ensureSelection();
  renderSelectors();
  renderCalendar();
  renderMonth();
  renderEditor();
  renderStats();
  renderFulfillmentScope();
  renderFulfillment();
  renderSetup();
}

function renderSelectors() {
  els.team.innerHTML = `<option value="">Vyber tým</option>${state.teams.map(option).join("")}`;
  els.team.value = state.selectedTeamId;
  els.season.innerHTML = `<option value="">Vyber sezonu</option>${seasons().map(option).join("")}`;
  els.season.value = state.selectedSeasonId;
  els.period.innerHTML = `<option value="all">Všechna období</option>${periods().map((p) => `<option value="${p.id}">${esc(p.name)} · ${fmt(p.start)}-${fmt(p.end)}</option>`).join("")}`;
  els.period.value = state.selectedPeriodId || "all";
  const teamName = team()?.name || "bez týmu";
  const seasonName = season()?.name || "bez sezony";
  els.contextLine.textContent = `${teamName} · ${seasonName}`;
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
  $$("[data-session]").forEach((btn) => btn.addEventListener("click", () => {
    selectedSessionId = btn.dataset.session;
    render();
    openSessionDialog();
  }));
}

function renderMonth() {
  const start = firstOfMonth(monthCursor);
  const firstGridDay = monday(start);
  const month = start.getMonth();
  els.monthTitle.textContent = new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric" }).format(start);
  els.monthGrid.innerHTML = Array.from({ length: 42 }, (_, i) => {
    const day = addDays(firstGridDay, i);
    const key = dateKey(day);
    const count = visibleSessions().filter((s) => sessionOccursOn(s, key)).length;
    const isOutside = day.getMonth() !== month;
    const isSelectedWeek = key >= dateKey(weekStart) && key <= dateKey(addDays(weekStart, 6));
    return `<button class="month-day ${isOutside ? "outside" : ""} ${isSelectedWeek ? "week-mark" : ""}" data-month-date="${key}" type="button">
      <span>${day.getDate()}</span>${count ? `<i>${count}</i>` : ""}
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
}

function sessionCard(s) {
  const klass = ["Utkání", "Turnaj"].includes(s.type) ? "match" : "";
  return `<button class="event ${klass} ${s.id === selectedSessionId ? "active" : ""}" data-session="${s.id}" type="button">
    <strong>${esc(sessionCalendarTitle(s))}</strong>
  </button>`;
}

function renderEditor() {
  const s = sessionById(selectedSessionId);
  $("#deleteSession").disabled = !s;
  els.deleteSeries.disabled = !s || seriesSessions(s).length <= 1;
  els.form.querySelectorAll("input, select, textarea, button").forEach((el) => {
    if (!el.dataset.create) el.disabled = !s;
  });
  if (!s) {
    updateSessionDialogLabels(null);
    els.hint.textContent = state.selectedTeamId && state.selectedSeasonId ? "Vyber událost v kalendáři nebo vytvoř novou." : "Nejdřív vytvoř tým a sezonu.";
    els.form.reset();
    els.form.elements.type.innerHTML = TYPES.map((t) => `<option>${t}</option>`).join("");
    els.mainGoal.innerHTML = `<option>Bez události</option>`;
    els.extraGoals.innerHTML = `<div class="muted">Vyber událost.</div>`;
    els.details.innerHTML = `<div class="muted">Vyber událost.</div>`;
    els.ratings.innerHTML = `<div class="muted">Vyber událost.</div>`;
    return;
  }
  updateSessionDialogLabels(s);
  els.hint.textContent = long(new Date(`${s.date}T12:00:00`));
  els.form.elements.date.value = s.date;
  els.form.elements.type.innerHTML = TYPES.map((t) => `<option>${t}</option>`).join("");
  els.form.elements.type.value = s.type;
  els.form.elements.startTime.value = s.startTime || "";
  els.form.elements.endTime.value = s.endTime || "";
  els.form.elements.place.value = s.place || "";
  els.form.elements.coach.value = s.coach || "";
  els.form.elements.note.value = s.note || "";
  if (isMatchSession(s)) clearMacrocycleFields(s);
  renderGoalSelect(s);
  renderExtraGoals(s);
  renderDetails(s);
  renderRatings(s);
}

function renderGoalSelect(s) {
  if (isMatchSession(s)) {
    els.mainGoal.innerHTML = "";
    els.mainGoal.value = "";
    els.mainGoal.disabled = true;
    return;
  }
  els.mainGoal.disabled = false;
  const suggested = suggestedGoalsForSession(s);
  const other = state.goals.filter((g) => !suggested.some((x) => x.id === g.id));
  els.mainGoal.innerHTML = `<option value="">Vyber hlavní cíl</option>
    ${suggested.length ? `<optgroup label="Doporučené">${suggested.map(option).join("")}</optgroup>` : ""}
    ${other.length ? `<optgroup label="Ostatní">${other.map(option).join("")}</optgroup>` : ""}`;
  els.mainGoal.value = s.mainGoalId || "";
}

function renderExtraGoals(s) {
  if (isMatchSession(s)) {
    els.extraGoals.innerHTML = "";
    return;
  }
  els.extraGoals.innerHTML = state.goals.length ? state.goals
    .filter((g) => g.id !== s.mainGoalId)
    .map((g) => chip(g, s.extraGoalIds.includes(g.id), "extra-goal"))
    .join("") : `<div class="muted">Nejdřív vytvoř cíle.</div>`;
  $$("[data-extra-goal]").forEach((btn) => btn.addEventListener("click", () => toggleSessionArray("extraGoalIds", btn.dataset.extraGoal)));
}

function renderDetails(s) {
  if (isMatchSession(s)) {
    els.details.innerHTML = "";
    return;
  }
  const suggested = suggestedDetailsForSession(s);
  const other = state.details.filter((d) => !suggested.some((x) => x.id === d.id));
  const html = [
    suggested.length ? `<div class="muted">Doporučené podle cíle</div>${suggested.map((d) => chip(d, s.detailIds.includes(d.id), "detail")).join("")}` : "",
    other.length ? `<div class="muted">Další z knihovny</div>${other.map((d) => chip(d, s.detailIds.includes(d.id), "detail")).join("")}` : "",
  ].join("");
  els.details.innerHTML = html || `<div class="muted">Nejdřív vytvoř detaily.</div>`;
  $$("[data-detail]").forEach((btn) => btn.addEventListener("click", () => toggleSessionArray("detailIds", btn.dataset.detail)));
}

function renderRatings(s) {
  if (isMatchSession(s)) {
    els.ratings.innerHTML = `<div class="rating-row match-performance-row"><strong>Hodnocení výkonu</strong>${Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      return `<button class="${Number(s.performanceRating || 0) === n ? "active" : ""}" data-performance-rate="${n}" type="button">${n}</button>`;
    }).join("")}</div>`;
    $$("[data-performance-rate]").forEach((btn) => btn.addEventListener("click", () => setPerformanceRating(Number(btn.dataset.performanceRate))));
    return;
  }
  const goalIds = [s.mainGoalId, ...s.extraGoalIds].filter(Boolean);
  const detailIds = s.detailIds;
  const goalRows = goalIds.map((id) => ratingRow("goal", id, goalById(id)?.name || "", s.goalRatings[id] || 0)).join("");
  const detailRows = detailIds.map((id) => ratingRow("detail", id, detailById(id)?.name || "", s.detailRatings[id] || 0)).join("");
  els.ratings.innerHTML = `${goalRows || `<div class="muted">Bez cíle k hodnocení.</div>`}${detailRows || ""}`;
  $$("[data-rate]").forEach((btn) => btn.addEventListener("click", () => setRating(btn.dataset.kind, btn.dataset.id, Number(btn.dataset.rate))));
}

function updateSessionDialogLabels(session) {
  const type = session?.type || "";
  const isMatch = isMatchSession(session);
  const title = type === "Utkání" ? "Detail utkání" : type === "Turnaj" ? "Detail turnaje" : type ? "Detail tréninku" : "Detail události";
  if (els.sessionTitle) els.sessionTitle.textContent = title;
  if (els.ratingTitle) els.ratingTitle.textContent = isMatch ? "Hodnocení výkonu" : "Hodnocení po TJ";
  $("#deleteSession").textContent = isMatch ? `Smazat ${type.toLowerCase()}` : type ? "Smazat trénink" : "Smazat událost";
  els.deleteSeries.textContent = isMatch ? "Smazat celé opakování události" : "Smazat celé opakování";
  document.querySelectorAll(".macrocycle-field").forEach((block) => block.classList.toggle("hidden", isMatch));
}

function ratingRow(kind, id, name, value) {
  return `<div class="rating-row"><strong>${esc(name)}</strong>${Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    return `<button class="${value === n ? "active" : ""}" data-kind="${kind}" data-id="${id}" data-rate="${n}" type="button">${n}</button>`;
  }).join("")}</div>`;
}

function renderStats() {
  const p = progress();
  const matchStats = matchPerformanceStats();
  els.stats.innerHTML = [
    stat("Cíle", `${p.doneGoals}/${p.totalGoals}`, p.totalGoals ? p.doneGoals / p.totalGoals : 0),
    stat("Detaily", `${p.doneDetails}/${p.totalDetails}`, p.totalDetails ? p.doneDetails / p.totalDetails : 0),
    stat("TJ v sezoně", macroSessions().length, macroSessions().length ? macroSessions().filter((s) => hasRatings(s)).length / macroSessions().length : 0),
    stat("Výkon utkání", matchStats.count ? `${matchStats.average.toFixed(1)}/10` : "0/10", matchStats.count ? matchStats.average / 10 : 0),
  ].join("");
}

function stat(label, value, ratio) {
  return `<article class="stat"><strong>${value}</strong><span>${label}</span><div class="bar"><span style="width:${Math.round(ratio * 100)}%"></span></div></article>`;
}

function renderFulfillmentScope() {
  els.scope.innerHTML = `<option value="season">Celá sezona</option>${periods().map(option).join("")}`;
  if (!els.scope.value) els.scope.value = "season";
}

function renderFulfillment() {
  const scope = els.scope.value || "season";
  const goalIds = scope === "season" ? state.goals.map((g) => g.id) : periodById(scope)?.goalIds || [];
  const detailIds = [...new Set(goalIds.flatMap((id) => goalById(id)?.detailIds || []))];
  const matchStats = matchPerformanceStats(scope);
  const cards = [
    ...goalIds.map((id) => circleCard(goalById(id)?.name || "", completion("goal", id), "Cíl TJ")),
    ...detailIds.map((id) => circleCard(detailById(id)?.name || "", completion("detail", id), "Detail")),
    ...(matchStats.count ? [circleCard("Průměr výkonu", matchStats.average * 10, `${matchStats.count} utkání/turnajů`)] : []),
  ];
  els.fulfillment.innerHTML = cards.length ? cards.join("") : `<div class="muted">Zatím nejsou přiřazené cíle ani detaily.</div>`;
}

function circleCard(name, pct, label) {
  const color = pct >= 85 ? "#007a3d" : pct >= 45 ? "#d28a16" : "#9aa5a0";
  return `<article class="circle-card"><div class="circle" style="--pct:${pct};--color:${color}"><span>${Math.round(pct)}%</span></div><strong>${esc(name)}</strong><small>${label}</small></article>`;
}

function renderSetup() {
  renderSetupTable("teams", "Týmy", state.teams, ["name"]);
  renderSetupTable("seasons", "Sezony", seasons(), ["name"]);
  renderSetupTable("periods", "Období makrocyklu", periods(), ["name", "start", "end"]);
  renderSetupTable("goals", "Cíle TJ", state.goals, ["name"]);
  renderSetupTable("details", "Detaily TJ", state.details, ["name"]);
}

function renderSetupTable(key, title, rows, cols) {
  const panel = $(`[data-section="${key}"]`);
  panel.innerHTML = `<div class="panel-header"><div><h2>${title}</h2><p>${rows.length} položek</p></div><button class="mini" data-add="${key}" type="button">+ Přidat</button></div>
    <table><thead><tr>${cols.map((c) => `<th>${label(c)}</th>`).join("")}<th>Akce</th></tr></thead>
    <tbody>${rows.length ? rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(display(r, c))}</td>`).join("")}<td><div class="row-actions"><button class="mini" data-edit="${key}" data-id="${r.id}" type="button">Upravit</button></div></td></tr>`).join("") : `<tr><td colspan="${cols.length + 1}">Prázdné.</td></tr>`}</tbody></table>`;
  panel.querySelector("[data-add]").addEventListener("click", () => openDialog(entityFromKey(key)));
  panel.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => openDialog(entityFromKey(btn.dataset.edit), btn.dataset.id)));
}

function updateSession(event) {
  const s = selectedSession();
  if (!s || !event.target.name) return;
  s[event.target.name] = event.target.value;
  if (event.target.name === "type") {
    if (isMatchSession(s)) clearMacrocycleFields(s);
    save();
    render();
    return;
  }
  if (event.target.name === "date") {
    weekStart = monday(new Date(`${s.date}T12:00:00`));
    s.periodId = periodForDate(s.date)?.id || "";
  }
  save();
  renderCalendar();
  renderStats();
  renderFulfillment();
}

function updateMainGoal() {
  const s = selectedSession();
  if (!s) return;
  s.mainGoalId = els.mainGoal.value;
  s.goalRatings[s.mainGoalId] ??= 0;
  save();
  render();
}

function toggleSessionArray(key, id) {
  const s = selectedSession();
  s[key] = s[key].includes(id) ? s[key].filter((x) => x !== id) : [...s[key], id];
  if (key === "extraGoalIds") s.goalRatings[id] ??= 0;
  if (key === "detailIds") s.detailRatings[id] ??= 0;
  save();
  render();
}

function setRating(kind, id, value) {
  const s = selectedSession();
  if (!s || isMatchSession(s)) return;
  const key = kind === "goal" ? "goalRatings" : "detailRatings";
  s[key][id] = value;
  save();
  render();
}

function setPerformanceRating(value) {
  const s = selectedSession();
  if (!s || !isMatchSession(s)) return;
  s.performanceRating = value;
  save();
  render();
}

function openNewSessionDialog(date) {
  if (!state.selectedTeamId || !state.selectedSeasonId) {
    showView("setup");
    openDialog(!state.selectedTeamId ? "team" : "season");
    return;
  }
  els.newSessionForm.reset();
  els.newSessionForm.elements.date.value = date;
  els.newSessionForm.elements.type.innerHTML = TYPES.map((t) => `<option>${t}</option>`).join("");
  els.newSessionForm.elements.type.value = "TJ";
  els.newSessionForm.elements.repeatUntil.value = season()?.end || date;
  els.newSessionEl.showModal();
}

function saveNewSessionDialog() {
  const formData = new FormData(els.newSessionForm);
  const data = Object.fromEntries(formData.entries());
  const dates = repeatDates(data.date, formData.has("repeat") ? data.repeatUntil : "");
  const repeatGroupId = dates.length > 1 ? uid("repeat") : "";
  let firstId = "";
  dates.forEach((date) => {
    const s = makeSession({
      date,
      type: data.type || "TJ",
      startTime: data.startTime || "",
      endTime: data.endTime || "",
      place: data.place || "",
      coach: data.coach || "",
      note: data.note || "",
      repeatGroupId,
    });
    state.sessions.push(s);
    firstId ||= s.id;
  });
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

function makeSession(data) {
  return {
    id: uid("session"),
    teamId: state.selectedTeamId,
    seasonId: state.selectedSeasonId,
    date: data.date,
    endDate: data.endDate || "",
    type: data.type || "TJ",
    startTime: data.startTime || "",
    endTime: data.endTime || "",
    place: data.place || "",
    coach: data.coach || "",
    note: data.note || "",
    periodId: periodForDate(data.date)?.id || "",
    mainGoalId: "",
    extraGoalIds: [],
    detailIds: [],
    goalRatings: {},
    detailRatings: {},
    performanceRating: 0,
    repeatGroupId: data.repeatGroupId || "",
  };
}

function repeatDates(startDate, repeatUntil) {
  if (!startDate) return [];
  const dates = [];
  const start = new Date(`${startDate}T12:00:00`);
  const end = repeatUntil ? new Date(`${repeatUntil}T12:00:00`) : start;
  let current = new Date(start);
  while (current <= end) {
    dates.push(dateKey(current));
    current = addDays(current, 7);
  }
  return dates.length ? dates : [startDate];
}

function openSessionDialog() {
  if (!selectedSession()) return;
  if (!els.sessionEl.open) els.sessionEl.showModal();
}

function deleteSelectedSession() {
  if (!selectedSessionId) return;
  state.sessions = state.sessions.filter((s) => s.id !== selectedSessionId);
  selectedSessionId = sessions()[0]?.id || "";
  save();
  if (els.sessionEl.open) els.sessionEl.close();
  render();
}

function deleteSelectedSeries() {
  const s = selectedSession();
  if (!s) return;
  const series = seriesSessions(s);
  if (series.length <= 1) return;
  const ok = window.confirm(`Smazat celé opakování? Bude odstraněno ${series.length} událostí.`);
  if (!ok) return;
  const ids = new Set(series.map((item) => item.id));
  state.sessions = state.sessions.filter((item) => !ids.has(item.id));
  selectedSessionId = "";
  save();
  if (els.sessionEl.open) els.sessionEl.close();
  render();
}

function seriesSessions(source) {
  if (!source) return [];
  if (source.repeatGroupId) {
    return state.sessions.filter((s) => s.repeatGroupId === source.repeatGroupId);
  }
  const weekdayKey = new Date(`${source.date}T12:00:00`).getDay();
  return state.sessions.filter((s) =>
    s.teamId === source.teamId &&
    s.seasonId === source.seasonId &&
    s.id !== source.id &&
    new Date(`${s.date}T12:00:00`).getDay() === weekdayKey &&
    s.type === source.type &&
    (s.startTime || "") === (source.startTime || "") &&
    (s.endTime || "") === (source.endTime || "") &&
    (s.place || "") === (source.place || "") &&
    (s.coach || "") === (source.coach || "") &&
    (s.note || "") === (source.note || "")
  ).concat(source).sort((a, b) => a.date.localeCompare(b.date));
}

function openEntityFromSession(type) {
  if (els.sessionEl.open) els.sessionEl.close();
  openDialog(type);
}

function openDialog(type, id = "") {
  dialog = { type, id };
  const item = id ? collection(type).find((x) => x.id === id) : {};
  els.dialogTitle.textContent = id ? `Upravit ${entityName(type)}` : `Přidat ${entityName(type)}`;
  els.dialogDelete.classList.toggle("hidden", !id);
  els.dialogBody.innerHTML = fields(type, item);
  els.dialogEl.showModal();
}

function saveDialog() {
  const formData = new FormData(els.dialogForm);
  const data = Object.fromEntries(formData.entries());
  data.goalIds = formData.getAll("goalIds");
  data.detailIds = formData.getAll("detailIds");
  const item = normalize(dialog.type, data, dialog.id || uid(dialog.type));
  const list = collection(dialog.type);
  if (dialog.id) Object.assign(list.find((x) => x.id === dialog.id), item);
  else list.push(item);
  if (dialog.type === "team" && !state.selectedTeamId) state.selectedTeamId = item.id;
  if (dialog.type === "season" && !state.selectedSeasonId) state.selectedSeasonId = item.id;
  save();
  els.dialogEl.close();
  render();
}

function deleteDialogEntity() {
  const list = collection(dialog.type);
  const index = list.findIndex((x) => x.id === dialog.id);
  if (index >= 0) list.splice(index, 1);
  save();
  els.dialogEl.close();
  render();
}

function fields(type, item) {
  if (type === "team") return input("name", "Název týmu", item.name);
  if (type === "season") return input("name", "Název sezony", item.name) + input("start", "Začátek", item.start, "date") + input("end", "Konec", item.end, "date");
  if (type === "period") return input("name", "Název období", item.name) + input("start", "Od", item.start, "date") + input("end", "Do", item.end, "date") + select("phase", "Fáze", ["ÚF na OP", "ÚF na ÚP", "OF na ÚP", "OF na OP"], item.phase) + multi("goalIds", "Cíle pro tuto fázi", state.goals, item.goalIds || [], "Tyhle cíle se pak budou u TJ v daném období nabízet jako doporučené.");
  if (type === "goal") return input("name", "Název cíle", item.name) + multi("detailIds", "Doporučené detaily k tomuto cíli", state.details, item.detailIds || [], "Zaškrtni detaily, které se mají u tohoto cíle trenérovi nabízet. Detail může být zaškrtnutý u více cílů.");
  if (type === "detail") return input("name", "Název detailu", item.name);
  return "";
}

function normalize(type, data, id) {
  if (type === "team") return { id, name: data.name || "Nový tým" };
  if (type === "season") return { id, name: data.name || "Nová sezona", start: data.start || "", end: data.end || "" };
  if (type === "period") return { id, teamId: state.selectedTeamId, seasonId: state.selectedSeasonId, name: data.name || data.phase || "Období", start: data.start || "", end: data.end || "", phase: data.phase || "", goalIds: split(data.goalIds) };
  if (type === "goal") return { id, name: data.name || "Nový cíl", detailIds: split(data.detailIds) };
  if (type === "detail") return { id, name: data.name || "Nový detail" };
  return {};
}

function suggestedGoalsForSession(s) {
  const period = periodById(s.periodId) || periodForDate(s.date);
  return period ? state.goals.filter((g) => period.goalIds.includes(g.id)) : state.goals;
}

function suggestedDetailsForSession(s) {
  const goalIds = [s.mainGoalId, ...s.extraGoalIds].filter(Boolean);
  const ids = new Set(goalIds.flatMap((id) => goalById(id)?.detailIds || []));
  return state.details.filter((d) => ids.has(d.id));
}

function progress() {
  const goalIds = new Set(state.goals.map((g) => g.id));
  const detailIds = new Set([...goalIds].flatMap((id) => goalById(id)?.detailIds || []));
  return {
    totalGoals: goalIds.size,
    doneGoals: [...goalIds].filter((id) => completion("goal", id) >= 99.9).length,
    totalDetails: detailIds.size,
    doneDetails: [...detailIds].filter((id) => completion("detail", id) >= 99.9).length,
    periodsWithTraining: periods().filter((p) => sessions().some((s) => s.date >= p.start && s.date <= p.end)).length,
  };
}

function completion(kind, id) {
  const key = kind === "goal" ? "goalRatings" : "detailRatings";
  return macroSessions().reduce((current, s) => {
    const rating = Number(s[key]?.[id] || 0);
    return rating ? current + (100 - current) * (rating / 10) : current;
  }, 0);
}

function hasRatings(s) {
  if (isMatchSession(s)) return Number(s.performanceRating || 0) > 0;
  return Object.values(s.goalRatings).some(Boolean) || Object.values(s.detailRatings).some(Boolean);
}

function isMatchSession(session) {
  return ["Utkání", "Turnaj"].includes(session?.type);
}
function macroSessions() {
  return sessions().filter((session) => !isMatchSession(session));
}
function clearMacrocycleFields(session) {
  session.mainGoalId = "";
  session.extraGoalIds = [];
  session.detailIds = [];
  session.goalRatings = {};
  session.detailRatings = {};
}
function performanceLabel(session) {
  const rating = Number(session.performanceRating || 0);
  return rating ? `Výkon ${rating}/10` : "Bez hodnocení výkonu";
}
function matchPerformanceStats(scope = "season") {
  const source = scope === "season"
    ? sessions()
    : sessions().filter((session) => session.periodId === scope || periodForDate(session.date)?.id === scope);
  const values = source
    .filter(isMatchSession)
    .map((session) => Number(session.performanceRating || 0))
    .filter((rating) => rating > 0);
  const average = values.length ? values.reduce((sum, rating) => sum + rating, 0) / values.length : 0;
  return { count: values.length, average };
}

function input(name, label, value = "", type = "text") {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value || "")}" /></label>`;
}
function select(name, label, options, value = "") {
  return `<label>${label}<select name="${name}">${options.map((o) => `<option ${o === value ? "selected" : ""}>${o}</option>`).join("")}</select></label>`;
}
function multi(name, label, items, values, hint = "") {
  return `<fieldset class="check-list"><legend>${label}</legend>${hint ? `<p>${hint}</p>` : ""}
    ${items.length ? items.map((i) => `<label><input type="checkbox" name="${name}" value="${i.id}" ${values.includes(i.id) ? "checked" : ""} /> <span>${esc(i.name)}</span></label>`).join("") : `<div class="muted">Zatím tu nic není. Nejdřív vytvoř položky v nastavení.</div>`}
  </fieldset>`;
}
function chip(item, active, key) {
  return `<button class="chip ${active ? "active" : ""}" data-${key}="${item.id}" type="button">${esc(item.name)}</button>`;
}
function option(item) { return `<option value="${item.id}">${esc(item.name)}</option>`; }
function label(key) { return ({ name: "Název", start: "Od", end: "Do" })[key] || key; }
function display(row, key) { return key === "start" || key === "end" ? fmt(row[key]) : row[key] || ""; }

function showView(view) {
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `${view}View`));
}
function collection(type) { return ({ team: state.teams, season: state.seasons, period: state.periods, goal: state.goals, detail: state.details })[type]; }
function entityFromKey(key) { return ({ teams: "team", seasons: "season", periods: "period", goals: "goal", details: "detail" })[key]; }
function entityName(type) { return ({ team: "tým", season: "sezonu", period: "období", goal: "cíl", detail: "detail" })[type]; }
function activeSeason() { return state.seasons.find((s) => s.id === state.selectedSeasonId); }
function team() { return state.teams.find((t) => t.id === state.selectedTeamId); }
function season() { return activeSeason(); }
function seasons() { return state.seasons; }
function periods() { return state.periods.filter((p) => p.teamId === state.selectedTeamId && p.seasonId === state.selectedSeasonId); }
function sessions() { return state.sessions.filter((s) => s.teamId === state.selectedTeamId && s.seasonId === state.selectedSeasonId); }
function visibleSessions() { return state.selectedPeriodId === "all" ? sessions() : sessions().filter((s) => s.periodId === state.selectedPeriodId || periodForDate(s.date)?.id === state.selectedPeriodId); }
function selectedSession() { return sessionById(selectedSessionId); }
function sessionById(id) { return state.sessions.find((s) => s.id === id); }
function goalById(id) { return state.goals.find((g) => g.id === id); }
function detailById(id) { return state.details.find((d) => d.id === id); }
function periodById(id) { return state.periods.find((p) => p.id === id); }
function periodForDate(date) { return periods().find((p) => date >= p.start && date <= p.end); }
function sessionEndDate(session) {
  return session?.endDate && session.endDate >= session.date ? session.endDate : session?.date || "";
}
function sessionOccursOn(session, date) {
  if (!session?.date || !date) return false;
  return date >= session.date && date <= sessionEndDate(session);
}
function sessionCalendarTitle(session) {
  const name = session?.sourceSummary || session?.title || "";
  const prefix = session?.startTime ? `${session.startTime} ` : "";
  return name || `${prefix}${session?.type || "Událost"}`;
}
function ensureSelection() {
  state = migrateGlobalSeasons(state);
  if (!state.selectedTeamId || !state.teams.some((t) => t.id === state.selectedTeamId)) state.selectedTeamId = state.teams[0]?.id || "";
  if (!state.selectedSeasonId || !seasons().some((s) => s.id === state.selectedSeasonId)) state.selectedSeasonId = seasons()[0]?.id || "";
  if (!state.selectedPeriodId) state.selectedPeriodId = "all";
  if (selectedSessionId && !sessionById(selectedSessionId)) selectedSessionId = "";
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || blank(); } catch { return blank(); }
}
function blank() {
  return { teams: [], seasons: [], periods: [], goals: [], details: [], sessions: [], players: [], matchdays: [], xpsFeeds: [], selectedTeamId: "", selectedSeasonId: "", selectedPeriodId: "all" };
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (remoteEnabled && !applyingRemote) queueRemoteSave();
}
function setSyncStatus(text, mode = "") {
  if (!els.syncStatus) return;
  els.syncStatus.textContent = text;
  els.syncStatus.title = text;
  els.syncStatus.setAttribute("aria-label", text);
  els.syncStatus.className = `sync-status ${mode}`.trim();
}
async function startSync() {
  try {
    const store = await fetchRemoteState();
    remoteEnabled = true;
    remoteUpdatedAt = store.updatedAt || 0;
    if (store.state) {
      applyingRemote = true;
      state = normalizeState(store.state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      applyingRemote = false;
      render();
    }
    setSyncStatus(syncProvider === "supabase" ? "Sdíleno přes Supabase" : "Sdíleno online", "online");
    window.setInterval(pollRemoteState, 2000);
  } catch {
    remoteEnabled = false;
    setSyncStatus("Lokální režim");
  }
}
async function fetchRemoteState() {
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      return await fetchSupabaseState();
    } catch {
      syncProvider = "local";
    }
  }
  const response = await fetch(SYNC_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("Sync unavailable");
  syncProvider = "server";
  return response.json();
}
async function pollRemoteState() {
  if (!remoteEnabled) return;
  try {
    const store = await fetchRemoteState();
    if ((store.updatedAt || 0) > remoteUpdatedAt) {
      remoteUpdatedAt = store.updatedAt || 0;
      applyingRemote = true;
      state = normalizeState(store.state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      applyingRemote = false;
      render();
    }
    setSyncStatus(syncProvider === "supabase" ? "Sdíleno přes Supabase" : "Sdíleno online", "online");
  } catch {
    remoteEnabled = false;
    setSyncStatus("Lokální režim");
  }
}
function queueRemoteSave() {
  window.clearTimeout(saveTimer);
  setSyncStatus("Ukládám...", "saving");
  saveTimer = window.setTimeout(pushRemoteState, 250);
}
async function pushRemoteState() {
  if (!remoteEnabled) return;
  try {
    if (syncProvider === "supabase") {
      const store = await saveSupabaseState();
      remoteUpdatedAt = store.updatedAt || remoteUpdatedAt;
      setSyncStatus("Sdíleno přes Supabase", "online");
      return;
    }
    const response = await fetch(SYNC_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
    if (!response.ok) throw new Error("Save failed");
    const store = await response.json();
    remoteUpdatedAt = store.updatedAt || remoteUpdatedAt;
    setSyncStatus("Sdíleno online", "online");
  } catch {
    remoteEnabled = false;
    setSyncStatus("Lokální režim");
  }
}
async function fetchSupabaseState() {
  syncProvider = "supabase";
  const url = `${supabaseRestUrl()}?id=eq.${encodeURIComponent(SUPABASE_STATE_ID)}&select=id,updated_at,state`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: supabaseHeaders(),
  });
  if (!response.ok) throw new Error("Supabase sync unavailable");
  const rows = await response.json();
  if (rows[0]) return supabaseStore(rows[0]);
  return createSupabaseState();
}
async function createSupabaseState() {
  const response = await fetch(supabaseRestUrl(), {
    method: "POST",
    headers: { ...supabaseHeaders(), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ id: SUPABASE_STATE_ID, state: blank(), updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error("Supabase state create failed");
  const rows = await response.json();
  return supabaseStore(rows[0]);
}
async function saveSupabaseState() {
  const response = await fetch(`${supabaseRestUrl()}?id=eq.${encodeURIComponent(SUPABASE_STATE_ID)}`, {
    method: "PATCH",
    headers: { ...supabaseHeaders(), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ state, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error("Supabase save failed");
  const rows = await response.json();
  return supabaseStore(rows[0]);
}
function supabaseStore(row) {
  return { updatedAt: Date.parse(row?.updated_at || "") || 0, state: row?.state || blank() };
}
function supabaseRestUrl() {
  return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/app_state`;
}
function supabaseHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}
function normalizeState(nextState) {
  const next = migrateGlobalSeasons({ ...blank(), ...(nextState && typeof nextState === "object" ? nextState : {}) });
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
function seasonMergeKey(season) {
  return [season?.name || "", season?.start || "", season?.end || ""].map((value) => String(value).trim().toLowerCase()).join("|");
}
function migrateGlobalSeasons(nextState = state) {
  const next = { ...blank(), ...(nextState && typeof nextState === "object" ? nextState : {}) };
  const seasonIdMap = new Map();
  const seen = new Map();
  next.seasons = (next.seasons || []).reduce((items, season) => {
    const cleaned = { id: season.id || uid("season"), name: season.name || "Nová sezona", start: season.start || "", end: season.end || "" };
    const key = seasonMergeKey(cleaned);
    const existing = seen.get(key);
    if (existing) {
      seasonIdMap.set(season.id, existing.id);
      return items;
    }
    seen.set(key, cleaned);
    seasonIdMap.set(season.id, cleaned.id);
    items.push(cleaned);
    return items;
  }, []);
  const mapSeasonId = (id) => seasonIdMap.get(id) || id || next.seasons[0]?.id || "";
  next.selectedSeasonId = mapSeasonId(next.selectedSeasonId);
  next.periods = (next.periods || []).map((period) => ({ ...period, seasonId: mapSeasonId(period.seasonId) }));
  next.sessions = (next.sessions || []).map((session) => ({ ...session, seasonId: mapSeasonId(session.seasonId) }));
  return next;
}
function split(value) { return Array.isArray(value) ? value.filter(Boolean) : value ? String(value).split(",").filter(Boolean) : []; }
function monday(date) { const d = new Date(date); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); d.setHours(12,0,0,0); return d; }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function dateKey(date) { return date.toISOString().slice(0, 10); }
function todayKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
function firstOfMonth(date) { const d = new Date(date); d.setDate(1); d.setHours(12,0,0,0); return d; }
function addMonths(date, months) { const d = new Date(date); d.setMonth(d.getMonth() + months, 1); d.setHours(12,0,0,0); return d; }
function weekday(date) { return new Intl.DateTimeFormat("cs-CZ", { weekday: "short" }).format(date); }
function long(date) { return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }).format(date); }
function fmt(value) { return value ? new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric" }).format(new Date(`${value}T12:00:00`)) : ""; }
function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }
}
