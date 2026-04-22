import { NextResponse } from "next/server";
import { extractRequirementsFromPrd } from "@/lib/conformance/requirement-extractor";
import { geminiService } from "@/lib/gemini/service";
import type { RequirementExtractionResponse } from "@/lib/conformance/types";

type ExtractRequestBody = {
  prdText?: string;
};

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown server error.";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExtractRequestBody;
    const prdText = body.prdText?.trim() ?? "";

    if (!prdText) {
      return NextResponse.json(
        { error: "PRD/OpenSpec text is required." },
        { status: 400 },
      );
    }

    const requirements = await extractRequirementsFromPrd(prdText);

    const payload: RequirementExtractionResponse = {
      requirements,
      model: geminiService.model,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const message = messageFromUnknown(error);
    const lower = message.toLowerCase();

    if (lower.includes("api key")) {
      return NextResponse.json(
        {
          error:
            "Gemini is not configured yet. Set GEMINI_API_KEY in your environment and try again.",
        },
        { status: 500 },
      );
    }

    if (lower.includes("timeout")) {
      return NextResponse.json(
        {
          error:
            "Gemini request timed out. Please try again with shorter PRD/OpenSpec text.",
        },
        { status: 504 },
      );
    }

    if (
      lower.includes("429") ||
      lower.includes("rate") ||
      lower.includes("quota")
    ) {
      return NextResponse.json(
        {
          error:
            "Gemini rate limit reached. Wait a moment and retry the extraction.",
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      {
        error: `Requirement extraction failed: ${message}`,
      },
      { status: 500 },
    );
  }
}
