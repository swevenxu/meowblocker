import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  OWNED_RULE_ID_START,
  buildWhitelistRules,
  getDynamicRulesUpdate,
  getRulesetUpdate,
  isOwnedRule,
  isWhitelisted,
  sanitizeWhitelist,
} from "../background-logic.js";

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("whitelist matching includes subdomains but not lookalike domains", () => {
  assert.equal(isWhitelisted("example.com", ["example.com"]), true);
  assert.equal(isWhitelisted("player.example.com", ["example.com"]), true);
  assert.equal(isWhitelisted("notexample.com", ["example.com"]), false);
});

test("whitelist rules are site-scoped and cover main frames and descendants", () => {
  const rules = buildWhitelistRules(["example.com"]);
  assert.equal(rules.length, 3);
  assert.deepEqual(rules[1].condition, {
    requestDomains: ["example.com"],
    resourceTypes: ["main_frame"],
  });
  assert.deepEqual(rules[2].condition, {
    initiatorDomains: ["example.com"],
    resourceTypes: ["sub_frame"],
  });
  assert.equal(rules[2].action.type, "allowAllRequests");
  assert.equal(rules.every((rule) => rule.id >= OWNED_RULE_ID_START), true);
  assert.deepEqual(buildWhitelistRules([]), []);
});

test("enable and disable operations update the complete MeowBlocker ruleset set", () => {
  assert.deepEqual(getRulesetUpdate(true), {
    enableRulesetIds: ["meowblocker_blocklist"],
    disableRulesetIds: [],
  });
  assert.deepEqual(getRulesetUpdate(false), {
    enableRulesetIds: [],
    disableRulesetIds: ["meowblocker_blocklist"],
  });
});

test("whitelist values are normalized and deduplicated", () => {
  assert.deepEqual(sanitizeWhitelist([" Example.COM ", "example.com", "bad value"]), ["example.com"]);
});

test("unchanged dynamic whitelist rules do not trigger an update", () => {
  const desired = buildWhitelistRules(["example.com"]);
  assert.deepEqual(getDynamicRulesUpdate(desired, desired, () => true), {
    removeRuleIds: [],
    addRules: [],
  });
});

test("dynamic whitelist updates recover stale or missing rules", () => {
  const desired = buildWhitelistRules(["example.com"]);
  const stale = buildWhitelistRules(["stale.example"]);
  const update = getDynamicRulesUpdate(stale, desired, () => true);
  assert.deepEqual(update.removeRuleIds, stale.map((rule) => rule.id));
  assert.deepEqual(update.addRules, desired);
  assert.deepEqual(
    getDynamicRulesUpdate([], desired, () => true),
    { removeRuleIds: [], addRules: desired }
  );
});

test("background synchronization coalesces requests and checks state before updating", () => {
  const source = read("background.js");
  assert.match(source, /if \(syncPromise\) return syncPromise/);
  assert.match(source, /getEnabledRulesets\(\)/);
  assert.match(source, /getDynamicRulesUpdate\(/);
  assert.match(source, /if \(update\.removeRuleIds\.length \|\| update\.addRules\.length\)/);
});

test("unchanged-rule comparison leaves unrelated dynamic rules untouched", () => {
  const desired = buildWhitelistRules(["example.com"]);
  const unrelated = {
    id: 900000,
    priority: 1,
    action: { type: "block" },
    condition: { urlFilter: "||example.invalid" },
  };
  assert.deepEqual(
    getDynamicRulesUpdate([unrelated, ...desired], desired, isOwnedRule),
    { removeRuleIds: [], addRules: [] }
  );
});

test("legacy and current whitelist rules are identifiable without claiming arbitrary rules", () => {
  const [legacy] = buildWhitelistRules(["example.com"]);
  assert.equal(isOwnedRule({
    ...legacy,
    id: 12,
    condition: {
      initiatorDomains: ["example.com"],
      resourceTypes: [
        "sub_frame", "script", "image", "stylesheet",
        "xmlhttprequest", "media", "websocket", "ping", "font", "object", "other",
      ],
    },
  }, []), true);
  assert.equal(isOwnedRule({
    ...legacy,
    id: 13,
    condition: {
      requestDomains: ["example.com"],
      resourceTypes: ["main_frame"],
    },
  }, []), true);
  assert.equal(isOwnedRule(legacy, [legacy.id]), true);
  assert.equal(isOwnedRule(buildWhitelistRules(["example.com"])[0]), true);
  assert.equal(isOwnedRule(buildWhitelistRules(["example.com"])[1]), true);
  assert.equal(isOwnedRule(buildWhitelistRules(["example.com"])[2]), true);
  assert.equal(isOwnedRule({
    ...legacy,
    id: 14,
    action: { type: "block" },
  }, []), false);
});

test("cosmetic filtering is scoped and idempotent", () => {
  const source = read("content.js");
  assert.match(source, /meowblocker-cosmetic-filters/);
  assert.match(source, /chrome\.storage\.onChanged/);
  assert.match(source, /stored\.enabled !== false/);
  assert.match(source, /document\.getElementById\(STYLE_ID\)/);
  assert.doesNotMatch(source, /\.ez-video-wrap/);
});

test("test-page cosmetic selectors are scoped and cover dynamic elements", () => {
  const source = read("content.js");
  assert.match(source, /"\.adbox\.banner_ads\.adsbox"/);
  assert.match(source, /"\.textads"/);
  assert.match(source, /hostname === "adblock\.turtlecute\.org"/);
  assert.match(source, /selectors\.concat\(testPageSelectors\)/);
  assert.match(source, /display: none !important/);
});

test("popup removes the matching parent-domain whitelist entry from subdomains", () => {
  const source = read("popup.js");
  assert.match(source, /whitelist\.find/);
  assert.match(source, /whitelist\.filter\(\(host\) => host !== matchingHost\)/);
  assert.match(source, /pending = true/);
  assert.match(source, /Updating blocking rules/);
  assert.match(source, /matchingHost !== null && matchingHost !== undefined/);
});

test("reject unscoped global third-party blocking rules", () => {
  const rules = JSON.parse(read("rules.json"));
  rules.forEach((rule) => {
    if (
      rule.action.type === "block" &&
      rule.condition?.domainType === "thirdParty" &&
      !hasMeaningfulScope(rule)
    ) {
      assert.fail(
        `Rule ${rule.id} blocks third-party requests without meaningful positive scope.`
      );
    }
  });
});

test("reject third-party blocks scoped only by excluded initiators", () => {
  assert.equal(hasMeaningfulScope({
    id: 987654,
    action: { type: "block" },
    condition: { domainType: "thirdParty" },
  }), false);
  assert.equal(hasMeaningfulScope({
    id: 987655,
    action: { type: "block" },
    condition: {
      domainType: "thirdParty",
      excludedInitiatorDomains: ["example.com"],
    },
  }), false);
  assert.equal(hasMeaningfulScope({
    id: 987656,
    action: { type: "block" },
    condition: {
      domainType: "thirdParty",
      requestDomains: ["ads.example"],
    },
  }), true);
});

test("player compatibility rules do not block whole player services", () => {
  const rules = JSON.parse(read("rules.json"));
  const rule2 = rules.find((rule) => rule.id === 2);
  const blockedPlayerDomains = [
    "cdn.ex.co",
    "embed.ex.co",
    "player.avplayer.com",
    "player.ex.co",
    "player.sendtonews.com",
    "slickstream.com",
  ];
  assert.ok(rule2);
  assert.equal(
    blockedPlayerDomains.some((domain) => rule2.condition.requestDomains.includes(domain)),
    false
  );
  assert.equal(rules.some((rule) => [19, 46, 117].includes(rule.id)), false);
  assert.deepEqual(rules.find((rule) => rule.id === 13452), {
    id: 13452,
    priority: 40,
    action: { type: "block" },
    condition: {
      initiatorDomains: ["kotaku.com"],
      requestDomains: ["imasdk.googleapis.com"],
      resourceTypes: ["sub_frame"],
    },
  });
});

test("upload exceptions remain narrow and higher priority than ad filters", () => {
  const rules = JSON.parse(read("rules.json"));
  for (const [id, domain, resourceTypes] of [
    [20002, "chatgpt.com", ["xmlhttprequest"]],
    [20003, "files.oaiusercontent.com", ["xmlhttprequest", "image"]],
  ]) {
    const rule = rules.find((candidate) => candidate.id === id);
    assert.ok(rule);
    assert.equal(rule.priority, 30);
    assert.deepEqual(rule.action, { type: "allow" });
    assert.deepEqual(rule.condition, {
      requestDomains: [domain],
      resourceTypes,
    });
  }
});

test("known popunder scripts are blocked without blanket popup interception", () => {
  const rules = JSON.parse(read("rules.json"));
  const popunderBlocks = rules.filter((rule) => (
    rule.action?.type === "block" &&
    rule.condition?.resourceTypes?.length === 1 &&
    rule.condition.resourceTypes[0] === "script" &&
    [
      "||openlua.cloud/jquery.popunder.js",
      "||openlua.cloud/exitpopup.js",
    ].includes(rule.condition.urlFilter)
  ));
  assert.equal(popunderBlocks.length, 2);
  assert.equal(popunderBlocks.every((rule) => rule.priority > 30), true);
  assert.equal(popunderBlocks.every((rule) => rule.condition.domainType === "firstParty"), true);

  const content = read("content.js");
  assert.doesNotMatch(content, /window\.open|window\.close|addEventListener\(["']click/);
});

test("target ad test scripts and tracker hosts are narrowly blocked", () => {
  const rules = JSON.parse(read("rules.json"));
  const scriptRules = rules.filter((rule) => (
    rule.action?.type === "block" &&
    rule.condition?.requestDomains?.length === 1 &&
    rule.condition.requestDomains[0] === "adblock.turtlecute.org" &&
    rule.condition.resourceTypes?.length === 1 &&
    rule.condition.resourceTypes[0] === "script"
  ));
  assert.deepEqual(
    scriptRules.map((rule) => rule.condition.urlFilter).sort(),
    [
      "||adblock.turtlecute.org/js/pagead.js",
      "||adblock.turtlecute.org/js/widget/ads.js",
    ].sort()
  );
  const trackerRules = rules.filter((rule) => (
    rule.action?.type === "block" &&
    rule.condition?.requestDomains?.length === 1 &&
    [
      "analyticsengine.s3.amazonaws.com",
      "analytics.s3.amazonaws.com",
    ].includes(rule.condition.requestDomains[0])
  ));
  assert.equal(trackerRules.length, 2);
  assert.equal(rules.some((rule) => (
    rule.action?.type === "block" &&
    rule.condition?.requestDomains?.length === 1 &&
    rule.condition.requestDomains[0] === "amazonaws.com" &&
    !rule.condition.initiatorDomains?.length
  )), false);
  assert.equal(rules.some((rule) => (
    rule.action?.type === "block" &&
    rule.condition?.resourceTypes?.length === 1 &&
    rule.condition.resourceTypes[0] === "script" &&
    !rule.condition.urlFilter &&
    !rule.condition.regexFilter &&
    !rule.condition.requestDomains &&
    !rule.condition.initiatorDomains
  )), false);
});

function hasMeaningfulScope(rule) {
  const condition = rule.condition;
  return Boolean(
    condition.urlFilter ||
    condition.regexFilter ||
    condition.requestDomains?.length ||
    condition.initiatorDomains?.length ||
    condition.resourceTypes?.length
  );
}

test("all manifest rule resources exist and static rule ids are unique", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const ids = new Set();
  for (const resource of manifest.declarative_net_request.rule_resources) {
    assert.equal(ids.has(resource.id), false);
    ids.add(resource.id);
    const rules = JSON.parse(read(resource.path));
    const ruleIds = rules.map((rule) => rule.id);
    assert.equal(new Set(ruleIds).size, ruleIds.length);
  }
});
