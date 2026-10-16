import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  OWNED_RULE_ID_START,
  buildWhitelistRules,
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

test("enable and disable operations update the complete MeowPN ruleset set", () => {
  assert.deepEqual(getRulesetUpdate(true), {
    enableRulesetIds: ["meowpn_blocklist"],
    disableRulesetIds: [],
  });
  assert.deepEqual(getRulesetUpdate(false), {
    enableRulesetIds: [],
    disableRulesetIds: ["meowpn_blocklist"],
  });
});

test("whitelist values are normalized and deduplicated", () => {
  assert.deepEqual(sanitizeWhitelist([" Example.COM ", "example.com", "bad value"]), ["example.com"]);
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
  assert.equal(isOwnedRule({
    ...legacy,
    id: 14,
    action: { type: "block" },
  }, []), false);
});

test("cosmetic filtering is scoped and idempotent", () => {
  const source = read("content.js");
  assert.match(source, /meowpn-cosmetic-filters/);
  assert.match(source, /chrome\.storage\.onChanged/);
  assert.match(source, /stored\.enabled !== false/);
  assert.match(source, /document\.getElementById\(STYLE_ID\)/);
  assert.doesNotMatch(source, /\.ez-video-wrap/);
});

test("popup removes the matching parent-domain whitelist entry from subdomains", () => {
  const source = read("popup.js");
  assert.match(source, /whitelist\.find/);
  assert.match(source, /whitelist\.filter\(\(host\) => host !== matchingHost\)/);
  assert.match(source, /pending = true/);
  assert.match(source, /Updating blocking rules/);
  assert.match(source, /matchingHost !== null && matchingHost !== undefined/);
});

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
