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

function renderStatus() {
  els.body.dataset.state = enabled ? "on" : "off";
  els.statusText.textContent = enabled ? "Blocking" : "Paused";
  els.detail.textContent = enabled ? "Ads and trackers are blocked" : "Blocking is turned off";
}

function renderWhitelist() {
  const listed = hostname !== null && whitelist.includes(hostname);
  els.whitelist.disabled = hostname === null;
  els.whitelist.textContent = listed ? "Remove from whitelist" : "Whitelist this site";
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
  enabled = !enabled;
  await chrome.storage.local.set({ enabled });
  renderStatus();
});

els.whitelist.addEventListener("click", async () => {
  if (hostname === null) {
    return;
  }
  whitelist = whitelist.includes(hostname)
    ? whitelist.filter((host) => host !== hostname)
    : [...whitelist, hostname];
  await chrome.storage.local.set({ whitelist });
  renderWhitelist();
});

els.settingsLink.addEventListener("click", (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: "chrome://settings/security" });
});

(async () => {
  const stored = await chrome.storage.local.get(["enabled", "whitelist"]);
  enabled = Boolean(stored.enabled);
  whitelist = Array.isArray(stored.whitelist) ? stored.whitelist : [];
  hostname = await readHostname();
  renderStatus();
  renderWhitelist();
})();
