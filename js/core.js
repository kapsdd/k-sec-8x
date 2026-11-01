/* KOVCHEGG-SECURE // core */
(function () {
  "use strict";

  const FRAG_KEY = "kovchegg_fragments_v1";
  const ALL_KEYS = [
    "kovchegg_fragments_v1",
    "kovchegg_phase2_v1",
    "kovchegg_phase1_ok",
    "kovchegg_vault_opened",
  ];
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ?nosave — режим теста: всё пишется в sessionStorage (живёт внутри
     вкладки), в localStorage ничего не остаётся. Закрыл вкладку —
     прогресс исчез. Твой прогресс не перейдёт к Фиджи. */
  const NOSAVE = /(?:\?|&|#)nosave\b/.test(location.href);
  const backing = NOSAVE ? window.sessionStorage : window.localStorage;
  const store = {
    getItem(k) {
      try {
        return backing.getItem(k);
      } catch (_) {
        return null;
      }
    },
    setItem(k, v) {
      try {
        backing.setItem(k, String(v));
      } catch (_) {}
    },
    removeItem(k) {
      try {
        backing.removeItem(k);
      } catch (_) {}
      if (NOSAVE) {
        try {
          localStorage.removeItem(k);
        } catch (_) {}
      }
    },
    clear() {
      ALL_KEYS.forEach((k) => {
        try {
          backing.removeItem(k);
        } catch (_) {}
        try {
          localStorage.removeItem(k);
        } catch (_) {}
      });
    },
  };

  function resetAll() {
    store.clear();
    renderHUD();
    return "архив сброшен. можно начинать заново.";
  }

  /* ---------------- fragments store ---------------- */
  function readFragments() {
    try {
      const raw = store.getItem(FRAG_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function saveFragment(slot, value) {
    const all = readFragments();
    all[slot] = value;
    store.setItem(FRAG_KEY, JSON.stringify(all));
    renderHUD();
  }

  function hasFragment(slot) {
    return Boolean(readFragments()[slot]);
  }

  /* ---------------- HUD ---------------- */
  function renderHUD() {
    const root = document.querySelector("[data-hud]");
    if (!root) return;
    const all = readFragments();
    const total = Number(root.dataset.total || 8);
    let slots = "";
    for (let i = 1; i <= total; i++) {
      const v = all[i];
      slots += `<span class="hud-slot ${v ? "on" : ""}" title="${v ? "слот " + i + ": " + escapeHtml(v) : "слот " + i + ": пуст"}">${i}${v ? "*" : ""}</span>`;
    }
    root.innerHTML =
      `<span class="hud-label">Протокол доступа</span>` +
      `<span class="hud-slots">${slots}</span>` +
      (NOSAVE
        ? `<span class="tag hot">TEST MODE · без сохранения</span>`
        : "") +
      `<a href="vault.html">Хранилище</a>` +
      `<a href="index.html">Терминал</a>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  /* ---------------- answer checking ---------------- */
  function normalize(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[`"'«»]/g, "")
      .replace(/\s+/g, " ");
  }

  /* FNV-1a 32-bit — чтобы коды фазы 2 не светились в исходниках */
  function hash1a(s) {
    const t = normalize(s).replace(/[\s-]+/g, "");
    let h = 0x811c9dc5;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function bindSolve(formSel, accepted, onSuccess) {
    const form = document.querySelector(formSel);
    if (!form) return;
    const input = form.querySelector("input, textarea");
    const fb = document.querySelector(form.dataset.feedback || "#feedback");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = normalize(input && input.value);
      const ok = accepted.map(normalize).some((a) => a === val);
      if (ok) {
        if (fb) {
          fb.className = "feedback show good";
        }
        onSuccess(input ? input.value.trim() : "");
      } else {
        if (fb) {
          fb.className = "feedback show bad";
          fb.textContent = pick([
            "ОТВЕТ НЕ ПРИНЯТ // проверь раскладку и регистр не важен, смысл важен.",
            "ДОСТУП ОТКЛОНЁН // это не тот ключ.",
            "МАТРИЦА СОПРОТИВЛЯЕТСЯ // подумай ещё раз или открой подсказку.",
          ]);
        }
        if (input) input.select();
      }
    });
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* ---------------- fragment reveal ---------------- */
  function revealFragment(slot, value, extraHtml) {
    saveFragment(slot, value);
    const box = document.querySelector("[data-frag]");
    if (!box) return;
    box.innerHTML =
      `<div class="label">Фрагмент протокола [слот ${slot} / 8]</div>` +
      `<div class="frag-value">${escapeHtml(value)}</div>` +
      `<p class="dim">Фрагмент сохранён в панели протокола. Собери все восемь — и хранилище откроется.</p>` +
      (extraHtml || "");
    box.classList.add("show");
    box.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center" });
  }

  /* ---------------- hints ---------------- */
  function bindHints() {
    document.querySelectorAll("[data-hint]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.hint;
        const body = document.querySelector(`[data-hint-body="${id}"]`);
        if (body) {
          body.classList.toggle("show");
          btn.textContent = body.classList.contains("show") ? "Скрыть подсказку" : btn.dataset.label || "Подсказка";
        }
      });
    });
  }

  /* ---------------- typewriter ---------------- */
  function typewriter(el, lines, done) {
    if (!el) return;
    if (REDUCED) {
      el.innerHTML = lines.join("\n");
      if (done) done();
      return;
    }
    let i = 0;
    el.innerHTML = "";
    function nextLine() {
      if (i >= lines.length) {
        if (done) done();
        return;
      }
      const div = document.createElement("div");
      div.className = "line " + (lines[i].cls || "");
      el.appendChild(div);
      const text = lines[i].text !== undefined ? lines[i].text : lines[i];
      let j = 0;
      const speed = 8;
      (function tick() {
        div.textContent = text.slice(0, j);
        j++;
        if (j <= text.length) {
          setTimeout(tick, speed);
        } else {
          i++;
          setTimeout(nextLine, 90);
        }
      })();
      el.scrollTop = el.scrollHeight;
    }
    nextLine();
  }

  /* ---------------- matrix rain ---------------- */
  function initRain() {
    const canvas = document.getElementById("rain");
    if (!canvas || REDUCED) return;
    const ctx = canvas.getContext("2d");
    let w, h, cols, drops;
    const chars = "КОВЧЕГГ01<>/{}[]#*+=$АБВГДЕABCDEF010101".split("");
    const fontSize = 14;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      cols = Math.floor(w / fontSize);
      drops = Array(cols).fill(0).map(() => Math.random() * -50);
    }
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      ctx.fillStyle = "rgba(4, 10, 6, 0.12)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#33ff66";
      ctx.font = fontSize + "px monospace";
      for (let i = 0; i < drops.length; i++) {
        const c = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(c, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > h && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      requestAnimationFrame(draw);
    }
    draw();
  }

  /* ---------------- glitch title ---------------- */
  function initGlitch() {
    if (REDUCED) return;
    document.querySelectorAll(".glitch[data-text]").forEach((el) => {
      let n = 0;
      setInterval(() => {
        n++;
        el.style.transform = n % 4 === 0 ? "translateX(1px)" : "translateX(-1px)";
        if (n % 7 === 0) el.style.transform = "translateX(2px)";
        if (n % 11 === 0) el.style.transform = "none";
      }, 180);
    });
  }

  /* ---------------- fragment panel page helper ---------------- */
  function renderFragmentPanel(mountSel) {
    const mount = document.querySelector(mountSel);
    if (!mount) return;
    const all = readFragments();
    let html = "";
    for (let i = 1; i <= 8; i++) {
      const v = all[i];
      html += `<div class="hud-slot ${v ? "on" : ""}" style="min-width:120px;padding:10px">${v ? escapeHtml(v) : "[пусто]"}</div>`;
    }
    mount.innerHTML = html;
  }

  /* ---------------- boot ---------------- */
  document.addEventListener("DOMContentLoaded", () => {
    initRain();
    renderHUD();
    bindHints();
    initGlitch();
    document.querySelectorAll("[data-typewriter]").forEach((el) => {
      let lines = [];
      try {
        lines = JSON.parse(el.dataset.typewriter);
      } catch (_) {}
      typewriter(el, lines);
    });
  });

  window.KOVCHEGG = {
    normalize,
    hash1a,
    bindSolve,
    revealFragment,
    saveFragment,
    readFragments,
    hasFragment,
    renderHUD,
    renderFragmentPanel,
    typewriter,
    escapeHtml,
    resetAll,
    store,
    NOSAVE,
    REDUCED,
  };
})();
