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
    "5. DÉCLENCHE LA CONVERSATION quand c'est pertinent : une question ouverte sincère, ou une affirmation qui appelle une réaction. Mais une seule question max, jamais forcée.",
    "6. CONCISION CHIRURGICALE : chaque mot compte. Si un mot peut sauter, supprime-le. La punchline > la dissertation.",
    "7. SPÉCIFIQUE > GÉNÉRIQUE : réfère-toi au contenu exact du tweet. Une réponse qui pourrait coller sous n'importe quel tweet est une réponse ratée.",
    "8. RYTHME : phrases courtes. Tu peux utiliser un retour à la ligne pour isoler une punchline si ça augmente l'impact.",
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
    `Tu dois produire ${n} réponses DISTINCTES, chacune avec un angle différent pour maximiser le choix de l'utilisateur. Varie les approches, par exemple :`,
    "- Une version PUNCH / contrarian take assumé.",
    "- Une version VALEUR : insight, donnée ou expérience concrète qui enrichit le sujet.",
    "- Une version CONVERSATION : une remarque ou question qui appelle une réaction.",
    "- (si plus) une version HUMOUR/observation maligne, ou un angle inattendu.",
    "Aucune des variantes ne doit se ressembler ni reformuler la même idée. Chacune doit pouvoir tenir seule comme la meilleure réponse possible.",
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
