const STATIC_RULESET_ID = "meowpn_blocklist";
const ALLOW_PRIORITY = 2;
const RESOURCE_TYPES = [
  "main_frame", "sub_frame", "script", "image", "stylesheet",
  "xmlhttprequest", "media", "websocket", "ping", "font", "object", "other",
];
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

async function getState() {
  const stored = await chrome.storage.local.get(["enabled", "whitelist"]);
  const enabled = stored.enabled !== false;
  const whitelist = Array.isArray(stored.whitelist)
    ? stored.whitelist.filter((host) => typeof host === "string" && HOSTNAME_PATTERN.test(host))
    : [];
  return { enabled, whitelist };
}

let syncQueue = Promise.resolve();

function queueSync() {
  syncQueue = syncQueue.then(syncRules, syncRules);
  return syncQueue;
}

async function syncRules() {
  const { enabled, whitelist } = await getState();
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      [enabled ? "enableRulesetIds" : "disableRulesetIds"]: [STATIC_RULESET_ID],
    });

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map((rule) => rule.id);

    const addRules = enabled
      ? whitelist.map((host, index) => ({
          id: index + 1,
          priority: ALLOW_PRIORITY,
          action: { type: "allow" },
          condition: { initiatorDomains: [host], resourceTypes: RESOURCE_TYPES },
        }))
      : [];

    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
    await chrome.storage.local.set({ status: { ok: true, updatedAt: Date.now() } });
  } catch (err) {
    await chrome.storage.local.set({ status: { ok: false, error: String(err && err.message ? err.message : err), updatedAt: Date.now() } });
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.enabled || changes.whitelist)) {
    queueSync();
  }
});

chrome.runtime.onInstalled.addListener(() => queueSync());
chrome.runtime.onStartup.addListener(() => queueSync());

queueSync();
