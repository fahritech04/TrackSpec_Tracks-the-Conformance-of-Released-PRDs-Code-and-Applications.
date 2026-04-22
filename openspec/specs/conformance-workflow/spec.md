# Conformance Workflow Specification

## Purpose
TrackSpec provides repeatable PRD-Code-App Conformance analysis for released applications.

## Scope
- Input PRD/OpenSpec text.
- Input repository source (local path or GitHub URL).
- Input deployed app URL.
- Extract 5-8 verifiable requirements.
- Scan repository evidence.
- Run deployed app smoke checks.
- Produce Conformance Report per requirement.

## Requirement Conformance Rules
- `Match`: repository evidence is strong and deployed app evidence supports the same requirement.
- `Partial`: evidence exists but not strong enough or not clearly visible in deployed app checks.
- `Missing`: evidence is not sufficient in repository and/or deployed app checks.

## Output Contract
Each requirement in the Conformance Report must include:
- requirement id, title, description, test hint
- repository evidence status (`found | possible | not_found`)
- deployed status (`found | partial | not_found`)
- final status (`Match | Partial | Missing`)
- short recommendation

## Non-Goals
- Real-time monitoring.
- Enterprise features (auth, roles, queues, websockets, multi-tenant).
