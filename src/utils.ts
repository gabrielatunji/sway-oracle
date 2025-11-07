import axios, { AxiosRequestConfig } from "axios";

export interface QueryMetadata {
  original: string;
  normalized: string;
  sport: string | null;
  date: string | null;
  teams: string[];
}

export interface RetryOptions {
  retries?: number;
  initialDelayMs?: number;
  factor?: number;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
}

interface CircuitBreakerState {
  failures: number;
  openedAt: number | null;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
];

const BASKETBALL_KEYWORDS = [
  "nba",
  "basketball",
  "lakers",
  "warriors",
  "celtics",
  "heat",
  "bucks",
  "suns",
  "clippers",
  "bulls",
  "knicks",
  "76ers"
];

export function extractQueryMetadata(query: string): QueryMetadata {
  const normalized = query.trim();
  const lower = normalized.toLowerCase();

  let sport: string | null = null;
  if (BASKETBALL_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    sport = "basketball";
  }

  const teams = BASKETBALL_KEYWORDS.filter((keyword) => keyword !== "nba" && keyword !== "basketball" && lower.includes(keyword));

  const isoDate = detectIsoDate(lower);

  return {
    original: query,
    normalized,
    sport,
    date: isoDate,
    teams
  };
}

function detectIsoDate(value: string): string | null {
  const isoRegex = /(\d{4}-\d{2}-\d{2})/;
  const isoMatch = isoRegex.exec(value);
  if (isoMatch) {
    return isoMatch[1];
  }

  const monthRegex = new RegExp(`(${MONTHS.join("|")})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,\\s*\\d{4})?`, "i");
  const monthMatch = monthRegex.exec(value);
  if (monthMatch) {
    const parsed = new Date(monthMatch[0]);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  const numericDateRegex = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/;
  const numericMatch = numericDateRegex.exec(value);
  if (numericMatch) {
    const [_, m1, m2, m3] = numericMatch;
    const candidate = normalizeNumericDate(Number(m1), Number(m2), Number(m3));
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function normalizeNumericDate(a: number, b: number, c: number): string | null {
  const year = c < 100 ? 2000 + c : c;
  const monthFirst = new Date(year, a - 1, b);
  if (isValidDate(monthFirst, year, a, b)) {
    return monthFirst.toISOString().slice(0, 10);
  }
  const dayFirst = new Date(year, b - 1, a);
  if (isValidDate(dayFirst, year, b, a)) {
    return dayFirst.toISOString().slice(0, 10);
  }
  return null;
}

function isValidDate(candidate: Date, year: number, month: number, day: number): boolean {
  return (
    !Number.isNaN(candidate.getTime()) &&
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() + 1 === month &&
    candidate.getUTCDate() === day
  );
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 2, initialDelayMs = 250, factor = 2 } = options;
  let attempt = 0;
  let delay = initialDelayMs;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= factor;
      attempt += 1;
    }
  }
}

export class CircuitBreaker {
  private readonly state: CircuitBreakerState = { failures: 0, openedAt: null };

  private readonly failureThreshold: number;

  private readonly cooldownMs: number;

  constructor({ failureThreshold = 3, cooldownMs = 15_000 }: CircuitBreakerOptions = {}) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
  }

  exec<T>(action: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new CircuitOpenError();
    }

    return action()
      .then((result) => {
        this.reset();
        return result;
      })
      .catch((error) => {
        this.recordFailure();
        throw error;
      });
  }

  private recordFailure(): void {
    this.state.failures += 1;
    if (this.state.failures >= this.failureThreshold) {
      this.state.openedAt = Date.now();
    }
  }

  private reset(): void {
    this.state.failures = 0;
    this.state.openedAt = null;
  }

  private isOpen(): boolean {
    if (this.state.openedAt === null) {
      return false;
    }
    const elapsed = Date.now() - this.state.openedAt;
    if (elapsed > this.cooldownMs) {
      this.reset();
      return false;
    }
    return true;
  }
}

export class CircuitOpenError extends Error {
  constructor() {
    super("Circuit breaker is open");
  }
}

const breakerMap = new Map<string, CircuitBreaker>();

function getCircuitBreaker(host: string, options?: CircuitBreakerOptions): CircuitBreaker {
  const key = host.toLowerCase();
  if (!breakerMap.has(key)) {
    breakerMap.set(key, new CircuitBreaker(options));
  }
  return breakerMap.get(key)!;
}

export function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch (_error) {
    return null;
  }
}

export async function fetchJson(
  url: string,
  config: AxiosRequestConfig = {},
  retryOptions?: RetryOptions,
  cbOptions?: CircuitBreakerOptions
): Promise<any> {
  const parsed = new URL(url);
  const breaker = getCircuitBreaker(parsed.host, cbOptions);
  const executor = () => axios({ url, ...config }).then((response) => response.data);
  return breaker.exec(() => withRetry(executor, retryOptions));
}

export { MONTHS, BASKETBALL_KEYWORDS };
