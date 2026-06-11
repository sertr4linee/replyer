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
      count: 3,
      instructions: ""
    },
    selecting: false,
    hoverEl: null,
    selectedArticle: null,
    selectedTweet: null,
    selectedContext: [],
    originalPostEl: null,
    lastReply: ""
  };

  let shadowRoot = null;
  let ui = {}; // références aux éléments de la sidebar

  // Cache des fils : id du tweet -> { context: [posts parents], isReply: bool } ; et id -> basic
  const threadCache = new Map(); // replyId -> [parents basics]
  const tweetCache = new Map(); // id -> basic info

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
    btn.setAttribute("aria-label", "Replyer — Réponses IA");
    btn.title = "Replyer — Réponses IA";
    // Base "native X" (sera affinée en copiant le style réel du bouton Grok)
    btn.style.cssText = [
      "position:fixed",
      "z-index:2147483646",
      "width:55px",
      "height:55px",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "border-radius:16px",
      "cursor:pointer",
      "background:rgba(255,255,255,.85)",
      "color:#0f1419",
      "border:1px solid rgb(159,181,195)",
      "box-shadow:rgba(101,119,134,.2) 0 0 15px 0, rgba(101,119,134,.15) 0 0 3px 1px",
      "backdrop-filter:blur(4px)",
      "-webkit-backdrop-filter:blur(4px)",
      "transition:transform .12s ease, filter .15s ease",
      "right:24px",
      "bottom:150px"
    ].join(";");
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" style="display:block">
        <path fill="#1d9bf0" d="M12 2a2 2 0 0 1 2 2v1h3a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-3.6L8 21.5V18H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h3V4a2 2 0 0 1 2-2Zm-3 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/>
      </svg>
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "scale(1.06)";
      btn.style.filter = "brightness(0.97)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "scale(1)";
      btn.style.filter = "none";
    });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    });
    return btn;
  }

  function positionFloatingButton(btn) {
    const grok = findGrokButton();
    const isFloatingGrok = grok && grok.getAttribute("data-testid") === "GrokDrawerHeader";

    if (grok) {
      // Copie le look natif exact (gère thème clair/sombre automatiquement)
      const cs = getComputedStyle(grok);
      if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") {
        btn.style.background = cs.backgroundColor;
        btn.style.borderRadius = cs.borderRadius;
        btn.style.boxShadow = cs.boxShadow;
        btn.style.borderColor = cs.borderTopColor;
        btn.style.borderWidth = cs.borderTopWidth;
        btn.style.borderStyle = cs.borderTopStyle || "solid";
      }

      const r = grok.getBoundingClientRect();
      if (isFloatingGrok && r.width > 0 && r.height > 0) {
        // Empilé juste au-dessus du bouton Grok flottant
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
    btn.style.width = "55px";
    btn.style.height = "55px";
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
          position: fixed; top: 0; right: 0; height: 100vh; width: 400px; max-width: 94vw;
          background: #0d0f12; color: #e7e9ea; box-shadow: -12px 0 40px rgba(0,0,0,.5);
          display: flex; flex-direction: column; transform: translateX(102%);
          transition: transform .28s cubic-bezier(.22,.61,.36,1); border-left: 1px solid #23282d;
        }
        .panel.open { transform: translateX(0); }

        header {
          display:flex; align-items:center; justify-content:space-between; padding:16px 18px;
          background: linear-gradient(135deg, rgba(29,155,240,.16), rgba(29,155,240,0) 70%);
          border-bottom:1px solid #23282d;
        }
        .brand { display:flex; align-items:center; gap:10px; }
        .logo { width:34px; height:34px; border-radius:10px; background:#1d9bf0; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 14px rgba(29,155,240,.45); }
        .brand h1 { margin:0; font-size:17px; font-weight:800; letter-spacing:-.2px; }
        .brand .sub { font-size:11px; color:#8b98a5; font-weight:600; }
        .close { background:transparent; border:none; color:#8b98a5; font-size:24px; cursor:pointer; line-height:1; padding:2px 8px; border-radius:8px; }
        .close:hover { background:#1c2228; color:#fff; }

        .tabs { display:flex; gap:6px; padding:12px 16px 0; background:#0d0f12; }
        .tab { flex:1; text-align:center; padding:10px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; color:#8b98a5; transition:.15s; }
        .tab:hover { color:#e7e9ea; }
        .tab.active { color:#fff; background:#16191d; box-shadow:inset 0 0 0 1px #23282d; }

        .body { padding:16px; overflow-y:auto; flex:1; }
        .body::-webkit-scrollbar { width:9px; }
        .body::-webkit-scrollbar-thumb { background:#2b3137; border-radius:9px; border:2px solid #0d0f12; }

        label { display:block; font-size:11px; color:#8b98a5; margin:16px 0 6px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
        input, select, textarea {
          width:100%; background:#16191d; border:1px solid #2b3137; color:#e7e9ea;
          border-radius:11px; padding:11px 13px; font-size:14px; outline:none; transition:border-color .15s, box-shadow .15s;
        }
        input:focus, select:focus, textarea:focus { border-color:#1d9bf0; box-shadow:0 0 0 3px rgba(29,155,240,.15); }
        textarea { resize:vertical; min-height:70px; line-height:1.45; }
        .row { display:flex; gap:10px; }
        .row > div { flex:1; }

        button.primary {
          width:100%; margin-top:18px; background:#1d9bf0; color:#fff; border:none;
          border-radius:9999px; padding:13px; font-size:15px; font-weight:800; cursor:pointer; transition:.15s;
        }
        button.primary:hover { background:#1a8cd8; transform:translateY(-1px); }
        button.primary:active { transform:translateY(0); }
        button.primary:disabled { opacity:.45; cursor:not-allowed; transform:none; }
        button.ghost {
          background:transparent; border:1px solid #2b3137; color:#e7e9ea;
          border-radius:9999px; padding:11px; font-size:14px; font-weight:700; cursor:pointer; flex:1; transition:.15s;
        }
        button.ghost:hover { background:#16191d; border-color:#3a424a; }

        .hint { font-size:12px; color:#7c8893; margin-top:8px; line-height:1.5; }
        .divider { height:1px; background:#23282d; margin:18px 0; }
        .actions { display:flex; gap:10px; margin-top:12px; }
        .status { font-size:13px; margin-top:12px; min-height:18px; font-weight:600; }
        .status.err { color:#f4212e; }
        .status.ok { color:#00ba7c; }
        .status.info { color:#8b98a5; }

        .selected-box { background:#16191d; border:1px solid #23282d; border-radius:14px; padding:13px 14px; font-size:13.5px; color:#c8cdd1; white-space:pre-wrap; max-height:150px; overflow:auto; line-height:1.5; }
        .selected-author { color:#1d9bf0; font-weight:800; margin-bottom:5px; font-size:13px; }

        /* Variantes */
        .variants { margin-top:14px; display:flex; flex-direction:column; gap:12px; }
        .variant {
          background:#16191d; border:1px solid #23282d; border-radius:14px; padding:13px 14px;
          transition:border-color .15s, transform .1s; position:relative;
        }
        .variant:hover { border-color:#3a424a; }
        .variant-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .variant-tag { font-size:11px; font-weight:800; color:#1d9bf0; text-transform:uppercase; letter-spacing:.04em; }
        .variant-len { font-size:11px; font-weight:700; color:#7c8893; }
        .variant-len.over { color:#f4212e; }
        .variant-text { font-size:14px; line-height:1.5; color:#e7e9ea; white-space:pre-wrap; }
        .variant-actions { display:flex; gap:8px; margin-top:11px; }
        .chip {
          background:#0d0f12; border:1px solid #2b3137; color:#cfd6dc; border-radius:9999px;
          padding:7px 12px; font-size:12.5px; font-weight:700; cursor:pointer; transition:.15s; display:flex; align-items:center; gap:5px;
        }
        .chip:hover { background:#1c2228; border-color:#3a424a; color:#fff; }
        .chip.insert { background:#1d9bf0; border-color:#1d9bf0; color:#fff; margin-left:auto; }
        .chip.insert:hover { background:#1a8cd8; }

        /* Skeleton chargement */
        .skel { background:#16191d; border:1px solid #23282d; border-radius:14px; padding:14px; overflow:hidden; }
        .skel-line { height:11px; border-radius:6px; margin:7px 0; background:linear-gradient(90deg,#1c2228 25%,#262c33 37%,#1c2228 63%); background-size:400% 100%; animation:shimmer 1.3s infinite; }
        .skel-line.w70 { width:70%; } .skel-line.w90 { width:90%; } .skel-line.w50 { width:50%; }
        @keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:0 0} }

        .draft-counter { text-align:right; font-size:11px; font-weight:700; color:#7c8893; margin-top:5px; }
        .draft-counter.over { color:#f4212e; }

        /* Carte tweet (simulation) */
        .tw { background:#16191d; border:1px solid #23282d; border-radius:14px; padding:13px 14px; }
        .tw-head { display:flex; align-items:center; gap:10px; }
        .tw-avatar { width:42px; height:42px; border-radius:9999px; flex:none; background:#23282d; object-fit:cover; }
        .tw-id { min-width:0; flex:1; }
        .tw-name { font-weight:800; font-size:14.5px; color:#e7e9ea; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:4px; }
        .tw-verified { width:15px; height:15px; fill:#1d9bf0; flex:none; }
        .tw-handle { color:#7c8893; font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .tw-body { font-size:14.5px; line-height:1.5; color:#e7e9ea; margin-top:10px; white-space:pre-wrap; word-break:break-word; max-height:190px; overflow:auto; }
        .tw-media { margin-top:9px; font-size:12px; color:#7c8893; background:#0d0f12; border:1px solid #23282d; border-radius:9px; padding:6px 9px; display:inline-block; }
        .tw-media.clickable { cursor:pointer; color:#1d9bf0; border-color:rgba(29,155,240,.35); transition:.15s; }
        .tw-media.clickable:hover { background:rgba(29,155,240,.1); }

        /* Lightbox média */
        .lightbox { position:absolute; inset:0; background:rgba(0,0,0,.82); z-index:50; display:flex; align-items:center; justify-content:center; padding:18px; animation:fade .15s ease; }
        .lb-inner { position:relative; max-width:100%; max-height:100%; overflow:auto; display:flex; flex-direction:column; gap:10px; }
        .lb-img { max-width:100%; border-radius:12px; display:block; box-shadow:0 8px 30px rgba(0,0,0,.5); }
        .lb-close { position:sticky; top:0; align-self:flex-end; background:#16191d; color:#fff; border:1px solid #38444d; width:34px; height:34px; border-radius:9999px; font-size:20px; cursor:pointer; line-height:1; }
        .lb-close:hover { background:#22272b; }
        .lb-vidnote { font-size:12px; color:#aab2b9; text-align:center; margin-top:4px; }

        /* Vol de style */
        .steal-row { display:flex; gap:8px; }
        .steal-row input { flex:2; }
        .steal-row button { flex:1; margin:0; white-space:nowrap; }

        /* Onboarding overlay */
        .ob { position:absolute; inset:0; background:#0d0f12; z-index:60; display:flex; flex-direction:column; animation:fade .18s ease; }
        .ob-head { display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid #23282d; }
        .ob-title { font-size:16px; font-weight:800; }
        .ob-x { background:transparent; border:none; color:#8b98a5; font-size:24px; cursor:pointer; }
        .ob-x:hover { color:#fff; }
        .ob-progress { height:4px; background:#16191d; }
        .ob-bar { height:100%; background:#1d9bf0; width:0; transition:width .25s ease; }
        .ob-body { padding:22px 18px; flex:1; overflow-y:auto; }
        .ob-step-n { font-size:11px; font-weight:800; color:#1d9bf0; text-transform:uppercase; letter-spacing:.05em; }
        .ob-q { font-size:19px; font-weight:800; margin:8px 0 4px; line-height:1.3; }
        .ob-sub { font-size:13px; color:#8b98a5; margin-bottom:16px; }
        .ob-chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
        .ob-chip { background:#16191d; border:1px solid #2b3137; color:#cfd6dc; border-radius:9999px; padding:7px 13px; font-size:13px; cursor:pointer; transition:.15s; }
        .ob-chip:hover, .ob-chip.sel { background:rgba(29,155,240,.15); border-color:#1d9bf0; color:#fff; }
        .ob-nav { display:flex; gap:10px; padding:14px 18px; border-top:1px solid #23282d; }
        .ob-nav button { margin:0; }
        .ob-result { width:100%; min-height:220px; }
        .tw-metrics { display:flex; align-items:center; gap:18px; margin-top:12px; padding-top:11px; border-top:1px solid #23282d; color:#7c8893; font-size:12.5px; font-weight:600; }
        .tw-metric { display:flex; align-items:center; gap:5px; }
        .tw-metric.views { margin-left:auto; }
        .tw-metric svg { width:15px; height:15px; fill:currentColor; }
        .tw-metric.views svg { fill:#1d9bf0; }

        /* En-tête sélection + badge relation */
        .sel-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:16px 0 7px; }
        .sel-head label { margin:0; }
        .pill { font-size:10.5px; font-weight:800; padding:3px 10px; border-radius:9999px; text-transform:uppercase; letter-spacing:.03em; white-space:nowrap; }
        .pill.reply { background:rgba(29,155,240,.16); color:#1d9bf0; border:1px solid rgba(29,155,240,.4); }
        .pill.original { background:rgba(124,136,147,.14); color:#9aa6b0; border:1px solid rgba(124,136,147,.3); }
        .pill.cached { background:rgba(0,186,124,.14); color:#00ba7c; border:1px solid rgba(0,186,124,.35); }
        .pill.clickable { cursor:pointer; transition:filter .15s; }
        .pill.clickable:hover { filter:brightness(1.25); }

        /* Contexte (post initial / fil) */
        .ctx-label { font-size:11px; color:#7c8893; font-weight:800; margin:14px 0 7px; text-transform:uppercase; letter-spacing:.04em; display:flex; align-items:center; gap:6px; }
        .ctx-empty { font-size:12.5px; color:#7c8893; background:#121417; border:1px dashed #2b3137; border-radius:12px; padding:10px 12px; }
        .ctx-card { background:#121417; border:1px dashed #2b3137; border-radius:12px; padding:10px 12px; }
        .ctx-card + .ctx-card { margin-top:8px; }
        .ctx-author { color:#1d9bf0; font-weight:700; font-size:12.5px; margin-bottom:3px; }
        .ctx-text { font-size:13px; color:#aab2b9; line-height:1.45; white-space:pre-wrap; word-break:break-word; max-height:120px; overflow:auto; }
        .badge { display:inline-block; background:#1d9bf0; color:#fff; font-size:10px; padding:2px 7px; border-radius:9999px; vertical-align:middle; font-weight:800; }
        section { display:none; }
        section.active { display:block; animation:fade .2s ease; }
        @keyframes fade { from{opacity:0; transform:translateY(4px)} to{opacity:1; transform:none} }
      </style>

      <div class="panel" id="panel">
        <header>
          <div class="brand">
            <span class="logo">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M12 2a2 2 0 0 1 2 2v1h3a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-3.6L8 21.5V18H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h3V4a2 2 0 0 1 2-2Zm-3 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/></svg>
            </span>
            <div>
              <h1>Replyer</h1>
              <div class="sub">Réponses IA · Croissance X</div>
            </div>
          </div>
          <button class="close" id="close">×</button>
        </header>

        <div class="tabs">
          <div class="tab active" data-tab="reply">⚡ Répondre</div>
          <div class="tab" data-tab="config">⚙️ Configuration</div>
        </div>

        <div class="body">
          <!-- ONGLET RÉPONDRE -->
          <section id="tab-reply" class="active">
            <button class="primary" id="selectBtn">🎯 Sélectionner un tweet</button>
            <p class="hint">Clique, puis survole un tweet sur la page (surbrillance bleue) et clique dessus pour le choisir.</p>

            <div id="selectedWrap" style="display:none;">
              <div class="divider"></div>
              <div id="contextCard" style="display:none;"></div>
              <div class="sel-head">
                <label>Tweet sélectionné</label>
                <span id="tweetRelation" class="pill original"></span>
              </div>
              <div id="tweetCard" class="tw"></div>

              <button class="primary" id="generateBtn">✨ Générer 3 réponses</button>
              <div class="status info" id="status"></div>

              <div class="variants" id="variants"></div>

              <div id="draftWrap" style="display:none;">
                <label>Brouillon (éditable avant insertion)</label>
                <textarea id="replyText" placeholder="Choisis une variante via « Éditer », ou écris ici…"></textarea>
                <div class="draft-counter" id="draftCounter">0 / 280</div>
                <div class="actions">
                  <button class="ghost" id="copyBtn">📋 Copier</button>
                  <button class="ghost" id="insertBtn" style="background:#1d9bf0;border-color:#1d9bf0;color:#fff;">↩️ Insérer dans X</button>
                </div>
                <p class="hint">« Insérer » ouvre le champ de réponse du tweet et y colle le texte. Tu valides l'envoi toi-même sur X.</p>
              </div>
            </div>
          </section>

          <!-- ONGLET CONFIG -->
          <section id="tab-config">
            <label>Clé API OpenAI</label>
            <input type="password" id="apiKey" placeholder="sk-..." autocomplete="off" />
            <p class="hint">Stockée en local (chrome.storage). Envoyée uniquement à api.openai.com.</p>

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
                <input type="text" id="language" placeholder="auto" />
              </div>
              <div>
                <label>Longueur</label>
                <select id="length">
                  <option value="court">Court</option>
                  <option value="moyen">Moyen</option>
                  <option value="long">Long</option>
                </select>
              </div>
              <div>
                <label>Variantes</label>
                <select id="count">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>
            </div>

            <label>Ton / style (ta personnalité, ta niche)</label>
            <button class="ghost" id="obLaunch" style="margin-bottom:8px;">🎯 Lancer l'assistant de style</button>
            <textarea id="instructions" placeholder="Ex : niche tech/SaaS, ton direct et un peu provoc, point de vue de builder, pas d'emojis, toujours un angle concret…"></textarea>
            <p class="hint">💡 Le réglage le plus important pour faire décoller ton compte. Utilise l'assistant ou le vol de style ci-dessous pour le remplir automatiquement.</p>

            <label>🥷 Voler le style d'un compte</label>
            <div class="steal-row">
              <input type="text" id="stealHandle" placeholder="@compte" autocomplete="off" />
              <button class="ghost" id="stealBtn">Analyser</button>
            </div>
            <p class="hint">Ouvre le profil du compte (ou scrolle pour charger ses tweets), puis clique. GPT lit ses posts et en extrait son style pour l'imiter — ajouté à tes instructions.</p>

            <button class="primary" id="saveBtn">💾 Enregistrer</button>
            <div class="status ok" id="cfgStatus"></div>
          </section>
        </div>

        <!-- Onboarding (assistant de style) -->
        <div class="ob" id="onboarding" style="display:none;">
          <div class="ob-head">
            <div class="ob-title">🎯 Assistant de style</div>
            <button class="ob-x" id="obClose">×</button>
          </div>
          <div class="ob-progress"><div class="ob-bar" id="obBar"></div></div>
          <div class="ob-body" id="obBody"></div>
          <div class="ob-nav">
            <button class="ghost" id="obBack">← Retour</button>
            <button class="primary" id="obNext" style="margin-top:0;">Suivant →</button>
          </div>
        </div>
      </div>
    `;

    // Références
    ui.panel = shadowRoot.getElementById("panel");
    ui.close = shadowRoot.getElementById("close");
    ui.selectBtn = shadowRoot.getElementById("selectBtn");
    ui.selectedWrap = shadowRoot.getElementById("selectedWrap");
    ui.tweetCard = shadowRoot.getElementById("tweetCard");
    ui.tweetRelation = shadowRoot.getElementById("tweetRelation");
    ui.contextCard = shadowRoot.getElementById("contextCard");
    ui.generateBtn = shadowRoot.getElementById("generateBtn");
    ui.status = shadowRoot.getElementById("status");
    ui.variants = shadowRoot.getElementById("variants");
    ui.draftWrap = shadowRoot.getElementById("draftWrap");
    ui.replyText = shadowRoot.getElementById("replyText");
    ui.draftCounter = shadowRoot.getElementById("draftCounter");
    ui.copyBtn = shadowRoot.getElementById("copyBtn");
    ui.insertBtn = shadowRoot.getElementById("insertBtn");
    // config
    ui.apiKey = shadowRoot.getElementById("apiKey");
    ui.model = shadowRoot.getElementById("model");
    ui.language = shadowRoot.getElementById("language");
    ui.length = shadowRoot.getElementById("length");
    ui.count = shadowRoot.getElementById("count");
    ui.instructions = shadowRoot.getElementById("instructions");
    ui.saveBtn = shadowRoot.getElementById("saveBtn");
    ui.cfgStatus = shadowRoot.getElementById("cfgStatus");

    // Remplir la config
    ui.apiKey.value = state.config.apiKey || "";
    ui.model.value = state.config.model || "gpt-4o-mini";
    ui.language.value = state.config.language || "";
    ui.length.value = state.config.length || "moyen";
    ui.count.value = String(state.config.count || 3);
    ui.instructions.value = state.config.instructions || "";
    updateGenerateLabel();

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
    ui.replyText.addEventListener("input", () => updateDraftCounter());
    ui.copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(ui.replyText.value || "").then(() => setStatus("Copié ✓", "ok"));
    });
    ui.insertBtn.addEventListener("click", () => insertIntoX(ui.replyText.value));
    ui.saveBtn.addEventListener("click", () => {
      state.config.apiKey = ui.apiKey.value.trim();
      state.config.model = ui.model.value;
      state.config.language = ui.language.value.trim();
      state.config.length = ui.length.value;
      state.config.count = parseInt(ui.count.value, 10) || 3;
      state.config.instructions = ui.instructions.value.trim();
      saveConfig();
      updateGenerateLabel();
      ui.cfgStatus.textContent = "Configuration enregistrée ✓";
      setTimeout(() => (ui.cfgStatus.textContent = ""), 2500);
    });
  }

  function updateGenerateLabel() {
    if (!ui.generateBtn) return;
    const n = state.config.count || 3;
    ui.generateBtn.textContent = n > 1 ? `✨ Générer ${n} réponses` : "✨ Générer une réponse";
  }

  function updateDraftCounter() {
    if (!ui.draftCounter) return;
    const len = (ui.replyText.value || "").length;
    ui.draftCounter.textContent = `${len} / 280`;
    ui.draftCounter.classList.toggle("over", len > 280);
  }

  function renderVariants(list) {
    ui.variants.innerHTML = "";
    list.forEach((text, i) => {
      const len = text.length;
      const card = document.createElement("div");
      card.className = "variant";
      const tag = document.createElement("div");
      tag.className = "variant-head";
      tag.innerHTML = `<span class="variant-tag">Variante ${i + 1}</span><span class="variant-len ${len > 280 ? "over" : ""}">${len}/280</span>`;
      const body = document.createElement("div");
      body.className = "variant-text";
      body.textContent = text;
      const actions = document.createElement("div");
      actions.className = "variant-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "chip";
      editBtn.innerHTML = "✏️ Éditer";
      editBtn.addEventListener("click", () => {
        ui.draftWrap.style.display = "block";
        ui.replyText.value = text;
        updateDraftCounter();
        ui.replyText.focus();
        ui.draftWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setStatus("Variante chargée dans le brouillon. Édite puis insère.", "info");
      });

      const copyBtn = document.createElement("button");
      copyBtn.className = "chip";
      copyBtn.innerHTML = "📋";
      copyBtn.title = "Copier";
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(text).then(() => setStatus(`Variante ${i + 1} copiée ✓`, "ok"));
      });

      const insertBtn = document.createElement("button");
      insertBtn.className = "chip insert";
      insertBtn.innerHTML = "↩️ Insérer";
      insertBtn.addEventListener("click", () => insertIntoX(text));

      actions.append(editBtn, copyBtn, insertBtn);
      card.append(tag, body, actions);
      ui.variants.appendChild(card);
    });
  }

  function showSkeletons(n) {
    ui.variants.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const s = document.createElement("div");
      s.className = "skel";
      s.innerHTML = `<div class="skel-line w50"></div><div class="skel-line w90"></div><div class="skel-line w70"></div>`;
      ui.variants.appendChild(s);
    }
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

  // ── Helpers d'extraction ────────────────────────────────────────────────
  const SVG = {
    reply: '<svg viewBox="0 0 24 24"><path d="M1.75 12C1.75 6.34 6.34 1.75 12 1.75S22.25 6.34 22.25 12 17.66 22.25 12 22.25c-1.62 0-3.16-.38-4.52-1.05l-3.9 1.05 1.05-3.9A10.2 10.2 0 0 1 1.75 12Z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    repost: '<svg viewBox="0 0 24 24"><path d="M4.5 3.88l4.43 4.42-1.41 1.41L6 8.19V14a3 3 0 0 0 3 3h2v2H9a5 5 0 0 1-5-5V8.19L2.49 9.71 1.08 8.3 4.5 3.88zM19.5 20.12l-4.43-4.42 1.41-1.41L18 15.81V10a3 3 0 0 0-3-3h-2V5h2a5 5 0 0 1 5 5v5.81l1.51-1.51 1.41 1.41-3.42 4.41z"/></svg>',
    like: '<svg viewBox="0 0 24 24"><path d="M12 21.6l-1.45-1.32C5.4 15.36 2 12.27 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.77-3.4 6.86-8.55 11.78L12 21.6z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    view: '<svg viewBox="0 0 24 24"><path d="M8.75 21V3h2.5v18h-2.5zM18 21V8.5h2.5V21H18zM4 21l-.01-10h2.5L6.5 21H4zm9.25 0V12h2.5v9h-2.5z"/></svg>',
    verified: '<svg class="tw-verified" viewBox="0 0 22 22"><path d="M20.4 11l-2-2.3.3-3.1-3-.7-1.6-2.6L11 3.5 8 2.3 6.4 4.9l-3 .7.3 3.1-2 2.3 2 2.3-.3 3.1 3 .7L11 19.5l3-1.2 1.6 2.6 3-.7-.3-3.1 2.1-2.3zM9.8 14.6l-3-3 1.2-1.2 1.8 1.8 4.2-4.2 1.2 1.2-5.4 5.4z"/></svg>'
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function fmtCount(n) {
    if (n == null || isNaN(n)) return null;
    if (n < 1000) return String(n);
    if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/, "") + "K";
    return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  }

  function parseMetrics(aria) {
    const out = {};
    if (!aria) return out;
    aria.split(",").forEach((seg) => {
      const m = seg.trim().match(/^([\d.,\s ]+)\s*(.+)$/);
      if (!m) return;
      const num = parseInt(m[1].replace(/[^\d]/g, ""), 10);
      if (isNaN(num)) return;
      const label = m[2].toLowerCase();
      if (/repl|répon/.test(label)) out.replies = num;
      else if (/repost|retweet/.test(label)) out.reposts = num;
      else if (/like|aime/.test(label)) out.likes = num;
      else if (/bookmark|signet|enregist/.test(label)) out.bookmarks = num;
      else if (/view|vue/.test(label)) out.views = num;
    });
    return out;
  }

  function permalinkId(art) {
    const links = [...art.querySelectorAll('a[href*="/status/"]')];
    for (const a of links) {
      if (a.querySelector("time")) {
        const m = a.getAttribute("href").match(/\/status\/(\d+)/);
        if (m) return m[1];
      }
    }
    const f = links.find((a) => /\/status\/\d+(\?|$|\/)/.test(a.getAttribute("href") || ""));
    const m2 = f && (f.getAttribute("href").match(/\/status\/(\d+)/));
    return m2 ? m2[1] : null;
  }

  function tweetHead(art) {
    const full = art.innerText || "";
    const t = art.querySelector('[data-testid="tweetText"]');
    if (!t) return full;
    const idx = full.indexOf(t.innerText);
    return idx < 0 ? full : full.slice(0, idx);
  }

  function tweetHandle(art) {
    const un = art.querySelector('[data-testid="User-Name"]');
    if (!un) return "";
    const h = (un.innerText.split("\n").map((s) => s.trim()).find((l) => l.startsWith("@"))) || "";
    return h;
  }

  function extractTweet(article) {
    const un = article.querySelector('[data-testid="User-Name"]');
    const lines = un ? un.innerText.split("\n").map((s) => s.trim()).filter(Boolean) : [];
    const name = lines[0] || "Tweet";
    const handle = lines.find((l) => l.startsWith("@")) || "";
    const last = lines[lines.length - 1] || "";
    const timeRel = last && last !== handle && last !== name && /[0-9a-zA-Z]/.test(last) && last !== "·" ? last.replace(/^·\s*/, "") : "";
    const tEl = article.querySelector('[data-testid="tweetText"]');
    const text = (tEl ? tEl.innerText : "").trim();
    const avatarEl = article.querySelector('[data-testid="Tweet-User-Avatar"] img, img[src*="profile_images"]');
    let avatar = avatarEl ? avatarEl.getAttribute("src") : "";
    if (avatar) avatar = avatar.replace("_normal.", "_x96.");
    const verified = !!article.querySelector('[data-testid="icon-verified"], svg[aria-label*="Verified"], svg[aria-label*="Certifié"]');
    const group = article.querySelector('[role="group"]');
    const metrics = parseMetrics(group ? group.getAttribute("aria-label") : "");
    const media = extractMedia(article);
    return { name, handle, timeRel, text, avatar, verified, metrics, id: permalinkId(article), media };
  }

  function extractMedia(article) {
    const images = [...article.querySelectorAll('[data-testid="tweetPhoto"] img')]
      .map((i) => i.getAttribute("src"))
      .filter(Boolean)
      .map((u) => u.replace(/name=\w+/, "name=large"));
    const videoEl = article.querySelector("video");
    const videoPoster = videoEl ? videoEl.getAttribute("poster") : null;
    const hasVideo = !!article.querySelector('[data-testid="videoPlayer"], video');
    return { images, videoPoster, hasVideo, has: images.length > 0 || hasVideo };
  }

  function extractBasic(art) {
    const un = art.querySelector('[data-testid="User-Name"]');
    const lines = un ? un.innerText.split("\n").map((s) => s.trim()).filter(Boolean) : [];
    const tEl = art.querySelector('[data-testid="tweetText"]');
    const basic = {
      id: permalinkId(art),
      name: lines[0] || "",
      handle: lines.find((l) => l.startsWith("@")) || "",
      text: (tEl ? tEl.innerText : "").trim()
    };
    if (basic.id && basic.text) tweetCache.set(basic.id, basic); // cache de tous les tweets vus
    return basic;
  }

  // Calcule le contexte (post initial / parents) depuis le DOM
  function computeContextFromDOM(article) {
    const all = [...document.querySelectorAll('article[data-testid="tweet"]')];
    const idx = all.indexOf(article);
    const ctx = [];
    const seen = new Set();
    const add = (b, atFront) => {
      const key = b.id || b.text;
      if (!b.text || seen.has(key)) return;
      seen.add(key);
      if (atFront) ctx.unshift(b); else ctx.push(b);
    };

    let anchorEl = null; // élément DOM du post initial (pour scroller dessus)

    // Cas A : réponse explicite (timeline) → on remonte la chaîne par handle
    const head = tweetHead(article);
    const hasReplyingTo = /Replying to|En réponse à/i.test(head);
    if (hasReplyingTo && idx > 0) {
      const handles = new Set([...head.matchAll(/@(\w+)/g)].map((m) => m[1].toLowerCase()));
      const chain = [];
      for (let j = idx - 1; j >= 0 && idx - j <= 3; j--) {
        const prev = all[j];
        const ph = (tweetHandle(prev) || "").replace("@", "").toLowerCase();
        if (ph && handles.has(ph)) { chain.push(extractBasic(prev)); anchorEl = prev; }
        else break;
      }
      chain.reverse().forEach((b) => add(b));
    }

    // Cas B : page de statut → on ajoute le tweet focalisé (le post initial)
    const urlId = (location.pathname.match(/status\/(\d+)/) || [])[1];
    const selId = permalinkId(article);
    if (urlId && selId && selId !== urlId) {
      const focused = all.find((a) => permalinkId(a) === urlId);
      if (focused && focused !== article) { add(extractBasic(focused), true); anchorEl = focused; }
    }

    return { context: ctx, hasReplyingTo, anchorEl };
  }

  // Récupère le contexte avec mise en cache (persiste si le parent quitte le DOM au scroll)
  function getThreadContext(article) {
    const selId = permalinkId(article);
    const { context, hasReplyingTo, anchorEl } = computeContextFromDOM(article);

    if (context.length) {
      if (selId) threadCache.set(selId, context); // met le post initial en cache
      return { context, isReply: true, fromCache: false, anchorEl };
    }

    // Rien dans le DOM : on tente le cache (le parent a peut-être disparu au scroll)
    if (selId && threadCache.has(selId)) {
      return { context: threadCache.get(selId), isReply: true, fromCache: true, anchorEl: null };
    }

    // Pas de contexte trouvé : on reste sur la détection « réponse » via le label
    return { context: [], isReply: hasReplyingTo, fromCache: false, anchorEl: null };
  }

  // Mise en cache passive des fils visibles (appelée périodiquement)
  function cacheVisibleThreads() {
    if (!shadowRoot) return; // inutile tant que la sidebar n'a pas servi
    const arts = document.querySelectorAll('article[data-testid="tweet"]');
    arts.forEach((art) => {
      const id = permalinkId(art);
      if (!id) return;
      extractBasic(art); // alimente tweetCache
      if (!threadCache.has(id)) {
        const { context } = computeContextFromDOM(art);
        if (context.length) threadCache.set(id, context);
      }
    });
  }

  function renderTweetCard(t) {
    const m = t.metrics || {};
    const md = t.media || {};
    const item = (svg, val, cls) => (val != null ? `<span class="tw-metric ${cls || ""}">${svg}${fmtCount(val)}</span>` : "");
    let mediaLabel = "";
    if (md.images && md.images.length) {
      mediaLabel = `🖼️ ${md.images.length} image${md.images.length > 1 ? "s" : ""}${md.hasVideo ? " + vidéo" : ""} — cliquer pour prévisualiser`;
    } else if (md.hasVideo) {
      mediaLabel = "🎬 Vidéo — cliquer pour l'aperçu";
    }
    ui.tweetCard.innerHTML = `
      <div class="tw-head">
        ${t.avatar ? `<img class="tw-avatar" src="${escapeHtml(t.avatar)}" alt="">` : `<div class="tw-avatar"></div>`}
        <div class="tw-id">
          <div class="tw-name">${escapeHtml(t.name)}${t.verified ? SVG.verified : ""}</div>
          <div class="tw-handle">${escapeHtml(t.handle)}${t.timeRel ? " · " + escapeHtml(t.timeRel) : ""}</div>
        </div>
      </div>
      <div class="tw-body">${escapeHtml(t.text) || '<span style="color:#7c8893">(texte non détecté)</span>'}</div>
      ${mediaLabel ? `<div class="tw-media clickable" id="mediaBtn">${mediaLabel}</div>` : ""}
      <div class="tw-metrics">
        ${item(SVG.reply, m.replies)}
        ${item(SVG.repost, m.reposts)}
        ${item(SVG.like, m.likes)}
        ${item(SVG.view, m.views, "views")}
      </div>
    `;
    const mb = ui.tweetCard.querySelector("#mediaBtn");
    if (mb) mb.addEventListener("click", () => openLightbox(md));
  }

  function openLightbox(media) {
    if (!media || !media.has) return;
    let lb = shadowRoot.getElementById("lightbox");
    if (!lb) {
      lb = document.createElement("div");
      lb.id = "lightbox";
      lb.className = "lightbox";
      lb.addEventListener("click", (e) => { if (e.target === lb || e.target.classList.contains("lb-close")) lb.remove(); });
      shadowRoot.querySelector(".panel").appendChild(lb);
    }
    const imgs = (media.images || []).map((u) => `<img class="lb-img" src="${escapeHtml(u)}" alt="">`).join("");
    const vid = media.hasVideo
      ? `<div class="lb-video">${media.videoPoster ? `<img class="lb-img" src="${escapeHtml(media.videoPoster)}" alt="">` : ""}<div class="lb-vidnote">🎬 Aperçu vidéo (lecture sur X). Le contenu vidéo n'est pas envoyé à l'IA.</div></div>`
      : "";
    lb.innerHTML = `<div class="lb-inner"><button class="lb-close" title="Fermer">×</button>${imgs}${vid}</div>`;
  }

  function renderContext(list, isReply, fromCache) {
    // Réponse, mais parent introuvable (ni DOM ni cache)
    if (isReply && (!list || !list.length)) {
      ui.contextCard.style.display = "block";
      ui.contextCard.innerHTML =
        `<div class="ctx-label">🧵 Réponse à un post</div>` +
        `<div class="ctx-empty">Post initial non récupéré (il faut qu'il ait été affiché à l'écran au moins une fois). Ouvre le tweet ou scrolle jusqu'au post d'origine, puis re-sélectionne.</div>`;
      return;
    }
    if (!list || !list.length) {
      ui.contextCard.style.display = "none";
      ui.contextCard.innerHTML = "";
      return;
    }
    ui.contextCard.style.display = "block";
    ui.contextCard.innerHTML =
      `<div class="ctx-label">🧵 Post initial / contexte récupéré (${list.length})${fromCache ? " · cache" : ""}</div>` +
      list
        .map(
          (c) =>
            `<div class="ctx-card"><div class="ctx-author">${escapeHtml(c.name)} ${escapeHtml(c.handle)}</div><div class="ctx-text">${escapeHtml(c.text)}</div></div>`
        )
        .join("");
  }

  function selectTweet(article) {
    state.selectedArticle = article;
    const t = extractTweet(article);
    const { context, isReply, fromCache, anchorEl } = getThreadContext(article);
    state.selectedTweet = t;
    state.selectedContext = context;
    state.originalPostEl = anchorEl || null;

    ui.selectedWrap.style.display = "block";
    renderTweetCard(t);
    renderContext(context, isReply, fromCache);

    // Badge : réponse à un post (cliquable → scroll vers le post initial), ou post original
    if (isReply) {
      const canScroll = !!state.originalPostEl;
      ui.tweetRelation.textContent = (fromCache ? "🧵 Réponse · post en cache" : "🧵 Réponse à un post") + (canScroll ? " ↗" : "");
      ui.tweetRelation.className = "pill clickable " + (fromCache ? "cached" : "reply");
      ui.tweetRelation.title = canScroll ? "Aller au post initial" : "";
      ui.tweetRelation.onclick = () => scrollToOriginalPost();
    } else {
      ui.tweetRelation.textContent = "📝 Post original";
      ui.tweetRelation.className = "pill original";
      ui.tweetRelation.title = "";
      ui.tweetRelation.onclick = null;
    }

    ui.variants.innerHTML = "";
    ui.draftWrap.style.display = "none";
    ui.replyText.value = "";
    updateDraftCounter();
    setStatus(
      isReply
        ? context.length
          ? `Réponse détectée — post initial récupéré ✓`
          : `Réponse détectée — post initial non disponible`
        : "Post original sélectionné ✓",
      isReply && !context.length ? "info" : "ok"
    );

    // brève surbrillance de confirmation
    article.style.outline = "3px solid #00ba7c";
    article.style.outlineOffset = "-3px";
    setTimeout(() => { article.style.outline = ""; }, 800);
  }

  function scrollToOriginalPost() {
    const el = state.originalPostEl;
    if (!el || !document.contains(el)) {
      setStatus("Post initial hors écran (restitué depuis le cache, impossible d'y aller).", "info");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.outline = "3px solid #1d9bf0";
    el.style.outlineOffset = "-3px";
    el.style.transition = "outline .2s";
    setTimeout(() => { el.style.outline = ""; }, 1400);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Génération via OpenAI (background)
  // ───────────────────────────────────────────────────────────────────────────
  function doGenerate() {
    if (!state.selectedTweet) { setStatus("Sélectionne d'abord un tweet.", "err"); return; }
    if (!state.config.apiKey) { setStatus("Ajoute ta clé API OpenAI dans l'onglet Configuration.", "err"); return; }

    const n = state.config.count || 3;
    ui.generateBtn.disabled = true;
    ui.draftWrap.style.display = "none";
    setStatus(n > 1 ? `Génération de ${n} variantes…` : "Génération…", "info");
    showSkeletons(n);

    chrome.runtime.sendMessage(
      {
        type: "GENERATE_REPLY",
        payload: {
          apiKey: state.config.apiKey,
          model: state.config.model,
          language: state.config.language,
          length: state.config.length,
          count: n,
          instructions: state.config.instructions,
          tweetText: state.selectedTweet.text,
          author: [state.selectedTweet.name, state.selectedTweet.handle].filter(Boolean).join(" "),
          metrics: state.selectedTweet.metrics,
          images: (state.selectedTweet.media && state.selectedTweet.media.images) || [],
          context: (state.selectedContext || []).map((c) => ({
            author: [c.name, c.handle].filter(Boolean).join(" "),
            text: c.text
          }))
        }
      },
      (resp) => {
        ui.generateBtn.disabled = false;
        if (chrome.runtime.lastError) { ui.variants.innerHTML = ""; setStatus("Erreur runtime : " + chrome.runtime.lastError.message, "err"); return; }
        if (!resp || !resp.ok) { ui.variants.innerHTML = ""; setStatus("Erreur : " + (resp && resp.error ? resp.error : "inconnue"), "err"); return; }
        const list = resp.variants || [];
        if (!list.length) { ui.variants.innerHTML = ""; setStatus("Aucune réponse générée.", "err"); return; }
        state.lastReply = list[0];
        renderVariants(list);
        setStatus(`${list.length} réponse${list.length > 1 ? "s" : ""} générée${list.length > 1 ? "s" : ""} ✓ — « Insérer » pour publier, « Éditer » pour affiner.`, "ok");
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

  async function insertIntoX(textArg) {
    const text = (typeof textArg === "string" ? textArg : ui.replyText.value) || "";
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
    setInterval(cacheVisibleThreads, 2500);
    window.addEventListener("resize", () => ensureNavButton(), true);
    window.addEventListener("scroll", () => ensureNavButton(), true);
  });
})();
