export type ExtractedRequirement = {
  id: string;
  title: string;
  description: string;
  test_hint: string;
};

export type RequirementExtractionResponse = {
  requirements: ExtractedRequirement[];
  model: string;
};

export type RepoEvidenceStatus = "found" | "possible" | "not_found";

export type RequirementRepoEvidence = {
  requirement_id: string;
  requirement_title: string;
  evidence_status: RepoEvidenceStatus;
  matched_files: string[];
  reason: string;
  confidence: number;
};

export type RepositoryEvidenceResponse = {
  scanned_root: string;
  scanned_file_count: number;
  evidences: RequirementRepoEvidence[];
};
