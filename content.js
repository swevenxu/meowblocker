// MeowPN Content Script: Cosmetic filtering
// Hides ad elements using selectors from uBlock Origin Lite generic rules.

(function () {
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

  const head = document.head || document.getElementsByTagName("head")[0];
  if (!head) return;

  const style = document.createElement("style");
  style.type = "text/css";
  const css = selectors.map((sel) => sel + " { display: none !important; }").join("\n");
  style.appendChild(document.createTextNode(css));
  head.appendChild(style);
})();
