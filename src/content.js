(function () {
  "use strict";

  // ───────────────────────────────────────────────────────────────────────────
  // État global
  // ───────────────────────────────────────────────────────────────────────────
  const state = {
    config: {
      apiKey: "",
      model: "gpt-4o-mini",
      language: "",
      length: "moyen",
      instructions: ""
    },
    selecting: false,
    hoverEl: null,
    selectedArticle: null,
    selectedTweet: null,
    lastReply: ""
  };

  let shadowRoot = null;
  let ui = {}; // références aux éléments de la sidebar

  // ───────────────────────────────────────────────────────────────────────────
  // Config (chrome.storage.local)
  // ───────────────────────────────────────────────────────────────────────────
  function loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get("replyerConfig", (data) => {
        if (data && data.replyerConfig) Object.assign(state.config, data.replyerConfig);
        resolve();
      });
    });
  }
  function saveConfig() {
    chrome.storage.local.set({ replyerConfig: state.config });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Bouton flottant au-dessus de l'icône Grok (bouton flottant en bas à droite)
  // ───────────────────────────────────────────────────────────────────────────
  function findGrokButton() {
    // 1) Bouton Grok FLOTTANT en bas à droite (cible prioritaire)
    const fab = document.querySelector('[data-testid="GrokDrawerHeader"]');
    if (fab) return fab;
    // 2) Repli : lien Grok dans la nav de gauche
    const nav = document.querySelector('a[href="/i/grok"]');
    if (nav) return nav.closest("a, [role='link']") || nav;
    // 3) Repli générique par aria-label / href
    const candidates = document.querySelectorAll('a[aria-label], button[aria-label], [role="button"][aria-label], [role="link"][aria-label]');
    for (const el of candidates) {
      const label = (el.getAttribute("aria-label") || "").toLowerCase();
      const href = (el.getAttribute("href") || "").toLowerCase();
      if (label === "grok" || label.includes("grok") || href.includes("grok")) {
        return el.closest("button, a, [role='button'], [role='link']") || el;
      }
    }
    return null;
  }

  function buildFloatingButton() {
    const btn = document.createElement("div");
    btn.id = "replyer-fab";
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.title = "Replyer — Réponses IA";
    btn.style.cssText = [
      "position:fixed",
      "z-index:2147483646",
      "width:52px",
      "height:52px",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "border-radius:9999px",
      "cursor:pointer",
      "background:#1d9bf0",
      "color:#fff",
      "border:1px solid rgba(0,0,0,.08)",
      "box-shadow:0 2px 10px rgba(0,0,0,.25)",
      "transition:transform .12s, background .15s",
      "right:24px",
      "bottom:150px"
    ].join(";");
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
        <path d="M12 2a2 2 0 0 1 2 2v1h3a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-3.6L8 21.5V18H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h3V4a2 2 0 0 1 2-2Zm-3 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/>
      </svg>
    `;
    btn.addEventListener("mouseenter", () => (btn.style.transform = "scale(1.06)"));
    btn.addEventListener("mouseleave", () => (btn.style.transform = "scale(1)"));
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    });
    return btn;
  }

  function positionFloatingButton(btn) {
    const grok = findGrokButton();
    if (grok) {
      const r = grok.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        btn.style.width = r.width + "px";
        btn.style.height = r.height + "px";
        btn.style.left = r.left + "px";
        btn.style.top = Math.max(8, r.top - r.height - 12) + "px";
        btn.style.right = "auto";
        btn.style.bottom = "auto";
        return;
      }
    }
    // Repli : coin bas-droit, au-dessus de la zone des boutons flottants
    btn.style.width = "52px";
    btn.style.height = "52px";
    btn.style.left = "auto";
    btn.style.top = "auto";
    btn.style.right = "24px";
    btn.style.bottom = "150px";
  }

  function ensureNavButton() {
    let btn = document.getElementById("replyer-fab");
    if (!btn) {
      btn = buildFloatingButton();
      document.documentElement.appendChild(btn);
    }
    positionFloatingButton(btn);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Sidebar custom (Shadow DOM)
  // ───────────────────────────────────────────────────────────────────────────
  function buildSidebar() {
    if (shadowRoot) return;
    const host = document.createElement("div");
    host.id = "replyer-sidebar-host";
    host.style.cssText = "all:initial;position:fixed;top:0;right:0;z-index:2147483647;";
    document.documentElement.appendChild(host);
    shadowRoot = host.attachShadow({ mode: "open" });

    shadowRoot.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        .panel {
          position: fixed; top: 0; right: 0; height: 100vh; width: 380px; max-width: 92vw;
          background: #15181c; color: #e7e9ea; box-shadow: -8px 0 30px rgba(0,0,0,.45);
          display: flex; flex-direction: column; transform: translateX(100%);
          transition: transform .25s ease; border-left: 1px solid #2f3336;
        }
        .panel.open { transform: translateX(0); }
        header { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid #2f3336; }
        header h1 { margin:0; font-size:16px; font-weight:700; display:flex; align-items:center; gap:8px; }
        .close { background:transparent; border:none; color:#8b98a5; font-size:22px; cursor:pointer; line-height:1; padding:4px 8px; border-radius:6px; }
        .close:hover { background:#22272b; color:#fff; }
        .body { padding:16px; overflow-y:auto; flex:1; }
        label { display:block; font-size:12px; color:#8b98a5; margin:14px 0 5px; font-weight:600; text-transform:uppercase; letter-spacing:.03em; }
        input, select, textarea {
          width:100%; background:#202327; border:1px solid #38444d; color:#e7e9ea;
          border-radius:10px; padding:10px 12px; font-size:14px; outline:none;
        }
        input:focus, select:focus, textarea:focus { border-color:#1d9bf0; }
        textarea { resize:vertical; min-height:64px; }
        .row { display:flex; gap:10px; }
        .row > div { flex:1; }
        button.primary {
          width:100%; margin-top:16px; background:#1d9bf0; color:#fff; border:none;
          border-radius:9999px; padding:12px; font-size:15px; font-weight:700; cursor:pointer;
        }
        button.primary:hover { background:#1a8cd8; }
        button.primary:disabled { opacity:.5; cursor:not-allowed; }
        button.ghost {
          background:transparent; border:1px solid #38444d; color:#e7e9ea;
          border-radius:9999px; padding:10px; font-size:14px; font-weight:600; cursor:pointer; flex:1;
        }
        button.ghost:hover { background:#22272b; }
        .hint { font-size:12px; color:#8b98a5; margin-top:6px; line-height:1.4; }
        .divider { height:1px; background:#2f3336; margin:18px 0; }
        .selected-box { background:#1a1d21; border:1px solid #2f3336; border-radius:12px; padding:12px; font-size:13px; color:#c8cdd1; white-space:pre-wrap; max-height:140px; overflow:auto; }
        .selected-author { color:#1d9bf0; font-weight:700; margin-bottom:4px; }
        .reply-box { width:100%; background:#202327; border:1px solid #38444d; color:#e7e9ea; border-radius:10px; padding:10px 12px; font-size:14px; min-height:90px; resize:vertical; }
        .actions { display:flex; gap:10px; margin-top:10px; }
        .status { font-size:13px; margin-top:10px; min-height:18px; }
        .status.err { color:#f4212e; }
        .status.ok { color:#00ba7c; }
        .status.info { color:#8b98a5; }
        .badge { display:inline-block; background:#1d9bf0; color:#fff; font-size:10px; padding:2px 7px; border-radius:9999px; vertical-align:middle; }
        .muted { color:#8b98a5; font-size:12px; }
        section { display:none; }
        section.active { display:block; }
        .tabs { display:flex; gap:6px; padding:10px 16px 0; }
        .tab { flex:1; text-align:center; padding:8px; border-radius:9px 9px 0 0; cursor:pointer; font-size:13px; font-weight:600; color:#8b98a5; }
        .tab.active { color:#fff; background:#202327; }
      </style>

      <div class="panel" id="panel">
        <header>
          <h1>🤖 Replyer <span class="badge">IA</span></h1>
          <button class="close" id="close">×</button>
        </header>

        <div class="tabs">
          <div class="tab active" data-tab="reply">Répondre</div>
          <div class="tab" data-tab="config">Configuration</div>
        </div>

        <div class="body">
          <!-- ONGLET RÉPONDRE -->
          <section id="tab-reply" class="active">
            <button class="primary" id="selectBtn">🎯 Sélectionner un tweet</button>
            <p class="hint">Clique puis survole un tweet sur la page : il se met en surbrillance. Clique dessus pour le choisir.</p>

            <div id="selectedWrap" style="display:none;">
              <div class="divider"></div>
              <label>Tweet sélectionné</label>
              <div class="selected-box">
                <div class="selected-author" id="selAuthor"></div>
                <div id="selText"></div>
              </div>

              <button class="primary" id="generateBtn">✨ Générer une réponse</button>
              <div class="status info" id="status"></div>

              <label>Réponse proposée</label>
              <textarea class="reply-box" id="replyText" placeholder="La réponse générée apparaîtra ici (modifiable)…"></textarea>
              <div class="actions">
                <button class="ghost" id="copyBtn">📋 Copier</button>
                <button class="ghost" id="insertBtn">↩️ Insérer dans X</button>
              </div>
              <p class="hint">« Insérer » ouvre le champ de réponse du tweet et y colle le texte. Tu valides l'envoi toi-même sur X.</p>
            </div>
          </section>

          <!-- ONGLET CONFIG -->
          <section id="tab-config">
            <label>Clé API OpenAI</label>
            <input type="password" id="apiKey" placeholder="sk-..." autocomplete="off" />
            <p class="hint">Stockée en local dans ton navigateur (chrome.storage). Jamais envoyée ailleurs qu'à api.openai.com.</p>

            <label>Modèle</label>
            <select id="model">
              <option value="gpt-4o-mini">gpt-4o-mini (rapide & éco)</option>
              <option value="gpt-4o">gpt-4o (qualité)</option>
              <option value="gpt-4.1">gpt-4.1</option>
              <option value="gpt-4.1-mini">gpt-4.1-mini</option>
            </select>

            <div class="row">
              <div>
                <label>Langue</label>
                <input type="text" id="language" placeholder="auto (langue du tweet)" />
              </div>
              <div>
                <label>Longueur</label>
                <select id="length">
                  <option value="court">Court</option>
                  <option value="moyen">Moyen</option>
                  <option value="long">Long</option>
                </select>
              </div>
            </div>

            <label>Ton / style (instructions)</label>
            <textarea id="instructions" placeholder="Ex : ton amical et un peu humoristique, point de vue d'expert tech, sans emojis…"></textarea>

            <button class="primary" id="saveBtn">💾 Enregistrer</button>
            <div class="status ok" id="cfgStatus"></div>
          </section>
        </div>
      </div>
    `;

    // Références
    ui.panel = shadowRoot.getElementById("panel");
    ui.close = shadowRoot.getElementById("close");
    ui.selectBtn = shadowRoot.getElementById("selectBtn");
    ui.selectedWrap = shadowRoot.getElementById("selectedWrap");
    ui.selAuthor = shadowRoot.getElementById("selAuthor");
    ui.selText = shadowRoot.getElementById("selText");
    ui.generateBtn = shadowRoot.getElementById("generateBtn");
    ui.status = shadowRoot.getElementById("status");
    ui.replyText = shadowRoot.getElementById("replyText");
    ui.copyBtn = shadowRoot.getElementById("copyBtn");
    ui.insertBtn = shadowRoot.getElementById("insertBtn");
    // config
    ui.apiKey = shadowRoot.getElementById("apiKey");
    ui.model = shadowRoot.getElementById("model");
    ui.language = shadowRoot.getElementById("language");
    ui.length = shadowRoot.getElementById("length");
    ui.instructions = shadowRoot.getElementById("instructions");
    ui.saveBtn = shadowRoot.getElementById("saveBtn");
    ui.cfgStatus = shadowRoot.getElementById("cfgStatus");

    // Remplir la config
    ui.apiKey.value = state.config.apiKey || "";
    ui.model.value = state.config.model || "gpt-4o-mini";
    ui.language.value = state.config.language || "";
    ui.length.value = state.config.length || "moyen";
    ui.instructions.value = state.config.instructions || "";

    // Tabs
    shadowRoot.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        shadowRoot.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        shadowRoot.querySelectorAll("section").forEach((s) => s.classList.remove("active"));
        tab.classList.add("active");
        shadowRoot.getElementById("tab-" + tab.dataset.tab).classList.add("active");
      });
    });

    // Events
    ui.close.addEventListener("click", () => toggleSidebar(false));
    ui.selectBtn.addEventListener("click", () => startSelection());
    ui.generateBtn.addEventListener("click", () => doGenerate());
    ui.copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(ui.replyText.value || "").then(() => setStatus("Copié ✓", "ok"));
    });
    ui.insertBtn.addEventListener("click", () => insertIntoX());
    ui.saveBtn.addEventListener("click", () => {
      state.config.apiKey = ui.apiKey.value.trim();
      state.config.model = ui.model.value;
      state.config.language = ui.language.value.trim();
      state.config.length = ui.length.value;
      state.config.instructions = ui.instructions.value.trim();
      saveConfig();
      ui.cfgStatus.textContent = "Configuration enregistrée ✓";
      setTimeout(() => (ui.cfgStatus.textContent = ""), 2500);
    });
  }

  function toggleSidebar(force) {
    buildSidebar();
    const open = typeof force === "boolean" ? force : !ui.panel.classList.contains("open");
    ui.panel.classList.toggle("open", open);
    if (!open) stopSelection();
  }

  function setStatus(msg, kind) {
    if (!ui.status) return;
    ui.status.textContent = msg;
    ui.status.className = "status " + (kind || "info");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Outil de sélection de tweet
  // ───────────────────────────────────────────────────────────────────────────
  function getArticleFrom(target) {
    return target.closest && target.closest('article[data-testid="tweet"], article[role="article"]');
  }

  function onHover(e) {
    const art = getArticleFrom(e.target);
    if (art === state.hoverEl) return;
    if (state.hoverEl) state.hoverEl.style.outline = "";
    state.hoverEl = art;
    if (art) {
      art.style.outline = "3px solid #1d9bf0";
      art.style.outlineOffset = "-3px";
      art.style.cursor = "pointer";
    }
  }

  function onPick(e) {
    const art = getArticleFrom(e.target);
    if (!art) return;
    e.preventDefault();
    e.stopPropagation();
    selectTweet(art);
    stopSelection();
  }

  function onKey(e) {
    if (e.key === "Escape") stopSelection();
  }

  function startSelection() {
    if (state.selecting) return;
    toggleSidebar(true);
    state.selecting = true;
    ui.selectBtn.textContent = "⏳ Sélection active — survole un tweet (Échap pour annuler)";
    document.addEventListener("mousemove", onHover, true);
    document.addEventListener("click", onPick, true);
    document.addEventListener("keydown", onKey, true);
  }

  function stopSelection() {
    if (!state.selecting) return;
    state.selecting = false;
    if (ui.selectBtn) ui.selectBtn.textContent = "🎯 Sélectionner un tweet";
    if (state.hoverEl) state.hoverEl.style.outline = "";
    state.hoverEl = null;
    document.removeEventListener("mousemove", onHover, true);
    document.removeEventListener("click", onPick, true);
    document.removeEventListener("keydown", onKey, true);
  }

  function extractTweet(article) {
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const text = (textEl ? textEl.innerText : article.innerText || "").trim();
    const userEl = article.querySelector('[data-testid="User-Name"]');
    let author = "";
    if (userEl) author = userEl.innerText.split("\n").filter(Boolean).slice(0, 2).join(" ");
    return { text, author };
  }

  function selectTweet(article) {
    state.selectedArticle = article;
    state.selectedTweet = extractTweet(article);
    ui.selectedWrap.style.display = "block";
    ui.selAuthor.textContent = state.selectedTweet.author || "Tweet";
    ui.selText.textContent = state.selectedTweet.text || "(texte non détecté)";
    ui.replyText.value = "";
    setStatus("Tweet sélectionné. Clique sur « Générer une réponse ».", "ok");
    // brève surbrillance de confirmation
    article.style.outline = "3px solid #00ba7c";
    article.style.outlineOffset = "-3px";
    setTimeout(() => { article.style.outline = ""; }, 800);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Génération via OpenAI (background)
  // ───────────────────────────────────────────────────────────────────────────
  function doGenerate() {
    if (!state.selectedTweet) { setStatus("Sélectionne d'abord un tweet.", "err"); return; }
    if (!state.config.apiKey) { setStatus("Ajoute ta clé API OpenAI dans l'onglet Configuration.", "err"); return; }

    ui.generateBtn.disabled = true;
    setStatus("Génération en cours…", "info");

    chrome.runtime.sendMessage(
      {
        type: "GENERATE_REPLY",
        payload: {
          apiKey: state.config.apiKey,
          model: state.config.model,
          language: state.config.language,
          length: state.config.length,
          instructions: state.config.instructions,
          tweetText: state.selectedTweet.text,
          author: state.selectedTweet.author
        }
      },
      (resp) => {
        ui.generateBtn.disabled = false;
        if (chrome.runtime.lastError) { setStatus("Erreur runtime : " + chrome.runtime.lastError.message, "err"); return; }
        if (!resp || !resp.ok) { setStatus("Erreur : " + (resp && resp.error ? resp.error : "inconnue"), "err"); return; }
        state.lastReply = resp.reply;
        ui.replyText.value = resp.reply;
        setStatus("Réponse générée ✓ (modifiable avant insertion)", "ok");
      }
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Insertion dans le composer de X
  // ───────────────────────────────────────────────────────────────────────────
  function waitFor(selector, timeout) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start > (timeout || 4000)) return resolve(null);
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  async function insertIntoX() {
    const text = ui.replyText.value || "";
    if (!text) { setStatus("Rien à insérer.", "err"); return; }
    if (!state.selectedArticle || !document.contains(state.selectedArticle)) {
      setStatus("Le tweet n'est plus visible. Re-sélectionne-le.", "err");
      return;
    }
    setStatus("Ouverture du champ de réponse…", "info");

    // Clique le bouton "Répondre" du tweet sélectionné
    const replyBtn = state.selectedArticle.querySelector('[data-testid="reply"]');
    if (replyBtn) replyBtn.click();

    const box = await waitFor('[data-testid="tweetTextarea_0"]', 5000);
    if (!box) { setStatus("Champ de réponse introuvable. Ouvre-le manuellement puis réessaie.", "err"); return; }

    box.focus();
    // X utilise un éditeur contenteditable (Draft.js) : execCommand reste la voie la plus fiable
    const ok = document.execCommand("insertText", false, text);
    if (!ok) {
      // fallback : événement input
      box.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: text, bubbles: true, cancelable: true }));
    }
    setStatus("Texte inséré ✓ Vérifie et envoie sur X.", "ok");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Init + résilience SPA
  // ───────────────────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "TOGGLE_SIDEBAR") toggleSidebar();
  });

  function init() {
    ensureNavButton();
  }

  loadConfig().then(() => {
    init();
    // x.com est une SPA : on ré-injecte / repositionne le bouton
    const obs = new MutationObserver(() => ensureNavButton());
    obs.observe(document.body, { childList: true, subtree: true });
    setInterval(ensureNavButton, 1500);
    window.addEventListener("resize", () => ensureNavButton(), true);
    window.addEventListener("scroll", () => ensureNavButton(), true);
  });
})();
