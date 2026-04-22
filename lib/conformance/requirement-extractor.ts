import { geminiService } from "@/lib/gemini/service";
import type { ExtractedRequirement } from "@/lib/conformance/types";

const MIN_REQUIREMENTS = 5;
const MAX_REQUIREMENTS = 8;
const MAX_PRD_CHARS = 12000;

const extractionCache = new Map<string, ExtractedRequirement[]>();

type GeminiRequirementPayload = {
  requirements?: Array<{
    id?: unknown;
    title?: unknown;
    description?: unknown;
    test_hint?: unknown;
  }>;
};

function toShortText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function createPrompt(prdText: string): string {
  return [
    "You are an expert product and engineering analyst.",
    "Extract exactly 5 to 8 verifiable requirements from the PRD/OpenSpec text.",
    "Output only valid JSON with this structure:",
    '{"requirements":[{"id":"REQ-1","title":"...","description":"...","test_hint":"..."}]}',
    "Rules:",
    "- id must follow REQ-1, REQ-2, ... format.",
    "- title must be concise.",
    "- description must describe expected behavior.",
    "- test_hint must describe how to verify the requirement in code or app.",
    "- No markdown, no explanation text, no extra keys.",
    "",
    "PRD/OpenSpec:",
    prdText,
  ].join("\n");
}

function normalizeRequirements(payload: unknown): ExtractedRequirement[] {
  const raw = payload as GeminiRequirementPayload;
  const candidates = Array.isArray(raw.requirements) ? raw.requirements : [];

  const normalized = candidates
    .map((item, index) => {
      const title = toShortText(item.title);
      const description = toShortText(item.description);
      const testHint = toShortText(item.test_hint);

      if (!title || !description || !testHint) {
        return null;
      }

      const idFromModel = toShortText(item.id);
      const fallbackId = `REQ-${index + 1}`;

      return {
        id: idFromModel || fallbackId,
        title,
        description,
        test_hint: testHint,
      };
    })
    .filter((value): value is ExtractedRequirement => Boolean(value));

  if (normalized.length < MIN_REQUIREMENTS) {
    throw new Error(
      `Gemini returned too few valid requirements (${normalized.length}). Minimum is ${MIN_REQUIREMENTS}.`,
    );
  }

  const clipped = normalized.slice(0, MAX_REQUIREMENTS);

  return clipped.map((item, index) => ({
    ...item,
    id: `REQ-${index + 1}`,
  }));
}

export async function extractRequirementsFromPrd(
  prdText: string,
): Promise<ExtractedRequirement[]> {
  const cleanedPrd = prdText.trim();

  if (!cleanedPrd) {
    throw new Error("PRD/OpenSpec text is required.");
  }

  if (cleanedPrd.length < 80) {
    throw new Error("PRD/OpenSpec text must be at least 80 characters.");
  }

  const boundedPrd = cleanedPrd.slice(0, MAX_PRD_CHARS);
  const cacheKey = boundedPrd;

  const cached = extractionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const prompt = createPrompt(boundedPrd);
  const payload = await geminiService.generateJson(prompt, {
    retries: 2,
    timeoutMs: 20000,
    temperature: 0.2,
    maxOutputTokens: 1400,
  });

  const requirements = normalizeRequirements(payload);
  extractionCache.set(cacheKey, requirements);
  return requirements;
}
