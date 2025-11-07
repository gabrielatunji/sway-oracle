export function buildSystemPrompt(): string {
  return "You are a sports resolution assistant. Provide factual, succinct outputs. Do not reveal chain-of-thought. Provide short verifiable reasoning only.";
}

export function buildUserPrompt(structured: unknown, evidenceDigest: unknown): string {
  return [
    "Given the structured sports query and evidence digest below, respond with a single JSON object using the schema:",
    "{",
    '  "resolution": "string",',
    '  "confidence": 0.0,',
    '  "reasoning": "1-3 sentences, verifiable, no private chain-of-thought",',
    '  "sources": ["..."],',
    '  "evidence": { "keyFacts": "..." }',
    "}",
    "",
    "Structured Query:",
    JSON.stringify(structured, null, 2),
    "",
    "Evidence Digest:",
    JSON.stringify(evidenceDigest, null, 2)
  ].join("\n");
}
