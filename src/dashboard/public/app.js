/* Volt — bibliothèque partagée du dashboard Fusion Bot. */
"use strict";

const App = (() => {
  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: "same-origin", ...opts });
    if (r.status === 401) { location.href = "/"; return null; }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ("Erreur " + r.status));
    return data;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function toast(msg, kind = "") {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast " + kind;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 320); }, 2600);
  }

  function toggle(on, onChange) {
    const b = document.createElement("button");
    b.className = "tgl";
    b.type = "button";
    b.setAttribute("role", "switch");
    b.setAttribute("aria-checked", on ? "true" : "false");
    b.innerHTML = '<span class="tr"></span><span class="th"></span>';
    b.addEventListener("click", () => {
      const v = b.getAttribute("aria-checked") !== "true";
      b.setAttribute("aria-checked", v ? "true" : "false");
      onChange(v, () => b.setAttribute("aria-checked", !v ? "true" : "false"));
    });
    return b;
  }

  function skeleton(n, h = 64) {
    let s = "";
    for (let i = 0; i < n; i++) s += `<div class="sk" style="height:${h}px;margin-bottom:10px"></div>`;
    return s;
  }

  function iconUrl(id, icon) {
    return icon ? `https://cdn.discordapp.com/icons/${id}/${icon}.png?size=128` : null;
  }

  // Bottom sheet (mobile) / modal (desktop)
  function sheet(title, sub) {
    const scrim = document.createElement("div");
    scrim.className = "scrim";
    const el = document.createElement("div");
    el.className = "sheet";
    el.setAttribute("role", "dialog");
    el.innerHTML = `<div class="sheet-h"><h3></h3><p></p></div><div class="sheet-b"></div>`;
    el.querySelector("h3").textContent = title;
    el.querySelector("p").textContent = sub || "";
    document.body.append(scrim, el);
    requestAnimationFrame(() => requestAnimationFrame(() => { scrim.classList.add("open"); el.classList.add("open"); }));
    const close = () => {
      scrim.classList.remove("open"); el.classList.remove("open");
      setTimeout(() => { scrim.remove(); el.remove(); }, 300);
    };
    scrim.addEventListener("click", close);
    return { body: el.querySelector(".sheet-b"), close, setTitle: t => el.querySelector("h3").textContent = t };
  }

  return { api, esc, toast, toggle, skeleton, iconUrl, sheet };
})();
