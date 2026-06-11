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
      instructions: "",
      personas: [],
      activePersonaId: "",
      onboarded: false
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

  // Onboarding (assistant de style)
  let obState = { step: 0, answers: {} };
  const OB_STEPS = [
    { key: "niche", title: "Ta niche", q: "Quels sujets / thèmes traites-tu principalement ?", type: "textarea", ph: "Ex : IA, SaaS, build in public, crypto, productivité…" },
    { key: "audience", title: "Ton audience", q: "À qui t'adresses-tu ?", type: "text", ph: "Ex : fondateurs, devs, marketeurs, débutants…" },
    { key: "tone", title: "Ton ton", q: "Quelle personnalité veux-tu dégager ?", type: "text", ph: "Choisis ou écris…", chips: ["Direct", "Provoc", "Expert", "Drôle", "Inspirant", "Cash", "Bienveillant", "Contrarian"] },
    { key: "language", title: "Ta langue", q: "Langue principale de tes réponses ?", type: "text", ph: "Choisis…", chips: ["Français", "English", "Auto (langue du tweet)"] },
    { key: "emojis", title: "Les emojis", q: "Quel usage des emojis ?", type: "text", ph: "Choisis…", chips: ["Jamais", "1 max", "Parfois"] },
    { key: "goal", title: "Ton objectif", q: "Ton but sur X ?", type: "text", ph: "Choisis ou écris…", chips: ["Gagner des abonnés", "Vendre mon produit", "Networker", "Autorité / expertise"] },
    { key: "examples", title: "Tes inspirations", q: "Des comptes qui t'inspirent, des punchlines, ou ta bio ?", type: "textarea", ph: "Colle ta bio ou des exemples de ton style…" }
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // Config (chrome.storage.local)
  // ───────────────────────────────────────────────────────────────────────────
  function loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get("replyerConfig", (data) => {
        if (data && data.replyerConfig) Object.assign(state.config, data.replyerConfig);
        migratePersonas();
        resolve();
      });
    });
  }

  // Modèle de personas multiples. `instructions` reste le miroir de la persona active.
  function migratePersonas() {
    if (!Array.isArray(state.config.personas) || !state.config.personas.length) {
      state.config.personas = [{ id: "p_default", name: "Mon style", instructions: state.config.instructions || "" }];
      state.config.activePersonaId = "p_default";
    }
    if (!state.config.activePersonaId || !state.config.personas.some((p) => p.id === state.config.activePersonaId)) {
      state.config.activePersonaId = state.config.personas[0].id;
    }
    const ap = activePersona();
    state.config.instructions = (ap && ap.instructions) || "";
  }
  function activePersona() {
    return state.config.personas.find((p) => p.id === state.config.activePersonaId) || state.config.personas[0];
  }
  function newPersonaId() {
    return "p_" + Date.now().toString(36) + Math.floor(performance.now()).toString(36);
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
        * { box-sizing: border-box; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        :host {
          --bg:#171717; --panel:#1c1c1c; --card:#1f1f1f; --card-2:#242424;
          --border:#2e2e2e; --border-strong:#3a3a3a;
          --fg:#ededed; --muted:#a0a0a0; --muted-2:#707070;
          --accent:#3ecf8e; --accent-hover:#34b87b; --accent-fg:#0a1f16;
          --danger:#f87171; --info:#60a5fa;
          --radius:8px;
        }
        ::selection { background: rgba(62,207,142,.3); }

        /* Scrollbars (propres, fines) */
        *::-webkit-scrollbar { width:8px; height:8px; }
        *::-webkit-scrollbar-track { background:transparent; }
        *::-webkit-scrollbar-thumb { background:#3a3a3a; border-radius:8px; }
        *::-webkit-scrollbar-thumb:hover { background:#4a4a4a; }

        .panel {
          position: fixed; top: 0; right: 0; height: 100vh; width: 400px; max-width: 94vw;
          background: var(--bg); color: var(--fg); box-shadow: -16px 0 50px rgba(0,0,0,.55);
          display: flex; flex-direction: column; transform: translateX(102%);
          transition: transform .26s cubic-bezier(.22,.61,.36,1); border-left: 1px solid var(--border);
          font-size:14px;
        }
        .panel.open { transform: translateX(0); }

        header {
          display:flex; align-items:center; justify-content:space-between; padding:14px 16px;
          border-bottom:1px solid var(--border); background:var(--panel);
        }
        .brand { display:flex; align-items:center; gap:10px; }
        .logo { width:30px; height:30px; border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center; }
        .logo img { width:100%; height:100%; object-fit:cover; display:block; }
        .brand h1 { margin:0; font-size:15px; font-weight:700; letter-spacing:-.2px; color:var(--fg); }
        .brand .sub { font-size:11px; color:var(--muted-2); font-weight:500; }
        .close { background:transparent; border:none; color:var(--muted); font-size:20px; cursor:pointer; line-height:1; width:30px; height:30px; border-radius:7px; display:flex; align-items:center; justify-content:center; transition:.15s; }
        .close:hover { background:var(--card-2); color:var(--fg); }

        /* Tabs : segmented control shadcn */
        .tabs { display:flex; gap:3px; margin:12px 16px 4px; padding:3px; background:var(--panel); border:1px solid var(--border); border-radius:9px; }
        .tab { flex:1; text-align:center; padding:7px; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600; color:var(--muted); transition:.15s; }
        .tab:hover { color:var(--fg); }
        .tab.active { color:var(--fg); background:var(--card-2); box-shadow:0 1px 2px rgba(0,0,0,.3); }

        .body { padding:14px 16px; overflow-y:auto; flex:1; }

        label { display:block; font-size:12px; color:var(--muted); margin:16px 0 6px; font-weight:600; letter-spacing:0; }
        input, select, textarea {
          width:100%; background:var(--card); border:1px solid var(--border); color:var(--fg);
          border-radius:var(--radius); padding:9px 11px; font-size:13.5px; outline:none; transition:border-color .12s, box-shadow .12s;
        }
        input::placeholder, textarea::placeholder { color:var(--muted-2); }
        input:hover, select:hover, textarea:hover { border-color:var(--border-strong); }
        input:focus, select:focus, textarea:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(62,207,142,.12); }
        textarea { resize:none; min-height:64px; max-height:260px; line-height:1.5; overflow-y:auto; }
        /* Le persona peut être long : on le laisse s'étendre largement avant de scroller */
        #instructions { min-height:120px; max-height:75vh; }
        #obResult { max-height:46vh; }
        select { appearance:none; -webkit-appearance:none; background-image:url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23a0a0a0' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 10px center; padding-right:30px; cursor:pointer; }
        .row { display:flex; gap:8px; }
        .row > div { flex:1; min-width:0; }

        button.primary {
          width:100%; margin-top:16px; background:var(--accent); color:var(--accent-fg); border:1px solid transparent;
          border-radius:var(--radius); padding:10px; font-size:14px; font-weight:600; cursor:pointer; transition:.13s;
        }
        button.primary:hover { background:var(--accent-hover); }
        button.primary:active { transform:translateY(.5px); }
        button.primary:disabled { opacity:.4; cursor:not-allowed; }
        button.ghost {
          background:var(--card); border:1px solid var(--border); color:var(--fg);
          border-radius:var(--radius); padding:9px; font-size:13.5px; font-weight:600; cursor:pointer; flex:1; transition:.13s;
        }
        button.ghost:hover { background:var(--card-2); border-color:var(--border-strong); }

        .hint { font-size:12px; color:var(--muted-2); margin-top:7px; line-height:1.5; }
        .divider { height:1px; background:var(--border); margin:16px 0; }
        .actions { display:flex; gap:8px; margin-top:10px; }
        .status { font-size:12.5px; margin-top:10px; min-height:16px; font-weight:500; line-height:1.4; }
        .status.err { color:var(--danger); }
        .status.ok { color:var(--accent); }
        .status.info { color:var(--muted); }

        .selected-box { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:12px; font-size:13px; color:#c8cdd1; white-space:pre-wrap; max-height:150px; overflow:auto; line-height:1.5; }
        .selected-author { color:var(--accent); font-weight:700; margin-bottom:5px; font-size:13px; }

        /* Variantes */
        .variants { margin-top:14px; display:flex; flex-direction:column; gap:10px; }
        .variant {
          background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:12px;
          transition:border-color .13s; position:relative;
        }
        .variant:hover { border-color:var(--border-strong); }
        .variant-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:7px; }
        .variant-tag { font-size:11px; font-weight:700; color:var(--accent); letter-spacing:.02em; }
        .variant-len { font-size:11px; font-weight:600; color:var(--muted-2); font-variant-numeric:tabular-nums; }
        .variant-len.over { color:var(--danger); }
        .variant-text { font-size:13.5px; line-height:1.55; color:var(--fg); white-space:pre-wrap; word-break:break-word; }
        .variant-actions { display:flex; gap:7px; margin-top:11px; }
        .chip {
          background:var(--card-2); border:1px solid var(--border); color:#cfd6dc; border-radius:7px;
          padding:6px 11px; font-size:12.5px; font-weight:600; cursor:pointer; transition:.13s; display:flex; align-items:center; gap:5px;
        }
        .chip:hover { background:#2c2c2c; border-color:var(--border-strong); color:var(--fg); }
        .chip.insert { background:var(--accent); border-color:transparent; color:var(--accent-fg); margin-left:auto; }
        .chip.insert:hover { background:var(--accent-hover); }

        /* Skeleton chargement */
        .skel { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:13px; overflow:hidden; }
        .skel-line { height:10px; border-radius:5px; margin:7px 0; background:linear-gradient(90deg,#242424 25%,#2f2f2f 37%,#242424 63%); background-size:400% 100%; animation:shimmer 1.3s infinite; }
        .skel-line.w70 { width:70%; } .skel-line.w90 { width:90%; } .skel-line.w50 { width:50%; }
        @keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:0 0} }

        .draft-counter { text-align:right; font-size:11px; font-weight:600; color:var(--muted-2); margin-top:5px; font-variant-numeric:tabular-nums; }
        .draft-counter.over { color:var(--danger); }

        /* Carte tweet */
        .tw { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:12px; }
        .tw-head { display:flex; align-items:center; gap:10px; }
        .tw-avatar { width:40px; height:40px; border-radius:9999px; flex:none; background:var(--card-2); object-fit:cover; }
        .tw-id { min-width:0; flex:1; }
        .tw-name { font-weight:700; font-size:14px; color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:4px; }
        .tw-verified { width:15px; height:15px; fill:var(--info); flex:none; }
        .tw-handle { color:var(--muted-2); font-size:13px; font-weight:400; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .tw-body { font-size:14px; line-height:1.55; color:var(--fg); margin-top:10px; white-space:pre-wrap; word-break:break-word; max-height:200px; overflow:auto; }
        .tw-media { margin-top:9px; font-size:12px; color:var(--muted); background:var(--bg); border:1px solid var(--border); border-radius:7px; padding:6px 9px; display:inline-block; }
        .tw-media.clickable { cursor:pointer; color:var(--accent); border-color:rgba(62,207,142,.3); transition:.13s; }
        .tw-media.clickable:hover { background:rgba(62,207,142,.08); }

        /* Lightbox média */
        .lightbox { position:absolute; inset:0; background:rgba(0,0,0,.85); z-index:50; display:flex; align-items:center; justify-content:center; padding:18px; animation:fade .15s ease; }
        .lb-inner { position:relative; max-width:100%; max-height:100%; overflow:auto; display:flex; flex-direction:column; gap:10px; }
        .lb-img { max-width:100%; border-radius:var(--radius); display:block; box-shadow:0 8px 30px rgba(0,0,0,.5); }
        .lb-close { position:sticky; top:0; align-self:flex-end; background:var(--card); color:var(--fg); border:1px solid var(--border-strong); width:32px; height:32px; border-radius:9999px; font-size:18px; cursor:pointer; line-height:1; }
        .lb-close:hover { background:var(--card-2); }
        .lb-vidnote { font-size:12px; color:var(--muted); text-align:center; margin-top:4px; }

        /* Personas */
        .persona-row { display:flex; gap:7px; }
        .persona-row select { flex:1; }
        .persona-row button.icon { flex:none; width:38px; padding:0; font-size:15px; display:flex; align-items:center; justify-content:center; }

        /* Vol de style */
        .steal-row { display:flex; gap:8px; }
        .steal-row input { flex:2; }
        .steal-row button { flex:1; margin:0; white-space:nowrap; }

        /* Onboarding overlay */
        .ob { position:absolute; inset:0; background:var(--bg); z-index:60; display:flex; flex-direction:column; animation:fade .18s ease; }
        .ob-head { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--border); }
        .ob-title { font-size:15px; font-weight:700; }
        .ob-x { background:transparent; border:none; color:var(--muted); font-size:22px; cursor:pointer; }
        .ob-x:hover { color:var(--fg); }
        .ob-progress { height:3px; background:var(--card); }
        .ob-bar { height:100%; background:var(--accent); width:0; transition:width .25s ease; }
        .ob-body { padding:22px 18px; flex:1; overflow-y:auto; }
        .ob-step-n { font-size:11px; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:.04em; }
        .ob-q { font-size:18px; font-weight:700; margin:8px 0 4px; line-height:1.3; }
        .ob-sub { font-size:13px; color:var(--muted); margin-bottom:16px; line-height:1.5; }
        .ob-chips { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }
        .ob-chip { background:var(--card); border:1px solid var(--border); color:#cfd6dc; border-radius:7px; padding:7px 12px; font-size:13px; cursor:pointer; transition:.13s; }
        .ob-chip:hover, .ob-chip.sel { background:rgba(62,207,142,.12); border-color:var(--accent); color:var(--fg); }
        .ob-nav { display:flex; gap:10px; padding:14px 16px; border-top:1px solid var(--border); }
        .ob-nav button { margin:0; }
        .ob-result { width:100%; min-height:200px; max-height:300px; }

        .tw-metrics { display:flex; align-items:center; gap:16px; margin-top:11px; padding-top:11px; border-top:1px solid var(--border); color:var(--muted-2); font-size:12.5px; font-weight:500; }
        .tw-metric { display:flex; align-items:center; gap:5px; font-variant-numeric:tabular-nums; }
        .tw-metric.views { margin-left:auto; }
        .tw-metric svg { width:15px; height:15px; fill:currentColor; }
        .tw-metric.views svg { fill:var(--accent); }

        /* En-tête sélection + badge relation */
        .sel-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:16px 0 7px; }
        .sel-head label { margin:0; }
        .pill { font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:6px; letter-spacing:.02em; white-space:nowrap; }
        .pill.reply { background:rgba(62,207,142,.14); color:var(--accent); border:1px solid rgba(62,207,142,.35); }
        .pill.original { background:var(--card-2); color:var(--muted); border:1px solid var(--border); }
        .pill.cached { background:rgba(96,165,250,.14); color:var(--info); border:1px solid rgba(96,165,250,.3); }
        .pill.clickable { cursor:pointer; transition:filter .15s; }
        .pill.clickable:hover { filter:brightness(1.2); }

        /* Contexte (post initial / fil) */
        .ctx-label { font-size:11px; color:var(--muted-2); font-weight:700; margin:14px 0 7px; letter-spacing:.02em; display:flex; align-items:center; gap:6px; }
        .ctx-empty { font-size:12.5px; color:var(--muted-2); background:var(--card); border:1px dashed var(--border-strong); border-radius:var(--radius); padding:10px 12px; line-height:1.5; }
        .ctx-card { background:var(--card); border:1px solid var(--border); border-left:2px solid var(--accent); border-radius:var(--radius); padding:10px 12px; }
        .ctx-card + .ctx-card { margin-top:8px; }
        .ctx-author { color:var(--accent); font-weight:600; font-size:12.5px; margin-bottom:3px; }
        .ctx-text { font-size:13px; color:var(--muted); line-height:1.5; white-space:pre-wrap; word-break:break-word; max-height:120px; overflow:auto; }
        .badge { display:inline-block; background:var(--accent); color:var(--accent-fg); font-size:10px; padding:2px 6px; border-radius:5px; vertical-align:middle; font-weight:700; }

        /* Growth Radar */
        .radar-list { margin-top:14px; display:flex; flex-direction:column; gap:10px; }
        .radar-card { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:12px; transition:border-color .13s; }
        .radar-card:hover { border-color:var(--border-strong); }
        .radar-top { display:flex; align-items:flex-start; gap:10px; }
        .radar-score { flex:none; width:42px; height:42px; border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:15px; font-weight:800; font-variant-numeric:tabular-nums; }
        .radar-score.hot { background:rgba(62,207,142,.16); color:var(--accent); border:1px solid rgba(62,207,142,.4); }
        .radar-score.warm { background:rgba(245,179,80,.14); color:#f5b350; border:1px solid rgba(245,179,80,.35); }
        .radar-score.mild { background:var(--card-2); color:var(--muted); border:1px solid var(--border); }
        .radar-main { min-width:0; flex:1; }
        .radar-author { font-size:12.5px; font-weight:700; color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .radar-reason { font-size:11.5px; color:var(--accent); margin-top:1px; line-height:1.35; }
        .radar-text { font-size:13px; color:var(--muted); line-height:1.45; margin-top:7px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
        .radar-meta { font-size:11px; color:var(--muted-2); margin-top:7px; display:flex; gap:12px; font-variant-numeric:tabular-nums; }
        .radar-actions { display:flex; gap:7px; margin-top:10px; }
        section { display:none; }
        section.active { display:block; animation:fade .2s ease; }
        @keyframes fade { from{opacity:0; transform:translateY(4px)} to{opacity:1; transform:none} }
      </style>

      <div class="panel" id="panel">
        <header>
          <div class="brand">
            <span class="logo"><img src="${chrome.runtime.getURL("src/icon.png")}" alt="Replyer"></span>
            <div>
              <h1>Replyer</h1>
              <div class="sub">Réponses IA · Croissance X</div>
            </div>
          </div>
          <button class="close" id="close">×</button>
        </header>

        <div class="tabs">
          <div class="tab active" data-tab="reply">⚡ Répondre</div>
          <div class="tab" data-tab="radar">📡 Radar</div>
          <div class="tab" data-tab="config">⚙️ Config</div>
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
                  <button class="ghost" id="insertBtn" style="background:var(--accent);border-color:transparent;color:var(--accent-fg);">↩️ Insérer dans X</button>
                </div>
                <p class="hint">« Insérer » ouvre le champ de réponse du tweet et y colle le texte. Tu valides l'envoi toi-même sur X.</p>
              </div>
            </div>
          </section>

          <!-- ONGLET RADAR -->
          <section id="tab-radar">
            <button class="primary" id="radarScan" style="margin-top:0;">📡 Scanner le fil</button>
            <p class="hint">Replyer analyse les tweets de ton fil et classe les <b>meilleures opportunités de réponse</b> selon ta niche (onglet Config), leur fraîcheur et leur portée.</p>
            <div class="status info" id="radarStatus"></div>
            <div class="radar-list" id="radarList"></div>
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

            <label>Persona active</label>
            <div class="persona-row">
              <select id="personaSelect"></select>
              <button class="ghost icon" id="personaNew" title="Nouvelle persona">＋</button>
              <button class="ghost icon" id="personaRename" title="Renommer">✎</button>
              <button class="ghost icon" id="personaDelete" title="Supprimer">🗑</button>
            </div>
            <p class="hint">Crée plusieurs styles (perso, marque, shitpost…) et bascule en un clic. L'assistant et le vol de style écrivent dans la persona active.</p>

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
    // radar
    ui.radarScan = shadowRoot.getElementById("radarScan");
    ui.radarStatus = shadowRoot.getElementById("radarStatus");
    ui.radarList = shadowRoot.getElementById("radarList");
    // config
    ui.apiKey = shadowRoot.getElementById("apiKey");
    ui.model = shadowRoot.getElementById("model");
    ui.language = shadowRoot.getElementById("language");
    ui.length = shadowRoot.getElementById("length");
    ui.count = shadowRoot.getElementById("count");
    ui.instructions = shadowRoot.getElementById("instructions");
    ui.saveBtn = shadowRoot.getElementById("saveBtn");
    ui.cfgStatus = shadowRoot.getElementById("cfgStatus");
    ui.personaSelect = shadowRoot.getElementById("personaSelect");
    ui.personaNew = shadowRoot.getElementById("personaNew");
    ui.personaRename = shadowRoot.getElementById("personaRename");
    ui.personaDelete = shadowRoot.getElementById("personaDelete");
    ui.obLaunch = shadowRoot.getElementById("obLaunch");
    ui.stealHandle = shadowRoot.getElementById("stealHandle");
    ui.stealBtn = shadowRoot.getElementById("stealBtn");
    // onboarding
    ui.onboarding = shadowRoot.getElementById("onboarding");
    ui.obClose = shadowRoot.getElementById("obClose");
    ui.obBar = shadowRoot.getElementById("obBar");
    ui.obBody = shadowRoot.getElementById("obBody");
    ui.obBack = shadowRoot.getElementById("obBack");
    ui.obNext = shadowRoot.getElementById("obNext");

    // Remplir la config
    ui.apiKey.value = state.config.apiKey || "";
    ui.model.value = state.config.model || "gpt-4o-mini";
    ui.language.value = state.config.language || "";
    ui.length.value = state.config.length || "moyen";
    ui.count.value = String(state.config.count || 3);
    ui.instructions.value = (activePersona() && activePersona().instructions) || "";
    renderPersonaSelect();
    updateGenerateLabel();
    setTimeout(() => autoGrow(ui.instructions), 0);

    // Tabs
    shadowRoot.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        shadowRoot.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        shadowRoot.querySelectorAll("section").forEach((s) => s.classList.remove("active"));
        tab.classList.add("active");
        shadowRoot.getElementById("tab-" + tab.dataset.tab).classList.add("active");
        if (tab.dataset.tab === "config") autoGrow(ui.instructions);
      });
    });

    // Events
    ui.close.addEventListener("click", () => toggleSidebar(false));
    ui.selectBtn.addEventListener("click", () => startSelection());
    ui.generateBtn.addEventListener("click", () => doGenerate());
    ui.replyText.addEventListener("input", () => { updateDraftCounter(); autoGrow(ui.replyText); });
    ui.instructions.addEventListener("input", () => autoGrow(ui.instructions));
    ui.copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(ui.replyText.value || "").then(() => setStatus("Copié ✓", "ok"));
    });
    ui.insertBtn.addEventListener("click", () => insertIntoX(ui.replyText.value));
    ui.radarScan.addEventListener("click", () => runRadar());
    ui.saveBtn.addEventListener("click", () => {
      state.config.apiKey = ui.apiKey.value.trim();
      state.config.model = ui.model.value;
      state.config.language = ui.language.value.trim();
      state.config.length = ui.length.value;
      state.config.count = parseInt(ui.count.value, 10) || 3;
      commitActivePersona();
      saveConfig();
      updateGenerateLabel();
      ui.cfgStatus.className = "status ok";
      ui.cfgStatus.textContent = "Configuration enregistrée ✓";
      setTimeout(() => (ui.cfgStatus.textContent = ""), 2500);
    });

    // Personas
    ui.personaSelect.addEventListener("change", () => switchPersona(ui.personaSelect.value));
    ui.personaNew.addEventListener("click", () => personaCreate());
    ui.personaRename.addEventListener("click", () => personaRename());
    ui.personaDelete.addEventListener("click", () => personaDelete());

    // Vol de style + onboarding
    if (state.selectedTweet === null) ui.stealHandle.value = currentProfileHandle();
    ui.stealBtn.addEventListener("click", () => stealStyle());
    ui.obLaunch.addEventListener("click", () => openOnboarding());
    ui.obClose.addEventListener("click", () => (ui.onboarding.style.display = "none"));
    ui.obBack.onclick = () => obStep(-1);
    ui.obNext.onclick = () => obStep(1);
  }

  function currentProfileHandle() {
    const seg = location.pathname.replace(/^\//, "").split("/")[0].toLowerCase();
    const reserved = new Set(["home", "explore", "notifications", "messages", "search", "i", "settings", "compose", ""]);
    return reserved.has(seg) ? "" : "@" + seg;
  }

  // ── Personas multiples ───────────────────────────────────────────────────
  function renderPersonaSelect() {
    if (!ui.personaSelect) return;
    ui.personaSelect.innerHTML = state.config.personas
      .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
      .join("");
    ui.personaSelect.value = state.config.activePersonaId;
    ui.personaDelete.disabled = state.config.personas.length <= 1;
  }

  // Écrit le contenu du textarea dans la persona active + le miroir state.config.instructions
  function commitActivePersona() {
    const text = (ui.instructions.value || "").trim();
    const ap = activePersona();
    if (ap) ap.instructions = text;
    state.config.instructions = text;
  }

  function switchPersona(id) {
    commitActivePersona(); // sauve les éventuelles modifs en cours
    state.config.activePersonaId = id;
    const ap = activePersona();
    ui.instructions.value = (ap && ap.instructions) || "";
    state.config.instructions = ui.instructions.value;
    autoGrow(ui.instructions);
    saveConfig();
    renderPersonaSelect();
    ui.cfgStatus.className = "status ok";
    ui.cfgStatus.textContent = `Persona « ${ap.name} » active`;
    setTimeout(() => (ui.cfgStatus.textContent = ""), 2000);
  }

  function personaCreate() {
    const name = (window.prompt("Nom de la nouvelle persona :", "Nouvelle persona") || "").trim();
    if (!name) return;
    commitActivePersona();
    const p = { id: newPersonaId(), name, instructions: "" };
    state.config.personas.push(p);
    state.config.activePersonaId = p.id;
    ui.instructions.value = "";
    state.config.instructions = "";
    autoGrow(ui.instructions);
    saveConfig();
    renderPersonaSelect();
    ui.instructions.focus();
  }

  function personaRename() {
    const ap = activePersona();
    const name = (window.prompt("Renommer la persona :", ap.name) || "").trim();
    if (!name) return;
    ap.name = name;
    saveConfig();
    renderPersonaSelect();
  }

  function personaDelete() {
    if (state.config.personas.length <= 1) return;
    const ap = activePersona();
    if (!window.confirm(`Supprimer la persona « ${ap.name} » ?`)) return;
    state.config.personas = state.config.personas.filter((p) => p.id !== ap.id);
    state.config.activePersonaId = state.config.personas[0].id;
    const next = activePersona();
    ui.instructions.value = next.instructions || "";
    state.config.instructions = ui.instructions.value;
    autoGrow(ui.instructions);
    saveConfig();
    renderPersonaSelect();
  }

  // ── Onboarding (assistant de style) ──────────────────────────────────────
  function openOnboarding() {
    obState = { step: 0, answers: Object.assign({}, obState.answers) };
    ui.onboarding.style.display = "flex";
    ui.obBack.disabled = ui.obNext.disabled = false;
    ui.obNext.onclick = () => obStep(1);
    renderObStep();
  }

  function renderObStep() {
    const s = OB_STEPS[obState.step];
    ui.obBar.style.width = Math.round((obState.step / OB_STEPS.length) * 100) + "%";
    ui.obBack.style.visibility = obState.step === 0 ? "hidden" : "visible";
    ui.obNext.textContent = obState.step === OB_STEPS.length - 1 ? "✨ Générer mon style" : "Suivant →";
    ui.obNext.onclick = () => obStep(1);
    const val = obState.answers[s.key] || "";
    const field = s.type === "textarea"
      ? `<textarea id="obInput" placeholder="${escapeHtml(s.ph || "")}">${escapeHtml(val)}</textarea>`
      : `<input id="obInput" type="text" placeholder="${escapeHtml(s.ph || "")}" value="${escapeHtml(val)}">`;
    const chips = s.chips ? `<div class="ob-chips">${s.chips.map((c) => `<span class="ob-chip">${escapeHtml(c)}</span>`).join("")}</div>` : "";
    ui.obBody.innerHTML = `
      <div class="ob-step-n">Étape ${obState.step + 1} / ${OB_STEPS.length}</div>
      <div class="ob-q">${escapeHtml(s.title)}</div>
      <div class="ob-sub">${escapeHtml(s.q)}</div>
      ${field}
      ${chips}
    `;
    const input = ui.obBody.querySelector("#obInput");
    if (input) input.focus();
    ui.obBody.querySelectorAll(".ob-chip").forEach((ch) => {
      ch.addEventListener("click", () => {
        if (s.type === "textarea") {
          const cur = input.value.trim();
          input.value = cur ? cur.replace(/,\s*$/, "") + ", " + ch.textContent : ch.textContent;
        } else {
          input.value = ch.textContent;
        }
        input.focus();
      });
    });
  }

  function obStep(dir) {
    const s = OB_STEPS[obState.step];
    const input = ui.obBody.querySelector("#obInput");
    if (input) obState.answers[s.key] = input.value.trim();
    if (dir < 0) {
      if (obState.step > 0) { obState.step--; renderObStep(); }
      return;
    }
    if (obState.step < OB_STEPS.length - 1) { obState.step++; renderObStep(); return; }
    generateStyleFromOnboarding();
  }

  function generateStyleFromOnboarding() {
    if (!state.config.apiKey) {
      ui.obBody.innerHTML = `<div class="ob-q">Clé API manquante</div><div class="ob-sub" style="color:#f4212e">Ajoute ta clé OpenAI dans l'onglet Configuration, puis relance l'assistant.</div>`;
      return;
    }
    ui.obBar.style.width = "100%";
    ui.obBack.disabled = ui.obNext.disabled = true;
    ui.obBody.innerHTML = `<div class="ob-q">✨ Création de ton style…</div><div class="skel" style="margin-top:12px"><div class="skel-line w90"></div><div class="skel-line w70"></div><div class="skel-line w50"></div></div>`;
    chrome.runtime.sendMessage(
      { type: "BUILD_STYLE", payload: { apiKey: state.config.apiKey, model: state.config.model, mode: "onboarding", answers: obState.answers } },
      (resp) => {
        ui.obBack.disabled = ui.obNext.disabled = false;
        if (chrome.runtime.lastError) { ui.obBody.innerHTML = `<div class="ob-sub" style="color:#f4212e">Erreur : ${escapeHtml(chrome.runtime.lastError.message)}</div>`; return; }
        if (!resp || !resp.ok) { ui.obBody.innerHTML = `<div class="ob-sub" style="color:#f4212e">Erreur : ${escapeHtml((resp && resp.error) || "inconnue")}</div>`; return; }
        renderObResult(resp.style);
      }
    );
  }

  function renderObResult(style) {
    ui.obBody.innerHTML = `
      <div class="ob-step-n">✅ Ton style est prêt</div>
      <div class="ob-q">Ton persona</div>
      <div class="ob-sub">Relis et ajuste si besoin, puis applique-le.</div>
      <textarea id="obResult" class="ob-result">${escapeHtml(style)}</textarea>
    `;
    ui.obBack.style.visibility = "visible";
    ui.obNext.textContent = "✅ Utiliser ce style";
    ui.obNext.onclick = () => {
      const v = (ui.obBody.querySelector("#obResult").value || "").trim();
      ui.instructions.value = v;
      autoGrow(ui.instructions);
      commitActivePersona();
      state.config.onboarded = true;
      saveConfig();
      ui.onboarding.style.display = "none";
      ui.cfgStatus.className = "status ok";
      ui.cfgStatus.textContent = "Style appliqué à tes instructions ✓";
      setTimeout(() => (ui.cfgStatus.textContent = ""), 3000);
    };
  }

  // ── Vol de style d'un compte ─────────────────────────────────────────────
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function scrapeUserTweets(handle, maxScrolls) {
    const map = new Map();
    const collect = () => {
      document.querySelectorAll('article[data-testid="tweet"]').forEach((a) => {
        const h = (tweetHandle(a) || "").replace("@", "").toLowerCase();
        if (h !== handle) return;
        const t = a.querySelector('[data-testid="tweetText"]');
        if (!t) return;
        const txt = t.innerText.trim();
        if (txt.length < 15) return;
        map.set(permalinkId(a) || txt, txt);
      });
    };
    collect();
    const onProfile = location.pathname.replace(/^\//, "").split("/")[0].toLowerCase() === handle;
    if (onProfile) {
      const prevY = window.scrollY;
      for (let i = 0; i < (maxScrolls || 10) && map.size < 30; i++) {
        window.scrollBy(0, window.innerHeight * 1.6);
        await sleep(650);
        collect();
      }
      window.scrollTo(0, prevY);
    }
    return [...map.values()];
  }

  async function stealStyle() {
    const handle = ui.stealHandle.value.trim().replace(/^@/, "").toLowerCase();
    if (!handle) { ui.cfgStatus.className = "status err"; ui.cfgStatus.textContent = "Entre un @compte à analyser."; return; }
    if (!state.config.apiKey) { ui.cfgStatus.className = "status err"; ui.cfgStatus.textContent = "Ajoute ta clé API OpenAI d'abord."; return; }

    ui.stealBtn.disabled = true;
    ui.cfgStatus.className = "status info";
    ui.cfgStatus.textContent = `Lecture des tweets de @${handle}…`;

    const tweets = await scrapeUserTweets(handle);
    if (tweets.length < 3) {
      ui.stealBtn.disabled = false;
      ui.cfgStatus.className = "status err";
      ui.cfgStatus.textContent = `Trop peu de tweets de @${handle} trouvés (${tweets.length}). Ouvre x.com/${handle}, scrolle un peu, puis reclique.`;
      return;
    }

    ui.cfgStatus.textContent = `${tweets.length} tweets analysés — création du style…`;
    chrome.runtime.sendMessage(
      { type: "BUILD_STYLE", payload: { apiKey: state.config.apiKey, model: state.config.model, mode: "steal", handle, tweets } },
      (resp) => {
        ui.stealBtn.disabled = false;
        if (chrome.runtime.lastError) { ui.cfgStatus.className = "status err"; ui.cfgStatus.textContent = "Erreur : " + chrome.runtime.lastError.message; return; }
        if (!resp || !resp.ok) { ui.cfgStatus.className = "status err"; ui.cfgStatus.textContent = "Erreur : " + ((resp && resp.error) || "inconnue"); return; }
        const cur = ui.instructions.value.trim();
        const block = `— Style inspiré de @${handle} —\n${resp.style}`;
        ui.instructions.value = cur ? cur + "\n\n" + block : block;
        autoGrow(ui.instructions);
        commitActivePersona();
        saveConfig();
        ui.cfgStatus.className = "status ok";
        ui.cfgStatus.textContent = `Style de @${handle} ajouté à tes instructions ✓`;
      }
    );
  }

  // ── Growth Radar ─────────────────────────────────────────────────────────
  function switchTab(name) {
    shadowRoot.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    shadowRoot.querySelectorAll("section").forEach((s) => s.classList.remove("active"));
    const sec = shadowRoot.getElementById("tab-" + name);
    if (sec) sec.classList.add("active");
    if (name === "config") autoGrow(ui.instructions);
  }

  function findArticleById(id) {
    return [...document.querySelectorAll('article[data-testid="tweet"]')].find((a) => permalinkId(a) === id) || null;
  }

  async function scanTimeline() {
    const map = new Map();
    const collect = () => {
      document.querySelectorAll('article[data-testid="tweet"]').forEach((a) => {
        if (/promoted|sponsoris|publicité|ad ·/i.test(a.innerText.slice(0, 160))) return; // pubs
        const id = permalinkId(a);
        if (!id) return;
        const tEl = a.querySelector('[data-testid="tweetText"]');
        const text = tEl ? tEl.innerText.trim() : "";
        if (text.length < 15) return;
        const t = extractTweet(a);
        map.set(id, { id, name: t.name, handle: t.handle, text, metrics: t.metrics || {}, timeRel: t.timeRel, hasMedia: t.media && t.media.has });
      });
    };
    collect();
    const prevY = window.scrollY;
    for (let i = 0; i < 3 && map.size < 35; i++) {
      window.scrollBy(0, window.innerHeight * 1.4);
      await sleep(750);
      collect();
    }
    window.scrollTo(0, prevY);
    return [...map.values()];
  }

  async function runRadar() {
    if (!state.config.apiKey) { ui.radarStatus.className = "status err"; ui.radarStatus.textContent = "Ajoute ta clé API OpenAI (onglet Config)."; return; }
    ui.radarScan.disabled = true;
    ui.radarStatus.className = "status info";
    ui.radarStatus.textContent = "Scan du fil…";
    ui.radarList.innerHTML = "";

    const tweets = await scanTimeline();
    if (tweets.length < 3) {
      ui.radarScan.disabled = false;
      ui.radarStatus.className = "status err";
      ui.radarStatus.textContent = "Trop peu de tweets dans le fil. Scrolle un peu et relance.";
      return;
    }

    ui.radarStatus.textContent = `${tweets.length} tweets — analyse IA en cours…`;
    ui.radarList.innerHTML = '<div class="skel"><div class="skel-line w50"></div><div class="skel-line w90"></div></div>'.repeat(3);
    const dataById = new Map(tweets.map((t) => [t.id, t]));

    chrome.runtime.sendMessage(
      {
        type: "RANK_OPPORTUNITIES",
        payload: {
          apiKey: state.config.apiKey,
          model: state.config.model,
          instructions: state.config.instructions,
          language: state.config.language,
          tweets: tweets.map((t) => ({ id: t.id, author: [t.name, t.handle].filter(Boolean).join(" "), text: t.text, views: t.metrics.views, likes: t.metrics.likes, age: t.timeRel }))
        }
      },
      (resp) => {
        ui.radarScan.disabled = false;
        if (chrome.runtime.lastError) { ui.radarList.innerHTML = ""; ui.radarStatus.className = "status err"; ui.radarStatus.textContent = "Erreur : " + chrome.runtime.lastError.message; return; }
        if (!resp || !resp.ok) { ui.radarList.innerHTML = ""; ui.radarStatus.className = "status err"; ui.radarStatus.textContent = "Erreur : " + ((resp && resp.error) || "inconnue"); return; }
        const opps = resp.opportunities || [];
        if (!opps.length) { ui.radarList.innerHTML = ""; ui.radarStatus.className = "status info"; ui.radarStatus.textContent = "Aucune opportunité pertinente ici. Affine ta niche (Config) ou scrolle ailleurs."; return; }
        ui.radarStatus.className = "status ok";
        ui.radarStatus.textContent = `${opps.length} opportunité(s) classée(s) ✓`;
        renderOpportunities(opps, dataById);
      }
    );
  }

  function renderOpportunities(opps, dataById) {
    ui.radarList.innerHTML = "";
    opps.forEach((o) => {
      const t = dataById.get(o.id);
      if (!t) return;
      const cls = o.score >= 75 ? "hot" : o.score >= 55 ? "warm" : "mild";
      const m = t.metrics || {};
      const meta = [];
      if (m.views != null) meta.push("👁 " + fmtCount(m.views));
      if (m.likes != null) meta.push("♥ " + fmtCount(m.likes));
      if (t.timeRel) meta.push("🕒 " + t.timeRel);
      const card = document.createElement("div");
      card.className = "radar-card";
      card.innerHTML = `
        <div class="radar-top">
          <div class="radar-score ${cls}">${o.score}</div>
          <div class="radar-main">
            <div class="radar-author">${escapeHtml([t.name, t.handle].filter(Boolean).join(" "))}</div>
            <div class="radar-reason">${escapeHtml(o.reason || "")}</div>
          </div>
        </div>
        <div class="radar-text">${escapeHtml(t.text)}</div>
        <div class="radar-meta">${meta.map((x) => "<span>" + escapeHtml(x) + "</span>").join("")}</div>
        <div class="radar-actions">
          <button class="chip goto">↗ Aller au tweet</button>
          <button class="chip insert gen">✨ Répondre</button>
        </div>`;
      card.querySelector(".goto").addEventListener("click", () => goToTweet(o.id, false));
      card.querySelector(".gen").addEventListener("click", () => goToTweet(o.id, true));
      ui.radarList.appendChild(card);
    });
  }

  function goToTweet(id, generate) {
    const el = findArticleById(id);
    if (!el) {
      ui.radarStatus.className = "status err";
      ui.radarStatus.textContent = "Ce tweet a quitté le fil (virtualisé). Re-scanne, ou scrolle jusqu'à lui.";
      return;
    }
    switchTab("reply");
    selectTweet(el);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (generate) setTimeout(() => doGenerate(), 450);
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

  // Auto-redimensionne un textarea à son contenu. Le plafond éventuel est géré
  // en CSS via max-height (différent selon le champ), pas en JS.
  function autoGrow(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  }

  const TWEAKS = [
    { label: "🔄 Autre", t: "Réécris-la complètement différemment : autre angle, autre structure, autre attaque." },
    { label: "+ court", t: "Rends-la nettement plus courte et plus percutante." },
    { label: "+ drôle", t: "Rends-la plus drôle / spirituelle, sans forcer." },
    { label: "- formel", t: "Rends-la moins formelle, plus parlée et naturelle." },
    { label: "+ concret", t: "Rends-la plus concrète : ajoute un exemple, un chiffre ou un détail précis." }
  ];

  function renderVariants(list) {
    ui.variants.innerHTML = "";
    list.forEach((text, i) => {
      const card = document.createElement("div");
      card.className = "variant";

      const tag = document.createElement("div");
      tag.className = "variant-head";
      const lenEl = document.createElement("span");
      const tagEl = document.createElement("span");
      tagEl.className = "variant-tag";
      tagEl.textContent = `Variante ${i + 1}`;
      tag.append(tagEl, lenEl);

      const body = document.createElement("div");
      body.className = "variant-text";

      const setText = (val) => {
        body.textContent = val;
        lenEl.className = "variant-len" + (val.length > 280 ? " over" : "");
        lenEl.textContent = `${val.length}/280`;
      };
      const getText = () => body.textContent;
      setText(text);

      // Actions principales
      const actions = document.createElement("div");
      actions.className = "variant-actions";
      const editBtn = document.createElement("button");
      editBtn.className = "chip";
      editBtn.innerHTML = "✏️ Éditer";
      editBtn.addEventListener("click", () => {
        ui.draftWrap.style.display = "block";
        ui.replyText.value = getText();
        updateDraftCounter();
        autoGrow(ui.replyText);
        ui.replyText.focus();
        ui.draftWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setStatus("Variante chargée dans le brouillon. Édite puis insère.", "info");
      });
      const copyBtn = document.createElement("button");
      copyBtn.className = "chip";
      copyBtn.innerHTML = "📋";
      copyBtn.title = "Copier";
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(getText()).then(() => setStatus(`Variante ${i + 1} copiée ✓`, "ok"));
      });
      const insertBtn = document.createElement("button");
      insertBtn.className = "chip insert";
      insertBtn.innerHTML = "↩️ Insérer";
      insertBtn.addEventListener("click", () => insertIntoX(getText()));
      actions.append(editBtn, copyBtn, insertBtn);

      // Chips de reformulation (régénérer avec feedback)
      const tweaks = document.createElement("div");
      tweaks.className = "variant-tweaks";
      TWEAKS.forEach((tw) => {
        const b = document.createElement("button");
        b.className = "tchip";
        b.textContent = tw.label;
        b.title = tw.t;
        b.addEventListener("click", () => regenerateVariant({ card, body, setText, tweak: tw.t, index: i }));
        tweaks.appendChild(b);
      });

      card.append(tag, body, actions, tweaks);
      ui.variants.appendChild(card);
    });
  }

  function regenerateVariant({ card, body, setText, tweak, index }) {
    if (!state.selectedTweet) { setStatus("Aucun tweet sélectionné.", "err"); return; }
    if (!state.config.apiKey) { setStatus("Clé API manquante (onglet Config).", "err"); return; }
    if (card.classList.contains("regen")) return;
    card.classList.add("regen");
    const prev = body.textContent;
    body.textContent = "…";

    chrome.runtime.sendMessage(
      {
        type: "GENERATE_REPLY",
        payload: {
          apiKey: state.config.apiKey,
          model: state.config.model,
          language: state.config.language,
          length: state.config.length,
          count: 1,
          tweak,
          instructions: state.config.instructions,
          tweetText: state.selectedTweet.text,
          author: [state.selectedTweet.name, state.selectedTweet.handle].filter(Boolean).join(" "),
          metrics: state.selectedTweet.metrics,
          images: (state.selectedTweet.media && state.selectedTweet.media.images) || [],
          context: (state.selectedContext || []).map((c) => ({ author: [c.name, c.handle].filter(Boolean).join(" "), text: c.text }))
        }
      },
      (resp) => {
        card.classList.remove("regen");
        if (chrome.runtime.lastError || !resp || !resp.ok || !(resp.variants && resp.variants.length)) {
          setText(prev);
          setStatus("Échec de la régénération : " + ((resp && resp.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || "inconnue"), "err");
          return;
        }
        setText(resp.variants[0]);
        setStatus("Variante régénérée ✓", "ok");
      }
    );
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

  // Détecte le trait de connexion du fil dans la colonne avatar.
  // Un tweet "parent" connecté à sa réponse en dessous a un connecteur descendant (down).
  function avatarConnectors(art) {
    const av = art.querySelector('[data-testid="Tweet-User-Avatar"]');
    if (!av) return { up: false, down: false };
    const a = av.getBoundingClientRect();
    let up = false, down = false;
    art.querySelectorAll("div").forEach((d) => {
      const r = d.getBoundingClientRect();
      if (r.width > 0 && r.width <= 4 && r.height >= 16) {
        if (r.top < a.top + 4) up = true;
        if (r.bottom > a.bottom - 4) down = true;
      }
    });
    return { up, down };
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

    // Cas A2 : paire/fil connecté visuellement (sans label « Replying to »).
    // Le tweet du dessus est un parent s'il a un connecteur descendant vers celui-ci.
    if (!ctx.length && idx > 0) {
      const chain = [];
      for (let j = idx - 1; j >= 0 && idx - j <= 4; j--) {
        const prev = all[j];
        if (avatarConnectors(prev).down) { chain.push(extractBasic(prev)); anchorEl = prev; }
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

    return { context: ctx, hasReplyingTo: hasReplyingTo || ctx.length > 0, anchorEl };
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
    autoGrow(ui.replyText);
    updateDraftCounter();
    if (ui.generateBtn) ui.generateBtn.disabled = false; // toujours réactiver pour un nouveau post
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
