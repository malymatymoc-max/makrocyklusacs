(function () {
  let playerDialogTeamId = "";
  const openRosterTeamIds = new Set();
  const PLAYER_BACKUP_KEY = "coach-acs-player-backup-latest";
  const PLAYER_BACKUP_META_KEY = "coach-acs-player-backup-meta";
  const PLAYER_BACKUP_ROW_ID = "players_backup_latest";

  function migratePlayers(nextState = state) {
    const next = { ...blank(), ...(nextState && typeof nextState === "object" ? nextState : {}) };
    next.players = (next.players || []).map((player) => ({
      id: player.id || uid("player"),
      teamId: player.teamId || next.selectedTeamId || next.teams?.[0]?.id || "",
      firstName: player.firstName || "",
      lastName: player.lastName || "",
      birthDate: player.birthDate || "",
      photoData: player.photoData || "",
    }));
    return next;
  }

  function playersForTeam(teamId = state.selectedTeamId) {
    return (state.players || []).filter((player) => player.teamId === teamId);
  }

  function initials(player) {
    const first = (player.firstName || "").trim()[0] || "";
    const last = (player.lastName || "").trim()[0] || "";
    return (first + last || "?").toUpperCase();
  }

  function playerName(player) {
    return `${player.firstName || ""} ${player.lastName || ""}`.trim() || "Bez jména";
  }

  function photoMarkup(player, className = "player-photo") {
    return `<span class="${className}">${player.photoData ? `<img src="${esc(player.photoData)}" alt="" />` : esc(initials(player))}</span>`;
  }

  function renderPlayers() {
    const title = document.querySelector("#teamRosterTitle");
    const meta = document.querySelector("#teamRosterMeta");
    const grid = document.querySelector("#playersGrid");
    if (!title || !meta || !grid) return;

    const totalPlayers = (state.players || []).length;
    title.textContent = "Týmy";
    meta.textContent = state.teams.length ? `${state.teams.length} týmů · ${totalPlayers} hráček celkem` : "Nejdřív vytvoř tým.";

    if (!state.teams.length) {
      grid.innerHTML = `<div class="muted">Nejdřív vytvoř tým v nastavení.</div>`;
      bindPlayerTools();
      return;
    }

    grid.innerHTML = state.teams.map((rosterTeam) => {
      const players = playersForTeam(rosterTeam.id);
      const isOpen = openRosterTeamIds.has(rosterTeam.id);
      return `<section class="team-roster-card">
        <div class="team-roster-head">
          <button class="team-roster-toggle" data-toggle-roster="${rosterTeam.id}" type="button" aria-expanded="${isOpen ? "true" : "false"}">
            <span>${isOpen ? "Sbalit" : "Rozbalit"}</span>
          </button>
          <div class="team-roster-title">
            <i class="team-roster-dot" style="background:${esc(rosterTeam.color || "#007a3d")}"></i>
            <span><strong>${esc(rosterTeam.name)}</strong><span>${players.length} hráček</span></span>
          </div>
          <button class="mini" data-add-player="${rosterTeam.id}" type="button">+ Hráčka</button>
        </div>
        <div class="team-roster-list ${isOpen ? "" : "hidden"}">
          ${players.length ? players.map((player) => `
            <button class="player-card" data-player="${player.id}" type="button">
              ${photoMarkup(player)}
              <span>
                <strong>${esc(playerName(player))}</strong>
                <span>${player.birthDate ? `Nar. ${fmtFullDate(player.birthDate)}` : "Datum narození nevyplněno"}</span>
              </span>
            </button>
          `).join("") : `<div class="muted">Zatím tu není žádná hráčka.</div>`}
        </div>
      </section>`;
    }).join("");

    grid.querySelectorAll("[data-player]").forEach((button) => {
      button.addEventListener("click", () => openPlayerDialog(state.players.find((player) => player.id === button.dataset.player)?.teamId || "", button.dataset.player));
    });
    grid.querySelectorAll("[data-add-player]").forEach((button) => {
      button.addEventListener("click", () => openPlayerDialog(button.dataset.addPlayer));
    });
    grid.querySelectorAll("[data-toggle-roster]").forEach((button) => {
      button.addEventListener("click", () => {
        if (openRosterTeamIds.has(button.dataset.toggleRoster)) openRosterTeamIds.delete(button.dataset.toggleRoster);
        else openRosterTeamIds.add(button.dataset.toggleRoster);
        renderPlayers();
      });
    });
    bindPlayerTools();
  }

  function bindPlayerTools() {
    const exportButton = document.querySelector("#exportPlayers");
    const backupButton = document.querySelector("#backupPlayersNow");
    if (exportButton && !exportButton.dataset.bound) {
      exportButton.dataset.bound = "1";
      exportButton.addEventListener("click", exportPlayers);
    }
    if (backupButton && !backupButton.dataset.bound) {
      backupButton.dataset.bound = "1";
      backupButton.addEventListener("click", async () => {
        const snapshot = backupPlayersSnapshot("manual");
        try {
          const remoteSaved = await savePlayerBackupRemote(snapshot);
          window.alert(remoteSaved ? "Záloha hráček je uložená." : "Lokální záloha je uložená v tomto zařízení.");
        } catch {
          window.alert("Lokální záloha je uložená v tomto zařízení. Online záloha se teď nepodařila.");
        }
      });
    }
  }

  function buildPlayersSnapshot(reason = "manual") {
    return {
      version: 1,
      reason,
      createdAt: new Date().toISOString(),
      teams: (state.teams || []).map((team) => ({ id: team.id, name: team.name || "", color: team.color || "" })),
      players: (state.players || []).map((player) => ({
        id: player.id,
        teamId: player.teamId || "",
        firstName: player.firstName || "",
        lastName: player.lastName || "",
        birthDate: player.birthDate || "",
        photoData: player.photoData || "",
      })),
    };
  }

  function backupPlayersSnapshot(reason = "auto") {
    const snapshot = buildPlayersSnapshot(reason);
    try {
      localStorage.setItem(PLAYER_BACKUP_KEY, JSON.stringify(snapshot));
      localStorage.setItem(PLAYER_BACKUP_META_KEY, JSON.stringify({
        createdAt: snapshot.createdAt,
        playerCount: snapshot.players.length,
        teamCount: snapshot.teams.length,
        reason,
      }));
    } catch {
      try {
        const lightSnapshot = {
          ...snapshot,
          players: snapshot.players.map((player) => ({ ...player, photoData: "" })),
          note: "Fotky nebyly uložené kvůli omezenému místu v zařízení.",
        };
        localStorage.setItem(PLAYER_BACKUP_KEY, JSON.stringify(lightSnapshot));
      } catch {}
    }
    savePlayerBackupRemote(snapshot).catch(() => {});
    return snapshot;
  }

  async function savePlayerBackupRemote(snapshot) {
    if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_KEY === "undefined" || !SUPABASE_URL || !SUPABASE_KEY) return false;
    if (typeof supabaseRestUrl !== "function" || typeof supabaseHeaders !== "function") return false;
    const response = await fetch(`${supabaseRestUrl()}?on_conflict=id`, {
      method: "POST",
      headers: { ...supabaseHeaders(), "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: PLAYER_BACKUP_ROW_ID, state: snapshot, updated_at: new Date().toISOString() }),
    });
    if (!response.ok) throw new Error("Player backup failed");
    return true;
  }

  function exportPlayers() {
    const snapshot = buildPlayersSnapshot("export");
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    link.href = URL.createObjectURL(blob);
    link.download = `coach-acs-hracky-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function openPlayerDialog(teamId, id = "") {
    playerDialogTeamId = teamId || state.selectedTeamId || state.teams[0]?.id || "";
    openDialog("player", id);
  }

  function playerFields(item = {}) {
    const previewPlayer = { firstName: item.firstName || "", lastName: item.lastName || "", photoData: item.photoData || "" };
    return `
      <div class="player-photo-field">
        ${photoMarkup(previewPlayer, "player-photo-preview")}
        <label>Fotka hráčky
          <input name="photoUpload" type="file" accept="image/*" />
          <input name="photoData" type="hidden" value="${esc(item.photoData || "")}" />
        </label>
      </div>
      <div class="form-row">
        ${input("firstName", "Jméno", item.firstName || "")}
        ${input("lastName", "Příjmení", item.lastName || "")}
      </div>
      ${input("birthDate", "Datum narození", item.birthDate || "", "date")}
    `;
  }

  function bindPlayerPhotoInput() {
    const inputEl = els.dialogBody.querySelector("input[name='photoUpload']");
    const hiddenEl = els.dialogBody.querySelector("input[name='photoData']");
    const previewEl = els.dialogBody.querySelector(".player-photo-preview");
    if (!inputEl || !hiddenEl || !previewEl) return;
    inputEl.addEventListener("change", async () => {
      const file = inputEl.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await resizeImage(file);
        hiddenEl.value = dataUrl;
        previewEl.innerHTML = `<img src="${esc(dataUrl)}" alt="" />`;
      } catch {
        window.alert("Fotku se nepodařilo nahrát.");
      }
    });
  }

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const max = 480;
          const ratio = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * ratio));
          canvas.height = Math.max(1, Math.round(img.height * ratio));
          const context = canvas.getContext("2d");
          context.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function fmtFullDate(value) {
    return value ? new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`)) : "";
  }

  const playersNormalizeState = window.normalizeState;
  normalizeState = function normalizePlayerState(nextState) {
    return migratePlayers(playersNormalizeState(nextState));
  };

  const playersBlank = window.blank;
  blank = function blankWithPlayers() {
    return { ...playersBlank(), players: [] };
  };

  const playersRender = window.render;
  render = function renderWithPlayers() {
    playersRender();
    renderPlayers();
  };

  const playersOpenDialog = window.openDialog;
  openDialog = function openDialogWithPlayers(type, id = "") {
    if (type === "player" && id) {
      playerDialogTeamId = state.players.find((player) => player.id === id)?.teamId || playerDialogTeamId;
    }
    playersOpenDialog(type, id);
    if (type === "player") bindPlayerPhotoInput();
  };

  const playersCollection = window.collection;
  collection = function collectionWithPlayers(type) {
    if (type === "player") return state.players;
    return playersCollection(type);
  };

  const playersEntityName = window.entityName;
  entityName = function entityNameWithPlayers(type) {
    if (type === "player") return "hráčku";
    return playersEntityName(type);
  };

  const playersFields = window.fields;
  fields = function fieldsWithPlayers(type, item) {
    if (type === "player") return playerFields(item);
    return playersFields(type, item);
  };

  const playersNormalize = window.normalize;
  normalize = function normalizeWithPlayers(type, data, id) {
    if (type === "player") {
      return {
        id,
        teamId: playerDialogTeamId || state.players.find((player) => player.id === id)?.teamId || state.selectedTeamId,
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        birthDate: data.birthDate || "",
        photoData: typeof data.photoData === "string" ? data.photoData : "",
      };
    }
    return playersNormalize(type, data, id);
  };

  const playersEnsureSelection = window.ensureSelection;
  ensureSelection = function ensureSelectionWithPlayers() {
    state = migratePlayers(state);
    playersEnsureSelection();
  };

  const playersSaveDialog = window.saveDialog;
  saveDialog = function saveDialogWithPlayerBackup() {
    if (dialog?.type === "player") backupPlayersSnapshot(dialog.id ? "before-player-edit" : "before-player-create");
    return playersSaveDialog();
  };

  const playersDeleteDialogEntity = window.deleteDialogEntity;
  deleteDialogEntity = function deleteDialogEntityWithPlayerBackup() {
    if (dialog?.type === "player") backupPlayersSnapshot("before-player-delete");
    return playersDeleteDialogEntity();
  };

  window.playersForTeam = playersForTeam;
  window.playerName = playerName;
  window.playerInitials = initials;
  window.backupPlayersSnapshot = backupPlayersSnapshot;
  window.exportPlayers = exportPlayers;

  try {
    state = migratePlayers(state);
    render();
  } catch {}
})();
