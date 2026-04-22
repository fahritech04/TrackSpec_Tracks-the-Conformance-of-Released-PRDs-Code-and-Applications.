"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  ExtractedRequirement,
  RepositoryEvidenceResponse,
  RequirementExtractionResponse,
  RequirementRepoEvidence,
} from "@/lib/conformance/types";

type SetupFormValues = {
  prdText: string;
  repoSource: string;
  deployedAppUrl: string;
};

type SetupErrors = Partial<Record<keyof SetupFormValues, string>>;

const initialForm: SetupFormValues = {
  prdText: "",
  repoSource: "",
  deployedAppUrl: "",
};

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isLikelyLocalPath(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\") ||
    /^[a-zA-Z]:\\/.test(trimmed)
  );
}

function isValidRepoSource(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return isValidUrl(trimmed) || isLikelyLocalPath(trimmed);
}

function validateInput(values: SetupFormValues): SetupErrors {
  const errors: SetupErrors = {};

  if (!values.prdText.trim()) {
    errors.prdText = "PRD/OpenSpec text is required.";
  } else if (values.prdText.trim().length < 80) {
    errors.prdText = "Provide at least 80 characters for meaningful extraction.";
  }

  if (!isValidRepoSource(values.repoSource)) {
    errors.repoSource = "Use a local repository path or a valid repository URL.";
  }

  if (!isValidUrl(values.deployedAppUrl.trim())) {
    errors.deployedAppUrl = "Use a valid http/https URL for deployed app.";
  }

  return errors;
}

function readinessLabel(valid: boolean): "Ready" | "Needs Input" {
  return valid ? "Ready" : "Needs Input";
}

function toUserMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unknown error while extracting requirements.";
}

function evidenceBadgeClass(status: RequirementRepoEvidence["evidence_status"]): string {
  if (status === "found") {
    return "bg-match/10 text-match";
  }

  if (status === "possible") {
    return "bg-partial/15 text-partial";
  }

  return "bg-missing/10 text-missing";
}

export default function Home() {
  const [values, setValues] = useState<SetupFormValues>(initialForm);
  const [submitted, setSubmitted] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState("");
  const [hasExtractionAttempt, setHasExtractionAttempt] = useState(false);
  const [requirements, setRequirements] = useState<ExtractedRequirement[]>([]);
  const [usedModel, setUsedModel] = useState("");
  const [isScanningRepo, setIsScanningRepo] = useState(false);
  const [hasRepoScanAttempt, setHasRepoScanAttempt] = useState(false);
  const [repoScanError, setRepoScanError] = useState("");
  const [repoEvidences, setRepoEvidences] = useState<RequirementRepoEvidence[]>([]);
  const [scannedRoot, setScannedRoot] = useState("");
  const [scannedFileCount, setScannedFileCount] = useState(0);

  const errors = useMemo(() => validateInput(values), [values]);
  const isValid = Object.keys(errors).length === 0;

  const prdReady = !errors.prdText && values.prdText.trim().length >= 80;
  const repoReady = !errors.repoSource && values.repoSource.trim().length > 0;
  const deployedReady =
    !errors.deployedAppUrl && values.deployedAppUrl.trim().length > 0;

  const readiness = useMemo(
    () => [
      { label: "PRD/OpenSpec", ready: prdReady },
      { label: "Repository Source", ready: repoReady },
      { label: "Deployed App URL", ready: deployedReady },
    ],
    [deployedReady, prdReady, repoReady],
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setHasExtractionAttempt(true);
    setExtractionError("");
    setRepoScanError("");

    if (!isValid) {
      setStatusMessage("Please fix input issues before running requirement extraction.");
      return;
    }

    setIsExtracting(true);
    setRequirements([]);
    setRepoEvidences([]);
    setScannedRoot("");
    setScannedFileCount(0);
    setHasRepoScanAttempt(false);
    setStatusMessage("Running Gemini requirement extraction...");

    try {
      const response = await fetch("/api/requirements/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prdText: values.prdText,
        }),
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const errorMessage =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Requirement extraction request failed.";

        throw new Error(errorMessage);
      }

      if (
        typeof payload !== "object" ||
        payload === null ||
        !("requirements" in payload) ||
        !Array.isArray(payload.requirements) ||
        !("model" in payload) ||
        typeof payload.model !== "string"
      ) {
        throw new Error(
          "Invalid requirement extraction response format from server.",
        );
      }

      const extractionPayload = payload as RequirementExtractionResponse;
      setRequirements(extractionPayload.requirements);
      setUsedModel(extractionPayload.model);
      setStatusMessage(
        `Requirement extraction completed. ${extractionPayload.requirements.length} requirements are ready for conformance analysis.`,
      );
    } catch (error) {
      const userMessage = toUserMessage(error);
      setExtractionError(userMessage);
      setStatusMessage(`Requirement extraction failed. ${userMessage}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const onRepositoryScan = async () => {
    setSubmitted(true);
    setHasRepoScanAttempt(true);
    setRepoScanError("");

    if (!isValid) {
      setStatusMessage("Please fix input issues before running repository evidence scan.");
      return;
    }

    if (requirements.length === 0) {
      setStatusMessage("Extract requirements first before repository evidence scan.");
      return;
    }

    setIsScanningRepo(true);
    setRepoEvidences([]);
    setStatusMessage("Scanning repository evidence for extracted requirements...");

    try {
      const response = await fetch("/api/repository/evidence", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repoSource: values.repoSource,
          requirements,
        }),
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const errorMessage =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Repository evidence scan request failed.";

        throw new Error(errorMessage);
      }

      if (
        typeof payload !== "object" ||
        payload === null ||
        !("evidences" in payload) ||
        !Array.isArray(payload.evidences) ||
        !("scanned_root" in payload) ||
        typeof payload.scanned_root !== "string" ||
        !("scanned_file_count" in payload) ||
        typeof payload.scanned_file_count !== "number"
      ) {
        throw new Error("Invalid repository evidence scan response format from server.");
      }

      const scanPayload = payload as RepositoryEvidenceResponse;
      setRepoEvidences(scanPayload.evidences);
      setScannedRoot(scanPayload.scanned_root);
      setScannedFileCount(scanPayload.scanned_file_count);
      setStatusMessage(
        `Repository evidence scan completed for ${scanPayload.evidences.length} requirements across ${scanPayload.scanned_file_count} files.`,
      );
    } catch (error) {
      const userMessage = toUserMessage(error);
      setRepoScanError(userMessage);
      setStatusMessage(`Repository evidence scan failed. ${userMessage}`);
    } finally {
      setIsScanningRepo(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-end justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-foreground-muted">
              Engineering Productivity x AI
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              TrackSpec
            </h1>
            <p className="mt-1 text-sm text-foreground-muted">
              Setup project input for PRD-Code-App Conformance
            </p>
          </div>
          <span className="rounded border bg-surface-muted px-3 py-1 text-xs font-medium text-foreground-muted">
            Stage 4: Requirement Extraction
          </span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-12 lg:gap-5 lg:px-8">
        <section className="rounded-lg border bg-surface p-5 sm:p-6 lg:col-span-7">
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
            Project Setup Input
          </h2>
          <p className="mt-2 text-sm leading-6 text-foreground-muted">
            Provide requirement source, implementation source, and released
            application target. Then run Gemini requirement extraction.
          </p>

          <form className="mt-5 space-y-4 sm:mt-6" onSubmit={onSubmit} noValidate>
            <div>
              <label
                htmlFor="prdText"
                className="text-sm font-medium text-foreground"
              >
                PRD/OpenSpec Text
              </label>
              <textarea
                id="prdText"
                name="prdText"
                rows={8}
                value={values.prdText}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, prdText: event.target.value }))
                }
                className="mt-2 w-full rounded-md border bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-foreground/60 focus:ring-2 focus:ring-foreground/10"
                placeholder="Paste PRD or OpenSpec text here. Include feature intent and expected behavior."
                aria-invalid={Boolean(submitted && errors.prdText)}
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                <span className="text-foreground-muted">
                  Minimum 80 characters for stable requirement extraction.
                </span>
                <span className="font-mono text-foreground-muted">
                  {values.prdText.trim().length} chars
                </span>
              </div>
              {submitted && errors.prdText ? (
                <p className="mt-1 text-sm text-missing">{errors.prdText}</p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="repoSource"
                className="text-sm font-medium text-foreground"
              >
                Repository Path or URL
              </label>
              <input
                id="repoSource"
                name="repoSource"
                type="text"
                value={values.repoSource}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, repoSource: event.target.value }))
                }
                className="mt-2 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition focus:border-foreground/60 focus:ring-2 focus:ring-foreground/10"
                placeholder="Example: D:\\project\\repo or https://github.com/org/repo"
                aria-invalid={Boolean(submitted && errors.repoSource)}
              />
              {submitted && errors.repoSource ? (
                <p className="mt-1 text-sm text-missing">{errors.repoSource}</p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="deployedAppUrl"
                className="text-sm font-medium text-foreground"
              >
                Deployed App URL
              </label>
              <input
                id="deployedAppUrl"
                name="deployedAppUrl"
                type="url"
                value={values.deployedAppUrl}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    deployedAppUrl: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition focus:border-foreground/60 focus:ring-2 focus:ring-foreground/10"
                placeholder="https://released-app.example.com"
                aria-invalid={Boolean(submitted && errors.deployedAppUrl)}
              />
              {submitted && errors.deployedAppUrl ? (
                <p className="mt-1 text-sm text-missing">{errors.deployedAppUrl}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-foreground-muted">
                Stage 4 extracts 5-8 verifiable requirements from PRD/OpenSpec.
              </p>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md border bg-foreground px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-foreground-muted"
                disabled={isExtracting}
              >
                {isExtracting ? "Extracting..." : "Extract Requirements"}
              </button>
            </div>
          </form>
        </section>

        <section className="space-y-4 lg:col-span-5">
          <article className="rounded-lg border bg-surface p-5 sm:p-6">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground-muted">
              Input Readiness
            </h3>
            <ul className="mt-3 space-y-2">
              {readiness.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between rounded border bg-surface-muted px-3 py-2"
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  <span
                    className={`rounded px-2 py-1 text-xs font-semibold ${
                      item.ready
                        ? "bg-match/10 text-match"
                        : "bg-partial/15 text-partial"
                    }`}
                  >
                    {readinessLabel(item.ready)}
                  </span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-lg border bg-surface p-5 sm:p-6">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground-muted">
              Current Input State
            </h3>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="rounded border bg-surface-muted px-3 py-2">
                <dt className="font-medium">PRD/OpenSpec Preview</dt>
                <dd className="mt-1 text-foreground-muted">
                  {values.prdText.trim()
                    ? `${values.prdText.trim().slice(0, 120)}${values.prdText.trim().length > 120 ? "..." : ""}`
                    : "Empty. Paste requirement text to continue."}
                </dd>
              </div>
              <div className="rounded border bg-surface-muted px-3 py-2">
                <dt className="font-medium">Repository Source</dt>
                <dd className="mt-1 break-all font-mono text-xs text-foreground-muted">
                  {values.repoSource.trim() || "Empty"}
                </dd>
              </div>
              <div className="rounded border bg-surface-muted px-3 py-2">
                <dt className="font-medium">Deployed App URL</dt>
                <dd className="mt-1 break-all font-mono text-xs text-foreground-muted">
                  {values.deployedAppUrl.trim() || "Empty"}
                </dd>
              </div>
            </dl>
          </article>

          <article
            className={`rounded-lg border p-4 text-sm leading-6 ${
              extractionError
                ? "border-missing/30 bg-missing/10 text-missing"
                : statusMessage
                  ? "border-match/40 bg-match/10 text-match"
                  : "bg-surface text-foreground-muted"
            }`}
          >
            {statusMessage ||
              "No extraction status yet. Fill all fields and run requirement extraction."}
          </article>
        </section>

        <section className="rounded-lg border bg-surface p-5 sm:p-6 lg:col-span-12">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold tracking-tight sm:text-lg">
              Extracted Requirements
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {usedModel ? (
                <span className="rounded border bg-surface-muted px-2 py-1 font-mono text-xs text-foreground-muted">
                  Model: {usedModel}
                </span>
              ) : null}
              <button
                type="button"
                onClick={onRepositoryScan}
                className="inline-flex items-center justify-center rounded-md border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface disabled:cursor-not-allowed disabled:text-foreground-muted"
                disabled={isExtracting || isScanningRepo || requirements.length === 0}
              >
                {isScanningRepo ? "Scanning Repo..." : "Scan Repository Evidence"}
              </button>
            </div>
          </div>

          {!hasExtractionAttempt ? (
            <div className="mt-4 rounded border bg-surface-muted px-4 py-3 text-sm text-foreground-muted">
              Empty state: run requirement extraction to generate 5-8 verifiable requirements.
            </div>
          ) : null}

          {isExtracting ? (
            <div className="mt-4 rounded border bg-surface-muted px-4 py-3 text-sm text-foreground-muted">
              Loading state: Gemini is extracting requirements from PRD/OpenSpec text...
            </div>
          ) : null}

          {extractionError ? (
            <div className="mt-4 rounded border border-missing/30 bg-missing/10 px-4 py-3 text-sm text-missing">
              Error state: {extractionError}
            </div>
          ) : null}

          {!isExtracting &&
          !extractionError &&
          hasExtractionAttempt &&
          requirements.length > 0 ? (
            <>
              <div className="mt-4 hidden overflow-x-auto rounded border sm:block">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-muted text-left text-xs uppercase tracking-[0.12em] text-foreground-muted">
                      <th className="px-3 py-2">ID</th>
                      <th className="px-3 py-2">Title</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Test Hint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirements.map((item) => (
                      <tr key={item.id} className="border-t align-top text-sm">
                        <td className="px-3 py-2 font-mono text-xs">{item.id}</td>
                        <td className="px-3 py-2 font-medium">{item.title}</td>
                        <td className="px-3 py-2 text-foreground-muted">
                          {item.description}
                        </td>
                        <td className="px-3 py-2 text-foreground-muted">
                          {item.test_hint}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 space-y-3 sm:hidden">
                {requirements.map((item) => (
                  <article
                    key={item.id}
                    className="rounded border bg-surface-muted p-3 text-sm"
                  >
                    <p className="font-mono text-xs text-foreground-muted">{item.id}</p>
                    <h4 className="mt-1 font-semibold">{item.title}</h4>
                    <p className="mt-2 text-foreground-muted">{item.description}</p>
                    <p className="mt-2 text-xs text-foreground-muted">
                      Test hint: {item.test_hint}
                    </p>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <section className="rounded-lg border bg-surface p-5 sm:p-6 lg:col-span-12">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold tracking-tight sm:text-lg">
              Repository Evidence
            </h3>
            {scannedRoot ? (
              <span className="rounded border bg-surface-muted px-2 py-1 font-mono text-xs text-foreground-muted">
                {scannedFileCount} files scanned
              </span>
            ) : null}
          </div>

          {!hasRepoScanAttempt ? (
            <div className="mt-4 rounded border bg-surface-muted px-4 py-3 text-sm text-foreground-muted">
              Empty state: run repository evidence scan after extracting requirements.
            </div>
          ) : null}

          {isScanningRepo ? (
            <div className="mt-4 rounded border bg-surface-muted px-4 py-3 text-sm text-foreground-muted">
              Loading state: scanning key repository files for requirement evidence...
            </div>
          ) : null}

          {repoScanError ? (
            <div className="mt-4 rounded border border-missing/30 bg-missing/10 px-4 py-3 text-sm text-missing">
              Error state: {repoScanError}
            </div>
          ) : null}

          {scannedRoot ? (
            <p className="mt-3 break-all font-mono text-xs text-foreground-muted">
              Scanned root: {scannedRoot}
            </p>
          ) : null}

          {!isScanningRepo &&
          !repoScanError &&
          hasRepoScanAttempt &&
          repoEvidences.length > 0 ? (
            <>
              <div className="mt-4 hidden overflow-x-auto rounded border sm:block">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-muted text-left text-xs uppercase tracking-[0.12em] text-foreground-muted">
                      <th className="px-3 py-2">Requirement</th>
                      <th className="px-3 py-2">Evidence Status</th>
                      <th className="px-3 py-2">Matched Files</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="px-3 py-2">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repoEvidences.map((item) => (
                      <tr
                        key={item.requirement_id}
                        className="border-t align-top text-sm"
                      >
                        <td className="px-3 py-2">
                          <p className="font-mono text-xs text-foreground-muted">
                            {item.requirement_id}
                          </p>
                          <p className="mt-1 font-medium">{item.requirement_title}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded px-2 py-1 text-xs font-semibold ${evidenceBadgeClass(
                              item.evidence_status,
                            )}`}
                          >
                            {item.evidence_status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground-muted">
                          {item.matched_files.length ? (
                            <div className="space-y-1">
                              {item.matched_files.map((filePath) => (
                                <p key={`${item.requirement_id}-${filePath}`}>{filePath}</p>
                              ))}
                            </div>
                          ) : (
                            "No matched files"
                          )}
                        </td>
                        <td className="px-3 py-2 text-foreground-muted">
                          {item.reason}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {item.confidence.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 space-y-3 sm:hidden">
                {repoEvidences.map((item) => (
                  <article
                    key={item.requirement_id}
                    className="rounded border bg-surface-muted p-3 text-sm"
                  >
                    <p className="font-mono text-xs text-foreground-muted">
                      {item.requirement_id}
                    </p>
                    <h4 className="mt-1 font-semibold">{item.requirement_title}</h4>
                    <span
                      className={`mt-2 inline-block rounded px-2 py-1 text-xs font-semibold ${evidenceBadgeClass(
                        item.evidence_status,
                      )}`}
                    >
                      {item.evidence_status}
                    </span>
                    <p className="mt-2 text-foreground-muted">{item.reason}</p>
                    <p className="mt-2 font-mono text-xs text-foreground-muted">
                      Confidence: {item.confidence.toFixed(2)}
                    </p>
                    <div className="mt-2 space-y-1">
                      {item.matched_files.length ? (
                        item.matched_files.map((filePath) => (
                          <p
                            key={`${item.requirement_id}-mobile-${filePath}`}
                            className="break-all font-mono text-xs text-foreground-muted"
                          >
                            {filePath}
                          </p>
                        ))
                      ) : (
                        <p className="text-xs text-foreground-muted">No matched files</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {!isScanningRepo &&
          !repoScanError &&
          hasRepoScanAttempt &&
          repoEvidences.length === 0 ? (
            <div className="mt-4 rounded border bg-surface-muted px-4 py-3 text-sm text-foreground-muted">
              Repository scan completed with no evidence records.
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
