(function () {
  function requiredCount(item) {
    return Math.max(1, Number(item?.requiredSessions || 1));
  }

  function requiredInput(value) {
    return input("requiredSessions", "Počet potřebných TJ", value || 1, "number");
  }

  function migrateRequirements(nextState = state) {
    const next = { ...blank(), ...(nextState && typeof nextState === "object" ? nextState : {}) };
    next.goals = (next.goals || []).map((goal) => ({ ...goal, requiredSessions: requiredCount(goal) }));
    next.details = (next.details || []).map((detail) => ({ ...detail, requiredSessions: requiredCount(detail) }));
    return next;
  }

  const requirementsNormalizeState = window.normalizeState;
  normalizeState = function normalizeRequirementState(nextState) {
    return migrateRequirements(requirementsNormalizeState(nextState));
  };

  const requirementsFields = window.fields;
  fields = function fieldsWithRequirements(type, item) {
    if (type === "goal") {
      return input("name", "Název cíle", item.name) +
        requiredInput(item.requiredSessions) +
        phaseMulti(item.phaseIds || []) +
        multi("detailIds", "Doporučené detaily k tomuto cíli", teamDetails(), item.detailIds || [], "Zaškrtni detaily, které se mají u tohoto cíle trenérovi nabízet.");
    }
    if (type === "detail") {
      return input("name", "Název detailu", item.name) + requiredInput(item.requiredSessions);
    }
    return requirementsFields(type, item);
  };

  const requirementsNormalize = window.normalize;
  normalize = function normalizeWithRequirements(type, data, id) {
    if (type === "goal") {
      return {
        id,
        teamId: state.selectedTeamId,
        name: data.name || "Nový cíl",
        phaseIds: split(data.phaseIds),
        detailIds: split(data.detailIds),
        requiredSessions: requiredCount(data),
      };
    }
    if (type === "detail") {
      return {
        id,
        teamId: state.selectedTeamId,
        name: data.name || "Nový detail",
        requiredSessions: requiredCount(data),
      };
    }
    return requirementsNormalize(type, data, id);
  };

  display = function displayWithRequirements(row, key) {
    if (key === "requiredSessions") return requiredCount(row);
    if (key === "start" || key === "end") return fmt(row[key]);
    if (key === "phaseIds") return split(row[key]).join(", ");
    return row[key] || "";
  };

  const requirementsLabel = window.label;
  label = function labelWithRequirements(key) {
    if (key === "requiredSessions") return "Potřebných TJ";
    return requirementsLabel(key);
  };

  renderSetup = function renderSetupWithRequirements() {
    state = migrateRequirements(state);
    renderSetupTable("teams", "Týmy", state.teams, ["name"]);
    renderSetupTable("seasons", "Sezony", seasons(), ["name"]);
    renderSetupTable("periods", "Fáze v sezoně", periods(), ["phase", "start", "end"]);
    renderSetupTable("goals", "Cíle TJ", teamGoals(), ["name", "phaseIds", "requiredSessions"]);
    renderSetupTable("details", "Detaily TJ", teamDetails(), ["name", "requiredSessions"]);
  };

  function ratedSessions(kind, id) {
    const key = kind === "goal" ? "goalRatings" : "detailRatings";
    return macroSessions()
      .map((session) => Number(session[key]?.[id] || 0))
      .filter((rating) => rating > 0);
  }

  completion = function completionWithRequiredSessions(kind, id) {
    const item = kind === "goal" ? goalById(id) : detailById(id);
    const required = requiredCount(item);
    const points = ratedSessions(kind, id).reduce((sum, rating) => sum + rating * 10, 0);
    return Math.min(100, points / required);
  };

  function sessionWarnings(session) {
    if (isMatchSession(session)) {
      const isPast = session.date < todayKey();
      return isPast && !Number(session.performanceRating || 0) ? ["Nevyhodnocený výkon"] : [];
    }
    const warnings = [];
    const goalIds = [session.mainGoalId, ...(session.extraGoalIds || [])].filter(Boolean);
    const detailIds = session.detailIds || [];
    const today = todayKey();
    const isPast = session.date < today;

    if (!goalIds.length) warnings.push("Chybí cíl");
    if (!detailIds.length) warnings.push("Chybí detail");
    if (isPast && goalIds.some((id) => !Number(session.goalRatings?.[id] || 0))) warnings.push("Nevyhodnocený cíl");
    if (isPast && detailIds.some((id) => !Number(session.detailRatings?.[id] || 0))) warnings.push("Nevyhodnocený detail");

    return warnings;
  }

  function warningBadges(session) {
    const warnings = sessionWarnings(session);
    return warnings.length ? `<span class="event-warnings" title="${esc(warnings.join(", "))}">${warnings.length}</span>` : "";
  }

  sessionCard = function sessionCardWithWarnings(session) {
    const klass = ["Utkání", "Turnaj"].includes(session.type) ? "match" : "";
    return `<button class="event ${klass} ${session.id === selectedSessionId ? "active" : ""}" data-session="${session.id}" type="button">
      <span class="event-kind">${esc(session.type || "Událost")}</span>
      <strong><span class="event-title">${esc(sessionCalendarTitle(session))}</span>${warningBadges(session)}</strong>
      <span class="event-meta">${esc(sessionMetaLine(session))}</span>
    </button>`;
  };

  try {
    state = migrateRequirements(state);
    save();
    render();
  } catch {}
})();
