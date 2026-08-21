# Kapehu — The Compass

**Your Personal AI Wayfinder.**

A small full-stack chat app: a React frontend talking to an Express backend that calls the
Claude API (`claude-opus-5`) with a "wayfinder" coaching persona — oriented toward helping you
get clear on a decision or situation and leave with a concrete next step, rather than generic
advice.

## Structure

```
kapehu/
├── server/   Express + TypeScript API (streams Claude's replies over SSE)
└── web/      Vite + React + TypeScript chat UI
```

## Local setup

Requires Node.js 20+ and an [Anthropic API key](https://console.anthropic.com/settings/keys).

```bash
git clone https://github.com/MatuaKevin/kapehu
cd kapehu
npm install

cp .env.example .env
# then edit .env and set ANTHROPIC_API_KEY=sk-ant-...

npm run dev
```

This starts both the API server (`http://localhost:8787`) and the web app
(`http://localhost:5173`, proxying `/api` to the server) together. Open
`http://localhost:5173` and start talking to Kapehu.

- `npm run build` — builds both workspaces for production
- `npm run start` — runs the built server (serves the API only; deploy `web/dist` as static
  files behind whatever you're using for the frontend)

## How it works

- `server/src/kapehu.ts` — the model ID and Kapehu's system prompt (persona + coaching style)
- `server/src/index.ts` — a single `POST /api/chat` endpoint that takes the full conversation
  history and streams Claude's response back as Server-Sent Events
- `web/src/App.tsx` — the chat UI; conversation history is kept in `localStorage` so it survives
  a page reload (this is a client-only, single-user app — there's no server-side persistence or
  auth yet)

## Notes

- The API key lives only in `server/.env` (via the root `.env` — see `.env.example`) and is
  never sent to the browser.
- This is a starting point, not a finished product: no auth, no multi-user support, no
  conversation storage beyond the browser. If you want Kapehu to remember you across devices or
  support more than one person, that's the natural next layer to add (a database + auth in
  `server/`).
