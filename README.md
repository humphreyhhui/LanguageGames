# Language Games

A competitive language learning mobile app where players compete in real-time translation games, earn Elo ratings, and collect badges. Think Duolingo meets chess.com meets drinking games.

## Tech Stack

- **Mobile App**: React Native (Expo) + NativeWind (Tailwind CSS)
- **Backend**: Node.js (Express) + Socket.io
- **Database/Auth**: Supabase (Postgres + Auth)
- **LLM**: Ollama (server-side only — users never need this installed)
- **State**: Zustand

## Architecture

```
┌─────────────────────┐
│  User's Phone / App │  (React Native)
└─────────┬───────────┘
          │ HTTP / WebSocket
┌─────────▼───────────┐
│  Your Server         │  (Node.js, port 3001)
│  - Express API       │
│  - Socket.io         │
└─────────┬───────────┘
          │ HTTP (localhost)
┌─────────▼───────────┐     ┌───────────────────┐
│  Ollama LLM          │     │  Supabase          │
│  (port 11434)        │     │  (Auth, Postgres)  │
└──────────────────────┘     └───────────────────┘
```

Users only need the app. All LLM processing happens on your server — Ollama generates translations, validates answers, and creates distractors without users ever needing to install anything.

## For Users

Download the app and create an account. That's it — no additional software needed.

## Developer Setup

### Prerequisites

- Node.js 20+
- [Ollama](https://ollama.ai) installed on your server/dev machine
- A [Supabase](https://supabase.com) project
- Xcode (for iOS Simulator) or Expo Go on your phone

### 1. Set Up Supabase

Create a Supabase project, then run the migration SQL:

```bash
# Copy the contents of supabase/migrations/001_initial_schema.sql
# and run it in your Supabase SQL editor
```

Update credentials in:
- `lib/constants.ts` — `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- `server/config.ts` — `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`

### 2. Set Up Ollama (Server-Side Only)

Ollama runs on your server/dev machine. Users never interact with it directly.

```bash
# Install Ollama (macOS)
brew install ollama

# Pull a model (qwen3:4b is lightweight and fast)
ollama pull qwen3:4b

# Ollama starts automatically, or run:
ollama serve
```

### 3. Start the Backend Server

```bash
cd server
npm install
npx ts-node index.ts
```

Server starts on `http://localhost:3001`.

### 4. Start the Mobile App

```bash
# From project root
npm install
npx expo start --ios    # iOS Simulator
# or
npx expo start          # QR code for Expo Go
```

## Game Modes

### Asteroid Shooter
Control a spaceship and shoot the asteroid with the correct translation. Combo multipliers for consecutive correct hits.

### Translation Race
Type translations as fast as possible within a time limit. LLM validates answers including synonyms.

### Memory Match
Classic card-flip game — match each word with its translation on a 4x4 grid. Compete on time.

### Wager Mode (Drinking Game)
Bet how many words you can translate each round. Hit your wager for bonus points; miss it for a penalty.

## Multiplayer

- **Practice Solo** — No account needed, play against yourself
- **Play with Friends** — Create a room, share the 6-character code
- **Ranked** — Matchmake against players near your Elo rating

## Custom Study Sets

Create Quizlet-like flashcard sets with your own word pairs, or use the AI auto-generate feature. Play any game mode with custom pairs.

## Project Structure

```
├── app/                  # Expo Router screens
│   ├── (tabs)/           # Tab navigation (Home, Profile, Settings)
│   ├── auth/             # Login/signup
│   ├── games/            # Game screens + lobby + results
│   └── pairs/            # Custom pair editor
├── components/           # Reusable UI components
├── lib/                  # Shared utilities, stores, types
│   └── stores/           # Zustand state management
├── server/               # Node.js backend
│   ├── routes/           # REST API endpoints
│   ├── services/         # Business logic (Ollama, Elo, matchmaking)
│   └── socket/           # WebSocket event handlers
└── supabase/             # Database migrations
```

## Environment Variables (Server)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `SUPABASE_URL` | Supabase project URL | — |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | — |
| `OLLAMA_URL` | Ollama API URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | LLM model name | `qwen3:4b` |
