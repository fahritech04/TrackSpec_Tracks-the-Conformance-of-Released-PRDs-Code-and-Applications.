# Proposal: Build TrackSpec MVP

## Why
Teams often cannot quickly prove that released applications still conform to PRD/OpenSpec requirements. TrackSpec solves this by running repeatable conformance analysis across specification, code, and deployed application.

## What Changes
- Add MVP workflow for PRD-Code-App Conformance.
- Add requirement extraction (5-8 items).
- Add repository evidence scanner (heuristic + Gemini-assisted).
- Add deployed app smoke checker.
- Add final Conformance Report with `Match | Partial | Missing`.

## Success Criteria
- End-to-end flow works in one run.
- Report is readable and evidence-focused for hackathon judges.
- Setup can be completed quickly by a beginner team.
