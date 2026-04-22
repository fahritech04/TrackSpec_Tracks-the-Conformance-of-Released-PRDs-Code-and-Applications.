# C4 - Level 1: System Context

## Scope
TrackSpec is used by an engineering team to validate PRD-Code-App Conformance for a released application.

## External Actors and Systems
- Engineering Team: submits PRD text, repository source, and deployed app URL; reviews Conformance Report.
- Gemini API: helps requirement extraction and report summarization.
- Repository Source: local repo path or GitHub repository URL.
- Deployed Application: live URL checked by smoke checks.
- PostgreSQL: stores conformance runs and report artifacts.

## Context Diagram (Text)
- Engineering Team -> TrackSpec: run conformance analysis
- TrackSpec -> Repository Source: read implementation evidence
- TrackSpec -> Deployed Application: run smoke checks
- TrackSpec -> Gemini API: extraction/summarization/classification support
- TrackSpec -> PostgreSQL: persist runs and outcomes
