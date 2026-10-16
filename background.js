const STATIC_RULESET_ID = "meowpn_blocklist";
const ALLOW_PRIORITY = 2;

async function getState() {
  const { enabled = false, whitelist = [] } = await chrome.storage.local.get([
    "enabled",
    "whitelist",
  ]);
  return { enabled, whitelist };
}

async function syncRules() {
  const { enabled, whitelist } = await getState();

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
        condition: {
          initiatorDomains: [host],
          resourceTypes: [
            "main_frame", "sub_frame", "script", "image", "stylesheet",
            "xmlhttprequest", "media", "websocket", "ping", "font", "object", "other",
          ],
        },
      }))
    : [];

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules,
  });
}

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") {
    syncRules();
  }
});

chrome.runtime.onInstalled.addListener(syncRules);
chrome.runtime.onStartup.addListener(syncRules);

syncRules();