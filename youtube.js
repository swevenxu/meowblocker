(function () {
  const STYLE_ID = "meowblocker-youtube-cosmetic-filters";
  const YOUTUBE_HOSTS = ["youtube.com", "youtube-nocookie.com"];
  const cosmeticSelectors = [
    "ytd-display-ad-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-promoted-video-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-ad-slot-renderer",
    "ytd-banner-promo-renderer",
    "ytd-merch-shelf-renderer",
    "ytd-video-masthead-ad-v3-renderer",
    "#player-ads",
    ".ytp-ad-overlay-container",
    ".ytp-ad-overlay-slot",
  ];
  const skipSelectors = [
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-slot",
  ];

  const hostname = location.hostname.toLowerCase().replace(/\.+$/, "");
  if (!YOUTUBE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    return;
  }

  let observer = null;
  let syncVersion = 0;
  let skipQueued = false;

  function isWhitelisted(whitelist) {
    return whitelist.some((entry) => (
      hostname === entry || hostname.endsWith(`.${entry}`)
    ));
  }

  function applyCosmeticFilters() {
    if (!document.head || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = cosmeticSelectors
      .map((selector) => `${selector} { display: none !important; }`)
      .join("\n");
    document.head.appendChild(style);
  }

  function removeCosmeticFilters() {
    document.getElementById(STYLE_ID)?.remove();
  }

  function clickSkipButton() {
    skipQueued = false;
    const player = document.querySelector("#movie_player");
    if (!player || !player.classList.contains("ad-showing")) return;
    const button = player.querySelector(skipSelectors.join(","));
    if (button instanceof HTMLElement && !button.disabled) {
      button.click();
    }
  }

  function queueSkipButtonCheck() {
    if (skipQueued) return;
    skipQueued = true;
    queueMicrotask(clickSkipButton);
  }

  function startPlayerObserver() {
    if (observer || !document.body) return;
    const player = document.querySelector("#movie_player");
    if (!player) return;
    observer = new MutationObserver(queueSkipButtonCheck);
    observer.observe(player, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    queueSkipButtonCheck();
  }

  function restartPlayerObserver() {
    observer?.disconnect();
    observer = null;
    startPlayerObserver();
  }

  async function syncYouTubeFilters() {
    const version = ++syncVersion;
    const stored = await chrome.storage.local.get(["enabled", "whitelist"]);
    if (version !== syncVersion) return;
    const whitelist = Array.isArray(stored.whitelist)
      ? stored.whitelist.filter((entry) => typeof entry === "string")
      : [];
    if (stored.enabled !== false && !isWhitelisted(whitelist)) {
      applyCosmeticFilters();
      startPlayerObserver();
    } else {
      removeCosmeticFilters();
      observer?.disconnect();
      observer = null;
    }
  }

  document.addEventListener("yt-navigate-finish", restartPlayerObserver);
  window.addEventListener("popstate", restartPlayerObserver);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.enabled || changes.whitelist)) {
      syncYouTubeFilters();
    }
  });

  syncYouTubeFilters();
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", syncYouTubeFilters, { once: true });
  }
})();
