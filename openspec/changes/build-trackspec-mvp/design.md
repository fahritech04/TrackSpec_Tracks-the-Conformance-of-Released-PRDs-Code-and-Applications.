# Design: TrackSpec MVP

## Architecture
- Single-repo monolith with Next.js (UI + API routes).
- PostgreSQL stores runs, requirements, and evidence summary.
- Gemini is used only for extraction, summarization, and classification support.

## Conformance Workflow
1. User submits PRD/OpenSpec text, repo source, and deployed app URL.
2. System extracts 5-8 verifiable requirements.
3. Repository scanner selects important files and finds evidence.
4. Deployed app checker runs smoke checks.
5. Rule-based classifier determines `Match | Partial | Missing`.
6. Conformance Report is generated and stored as a run.

## Simplicity Constraints
- No microservices.
- No auth.
- No queue/worker/websocket.
- No real-time monitoring.
- Retry + timeout for Gemini and network calls.

## Free-Tier Strategy
- Limit repo files and snippet length before sending to Gemini.
- Keep prompts short and structured.
- Fallback to rule-based output when Gemini is unavailable.
