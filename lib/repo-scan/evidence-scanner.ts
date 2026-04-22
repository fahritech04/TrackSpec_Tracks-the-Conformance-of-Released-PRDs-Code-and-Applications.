import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  ExtractedRequirement,
  RepoEvidenceStatus,
  RequirementRepoEvidence,
} from "@/lib/conformance/types";

const execFileAsync = promisify(execFile);

const IMPORTANT_DIRS = [
  "src",
  "app",
  "pages",
  "components",
  "lib",
  "server",
  "api",
  "routes",
];

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".idea",
  ".vscode",
  ".vercel",
  "vendor",
  "tmp",
  "temp",
]);

const TEXT_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".css",
  ".scss",
  ".html",
  ".sql",
  ".py",
  ".go",
  ".java",
  ".kt",
  ".rb",
  ".php",
  ".cs",
  ".swift",
  ".rs",
  ".env",
]);

const STOP_WORDS = new Set([
  "about",
  "above",
  "after",
  "again",
  "allow",
  "also",
  "application",
  "around",
  "because",
  "before",
  "below",
  "between",
  "build",
  "button",
  "check",
  "code",
  "conformance",
  "create",
  "deployed",
  "description",
  "feature",
  "from",
  "hint",
  "have",
  "into",
  "must",
  "open",
  "openspec",
  "page",
  "partial",
  "prd",
  "project",
  "report",
  "repository",
  "requirement",
  "should",
  "show",
  "text",
  "that",
  "their",
  "there",
  "these",
  "this",
  "trackspec",
  "with",
]);

const MAX_SCANNED_FILES = 120;
const MAX_FILE_BYTES = 128_000;
const MAX_FILE_SNIPPET_CHARS = 3_500;
const MAX_KEYWORDS_PER_REQUIREMENT = 20;

type SourceResolution = {
  rootPath: string;
  cleanup: () => Promise<void>;
};

type ScannedFile = {
  relativePath: string;
  content: string;
};

type RequirementScoring = {
  evidence_status: RepoEvidenceStatus;
  matched_files: string[];
  reason: string;
  confidence: number;
};

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRepositorySource(repoSource: string): Promise<SourceResolution> {
  const trimmed = repoSource.trim();

  if (!trimmed) {
    throw new Error("Repository source is required.");
  }

  if (isHttpUrl(trimmed)) {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "trackspec-repo-"));
    const clonePath = path.join(tempRoot, "repo");

    try {
      await execFileAsync("git", ["clone", "--depth", "1", trimmed, clonePath], {
        timeout: 45_000,
      });
    } catch (error) {
      await fs.rm(tempRoot, { recursive: true, force: true });
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to clone repository URL: ${message}`);
    }

    return {
      rootPath: clonePath,
      cleanup: async () => {
        await fs.rm(tempRoot, { recursive: true, force: true });
      },
    };
  }

  const resolvedPath = path.resolve(trimmed);
  const exists = await pathExists(resolvedPath);
  if (!exists) {
    throw new Error("Repository path does not exist on this machine.");
  }

  const stat = await fs.stat(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error("Repository source must point to a directory.");
  }

  return {
    rootPath: resolvedPath,
    cleanup: async () => Promise.resolve(),
  };
}

function isCandidateTextFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".min.js") || lower.endsWith(".min.css")) {
    return false;
  }

  const extension = path.extname(lower);
  return TEXT_FILE_EXTENSIONS.has(extension);
}

async function collectFilesFromRoots(rootPath: string): Promise<string[]> {
  const scanRoots: string[] = [];

  for (const dir of IMPORTANT_DIRS) {
    const maybe = path.join(rootPath, dir);
    if (await pathExists(maybe)) {
      const stat = await fs.stat(maybe);
      if (stat.isDirectory()) {
        scanRoots.push(maybe);
      }
    }
  }

  if (scanRoots.length === 0) {
    scanRoots.push(rootPath);
  }

  const foundFiles: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    if (foundFiles.length >= MAX_SCANNED_FILES) {
      return;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (foundFiles.length >= MAX_SCANNED_FILES) {
        break;
      }

      const nextPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name.toLowerCase())) {
          continue;
        }

        await walk(nextPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!isCandidateTextFile(nextPath)) {
        continue;
      }

      const stat = await fs.stat(nextPath);
      if (stat.size === 0 || stat.size > MAX_FILE_BYTES) {
        continue;
      }

      foundFiles.push(nextPath);
    }
  }

  for (const root of scanRoots) {
    await walk(root);
    if (foundFiles.length >= MAX_SCANNED_FILES) {
      break;
    }
  }

  return foundFiles;
}

async function readScannedFiles(rootPath: string, filePaths: string[]): Promise<ScannedFile[]> {
  const scanned: ScannedFile[] = [];

  for (const absolutePath of filePaths) {
    const raw = await fs.readFile(absolutePath, "utf8");
    const content = raw.slice(0, MAX_FILE_SNIPPET_CHARS);
    scanned.push({
      relativePath: path.relative(rootPath, absolutePath).replaceAll("\\", "/"),
      content,
    });
  }

  return scanned;
}

function extractKeywords(requirement: ExtractedRequirement): string[] {
  const source = `${requirement.title} ${requirement.description} ${requirement.test_hint}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");

  const words = source
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));

  return Array.from(new Set(words)).slice(0, MAX_KEYWORDS_PER_REQUIREMENT);
}

function scoreRequirementInFiles(
  requirement: ExtractedRequirement,
  files: ScannedFile[],
): RequirementScoring {
  const keywords = extractKeywords(requirement);

  if (keywords.length === 0) {
    return {
      evidence_status: "not_found",
      matched_files: [],
      reason: "No useful keywords could be derived from this requirement.",
      confidence: 0.1,
    };
  }

  const matches = files
    .map((file) => {
      const lowerPath = file.relativePath.toLowerCase();
      const lowerContent = file.content.toLowerCase();
      let score = 0;

      for (const keyword of keywords) {
        if (lowerContent.includes(keyword)) {
          score += 1;
        }
        if (lowerPath.includes(keyword)) {
          score += 1;
        }
      }

      return {
        path: file.relativePath,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const matchedFiles = matches.slice(0, 5).map((item) => item.path);
  const topScore = matches[0]?.score ?? 0;
  const totalScore = matches.slice(0, 5).reduce((acc, item) => acc + item.score, 0);

  let evidence_status: RepoEvidenceStatus = "not_found";
  let confidence = 0.14;

  if (topScore >= 5 || totalScore >= 14) {
    evidence_status = "found";
    confidence = Math.min(0.95, 0.55 + topScore * 0.05 + matchedFiles.length * 0.03);
  } else if (topScore >= 2 || totalScore >= 5) {
    evidence_status = "possible";
    confidence = Math.min(0.74, 0.35 + topScore * 0.06 + matchedFiles.length * 0.02);
  }

  if (matchedFiles.length === 0) {
    return {
      evidence_status: "not_found",
      matched_files: [],
      reason:
        "No matching signals were found in scanned repository files for this requirement.",
      confidence: 0.12,
    };
  }

  const reason =
    evidence_status === "found"
      ? `Strong keyword overlap detected in ${matchedFiles.length} file(s). Top score: ${topScore}.`
      : evidence_status === "possible"
        ? `Partial keyword overlap detected in ${matchedFiles.length} file(s). Top score: ${topScore}.`
        : `Weak overlap detected. Evidence is not sufficient for confident matching.`;

  return {
    evidence_status,
    matched_files: matchedFiles,
    reason,
    confidence: Number(confidence.toFixed(2)),
  };
}

export async function scanRepositoryEvidence(
  repoSource: string,
  requirements: ExtractedRequirement[],
): Promise<{ scannedRoot: string; scannedFileCount: number; evidences: RequirementRepoEvidence[] }> {
  if (!requirements.length) {
    throw new Error("Requirements are required before running repository evidence scan.");
  }

  const source = await resolveRepositorySource(repoSource);

  try {
    const filePaths = await collectFilesFromRoots(source.rootPath);
    const files = await readScannedFiles(source.rootPath, filePaths);

    const evidences = requirements.map((requirement) => {
      const scoring = scoreRequirementInFiles(requirement, files);

      return {
        requirement_id: requirement.id,
        requirement_title: requirement.title,
        evidence_status: scoring.evidence_status,
        matched_files: scoring.matched_files,
        reason: scoring.reason,
        confidence: scoring.confidence,
      };
    });

    return {
      scannedRoot: source.rootPath,
      scannedFileCount: files.length,
      evidences,
    };
  } finally {
    await source.cleanup();
  }
}
