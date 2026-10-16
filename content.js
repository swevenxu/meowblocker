(function () {
  const STYLE_ID = "meowpn-cosmetic-filters";
  const selectors = [
    ".ads_all > .ads_w",
    "body > #js-adContainer.adBlock",
    "#mobile-adhesion:not(#style_important)",
    "#ad-300x250_mid_mobile",
    ".sp_ad_box_top",
    ".happy-header-mobile",
    ".standard-article-vertical-ad",
    ".header-ad-mobile",
    ".under-player-ad-mobile",
    ".california-sticky-footer-ad-container",
    ".happy-under-player-mobile",
    ".b-mobile-spots",
    "#ad_inview_area",
    "#mgid_iframe1",
    ".amp_ad",
    "#ad-300x250_mobile"
  ];

  const hostname = location.hostname;
  let syncVersion = 0;
  const isWhitelisted = (whitelist) => whitelist.some((entry) => (
    hostname === entry || hostname.endsWith(`.${entry}`)
  ));

  function removeFilters() {
    document.getElementById(STYLE_ID)?.remove();
  }

  function applyFilters() {
    if (!document.head || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = selectors.map((sel) => `${sel} { display: none !important; }`).join("\n");
    document.head.appendChild(style);
  }

  async function syncFilters() {
    const version = ++syncVersion;
    const stored = await chrome.storage.local.get(["enabled", "whitelist"]);
    if (version !== syncVersion) return;
    const whitelist = Array.isArray(stored.whitelist)
      ? stored.whitelist.filter((entry) => typeof entry === "string")
      : [];
    if (stored.enabled !== false && !isWhitelisted(whitelist)) {
      applyFilters();
    } else {
      removeFilters();
    }
  }

  syncFilters();
  if (!document.head) {
    document.addEventListener("DOMContentLoaded", syncFilters, { once: true });
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.enabled || changes.whitelist)) {
      syncFilters();
    }
  });
})();
