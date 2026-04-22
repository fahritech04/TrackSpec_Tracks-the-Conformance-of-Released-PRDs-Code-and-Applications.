# C4 - Conformance Sequence (Run-Based)

## Sequence
1. User submits PRD/OpenSpec text, repository source, and deployed app URL.
2. API validates input.
3. Requirement extractor creates 5-8 verifiable requirements.
4. Repository evidence scanner checks key files and gathers evidence.
5. Deployed app checker runs smoke checks.
6. Conformance classifier determines final status per requirement.
7. Report composer builds the final Conformance Report.
8. Run data is saved to PostgreSQL.
9. UI displays report with status, evidence, and recommendation.

## Error Paths
- If Gemini is unavailable: keep rule-based flow and show friendly warning.
- If deployed app check fails: set lower confidence and continue report generation.
- If repository source is invalid: return actionable validation message.
