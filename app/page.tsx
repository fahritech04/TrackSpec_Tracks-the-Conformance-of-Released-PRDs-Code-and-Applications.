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
  if (status === "found") return "bg-emerald-400/15 text-emerald-300";
  if (status === "possible") return "bg-amber-400/15 text-amber-300";
  return "bg-rose-400/15 text-rose-300";
}

function readinessClass(valid: boolean): string {
  return valid ? "bg-emerald-400/15 text-emerald-300" : "bg-zinc-400/15 text-zinc-300";
}

function cardClassName(extra?: string): string {
  return `rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm shadow-[0_20px_60px_-40px_rgba(0,0,0,0.9)] ${extra ?? ""}`;
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
    <div className="relative min-h-screen overflow-hidden bg-[#05070d] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(74,222,128,0.08),transparent_30%),radial-gradient(circle_at_95%_0%,rgba(56,189,248,0.08),transparent_28%),linear-gradient(to_bottom,rgba(255,255,255,0.05),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.28)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.24)_1px,transparent_1px)] [background-size:72px_72px]" />

      <div className="relative z-10">
        <header className="border-b border-white/10">
          <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/20 text-cyan-300">
                <span className="font-mono text-sm font-bold">TS</span>
              </div>
              <div>
                <p className="text-sm font-semibold tracking-[0.08em] text-slate-100">
                  TRACKSPEC
                </p>
                <p className="text-xs text-slate-400">
                  PRD-Code-App Conformance Dashboard
                </p>
              </div>
            </div>

            <nav className="hidden items-center gap-8 text-sm text-slate-300 lg:flex">
              <span className="border-b border-cyan-300 pb-1 text-cyan-200">Dashboard</span>
              <span>Requirements</span>
              <span>Evidence</span>
              <span>Report</span>
            </nav>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRepositoryScan}
                className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isExtracting || isScanningRepo || requirements.length === 0}
              >
                {isScanningRepo ? "Scanning..." : "Scan Repository Evidence"}
              </button>
              <div className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-mono text-slate-300">
                {usedModel ? usedModel : "gemini model"}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1320px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className={cardClassName("p-4")}>
              <p className="text-xs uppercase tracking-[0.1em] text-slate-400">Requirements</p>
              <p className="mt-2 text-3xl font-semibold">{requirements.length}</p>
              <p className="mt-2 text-xs text-slate-400">Extracted from PRD/OpenSpec</p>
            </div>
            <div className={cardClassName("p-4")}>
              <p className="text-xs uppercase tracking-[0.1em] text-slate-400">Found Signals</p>
              <p className="mt-2 text-3xl font-semibold text-emerald-300">
                {evidenceSummary.found}
              </p>
              <p className="mt-2 text-xs text-slate-400">Repository evidence status found</p>
            </div>
            <div className={cardClassName("p-4")}>
              <p className="text-xs uppercase tracking-[0.1em] text-slate-400">Partial Signals</p>
              <p className="mt-2 text-3xl font-semibold text-amber-300">
                {evidenceSummary.possible}
              </p>
              <p className="mt-2 text-xs text-slate-400">Need stronger proof in codebase</p>
            </div>
            <div className={cardClassName("p-4")}>
              <p className="text-xs uppercase tracking-[0.1em] text-slate-400">Files Scanned</p>
              <p className="mt-2 text-3xl font-semibold">{scannedFileCount}</p>
              <p className="mt-2 text-xs text-slate-400">Across selected repo folders</p>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-12">
            <article className={cardClassName("p-5 sm:p-6 xl:col-span-7")}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-slate-400">
                    Setup Panel
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                    Conformance Input Console
                  </h2>
                </div>
                <div className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs text-slate-300">
                  Local + Gemini cloud inference
                </div>
              </div>

              <form onSubmit={onSubmit} noValidate className="space-y-4">
                <div>
                  <label htmlFor="prdText" className="text-sm font-medium text-slate-200">
                    PRD/OpenSpec Text
                  </label>
                  <textarea
                    id="prdText"
                    name="prdText"
                    rows={9}
                    value={values.prdText}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, prdText: event.target.value }))
                    }
                    className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-200/20"
                    placeholder="Paste PRD/OpenSpec text here..."
                    aria-invalid={Boolean(submitted && errors.prdText)}
                  />
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <span>Minimum 80 characters for stable extraction.</span>
                    <span className="font-mono">{values.prdText.trim().length} chars</span>
                  </div>
                  {submitted && errors.prdText ? (
                    <p className="mt-1 text-sm text-rose-300">{errors.prdText}</p>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="repoSource" className="text-sm font-medium text-slate-200">
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
                      className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-200/20"
                      placeholder="D:\\repo\\project or https://github.com/org/repo"
                      aria-invalid={Boolean(submitted && errors.repoSource)}
                    />
                    {submitted && errors.repoSource ? (
                      <p className="mt-1 text-sm text-rose-300">{errors.repoSource}</p>
                    ) : null}
                  </div>

                  <div>
                    <label
                      htmlFor="deployedAppUrl"
                      className="text-sm font-medium text-slate-200"
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
                      className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-200/20"
                      placeholder="https://released-app.example.com"
                      aria-invalid={Boolean(submitted && errors.deployedAppUrl)}
                    />
                    {submitted && errors.deployedAppUrl ? (
                      <p className="mt-1 text-sm text-rose-300">{errors.deployedAppUrl}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <p className="text-xs text-slate-400">
                    Logic and API stay unchanged. This action triggers existing extraction flow.
                  </p>
                  <button
                    type="submit"
                    className="rounded-xl border border-cyan-300/40 bg-cyan-300/15 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/25 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isExtracting}
                  >
                    {isExtracting ? "Extracting..." : "Extract Requirements"}
                  </button>
                </div>
              </form>
            </article>

            <div className="space-y-4 xl:col-span-5">
              <article className={cardClassName("p-5")}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-400">
                  Input Readiness
                </h3>
                <ul className="mt-3 space-y-2">
                  {readiness.map((item) => (
                    <li
                      key={item.label}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                    >
                      <span className="text-sm text-slate-200">{item.label}</span>
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${readinessClass(
                          item.ready,
                        )}`}
                      >
                        {readinessLabel(item.ready)}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className={cardClassName("p-5")}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-400">
                  Runtime State
                </h3>
                <div className="mt-3 space-y-2 text-xs text-slate-300">
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <p className="text-slate-400">Repo source</p>
                    <p className="mt-1 break-all font-mono">
                      {values.repoSource.trim() || "empty"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <p className="text-slate-400">Deployed app URL</p>
                    <p className="mt-1 break-all font-mono">
                      {values.deployedAppUrl.trim() || "empty"}
                    </p>
                  </div>
                  <div
                    className={`rounded-xl border px-3 py-2 ${
                      extractionError || repoScanError
                        ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
                        : statusMessage
                          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                          : "border-white/10 bg-black/20 text-slate-300"
                    }`}
                  >
                    {statusMessage || "System status will appear here after actions run."}
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section className={cardClassName("p-5 sm:p-6")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">Extracted Requirements</h3>
              {usedModel ? (
                <span className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 font-mono text-xs text-cyan-100">
                  Model: {usedModel}
                </span>
              ) : null}
            </div>

            {!hasExtractionAttempt ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                Empty state: run requirement extraction to generate 5-8 verifiable
                requirements.
              </div>
            ) : null}

            {isExtracting ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                Loading state: Gemini is extracting requirements from PRD/OpenSpec text...
              </div>
            ) : null}

            {extractionError ? (
              <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                Error state: {extractionError}
              </div>
            ) : null}

            {!isExtracting &&
            !extractionError &&
            hasExtractionAttempt &&
            requirements.length > 0 ? (
              <>
                <div className="mt-4 hidden overflow-x-auto rounded-xl border border-white/10 sm:block">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-left text-xs uppercase tracking-[0.12em] text-slate-400">
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
                          className={`border-t border-white/10 align-top text-sm ${
                            index % 2 === 0 ? "bg-black/10" : "bg-transparent"
                          }`}
                        >
                          <td className="px-3 py-2 font-mono text-xs text-cyan-200">{item.id}</td>
                          <td className="px-3 py-2 font-medium">{item.title}</td>
                          <td className="px-3 py-2 text-slate-300">{item.description}</td>
                          <td className="px-3 py-2 text-slate-300">{item.test_hint}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 space-y-3 sm:hidden">
                  {requirements.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm"
                    >
                      <p className="font-mono text-xs text-cyan-200">{item.id}</p>
                      <h4 className="mt-1 font-semibold">{item.title}</h4>
                      <p className="mt-2 text-slate-300">{item.description}</p>
                      <p className="mt-2 text-xs text-slate-400">Test hint: {item.test_hint}</p>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <section className={cardClassName("p-5 sm:p-6")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">Repository Evidence</h3>
              <div className="flex gap-2">
                <span className="rounded-md border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-300">
                  {evidenceSummary.found} found
                </span>
                <span className="rounded-md border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-300">
                  {evidenceSummary.possible} possible
                </span>
                <span className="rounded-md border border-rose-300/30 bg-rose-400/10 px-2 py-1 text-xs font-semibold text-rose-300">
                  {evidenceSummary.not_found} not_found
                </span>
              </div>
            </div>

            {!hasRepoScanAttempt ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                Empty state: run repository evidence scan after extracting requirements.
              </div>
            ) : null}

            {isScanningRepo ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                Loading state: scanning key repository files for requirement evidence...
              </div>
            ) : null}

            {repoScanError ? (
              <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                Error state: {repoScanError}
              </div>
            ) : null}

            {scannedRoot ? (
              <p className="mt-3 break-all font-mono text-xs text-slate-400">
                Scanned root: {scannedRoot}
              </p>
            ) : null}

            {!isScanningRepo &&
            !repoScanError &&
            hasRepoScanAttempt &&
            repoEvidences.length > 0 ? (
              <>
                <div className="mt-4 hidden overflow-x-auto rounded-xl border border-white/10 sm:block">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-left text-xs uppercase tracking-[0.12em] text-slate-400">
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
                          className={`border-t border-white/10 align-top text-sm ${
                            index % 2 === 0 ? "bg-black/10" : "bg-transparent"
                          }`}
                        >
                          <td className="px-3 py-2">
                            <p className="font-mono text-xs text-cyan-200">{item.requirement_id}</p>
                            <p className="mt-1 font-medium">{item.requirement_title}</p>
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-md px-2 py-1 text-xs font-semibold ${evidenceBadgeClass(
                                item.evidence_status,
                              )}`}
                            >
                              {item.evidence_status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-300">
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
                          <td className="px-3 py-2 text-slate-300">{item.reason}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-200">
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
                      className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm"
                    >
                      <p className="font-mono text-xs text-cyan-200">{item.requirement_id}</p>
                      <h4 className="mt-1 font-semibold">{item.requirement_title}</h4>
                      <span
                        className={`mt-2 inline-block rounded-md px-2 py-1 text-xs font-semibold ${evidenceBadgeClass(
                          item.evidence_status,
                        )}`}
                      >
                        {item.evidence_status}
                      </span>
                      <p className="mt-2 text-slate-300">{item.reason}</p>
                      <p className="mt-2 font-mono text-xs text-slate-400">
                        Confidence: {item.confidence.toFixed(2)}
                      </p>
                      <div className="mt-2 space-y-1">
                        {item.matched_files.length ? (
                          item.matched_files.map((filePath) => (
                            <p
                              key={`${item.requirement_id}-mobile-${filePath}`}
                              className="break-all font-mono text-xs text-slate-400"
                            >
                              {filePath}
                            </p>
                          ))
                        ) : (
                          <p className="text-xs text-slate-400">No matched files</p>
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
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                Repository scan completed with no evidence records.
              </div>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}
