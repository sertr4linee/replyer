<div align="center">

<img src="src/icon.png" width="128" alt="Replyer logo" />

# Replyer

### AI-powered auto-reply assistant for X (Twitter) — built for audience growth

Select any tweet, capture its full context, and generate scroll-stopping replies with OpenAI — right from a native-feeling sidebar.

<br/>

![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o%20Vision-412991?logo=openai&logoColor=white)
![No Build](https://img.shields.io/badge/Build-None-success)
![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

![Chrome](https://img.shields.io/badge/Chrome-supported-46892c?logo=googlechrome&logoColor=white)
![Edge](https://img.shields.io/badge/Edge-supported-0078D7?logo=microsoftedge&logoColor=white)
![Brave](https://img.shields.io/badge/Brave-supported-FB542B?logo=brave&logoColor=white)
![UI](https://img.shields.io/badge/UI-Supabase%20%2F%20shadcn%20inspired-3ECF8E)

</div>

---

## ✨ Overview

**Replyer** is a Chrome/Edge (Manifest V3) browser extension that lives on `x.com`. It adds a floating button **right above the Grok button**, opening a **custom in-page sidebar** (Shadow-DOM isolated — not the browser's native side panel). From there you can:

- 🎯 **Pick any tweet** on the page with a visual selection tool (hover → highlight, click → select)
- 🧵 **Auto-capture the conversation context** — when the selected tweet is a reply, the original post is detected, **cached**, and shown
- 🖼️ **Preview media** and feed **images to GPT-4o Vision** so replies account for the visual
- ✍️ **Generate multiple distinct reply variants** tuned for engagement & follower growth
- 🥷 **Clone a creator's writing style** by analyzing their posts, or build your own via a **guided onboarding**
- ↩️ **Insert the chosen reply** straight into X's reply box (you always send it yourself)

> ⚠️ **You stay in control.** Replyer never auto-sends. It drafts and inserts; the final post is always one manual click by you.

---

## 🚀 Features

### Tweet selection & context
- **Visual picker** — hover highlights tweets in blue, click to lock one in.
- **Realistic tweet card** — avatar, display name, verified badge, handle, timestamp, body, and **engagement metrics** (replies, reposts, likes, **impressions/views**) parsed from X's own accessibility data.
- **Reply vs. original badge** — instantly see whether the selected tweet is a standalone post or a reply. The badge is **clickable** and scrolls you to the original post.
- **Smart context capture** with three detection strategies:
  1. Explicit `Replying to @user` chains (timeline)
  2. **Visual thread-connector detection** — catches connected reply pairs that have *no* "Replying to" label
  3. Focused tweet on conversation/status pages
- **Context cache** — once a parent post has been seen, it persists even after it scrolls out of the DOM.

### AI generation
- **Multiple variants** (1–5, configurable) — each with a **different angle and sentence structure**, never the same mold.
- **Growth-optimized system prompt** — value-first, hook-driven, native tone, no empty flattery, no robotic "as an AI…", anti-cliché, anti-question-reflex.
- **GPT-4o Vision** — attached tweet images are analyzed so replies reference the visual (videos excluded).
- **Conversation-aware** — the captured thread context is passed to the model.
- Per-reply **character counter** (280 limit) with overflow warning.

### 📡 Growth Radar
- **Scan your feed** and let the AI surface the **best tweets to reply to** for *your* niche.
- One grouped OpenAI call scores each tweet (0–100) on **relevance to your persona, freshness, reach/velocity, and conversation potential**, with a one-line reason.
- Ranked opportunity cards with a color-coded score; **"Aller au tweet"** scrolls to and selects it, **"Répondre"** jumps straight into generation.

### Style engine
- **Onboarding wizard** — a 7-step guided flow (niche, audience, tone, language, emojis, goal, inspirations) that synthesizes a reusable **persona** with the AI.
- **Steal-a-style** — type a `@handle`, Replyer reads that account's posts (with auto-scroll on their profile) and generates instructions to write in their voice — appended to your persona.

### UX & UI
- **Supabase / shadcn-inspired** dark theme — neutral grays, green accent, soft radii, segmented tabs, clean scrollbars.
- **Media lightbox** — click the media chip to preview images in-panel.
- **Auto-growing textareas**, skeleton loaders, smooth transitions.
- Toggle the sidebar from the in-page button **or** the toolbar icon.

---

## 📦 Installation (developer mode)

> Not yet published to the Chrome Web Store — load it unpacked.

1. Clone or download this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select the `replyer/` folder.
5. Open [https://x.com](https://x.com) — the green **Replyer** button appears stacked above the Grok button (bottom-right).

---

## ⚙️ Configuration

1. Open the sidebar → **Configuration** tab.
2. Paste your **OpenAI API key** (`sk-...`).
3. Pick a **model** (vision-capable recommended: `gpt-4o-mini`, `gpt-4o`, `gpt-4.1`).
4. Set **language**, **length**, **number of variants**.
5. Define your **Tone / style** — manually, via the **onboarding wizard**, or by **stealing a style**.
6. **Save.**

| Setting | Description | Default |
|---|---|---|
| API key | Your OpenAI key, stored locally | — |
| Model | Chat model (vision needed for image context) | `gpt-4o-mini` |
| Language | Output language (or auto = tweet's language) | auto |
| Length | `short` / `medium` / `long` | medium |
| Variants | Number of replies generated (1–5) | 3 |
| Tone / style | Your persona — the single biggest growth lever | — |

---

## 🧭 Usage

1. **Configuration** → set your API key and persona.
2. **Reply** tab → **Select a tweet** → hover & click the target (press `Esc` to cancel).
3. Review the tweet card + auto-captured context.
4. **Generate** → compare variants.
5. **Edit** a variant into the draft (optional) → **Insert into X**.
6. Review on X and hit reply yourself.

---

## 🏗️ How it works

```
┌──────────────────────────────────────────────┐
│  x.com page (content script — src/content.js) │
│                                                │
│  • Floating button cloned from Grok's style    │
│  • Shadow-DOM sidebar (style-isolated)         │
│  • Tweet picker + structured extraction        │
│  • Context detection + in-memory cache         │
│  • Profile scraping for style cloning          │
└───────────────┬────────────────────────────────┘
                │ chrome.runtime messages
                ▼
┌──────────────────────────────────────────────┐
│  Service worker (src/background.js)            │
│                                                │
│  • GENERATE_REPLY → OpenAI chat completions    │
│    (JSON variants, optional image_url vision)  │
│  • BUILD_STYLE → persona / style synthesis     │
│  • Toolbar-icon → toggle sidebar               │
└──────────────┬─────────────────────────────────┘
               │ HTTPS
               ▼
        api.openai.com
```

- OpenAI calls run in the **service worker** to avoid page CORS restrictions.
- The sidebar is a **Shadow DOM** tree, so X's CSS can never leak in (or out).
- Tweet data is read from X's `data-testid` hooks and `role="group"` aria-labels — robust but **dependent on X's DOM**.

---

## 🗂️ Project structure

```
replyer/
├── manifest.json        # MV3 manifest: permissions, host permissions, content script
├── src/
│   ├── background.js     # Service worker — OpenAI calls (reply + style), sidebar toggle
│   └── content.js        # Button injection, sidebar UI, selection, context, cache, insert
└── README.md
```

## 🛠️ Tech stack

- **Manifest V3** Chrome extension (Chromium browsers)
- **Vanilla JavaScript** — zero dependencies, **no build step**
- **Shadow DOM** for style isolation
- **OpenAI Chat Completions API** (`gpt-4o` family, JSON mode, vision)
- `chrome.storage.local` for settings persistence

---

## 🔐 Privacy

- Your API key and settings are stored **locally** in `chrome.storage.local`.
- Data leaves your browser **only** to `api.openai.com`, and only the tweet text/context/images you choose to generate from.
- No analytics, no third-party servers, no telemetry.

## ⚠️ Limitations

- Relies on X's current DOM (`data-testid` selectors); a major X redesign may require selector updates.
- Reply insertion targets X's Draft.js editor via `execCommand('insertText')` — robust but not officially supported.
- Vision context requires a vision-capable model and images already loaded in the DOM.
- Style cloning reads only the posts currently rendered (more tweets = better fidelity → open the profile and scroll).

---

## 🗺️ Roadmap

See the discussion below — ideas under consideration:

- [x] **Growth Radar** — AI-ranked "best tweets to reply to" from your feed
- [ ] Regenerate / "more like this" per variant
- [ ] Tone sliders (spicy ↔ measured, short ↔ detailed)
- [ ] Saved persona profiles & quick-switch
- [ ] Content Studio — original tweets, quote-tweets & threads
- [ ] Multi-provider support (Anthropic Claude, local models)
- [ ] Reply history & favorites
- [ ] In-feed highlighting of Radar opportunities
- [ ] Keyboard shortcuts
- [ ] Custom toolbar PNG icons

---

## 📄 License

MIT — do what you want, no warranty.

<div align="center">
<sub>Built for creators who reply their way to an audience. Use responsibly and respect X's terms.</sub>
</div>
