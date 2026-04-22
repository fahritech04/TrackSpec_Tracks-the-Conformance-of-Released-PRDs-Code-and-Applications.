# C4 - Level 2: Container Diagram

## Containers
- Web App (Next.js): UI for setup, execution, and Conformance Report display.
- API Layer (Next.js Route Handlers): orchestrates extraction, scans, checks, and report generation.
- Conformance Services (internal modules): requirement extraction, repository evidence scanner, deployed checker, classifier.
- PostgreSQL: stores project, run, requirement, and evidence data.
- Gemini API: external LLM for selective tasks.

## Container Interactions
- UI calls API to start a conformance run.
- API executes conformance services in sequence.
- Services call Gemini API only where needed.
- API writes run results to PostgreSQL and returns report to UI.
