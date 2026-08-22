# Kapehu — The Compass

**Your Personal AI Wayfinder.**

A chat app deployed on Netlify: a React frontend, Netlify Functions calling the Claude API
(`claude-opus-5`) with a "wayfinder" coaching persona, and a Netlify-managed Postgres database so
your conversation follows you across every device — log in with the same passcode from your
phone, laptop, wherever, and you're back in the same conversation.

## Structure

```
kapehu/
├── src/                          React + TypeScript chat UI (Vite)
├── netlify/functions/            Serverless functions: /api/chat, /api/messages
└── netlify/database/migrations/  Postgres schema (Netlify Database)
```

## How access works

There's no multi-user account system — this is a personal app for one person (you) used from
several of your own devices. A single passcode (`KAPEHU_PASSCODE`, set as a Netlify environment
variable) gates every device; enter it once per device and it's remembered in that browser.
Everyone who has the passcode shares the one conversation history, which is the point: pick up on
your phone where you left off on your laptop.

## Setup

Requires a [Netlify account](https://app.netlify.com) (free), the
[Netlify CLI](https://docs.netlify.com/cli/get-started/) (`npm install -g netlify-cli`), Node.js
20+, and an [Anthropic API key](https://console.anthropic.com/settings/keys).

```bash
git clone https://github.com/MatuaKevin/kapehu
cd kapehu
npm install

netlify link          # connect this folder to the Netlify site (choose "kapehu")
netlify env:set ANTHROPIC_API_KEY sk-ant-...
netlify env:set KAPEHU_PASSCODE <pick-something-only-you-know>

npm run dev            # runs `netlify dev` — local dev server with functions + database emulated
```

Open the local URL it prints (usually `http://localhost:8888`), enter your passcode, and start
talking to Kapehu. The Postgres database is provisioned automatically the first time you run
`netlify dev` or deploy — no manual database setup.

### Deploying

Connect the GitHub repo to the Netlify site in the Netlify dashboard (Site configuration > Build
& deploy > Continuous deployment) for automatic deploys on push, or deploy directly:

```bash
netlify deploy --prod
```

## How it works

- `netlify/functions/_shared/kapehu.ts` — the model ID and Kapehu's system prompt (persona +
  coaching style)
- `netlify/functions/chat.mts` — `POST /api/chat`: takes one new message, loads the shared
  conversation history from the database, streams Claude's reply back over SSE, and saves both
  the user's message and Kapehu's reply
- `netlify/functions/messages.mts` — `GET /api/messages`: returns the full conversation history
  (used on load and to verify a passcode)
- `netlify/functions/_shared/auth.ts` — checks the `Authorization: Bearer <passcode>` header
  against `KAPEHU_PASSCODE`
- `netlify/database/migrations/` — the one `messages` table (role, content, created_at)
- `src/App.tsx` — the chat UI: a passcode gate, then the conversation, loaded from and saved to
  the shared database rather than browser storage

## Notes

- `ANTHROPIC_API_KEY` and `KAPEHU_PASSCODE` live only as Netlify environment variables — never in
  code, never sent to the browser.
- This is a starting point: single shared conversation, no per-message editing/deletion, no rate
  limiting beyond Anthropic's own. Natural next steps if you want them: per-conversation threads,
  a way to search past conversations, voice input.
