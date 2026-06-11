// Service worker : appels OpenAI (évite les blocages CORS du content script)
// et toggle de la sidebar via le clic sur l'icône de la barre d'outils.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "GENERATE_REPLY") {
    generateReply(msg.payload)
      .then((variants) => sendResponse({ ok: true, variants }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true; // réponse asynchrone
  }
  if (msg && msg.type === "BUILD_STYLE") {
    buildStyle(msg.payload)
      .then((style) => sendResponse({ ok: true, style }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true;
  }
});

function modelSupportsVision(model) {
  return /gpt-4o|gpt-4\.1|gpt-5|o3|o4/i.test(model || "");
}

// Clic sur l'icône d'extension dans la barre d'outils -> toggle la sidebar
chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SIDEBAR" }).catch(() => {});
});

async function generateReply({ apiKey, model, tweetText, author, instructions, language, length, count, context, metrics, images }) {
  if (!apiKey) throw new Error("Clé API OpenAI manquante. Renseigne-la dans la sidebar.");
  if (!tweetText) throw new Error("Aucun texte de tweet à traiter.");
  const n = Math.min(Math.max(parseInt(count, 10) || 3, 1), 5);
  const imgs = (Array.isArray(images) ? images : []).filter((u) => typeof u === "string" && /^https?:/.test(u)).slice(0, 2);
  const useVision = imgs.length > 0 && modelSupportsVision(model);

  const lang = language || "EXACTEMENT la même langue que le tweet d'origine";
  const lengthHint =
    length === "court"
      ? "Format : 1 seule phrase percutante (idéalement < 120 caractères). Le punch avant tout."
      : length === "long"
      ? "Format : 2 à 4 phrases, mais chaque phrase doit gagner sa place. Aucun remplissage."
      : "Format : 1 à 2 phrases denses. Coupe tout ce qui n'apporte rien.";

  const system = [
    "# RÔLE",
    "Tu es un ghostwriter expert de la croissance sur X (Twitter), spécialisé dans les réponses (reply guy stratégique). Ton unique objectif : écrire une réponse qui maximise l'engagement (likes, réponses, visites de profil, follows) et fait gagner de l'audience à l'utilisateur.",
    "",
    "# COMMENT FONCTIONNE LA CROISSANCE PAR REPLY",
    "- Les réponses pertinentes sous des tweets à forte portée exposent ton profil à l'audience de l'auteur.",
    "- L'algorithme de X privilégie les réponses qui génèrent à leur tour des réponses (conversation) et du temps de lecture.",
    "- On ne gagne pas d'abonnés en flattant l'auteur : on en gagne en apportant de la valeur, un angle neuf, ou un punch que les autres lecteurs veulent liker.",
    "",
    "# PRINCIPES DE RÉDACTION (obligatoires)",
    "1. APPORTE DE LA VALEUR : ajoute une idée, un angle, une info, une expérience concrète, ou un contre-point réfléchi. Jamais un simple « Bien dit ! » / « Tellement vrai » / « Super post ».",
    "2. HOOK DÈS LE PREMIER MOT : la 1re ligne doit accrocher (les gens lisent en diagonale). Pas d'introduction molle, pas de « Je pense que... ».",
    "3. SOIS HUMAIN, PAS UNE IA : ton naturel, parlé, direct. Zéro langue corporate, zéro formule scolaire, zéro « En tant que... ». Écris comme un humain malin qui scrolle X.",
    "4. PRENDS POSITION : une opinion claire, voire un contrarian take assumé (sans être gratuitement clivant ou insultant), bat toujours la réponse tiède et consensuelle.",
    "5. PRIVILÉGIE L'AFFIRMATION : par défaut, réponds par une affirmation, un constat ou une punchline — PAS par une question. Une réponse déclarative et assumée engage autant qu'une question, sans le côté \"relance\" artificiel.",
    "6. CONCISION CHIRURGICALE : chaque mot compte. Si un mot peut sauter, supprime-le. La punchline > la dissertation.",
    "7. SPÉCIFIQUE > GÉNÉRIQUE : réfère-toi au contenu exact du tweet. Une réponse qui pourrait coller sous n'importe quel tweet est une réponse ratée.",
    "8. RYTHME : phrases courtes. Tu peux utiliser un retour à la ligne pour isoler une punchline si ça augmente l'impact.",
    "9. VARIE LES TOURNURES : change la structure et l'attaque d'une réponse à l'autre. N'utilise jamais deux fois le même moule (même ouverture, même rythme, même chute). Alterne : affirmation tranchée, anecdote/exemple, constat, opinion, comparaison, chiffre, trait d'humour, mini-histoire, réaction directe.",
    "",
    "# INTERDICTIONS STRICTES",
    "- PAS de hashtags (sauf si l'utilisateur l'a explicitement demandé dans ses consignes).",
    "- PAS d'emojis en rafale ; au maximum 1 emoji et seulement s'il ajoute vraiment du ton. Par défaut, zéro emoji.",
    "- PAS de @mention ni du nom de l'auteur en préfixe (X l'ajoute déjà).",
    "- PAS de guillemets autour de ta réponse.",
    "- PAS de flatterie creuse, de lèche, ni de phrases bateau (« C'est exactement ça », « 100% d'accord », « Très intéressant »).",
    "- PAS de jargon marketing, pas de ton « influenceur LinkedIn », pas de morale en fin de phrase.",
    "- PAS de fautes : la crédibilité se joue sur chaque mot.",
    "- N'invente pas de faits, de chiffres ou de citations.",
    "- ÉVITE LA QUESTION RÉFLEXE : ne termine pas par une question rhétorique du type « non ? », « tu ne crois pas ? », « et toi ? ». Une seule variante AU MAXIMUM peut être interrogative, et seulement si la question est vraiment forte et sincère. Idéalement, zéro question.",
    "- PAS de moule récurrent : interdit de commencer plusieurs réponses par le même mot ou la même structure (« Honnêtement… », « Ce qui est fou… », « C'est exactement… »).",
    "",
    "# LANGUE & LONGUEUR",
    `- Réponds en ${lang}.`,
    "- Reste STRICTEMENT sous 280 caractères (idéalement 100–220 pour un meilleur taux de lecture).",
    lengthHint,
    "",
    "# TON DE L'UTILISATEUR (priorité absolue, écrase les défauts ci-dessus en cas de conflit)",
    instructions ? instructions : "(aucune consigne spécifique — adopte un ton vif, intelligent et naturel, adapté au sujet et à l'énergie du tweet)",
    "",
    "# STRATÉGIE DE VARIANTES",
    `Tu dois produire ${n} réponses DISTINCTES. Chacune doit avoir un ANGLE et surtout une TOURNURE DE PHRASE différente — c'est essentiel. Pioche dans des formes variées, par exemple :`,
    "- PUNCH / contrarian take assumé (affirmation tranchée).",
    "- VALEUR : insight, donnée ou expérience concrète qui enrichit le sujet.",
    "- ANECDOTE / EXEMPLE vécu ou observé.",
    "- CONSTAT ou comparaison inattendue.",
    "- HUMOUR / observation maligne.",
    "- RÉACTION directe et spontanée (comme un pote qui répond).",
    "CONTRAINTES DE DIVERSITÉ (impératives) :",
    "- Varie l'ATTAQUE : aucune variante ne doit commencer par le même mot ni la même structure qu'une autre.",
    "- Varie la FORME grammaticale : mélange phrases courtes/longues, affirmations, exclamations. AU PLUS une seule variante peut être une question (idéalement aucune).",
    "- Aucune ne doit reformuler la même idée. Chacune doit tenir seule comme la meilleure réponse possible.",
    "",
    "# SORTIE (STRICTE)",
    `Réponds UNIQUEMENT avec un objet JSON valide de la forme : {"variants": ["réponse 1", "réponse 2", ...]} contenant EXACTEMENT ${n} chaînes.`,
    "Chaque chaîne est le texte brut prêt à publier (pas de guillemets internes superflus, pas de @mention, pas de numérotation, pas de préfixe). Aucun texte hors du JSON."
  ]
    .filter((l) => l !== undefined && l !== null)
    .join("\n");

  // Contexte du fil (post initial / messages parents) pour des réponses plus pertinentes
  let ctxBlock = "";
  if (Array.isArray(context) && context.length) {
    ctxBlock =
      "CONTEXTE DE LA CONVERSATION (du plus ancien au plus récent — NE réponds PAS à ces messages, ils servent uniquement à comprendre le fil) :\n" +
      context
        .map((c, i) => `  [${i + 1}] ${c.author ? c.author + " : " : ""}"""${(c.text || "").trim()}"""`)
        .join("\n") +
      "\n";
  }

  const m = metrics || {};
  const metricsBits = [];
  if (m.views != null) metricsBits.push(`${m.views} vues`);
  if (m.likes != null) metricsBits.push(`${m.likes} likes`);
  if (m.replies != null) metricsBits.push(`${m.replies} réponses`);
  const metricsLine = metricsBits.length ? `Portée du tweet : ${metricsBits.join(", ")} (un tweet à forte portée = plus d'yeux sur ta réponse, soigne-la).` : "";

  const user = [
    "Tu dois écrire la meilleure réponse possible pour maximiser l'engagement et la croissance d'audience.",
    ctxBlock,
    author ? `Auteur du tweet à commenter : ${author}` : "",
    metricsLine,
    useVision ? "Le tweet contient une ou plusieurs IMAGES (jointes ci-dessous). Analyse-les et tiens-en compte dans ta réponse (ce qu'on y voit, le contexte visuel)." : "",
    "LE TWEET AUQUEL TU RÉPONDS (c'est à CELUI-CI que ta réponse s'adresse) :",
    `"""${tweetText}"""`,
    "",
    ctxBlock
      ? "Sers-toi du contexte ci-dessus pour que ta réponse tombe juste, mais adresse-toi bien au dernier tweet."
      : "",
    `Analyse les angles les plus percutants, puis écris ${n} réponses distinctes. Réponds uniquement avec l'objet JSON demandé.`
  ]
    .filter(Boolean)
    .join("\n");

  const userContent = useVision
    ? [{ type: "text", text: user }, ...imgs.map((u) => ({ type: "image_url", image_url: { url: u, detail: "low" } }))]
    : user;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent }
      ],
      temperature: 0.9,
      presence_penalty: 0.4,
      max_tokens: 700,
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j && j.error && j.error.message ? j.error.message : JSON.stringify(j);
    } catch (_) {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`OpenAI ${res.status} : ${detail || "erreur inconnue"}`);
  }

  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error("Réponse vide renvoyée par OpenAI.");

  let variants = [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) variants = parsed;
    else if (parsed && Array.isArray(parsed.variants)) variants = parsed.variants;
    else if (parsed && typeof parsed === "object") variants = Object.values(parsed).filter((v) => typeof v === "string");
  } catch (_) {
    // repli : si le modèle a renvoyé du texte brut, on le découpe par lignes
    variants = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }

  variants = variants
    .filter((v) => typeof v === "string")
    .map((v) => v.trim().replace(/^["']|["']$/g, "").replace(/^\d+[\).\s-]+/, "").trim())
    .filter(Boolean);

  if (!variants.length) throw new Error("Aucune variante exploitable renvoyée par OpenAI.");
  return variants.slice(0, n);
}

// Génère un bloc d'instructions de style (persona) à partir de l'onboarding
// ou en "volant" le style d'un compte (analyse de ses tweets).
async function buildStyle({ apiKey, model, mode, answers, tweets, handle }) {
  if (!apiKey) throw new Error("Clé API OpenAI manquante.");

  const system = [
    "Tu es un expert en personal branding et copywriting sur X (Twitter).",
    "Ta tâche : produire un BLOC D'INSTRUCTIONS DE STYLE réutilisable, qui servira de consigne à un générateur de réponses IA.",
    "Format de sortie : 6 à 12 lignes maximum, à l'impératif, actionnables et concrètes.",
    "Couvre : niche/sujets, ton & personnalité, vocabulaire & tics de langage, structure/format des réponses, usage des emojis, longueur, ce qu'il faut FAIRE et ÉVITER.",
    "N'écris AUCun préambule ni conclusion. Rends UNIQUEMENT le bloc d'instructions, prêt à coller."
  ].join("\n");

  let user;
  if (mode === "steal") {
    const sample = (Array.isArray(tweets) ? tweets : []).slice(0, 40).map((t, i) => `[${i + 1}] ${String(t).trim()}`).join("\n");
    if (!sample) throw new Error("Aucun tweet à analyser pour ce compte.");
    user = [
      `Voici un échantillon de tweets du compte ${handle ? "@" + handle.replace(/^@/, "") : "cible"}.`,
      "Analyse SON style (ton, rythme, structure, vocabulaire, punchlines, usage des emojis, longueur, angles récurrents).",
      "Produis des instructions pour ÉCRIRE DANS CE MÊME STYLE — sans jamais copier le contenu ni plagier des phrases, uniquement la manière.",
      "",
      "TWEETS :",
      sample
    ].join("\n");
  } else {
    const a = answers || {};
    user = [
      "Construis le style à partir des réponses de l'utilisateur à l'onboarding :",
      `- Niche / sujets : ${a.niche || "(non précisé)"}`,
      `- Audience cible : ${a.audience || "(non précisé)"}`,
      `- Ton souhaité : ${a.tone || "(non précisé)"}`,
      `- Langue principale : ${a.language || "(auto)"}`,
      `- Emojis : ${a.emojis || "(non précisé)"}`,
      `- Objectif sur X : ${a.goal || "(non précisé)"}`,
      `- Exemples / inspirations / bio : ${a.examples || "(non précisé)"}`,
      "",
      "Synthétise tout ça en un bloc d'instructions de style cohérent et percutant."
    ].join("\n");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.7,
      max_tokens: 500
    })
  });

  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = j && j.error && j.error.message ? j.error.message : JSON.stringify(j); } catch (_) { detail = await res.text().catch(() => ""); }
    throw new Error(`OpenAI ${res.status} : ${detail || "erreur inconnue"}`);
  }
  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error("Style vide renvoyé par OpenAI.");
  return text.trim();
}
