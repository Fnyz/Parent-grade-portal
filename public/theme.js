// Applies the saved theme before the page paints, so a dark choice never
// flashes light first. A plain script file because the content policy blocks
// inline scripts. Kept in step with web/lib/theme.ts.
(function () {
  try {
    var t = localStorage.getItem("pgp-theme");
    var dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) { /* no storage: stay light */ }
})();
