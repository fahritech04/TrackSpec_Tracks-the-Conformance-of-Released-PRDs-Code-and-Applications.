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

  return "Unknown error while processing request.";
}

function evidenceBadgeClass(status: RequirementRepoEvidence["evidence_status"]): string {
  if (status === "found") return "bg-emerald-500/15 text-emerald-700 border-emerald-300";
  if (status === "possible") return "bg-amber-400/20 text-amber-700 border-amber-300";
  return "bg-rose-500/15 text-rose-700 border-rose-300";
}

function readinessClass(valid: boolean): string {
  return valid
    ? "bg-emerald-500/15 text-emerald-700 border-emerald-300"
    : "bg-slate-400/15 text-slate-600 border-slate-300";
}

function panelClassName(extra?: string): string {
  return `rounded-[28px] border border-[#e8ddd1] bg-white shadow-[0_8px_18px_rgba(48,25,10,0.06)] ${extra ?? ""}`;
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
  const [repoEvidences, setRepoEvidences] = useState<RequirementRepoEvidence[]>(
    [],
  );
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

  const evidenceSummary = useMemo(() => {
    return {
      found: repoEvidences.filter((item) => item.evidence_status === "found").length,
      possible: repoEvidences.filter((item) => item.evidence_status === "possible")
        .length,
      not_found: repoEvidences.filter((item) => item.evidence_status === "not_found")
        .length,
    };
  }, [repoEvidences]);

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
        throw new Error("Invalid requirement extraction response format from server.");
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
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto w-full max-w-[1320px] rounded-[6px] bg-[#f7f2eb] shadow-[0_20px_80px_rgba(30,17,9,0.16)]">
        <div className="grid grid-cols-1 gap-px bg-[#5f1fb6] px-4 py-2 text-[11px] text-white sm:grid-cols-3 sm:px-8">
          <p className="text-center">15% Off On Requirement Extraction</p>
          <p className="text-center">Scan & Save Conformance Time</p>
          <p className="text-center">Free Local Setup + Gemini Cloud</p>
        </div>

        <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="text-[28px] leading-none [font-family:var(--font-display)]">
            TRACKSPEC<span className="text-[#ef5f24]">.</span>
          </div>

          <nav className="hidden items-center gap-7 text-sm font-extrabold text-[#2a1b1a] lg:flex">
            <span>SETUP</span>
            <span>REQUIREMENTS</span>
            <span>EVIDENCE</span>
            <span>REPORT</span>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              form="setup-form"
              className="rounded-full border-2 border-[#1f160f] bg-[#f6df2f] px-4 py-2 text-xs font-extrabold text-[#221810] transition hover:translate-y-[-1px]"
              disabled={isExtracting}
            >
              {isExtracting ? "EXTRACTING..." : "START TRACKING"}
            </button>
            <button
              type="button"
              onClick={onRepositoryScan}
              className="rounded-full border-2 border-[#1f160f] bg-white px-4 py-2 text-xs font-extrabold text-[#221810] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isExtracting || isScanningRepo || requirements.length === 0}
            >
              {isScanningRepo ? "SCANNING..." : "SCAN REPO"}
            </button>
          </div>
        </header>

        <main className="space-y-6 px-5 pb-8 sm:px-8">
          <section className={panelClassName("overflow-hidden p-4 sm:p-6")}>
            <div className="grid gap-5 lg:grid-cols-12">
              <div className="lg:col-span-6">
                <h1 className="text-[42px] leading-[0.95] text-[#2f1714] sm:text-[62px] [font-family:var(--font-display)]">
                  TRACK THE
                  <br />
                  CONFORMANCE
                </h1>
                <p className="mt-3 text-[30px] leading-[0.95] text-[#341b18] [font-family:var(--font-display)]">
                  REQUIREMENTS
                  <br />
                  CODE & APP
                </p>

                <div className="mt-4 flex flex-wrap gap-2 text-xs font-extrabold">
                  <span className="rounded-full bg-[#13a95d] px-3 py-1 text-white">RELIABLE</span>
                  <span className="rounded-full bg-[#2da5f2] px-3 py-1 text-white">REPEATABLE</span>
                  <span className="rounded-full bg-[#ef5f24] px-3 py-1 text-white">MVP READY</span>
                </div>

                <p className="mt-4 max-w-md text-sm text-[#5c4a45]">
                  Paste your PRD/OpenSpec, point to repository, and run conformance
                  extraction with evidence scan in one workflow.
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <div className="rounded-full border border-[#dfd2c7] bg-[#f6f0e8] px-3 py-1 text-xs font-bold text-[#4f3d37]">
                    Model: {usedModel || "not selected"}
                  </div>
                  <div className="rounded-full border border-[#dfd2c7] bg-[#f6f0e8] px-3 py-1 text-xs font-bold text-[#4f3d37]">
                    Files scanned: {scannedFileCount}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="h-full rounded-[28px] border border-[#e7dccc] bg-[#f6e15a] p-4">
                  <div className="grid h-full gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white/70 p-3">
                      <p className="text-xs font-bold uppercase text-[#6f5b54]">Requirement Count</p>
                      <p className="mt-2 text-4xl font-extrabold text-[#2e1b16]">{requirements.length}</p>
                      <p className="text-xs text-[#6f5b54]">Generated from PRD/OpenSpec</p>
                    </div>
                    <div className="rounded-2xl bg-white/70 p-3">
                      <p className="text-xs font-bold uppercase text-[#6f5b54]">Evidence Signals</p>
                      <p className="mt-2 text-3xl font-extrabold text-[#2e1b16]">
                        {evidenceSummary.found} / {repoEvidences.length}
                      </p>
                      <p className="text-xs text-[#6f5b54]">Found across repository scan</p>
                    </div>
                    <div className="rounded-2xl bg-white/70 p-3 sm:col-span-2">
                      <p className="text-xs font-bold uppercase text-[#6f5b54]">Current Status</p>
                      <p className="mt-2 text-sm text-[#4f3d37]">
                        {statusMessage ||
                          "Run extraction and repository scan to get latest conformance snapshot."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-12">
            <article className={panelClassName("p-4 sm:p-5 lg:col-span-8")}>
              <h2 className="text-[32px] leading-[1] text-[#2f1714] [font-family:var(--font-display)]">
                CONFORMANCE RECIPE
              </h2>
              <p className="mt-2 text-sm text-[#6a5650]">
                Fill all inputs, then run extraction and evidence scan.
              </p>

              <form id="setup-form" onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
                <div>
                  <label htmlFor="prdText" className="text-sm font-extrabold text-[#2c1d19]">
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
                    className="mt-2 w-full rounded-2xl border border-[#dfd2c7] bg-[#fffdfa] px-3 py-2 text-sm text-[#2d1d18] outline-none transition placeholder:text-[#9d8c84] focus:border-[#ef5f24] focus:ring-2 focus:ring-[#ef5f24]/20"
                    placeholder="Paste PRD/OpenSpec text here."
                    aria-invalid={Boolean(submitted && errors.prdText)}
                  />
                  <div className="mt-2 flex items-center justify-between text-xs text-[#806d65]">
                    <span>Minimum 80 characters for stable extraction.</span>
                    <span className="font-mono">{values.prdText.trim().length} chars</span>
                  </div>
                  {submitted && errors.prdText ? (
                    <p className="mt-1 text-sm text-rose-700">{errors.prdText}</p>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="repoSource" className="text-sm font-extrabold text-[#2c1d19]">
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
                      className="mt-2 w-full rounded-2xl border border-[#dfd2c7] bg-[#fffdfa] px-3 py-2 text-sm text-[#2d1d18] outline-none transition placeholder:text-[#9d8c84] focus:border-[#ef5f24] focus:ring-2 focus:ring-[#ef5f24]/20"
                      placeholder="D:\\repo\\project or https://github.com/org/repo"
                      aria-invalid={Boolean(submitted && errors.repoSource)}
                    />
                    {submitted && errors.repoSource ? (
                      <p className="mt-1 text-sm text-rose-700">{errors.repoSource}</p>
                    ) : null}
                  </div>

                  <div>
                    <label
                      htmlFor="deployedAppUrl"
                      className="text-sm font-extrabold text-[#2c1d19]"
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
                      className="mt-2 w-full rounded-2xl border border-[#dfd2c7] bg-[#fffdfa] px-3 py-2 text-sm text-[#2d1d18] outline-none transition placeholder:text-[#9d8c84] focus:border-[#ef5f24] focus:ring-2 focus:ring-[#ef5f24]/20"
                      placeholder="https://released-app.example.com"
                      aria-invalid={Boolean(submitted && errors.deployedAppUrl)}
                    />
                    {submitted && errors.deployedAppUrl ? (
                      <p className="mt-1 text-sm text-rose-700">{errors.deployedAppUrl}</p>
                    ) : null}
                  </div>
                </div>
              </form>
            </article>

            <aside className="space-y-4 lg:col-span-4">
              <article className={panelClassName("p-4")}>
                <h3 className="text-[26px] leading-[1] text-[#2f1714] [font-family:var(--font-display)]">
                  DAILY CHECKLIST
                </h3>
                <ul className="mt-3 space-y-2">
                  {readiness.map((item) => (
                    <li
                      key={item.label}
                      className="flex items-center justify-between rounded-2xl border border-[#e2d7cb] bg-[#fbf7f2] px-3 py-2"
                    >
                      <span className="text-sm font-bold text-[#33211d]">{item.label}</span>
                      <span
                        className={`rounded-full border px-2 py-1 text-xs font-extrabold ${readinessClass(
                          item.ready,
                        )}`}
                      >
                        {readinessLabel(item.ready)}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className={panelClassName("p-4")}>
                <h3 className="text-[26px] leading-[1] text-[#2f1714] [font-family:var(--font-display)]">
                  BATCH SUMMARY
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-[#e2d7cb] bg-[#f3f9f4] p-3">
                    <p className="text-xs font-extrabold text-[#52775e]">FOUND</p>
                    <p className="text-2xl font-extrabold text-[#27613b]">{evidenceSummary.found}</p>
                  </div>
                  <div className="rounded-2xl border border-[#e2d7cb] bg-[#fff8e9] p-3">
                    <p className="text-xs font-extrabold text-[#8d6a2a]">POSSIBLE</p>
                    <p className="text-2xl font-extrabold text-[#8f620c]">{evidenceSummary.possible}</p>
                  </div>
                </div>
                <p className="mt-3 break-all text-xs text-[#6f5b54]">
                  Scanned root: {scannedRoot || "not scanned yet"}
                </p>
              </article>
            </aside>
          </section>

          <section className={panelClassName("p-4 sm:p-5")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[32px] leading-[1] text-[#2f1714] [font-family:var(--font-display)]">
                REQUIREMENTS WE BAKE DAILY
              </h3>
              <div className="flex flex-wrap gap-2 text-xs font-extrabold">
                <span className="rounded-full bg-[#f0e4da] px-3 py-1 text-[#6b4d44]">REQ {requirements.length}</span>
                <span className="rounded-full bg-[#ece6fb] px-3 py-1 text-[#5d36ad]">
                  {usedModel || "model pending"}
                </span>
              </div>
            </div>

            {!hasExtractionAttempt ? (
              <div className="mt-4 rounded-2xl border border-[#e2d7cb] bg-[#fbf7f2] px-4 py-3 text-sm text-[#6f5b54]">
                Empty state: run requirement extraction to generate 5-8 verifiable requirements.
              </div>
            ) : null}

            {isExtracting ? (
              <div className="mt-4 rounded-2xl border border-[#e2d7cb] bg-[#fbf7f2] px-4 py-3 text-sm text-[#6f5b54]">
                Loading state: Gemini is extracting requirements from PRD/OpenSpec text...
              </div>
            ) : null}

            {extractionError ? (
              <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                Error state: {extractionError}
              </div>
            ) : null}

            {!isExtracting &&
            !extractionError &&
            hasExtractionAttempt &&
            requirements.length > 0 ? (
              <>
                <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-[#e2d7cb] sm:block">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="bg-[#f6f0e8] text-left text-xs uppercase tracking-[0.12em] text-[#6f5b54]">
                        <th className="px-3 py-2">ID</th>
                        <th className="px-3 py-2">Title</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2">Test Hint</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requirements.map((item, index) => (
                        <tr
                          key={item.id}
                          className={`border-t border-[#ece2d8] align-top text-sm ${
                            index % 2 === 0 ? "bg-white" : "bg-[#fffcf8]"
                          }`}
                        >
                          <td className="px-3 py-2 font-mono text-xs text-[#5f1fb6]">{item.id}</td>
                          <td className="px-3 py-2 font-bold text-[#2f1714]">{item.title}</td>
                          <td className="px-3 py-2 text-[#5f4d47]">{item.description}</td>
                          <td className="px-3 py-2 text-[#5f4d47]">{item.test_hint}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 space-y-3 sm:hidden">
                  {requirements.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-2xl border border-[#e2d7cb] bg-[#fffdfa] p-3 text-sm"
                    >
                      <p className="font-mono text-xs text-[#5f1fb6]">{item.id}</p>
                      <h4 className="mt-1 font-bold text-[#2f1714]">{item.title}</h4>
                      <p className="mt-2 text-[#5f4d47]">{item.description}</p>
                      <p className="mt-2 text-xs text-[#7b6961]">Test hint: {item.test_hint}</p>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <section className={panelClassName("p-4 sm:p-5")}>
            <h3 className="text-[32px] leading-[1] text-[#2f1714] [font-family:var(--font-display)]">
              REPOSITORY EVIDENCE COUNTER
            </h3>

            {!hasRepoScanAttempt ? (
              <div className="mt-4 rounded-2xl border border-[#e2d7cb] bg-[#fbf7f2] px-4 py-3 text-sm text-[#6f5b54]">
                Empty state: run repository evidence scan after extracting requirements.
              </div>
            ) : null}

            {isScanningRepo ? (
              <div className="mt-4 rounded-2xl border border-[#e2d7cb] bg-[#fbf7f2] px-4 py-3 text-sm text-[#6f5b54]">
                Loading state: scanning key repository files for requirement evidence...
              </div>
            ) : null}

            {repoScanError ? (
              <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                Error state: {repoScanError}
              </div>
            ) : null}

            {!isScanningRepo &&
            !repoScanError &&
            hasRepoScanAttempt &&
            repoEvidences.length > 0 ? (
              <>
                <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-[#e2d7cb] sm:block">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="bg-[#f6f0e8] text-left text-xs uppercase tracking-[0.12em] text-[#6f5b54]">
                        <th className="px-3 py-2">Requirement</th>
                        <th className="px-3 py-2">Evidence Status</th>
                        <th className="px-3 py-2">Matched Files</th>
                        <th className="px-3 py-2">Reason</th>
                        <th className="px-3 py-2">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repoEvidences.map((item, index) => (
                        <tr
                          key={item.requirement_id}
                          className={`border-t border-[#ece2d8] align-top text-sm ${
                            index % 2 === 0 ? "bg-white" : "bg-[#fffcf8]"
                          }`}
                        >
                          <td className="px-3 py-2">
                            <p className="font-mono text-xs text-[#5f1fb6]">{item.requirement_id}</p>
                            <p className="mt-1 font-bold text-[#2f1714]">{item.requirement_title}</p>
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full border px-2 py-1 text-xs font-extrabold ${evidenceBadgeClass(
                                item.evidence_status,
                              )}`}
                            >
                              {item.evidence_status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-[#5f4d47]">
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
                          <td className="px-3 py-2 text-[#5f4d47]">{item.reason}</td>
                          <td className="px-3 py-2 font-mono text-xs text-[#32201b]">
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
                      className="rounded-2xl border border-[#e2d7cb] bg-[#fffdfa] p-3 text-sm"
                    >
                      <p className="font-mono text-xs text-[#5f1fb6]">{item.requirement_id}</p>
                      <h4 className="mt-1 font-bold text-[#2f1714]">{item.requirement_title}</h4>
                      <span
                        className={`mt-2 inline-block rounded-full border px-2 py-1 text-xs font-extrabold ${evidenceBadgeClass(
                          item.evidence_status,
                        )}`}
                      >
                        {item.evidence_status}
                      </span>
                      <p className="mt-2 text-[#5f4d47]">{item.reason}</p>
                      <p className="mt-2 font-mono text-xs text-[#7b6961]">
                        Confidence: {item.confidence.toFixed(2)}
                      </p>
                      <div className="mt-2 space-y-1">
                        {item.matched_files.length ? (
                          item.matched_files.map((filePath) => (
                            <p
                              key={`${item.requirement_id}-mobile-${filePath}`}
                              className="break-all font-mono text-xs text-[#7b6961]"
                            >
                              {filePath}
                            </p>
                          ))
                        ) : (
                          <p className="text-xs text-[#7b6961]">No matched files</p>
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
              <div className="mt-4 rounded-2xl border border-[#e2d7cb] bg-[#fbf7f2] px-4 py-3 text-sm text-[#6f5b54]">
                Repository scan completed with no evidence records.
              </div>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}
