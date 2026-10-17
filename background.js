import {
  buildWhitelistRules,
  getRulesetUpdate,
  getDynamicRulesUpdate,
  isOwnedRule,
  sanitizeWhitelist,
  STATIC_RULESET_IDS,
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

let syncPromise = null;

function safeErrorMessage(err) {
  const message = err instanceof Error ? err.message : "Unable to synchronize blocking rules";
  return message.replace(/https?:\/\/\S+/gi, "[url]").slice(0, 200);
}

function queueSync() {
  if (syncPromise) return syncPromise;
  syncPromise = syncRules().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

async function syncRules() {
  try {
    const { enabled, whitelist, ownedDynamicRuleIds } = await getState();
    const enabledRulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
    const rulesetEnabled = enabledRulesets.some(({ id }) => STATIC_RULESET_IDS.includes(id));
    if (rulesetEnabled !== enabled) {
      await chrome.declarativeNetRequest.updateEnabledRulesets(getRulesetUpdate(enabled));
    }

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const addRules = enabled ? buildWhitelistRules(whitelist) : [];

    const update = getDynamicRulesUpdate(
      existing,
      addRules,
      (rule) => isOwnedRule(rule, ownedDynamicRuleIds)
    );
    if (update.removeRuleIds.length || update.addRules.length) {
      await chrome.declarativeNetRequest.updateDynamicRules(update);
    }
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
