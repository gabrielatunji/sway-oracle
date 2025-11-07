import { Router, Request, Response, NextFunction } from "express";
import { logResolution } from "./controllers/sportsresolution";
import { resolveQuery } from "./controllers/sportsresolver";

const router = Router();

router.post("/resolve", async (req: Request, res: Response, next: NextFunction) => {
  const { query } = req.body ?? {};
  if (!query || typeof query !== "string") {
    return res.status(400).json({ message: "Request body must include a query string." });
  }

  try {
    const result = await resolveQuery(query);

    await logResolution({
      query,
      resolution: result.resolution,
      confidence: result.confidence,
      reasoning: result.reasoning,
      sources: result.sources,
      evidence: result.evidence
    });

    return res.json({
      resolution: result.resolution,
      confidence: result.confidence,
      reasoning: result.reasoning,
      sources: result.sources
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Circuit breaker")) {
      return res.status(502).json({ message: "Upstream sports data temporarily unavailable." });
    }
    return next(error);
  }
});

export default router;
