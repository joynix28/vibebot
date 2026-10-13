/* ═══════════════════════════════════════════════════════════
   FUSION BOT — app.js · bibliothèque partagée du dashboard
   Helpers utilisés par dashboard.html et guild.html
   ═══════════════════════════════════════════════════════════ */
"use strict";

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

/** Échappe le HTML (anti-XSS sur les noms Discord). */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Appel API JSON. Redirige vers /login si session expirée (401). */
async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (res.status === 401) { window.location.href = "/login"; return null; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ("Erreur " + res.status));
  return data;
}

/** Toast de notification (ok=true → vert, false → rouge). */
function toast(msg, ok = true) {
  let box = $("#toasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "toasts";
    document.body.appendChild(box);
  }
  const t = document.createElement("div");
  t.className = "toast " + (ok ? "ok" : "err");
  const icon = document.createElement("span");
  icon.className = "ti";
  icon.textContent = ok ? "✅" : "⚠️";
  const label = document.createElement("span");
  label.textContent = msg;
  t.appendChild(icon); t.appendChild(label);
  box.appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, 2600);
}

/** Debounce : retarde l'exécution jusqu'à  ms sans nouvel appel. */
function debounce(fn, ms) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Icône de serveur (image Discord ou initiale). */
function guildIconHTML(g, cls) {
  const c = "guild-icon" + (cls ? " " + cls : "");
  if (g && g.icon) return '<span class="' + c + '"><img src="' + esc(g.icon) + '" alt="" loading="lazy"></span>';
  const init = ((g && g.name) || "?").trim().charAt(0).toUpperCase();
  return '<span class="' + c + '">' + esc(init) + "</span>";
}

/** Toggle switch iOS animé pour activer/désactiver un module. */
function switchHTML(mid, on) {
  return '<label class="switch"><input type="checkbox" data-toggle="' + esc(mid) + '"' +
    (on ? " checked" : "") + ' aria-label="Activer / désactiver"><span class="track"></span></label>';
}
