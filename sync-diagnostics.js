(function () {
  const CHECK_DELAY = 450;

  function getConfig() {
    return {
      url: (window.MAKROCYCLE_SUPABASE_URL || "").replace(/\/$/, ""),
      key: window.MAKROCYCLE_SUPABASE_KEY || "",
    };
  }

  function status(text, mode) {
    if (typeof setSyncStatus === "function") {
      setSyncStatus(text, mode || "");
    }
  }

  function headers(key) {
    return {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
  }

  async function loadSupabaseStore(url, key) {
    const response = await fetch(`${url}/rest/v1/app_state?id=eq.main&select=id,updated_at,state`, {
      headers: headers(key),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`${response.status} ${response.statusText}${body ? `: ${body.slice(0, 120)}` : ""}`);
    }

    const rows = await response.json();
    if (!rows.length) {
      return { state: null, updated_at: null };
    }
    return rows[0];
  }

  async function runSyncDiagnostics() {
    const config = getConfig();

    if (!config.url || !config.key) {
      status("Chybí Supabase config");
      console.warn("[Makrocyklus sync] Missing Supabase config", config);
      return;
    }

    try {
      const remoteStore = await loadSupabaseStore(config.url, config.key);

      if (remoteStore.state && typeof normalizeState === "function") {
        remoteEnabled = true;
        syncProvider = "supabase";
        remoteUpdatedAt = remoteStore.updated_at || new Date().toISOString();
        applyingRemote = true;
        state = normalizeState(remoteStore.state);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        applyingRemote = false;

        if (typeof render === "function") {
          render();
        }
      }

      status("Sdíleno přes Supabase", "online");
      console.info("[Makrocyklus sync] Supabase connection OK");
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      status(`Supabase chyba: ${message.slice(0, 80)}`);
      console.error("[Makrocyklus sync] Supabase connection failed", error);
    }
  }

  window.addEventListener("load", () => {
    window.setTimeout(runSyncDiagnostics, CHECK_DELAY);
  });
})();
