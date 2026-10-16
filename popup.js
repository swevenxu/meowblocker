const els = {
  body: document.body,
  toggle: document.getElementById("toggle"),
  statusText: document.getElementById("statusText"),
  detail: document.getElementById("detail"),
  whitelist: document.getElementById("whitelist"),
  settingsLink: document.getElementById("settingsLink"),
};

let enabled = false;
let hostname = null;
let whitelist = [];
let status = null;
let pending = false;

function renderStatus() {
  const syncingFailed = status && !status.ok;
  els.body.dataset.state = pending ? "connecting" : (syncingFailed ? "error" : (enabled ? "on" : "off"));
  els.statusText.textContent = pending ? "Syncing" : (syncingFailed ? "Sync failed" : (enabled ? "Blocking" : "Paused"));
  els.detail.textContent = pending
    ? "Updating blocking rules"
    : syncingFailed
    ? "Blocking state could not be updated"
    : (enabled ? "Ads and trackers are blocked" : "Blocking is turned off");
  els.detail.classList.toggle("error", syncingFailed);
}

function renderWhitelist() {
  const matchingHost = hostname !== null
    ? whitelist.find((host) => hostname === host || hostname.endsWith(`.${host}`))
    : null;
  const listed = matchingHost !== null && matchingHost !== undefined;
  els.whitelist.disabled = hostname === null;
  els.whitelist.textContent = listed ? "Remove from whitelist" : "Whitelist this site";
}

async function synchronizeRules() {
  try {
    return await chrome.runtime.sendMessage({ type: "syncRules" });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to synchronize blocking rules",
      updatedAt: Date.now(),
    };
  }
}

async function readHostname() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab && tab.url ? tab.url : "");
    return url.protocol === "http:" || url.protocol === "https:" ? url.hostname : null;
  } catch (err) {
    return null;
  }
}

els.toggle.addEventListener("click", async () => {
  els.toggle.disabled = true;
  pending = true;
  status = null;
  renderStatus();
  enabled = !enabled;
  try {
    await chrome.storage.local.set({ enabled });
    status = await synchronizeRules();
  } catch (err) {
    status = { ok: false, error: "Unable to update blocking state", updatedAt: Date.now() };
  }
  pending = false;
  renderStatus();
  els.toggle.disabled = false;
});

els.whitelist.addEventListener("click", async () => {
  if (hostname === null) {
    return;
  }
  els.whitelist.disabled = true;
  pending = true;
  status = null;
  renderStatus();
  const matchingHost = whitelist.find((host) => (
    hostname === host || hostname.endsWith(`.${host}`)
  ));
  whitelist = matchingHost !== undefined
    ? whitelist.filter((host) => host !== matchingHost)
    : [...whitelist, hostname];
  try {
    await chrome.storage.local.set({ whitelist });
    status = await synchronizeRules();
  } catch (err) {
    status = { ok: false, error: "Unable to update whitelist", updatedAt: Date.now() };
  }
  pending = false;
  renderWhitelist();
  renderStatus();
});

els.settingsLink.addEventListener("click", (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: "chrome://settings/security" });
});

(async () => {
  const stored = await chrome.storage.local.get(["enabled", "whitelist"]);
  enabled = stored.enabled !== false;
  whitelist = Array.isArray(stored.whitelist) ? stored.whitelist : [];
  status = stored.status || null;
  hostname = await readHostname();
  renderStatus();
  renderWhitelist();
})();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.enabled) enabled = changes.enabled.newValue !== false;
  if (changes.whitelist) whitelist = Array.isArray(changes.whitelist.newValue)
    ? changes.whitelist.newValue
    : [];
  if (changes.status) status = changes.status.newValue;
  renderStatus();
  renderWhitelist();
});
