import {
  buildWhitelistRules,
  getRulesetUpdate,
  isOwnedRule,
  sanitizeWhitelist,
} from "./background-logic.js";

async function getState() {
  const stored = await chrome.storage.local.get(["enabled", "whitelist", "ownedDynamicRuleIds"]);
  return {
    enabled: stored.enabled !== false,
    whitelist: sanitizeWhitelist(stored.whitelist),
    ownedDynamicRuleIds: Array.isArray(stored.ownedDynamicRuleIds)
      ? stored.ownedDynamicRuleIds.filter((id) => Number.isInteger(id))
      : [],
  };
}

let syncQueue = Promise.resolve();

function safeErrorMessage(err) {
  const message = err instanceof Error ? err.message : "Unable to synchronize blocking rules";
  return message.replace(/https?:\/\/\S+/gi, "[url]").slice(0, 200);
}

function queueSync() {
  syncQueue = syncQueue.then(syncRules, syncRules);
  return syncQueue;
}

async function syncRules() {
  try {
    const { enabled, whitelist, ownedDynamicRuleIds } = await getState();
    await chrome.declarativeNetRequest.updateEnabledRulesets(getRulesetUpdate(enabled));

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const ownedRules = existing.filter((rule) => isOwnedRule(rule, ownedDynamicRuleIds));
    const addRules = enabled ? buildWhitelistRules(whitelist) : [];

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ownedRules.map((rule) => rule.id),
      addRules,
    });
    const status = { ok: true, updatedAt: Date.now() };
    await chrome.storage.local.set({
      ownedDynamicRuleIds: addRules.map((rule) => rule.id),
      status,
    });
    return status;
  } catch (err) {
    const status = {
      ok: false,
      error: safeErrorMessage(err),
      updatedAt: Date.now(),
    };
    await chrome.storage.local.set({ status });
    return status;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "syncRules") return false;
  queueSync().then(sendResponse, () => sendResponse({
    ok: false,
    error: "Unable to synchronize blocking rules",
    updatedAt: Date.now(),
  }));
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.enabled || changes.whitelist)) {
    queueSync();
  }
});

chrome.runtime.onInstalled.addListener(() => queueSync());
chrome.runtime.onStartup.addListener(() => queueSync());

queueSync();
