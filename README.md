# TrackSpec

TrackSpec tracks the conformance of released Product Requirements Documents (PRDs), repository implementation, and deployed application behavior.

This repository is a single-repo monolith MVP for Refactory Hackathon (`Engineering Productivity x AI`) using:
- Next.js + TypeScript + Tailwind CSS
- PostgreSQL + Prisma
- Google Gemini API

## Current MVP Status

Implemented through Stage 5:
- project scaffolded with Next.js + TypeScript + Tailwind
- Prisma configured for PostgreSQL
- OpenSpec minimal and C4 docs minimal
- setup page with responsive input validation
- Gemini requirement extraction endpoint and UI result states
- repository evidence scanner endpoint and UI evidence table/list

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Copy environment file

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Set environment values in `.env`
- `DATABASE_URL` for your PostgreSQL
- `GEMINI_API_KEY` from Google AI Studio
- `GEMINI_MODEL` default is `gemini-2.0-flash` (free-tier friendly choice)

4. Generate Prisma client

```bash
npm run prisma:generate
```

5. Start app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Available Scripts

- `npm run dev` - start local development server
- `npm run build` - production build
- `npm run start` - start production server
- `npm run lint` - run lint checks
- `npm run typecheck` - run TypeScript checks
- `npm run prisma:generate` - generate Prisma client

## Notes for Next Stage

- Stage 6 will implement deployed app checker.
- Stage 7+ will assemble final Conformance Report.
