export const STATIC_RULESET_IDS = ["meowblocker_blocklist"];
export const OWNED_RULE_ID_START = 1000000;
export const OWNED_RULE_ID_END = 1300000;
export const WHITELIST_RESOURCE_TYPES = [
  "sub_frame", "script", "image", "stylesheet",
  "xmlhttprequest", "media", "websocket", "ping", "font", "object", "other",
];
const LEGACY_RESOURCE_TYPES = [
  "sub_frame", "script", "image", "stylesheet",
  "xmlhttprequest", "media", "websocket", "ping", "font", "object", "other",
];
export const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

export function getRulesetUpdate(enabled) {
  return {
    enableRulesetIds: enabled ? STATIC_RULESET_IDS : [],
    disableRulesetIds: enabled ? [] : STATIC_RULESET_IDS,
  };
}

export function normalizeHostname(host) {
  if (typeof host !== "string") return null;
  const normalized = host.trim().toLowerCase().replace(/\.+$/, "");
  return HOSTNAME_PATTERN.test(normalized) ? normalized : null;
}

export function isWhitelisted(hostname, whitelist) {
  const host = normalizeHostname(hostname);
  return host !== null && whitelist.some((entry) => {
    const normalized = normalizeHostname(entry);
    return normalized !== null && (host === normalized || host.endsWith(`.${normalized}`));
  });
}

export function buildWhitelistRules(whitelist) {
  return whitelist.flatMap((host, index) => {
    const baseId = OWNED_RULE_ID_START + index * 3;
    return [
      {
        id: baseId,
        priority: 100,
        action: { type: "allow" },
        condition: { initiatorDomains: [host], resourceTypes: WHITELIST_RESOURCE_TYPES },
      },
      {
        id: baseId + 1,
        priority: 101,
        action: { type: "allow" },
        condition: { requestDomains: [host], resourceTypes: ["main_frame"] },
      },
      {
        id: baseId + 2,
        priority: 102,
        action: { type: "allowAllRequests" },
        condition: { initiatorDomains: [host], resourceTypes: ["sub_frame"] },
      },
    ];
  });
}

export function sanitizeWhitelist(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeHostname).filter(Boolean))];
}

export function isOwnedRule(rule, storedIds = []) {
  if (storedIds.includes(rule.id)) return true;
  if (rule.id < OWNED_RULE_ID_START) {
    const condition = rule.condition;
    const resourceTypes = condition?.resourceTypes;
    const isLegacyResourceRule = rule.action?.type === "allow"
      && Array.isArray(condition?.initiatorDomains)
      && condition.initiatorDomains.length === 1
      && Array.isArray(resourceTypes)
      && resourceTypes.length === LEGACY_RESOURCE_TYPES.length
      && LEGACY_RESOURCE_TYPES.every((type) => resourceTypes.includes(type));
    const isLegacyMainFrameRule = rule.action?.type === "allow"
      && Array.isArray(condition?.requestDomains)
      && condition.requestDomains.length === 1
      && Array.isArray(resourceTypes)
      && resourceTypes.length === 1
      && resourceTypes[0] === "main_frame";
    return isLegacyResourceRule || isLegacyMainFrameRule;
  }
  return rule.id >= OWNED_RULE_ID_START
    && rule.id < OWNED_RULE_ID_END
    && (rule.action?.type === "allow" || rule.action?.type === "allowAllRequests")
    && Array.isArray(rule.condition?.initiatorDomains)
    && rule.condition.initiatorDomains.length === 1
    && Array.isArray(rule.condition?.resourceTypes)
    && rule.condition.resourceTypes.length === 1
    && rule.condition.resourceTypes[0] === "sub_frame";
}
