# C4 - Level 3: Component Diagram (API Container)

## Components
- `InputValidator`: validates PRD text, repo source, and deployed app URL.
- `RequirementExtractor`: generates 5-8 verifiable requirements from PRD/OpenSpec.
- `RepoEvidenceScanner`: scans selected files and produces evidence status.
- `DeployedAppChecker`: runs smoke checks and generates deployed status.
- `ConformanceClassifier`: maps evidence into `Match | Partial | Missing`.
- `ReportComposer`: assembles final Conformance Report and recommendation.
- `RunRepository`: persistence for run data and report artifacts.
- `GeminiService`: centralized Gemini wrapper with timeout, retry, and fallback.

## Component Flow
`InputValidator -> RequirementExtractor -> RepoEvidenceScanner -> DeployedAppChecker -> ConformanceClassifier -> ReportComposer -> RunRepository`
