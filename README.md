# Replyer — Auto Reply IA pour X (Twitter)

Extension de navigateur (Chrome / Edge, Manifest V3) qui :

- Détecte **x.com / twitter.com**
- Ajoute une icône **Replyer** dans la barre de navigation, **au-dessus du bouton Grok**
- Au clic, ouvre une **sidebar custom** (injectée dans la page, pas la sidebar native du navigateur)
- Permet de **configurer** la clé OpenAI, le modèle, la langue, le ton, la longueur
- Fournit un **outil de sélection de tweet** : survole un tweet → surbrillance, clic → sélection
- Génère une **réponse via OpenAI**, modifiable, puis l'**insère dans le champ de réponse** de X (tu valides l'envoi)

## Installation (mode développeur)

1. Ouvre `chrome://extensions` (ou `edge://extensions`)
2. Active **Mode développeur** (en haut à droite)
3. Clique **Charger l'extension non empaquetée**
4. Sélectionne ce dossier (`replyer`)
5. Va sur https://x.com — l'icône **Replyer** apparaît au-dessus de Grok dans le menu de gauche

## Utilisation

1. Clique sur l'icône **Replyer** (ou sur l'icône de l'extension dans la barre d'outils) → la sidebar s'ouvre
2. Onglet **Configuration** : colle ta clé API OpenAI (`sk-...`), choisis le modèle, le ton, la langue, puis **Enregistrer**
3. Onglet **Répondre** → **Sélectionner un tweet** → survole et clique le tweet voulu
4. **Générer une réponse** → édite si besoin → **Insérer dans X**
5. Vérifie et envoie le tweet toi-même sur X

## Notes techniques

- La clé API est stockée **en local** (`chrome.storage.local`), envoyée uniquement à `api.openai.com`.
- Les appels OpenAI passent par le **service worker** (`src/background.js`) pour éviter les blocages CORS.
- La sidebar utilise un **Shadow DOM** pour ne pas entrer en conflit avec les styles de X.
- Les sélecteurs (`data-testid="tweet"`, `tweetTextarea_0`, `reply`, etc.) dépendent du DOM de X : si X change son interface, il faudra les ajuster dans `src/content.js`.

## Fichiers

```
manifest.json        # déclaration MV3, permissions, content script
src/background.js     # appels OpenAI + toggle via icône toolbar
src/content.js        # injection icône, sidebar, sélection, insertion
```

## Idées d'évolution

- Génération de plusieurs variantes de réponse
- Mode « auto-reply » sur le fil (avec garde-fous)
- Support d'autres fournisseurs (Anthropic, etc.)
- Réglages par compte / par type de tweet
- Icônes PNG personnalisées pour la barre d'outils (`action.default_icon`)
