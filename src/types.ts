import type { QueryMetadata } from "./utils";

export interface EvidencePayload {
  metadata: QueryMetadata;
  data: Record<string, unknown>;
  errors: string[];
  modelOutputRaw?: string;
}

export interface ResolutionLog {
  query: string;
  resolution: string;
  confidence: number;
  reasoning: string;
  sources: string[];
  evidence: EvidencePayload;
}

export interface ResolutionResult {
  resolution: string;
  confidence: number;
  reasoning: string;
  sources: string[];
  evidence: EvidencePayload;
}
