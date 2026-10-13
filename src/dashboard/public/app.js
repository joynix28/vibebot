/* Helpers partagés du dashboard Fusion */

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = "/";
    return null;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ("Erreur " + res.status));
  return data;
}

function toast(msg, kind = "") {
  const box = document.getElementById("toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast" + (kind ? " " + kind : "");
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 0.3s";
    setTimeout(() => el.remove(), 320);
  }, 3400);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function guildIconHtml(g, cls) {
  const c = "guild-fb" + (cls ? " " + cls : "");
  if (g && g.icon) return `<img src="${g.icon}" alt="" class="${cls || ""}">`;
  const letter = ((g && g.name) || "?").charAt(0).toUpperCase();
  return `<div class="${c}">${esc(letter)}</div>`;
}

async function loadUserChip() {
  const me = await api("/api/me").catch(() => null);
  const loginBtn = document.getElementById("login-btn");
  const chip = document.getElementById("user-chip");
  if (!me) {
    if (loginBtn) loginBtn.style.display = "";
    if (chip) chip.style.display = "none";
    return null;
  }
  if (loginBtn) loginBtn.style.display = "none";
  if (chip) {
    chip.style.display = "flex";
    chip.innerHTML =
      `<img src="${me.avatar}" alt="">` +
      `<span>${esc(me.username)}</span>` +
      `<a class="logout" href="/logout">Déconnexion</a>`;
  }
  return me;
}

/* Skeletons de chargement */
function skel(n, h) {
  let s = "";
  for (let i = 0; i < n; i++) s += `<div class="skel" style="height:${h || 64}px"></div>`;
  return s;
}
