// Light or dark before the first paint (the choice from Einstellungen → Darstellung, see
// src/components/theme/use-theme.ts).
(() => {
  let choice = null;
  try {
    choice = localStorage.getItem("sekretaer.theme");
  } catch {
    // Storage may be refused; then the device decides.
  }
  const dark =
    choice === "dark" || (choice !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.add(dark ? "dark" : "light");
})();
