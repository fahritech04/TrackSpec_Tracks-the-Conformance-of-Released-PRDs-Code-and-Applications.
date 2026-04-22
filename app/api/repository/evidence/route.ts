import { NextResponse } from "next/server";
import { scanRepositoryEvidence } from "@/lib/repo-scan/evidence-scanner";
import type {
  ExtractedRequirement,
  RepositoryEvidenceResponse,
} from "@/lib/conformance/types";

type RepositoryEvidenceRequest = {
  repoSource?: string;
  requirements?: ExtractedRequirement[];
};

function isValidRequirement(value: unknown): value is ExtractedRequirement {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.description === "string" &&
    typeof item.test_hint === "string"
  );
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown server error.";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RepositoryEvidenceRequest;

    const repoSource = body.repoSource?.trim() ?? "";
    const requirements = Array.isArray(body.requirements) ? body.requirements : [];

    if (!repoSource) {
      return NextResponse.json(
        { error: "Repository source is required." },
        { status: 400 },
      );
    }

    if (!requirements.length) {
      return NextResponse.json(
        { error: "Requirements are required before repository evidence scan." },
        { status: 400 },
      );
    }

    if (!requirements.every(isValidRequirement)) {
      return NextResponse.json(
        { error: "Invalid requirement payload format." },
        { status: 400 },
      );
    }

    const result = await scanRepositoryEvidence(repoSource, requirements);

    const payload: RepositoryEvidenceResponse = {
      scanned_root: result.scannedRoot,
      scanned_file_count: result.scannedFileCount,
      evidences: result.evidences,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const message = messageFromUnknown(error);
    const lower = message.toLowerCase();

    if (lower.includes("does not exist") || lower.includes("directory")) {
      return NextResponse.json(
        {
          error: `Repository scan failed: ${message}`,
        },
        { status: 400 },
      );
    }

    if (lower.includes("clone") || lower.includes("git")) {
      return NextResponse.json(
        {
          error:
            "Repository URL could not be read. Check URL accessibility and try again.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: `Repository evidence scan failed: ${message}`,
      },
      { status: 500 },
    );
  }
}
