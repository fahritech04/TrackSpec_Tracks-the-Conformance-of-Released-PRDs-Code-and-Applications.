# TrackSpec PRD Summary

## Problem
Released applications can drift from PRD/OpenSpec requirements, and teams need fast evidence for what conforms and what does not.

## Product Goal
Provide a usable MVP that checks PRD-Code-App Conformance and outputs an evidence-first Conformance Report.

## MVP Inputs
- PRD/OpenSpec text.
- Repository source (local path or GitHub URL).
- Deployed app URL.

## MVP Outputs
- 5-8 extracted requirements.
- Repository evidence status per requirement.
- Deployed app status per requirement.
- Final status: `Match | Partial | Missing`.
- Short recommendation per requirement.

## Success for Demo
- Judges can run one analysis and quickly scan the report.
- Results are transparent, with clear evidence and reasoning.
