# BuddyChatAI

A full-stack AI character chat platform. Users can browse or create AI characters with their own personalities, have ongoing conversations with them, and connect with other users through profiles, follows, and real-time direct messaging.

## Features

- **AI chat with memory** – conversations are powered by an LLM through OpenRouter. Every 10 messages, the conversation is summarized and stored so characters keep context in long chats without exceeding the model's context window.
- **Character creation** – users create and share their own characters; community uploads go through a moderation queue before going public.
- **Real-time direct messaging** – Socket.io with JWT-authenticated connections, typing indicators, read receipts, and online presence.
- **Social features** – profiles, follows, favorites, showcased chats, blocking, and reporting.
- **Authentication** – email/password (bcrypt) and Google OAuth, with JWT access and refresh tokens.
- **Token economy and payments** – token packs, monthly subscriptions, signed payment webhooks with idempotent fulfillment, and an affiliate program.
- **Safety** – input sanitization, Zod validation, a moderation filter, rate limiting, Helmet security headers, and a CORS allowlist.
- **Admin tools** – character template management and a moderation dashboard.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, React Router |
| Backend | Node.js, Express, TypeScript, Zod |
| Database | PostgreSQL (Supabase) with SQL migrations |
| Real-time | Socket.io |
| AI | OpenRouter (configurable model) |
| Hosting | Vercel (frontend), Railway (backend) |

## Project Structure

```
├── backend/
│   └── src/
│       ├── routes/        # Express route modules (auth, chat, messages, payments, ...)
│       ├── services/      # LLM client, memory summaries, moderation, email, sockets, payments
│       ├── middleware/    # JWT auth, admin guard, rate limiting, CSRF
│       ├── db/migrations/ # SQL migrations (run in order)
│       └── utils/         # Sanitization, file validation, tags, search helpers
└── frontend/
    └── src/
        ├── pages/         # Route-level pages
        ├── components/    # Shared UI components
        ├── context/       # Auth and socket providers
        └── api/           # Axios API client
```

## How a chat message works

1. The frontend sends the message to `POST /chat/send` with a JWT in the `Authorization` header.
2. The backend sanitizes and validates the input, runs it through the moderation filter, verifies the user owns the session, and checks their token balance.
3. It builds the prompt from the character's personality, the conversation summary, and the last 20 messages, then calls the LLM.
4. Both messages are saved to Postgres, tokens are deducted, and the reply is returned.
5. In the background, the conversation summary is refreshed every 10 messages.

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project
- An OpenRouter API key

### Database

Run the SQL files in `backend/src/db/migrations/` in numeric order in the Supabase SQL editor.

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in your values
npm run dev            # http://localhost:3001
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # fill in your values
npm run dev            # http://localhost:5173
```

## Environment Variables

See `backend/.env.example` and `frontend/.env.example`. Secrets are only used by the backend; the frontend only receives public values such as the API URL and Google client ID.

## Roadmap

- Stream AI responses token by token
- Make token deduction an atomic database operation
- Move presence and rate-limit state to Redis for horizontal scaling
- Add automated tests and CI
