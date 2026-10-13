/* Helpers partagés du dashboard Fusion */

// Appel API JSON. Redirige vers / si la session a expiré (401).
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
  if (!res.ok) {
    throw new Error(data.error || `Erreur ${res.status}`);
  }
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

function guildIconHtml(guild, sizeClass = "") {
  if (guild.icon) {
    return `<img src="${guild.icon}" alt="" class="${sizeClass}">`;
  }
  const letter = (guild.name || "?").charAt(0).toUpperCase();
  return `<div class="guild-fallback ${sizeClass}">${letter}</div>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Charge le chip utilisateur (header). Masque le bouton login si connecté.
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
    chip.innerHTML = `<img src="${me.avatar}" alt=""><span>${escapeHtml(me.username)}</span>
      <a class="btn" href="/logout" style="padding:6px 12px;font-size:0.85rem;">Déconnexion</a>`;
  }
  return me;
}
