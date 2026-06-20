(function () {
  const UI_STORAGE_KEY = "makrocyklus-ui-state-v1";
  const SHARED_KEYS = ["teams", "seasons", "periods", "goals", "details", "sessions"];

  function sharedStateForSync(source) {
    return SHARED_KEYS.reduce((payload, key) => {
      payload[key] = Array.isArray(source?.[key]) ? source[key] : [];
      return payload;
    }, {});
  }

  function currentUiState(source = state) {
    return {
      selectedTeamId: source.selectedTeamId || "",
      selectedSeasonId: source.selectedSeasonId || "",
      selectedPeriodId: source.selectedPeriodId || "all",
      calendarTeamIds: Array.isArray(source.calendarTeamIds) ? source.calendarTeamIds.filter(Boolean) : [],
    };
  }

  function readUiState() {
    try {
      return JSON.parse(localStorage.getItem(UI_STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function writeUiState(source = state) {
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(currentUiState(source)));
  }

  function applyUiState(nextState) {
    const ui = readUiState();
    const teamIds = new Set((nextState.teams || []).map((team) => team.id));
    const selectedTeamId = teamIds.has(ui.selectedTeamId) ? ui.selectedTeamId : (nextState.teams || [])[0]?.id || "";
    const seasonIds = new Set((nextState.seasons || []).filter((season) => season.teamId === selectedTeamId).map((season) => season.id));
    const selectedSeasonId = seasonIds.has(ui.selectedSeasonId) ? ui.selectedSeasonId : (nextState.seasons || []).find((season) => season.teamId === selectedTeamId)?.id || "";
    const periodIds = new Set((nextState.periods || []).filter((period) => period.teamId === selectedTeamId && period.seasonId === selectedSeasonId).map((period) => period.id));
    const selectedPeriodId = ui.selectedPeriodId === "all" || periodIds.has(ui.selectedPeriodId) ? (ui.selectedPeriodId || "all") : "all";
    const calendarTeamIds = Array.isArray(ui.calendarTeamIds) ? ui.calendarTeamIds.filter((id) => teamIds.has(id)) : [];

    return {
      ...nextState,
      selectedTeamId,
      selectedSeasonId,
      selectedPeriodId,
      calendarTeamIds: calendarTeamIds.length ? calendarTeamIds : [selectedTeamId].filter(Boolean),
    };
  }

  const syncedNormalizeState = window.normalizeState;
  normalizeState = function normalizeSharedStateWithLocalUi(nextState) {
    return applyUiState(syncedNormalizeState(nextState));
  };

  const syncedSave = window.save;
  save = function saveSharedDataWithLocalUi() {
    writeUiState(state);
    syncedSave();
  };

  saveSupabaseState = async function saveSupabaseSharedStateOnly() {
    const response = await fetch(`${supabaseRestUrl()}?id=eq.${encodeURIComponent(SUPABASE_STATE_ID)}`, {
      method: "PATCH",
      headers: { ...supabaseHeaders(), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ state: sharedStateForSync(state), updated_at: new Date().toISOString() }),
    });
    if (!response.ok) throw new Error("Supabase save failed");
    const rows = await response.json();
    return supabaseStore(rows[0]);
  };

  writeUiState(state);
})();
