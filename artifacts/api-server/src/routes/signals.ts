import { Router, type IRouter } from "express";
import { eq, desc, or } from "drizzle-orm";
import { db, signalsTable } from "@workspace/db";
import {
  CreateSignalBody,
  ExpireSignalParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /signals/active
router.get("/signals/active", async (req, res): Promise<void> => {
  const now = new Date();
  const signals = await db
    .select()
    .from(signalsTable)
    .where(eq(signalsTable.status, "ACTIVE"))
    .orderBy(desc(signalsTable.createdAt));

  // Auto-expire signals past their expiry time
  const toExpire = signals.filter((s) => new Date(s.expiresAt) < now);
  if (toExpire.length > 0) {
    await db
      .update(signalsTable)
      .set({ status: "EXPIRED" })
      .where(
        or(
          ...toExpire.map((s) => eq(signalsTable.id, s.id))
        )
      );
  }

  const active = signals.filter((s) => new Date(s.expiresAt) >= now);
  res.json(active.map(formatSignal));
});

// POST /signals
router.post("/signals", async (req, res): Promise<void> => {
  const parsed = CreateSignalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const now = new Date();
  // Signals expire after 30 minutes by default
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

  const [signal] = await db
    .insert(signalsTable)
    .values({
      type: data.type,
      entryPrice: data.entryPrice,
      takeProfit: data.takeProfit,
      stopLoss: data.stopLoss,
      fibLevel: data.fibLevel,
      reason: data.reason,
      timeframe: data.timeframe,
      rrRatio: data.rrRatio ?? null,
      confidence: data.confidence ?? null,
      status: "ACTIVE",
      expiresAt,
    })
    .returning();

  res.status(201).json(formatSignal(signal));
});

// PATCH /signals/:id/expire
router.patch("/signals/:id/expire", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ExpireSignalParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [signal] = await db
    .update(signalsTable)
    .set({ status: "EXPIRED" })
    .where(eq(signalsTable.id, params.data.id))
    .returning();

  if (!signal) {
    res.status(404).json({ error: "Signal not found" });
    return;
  }

  res.json(formatSignal(signal));
});

// GET /signals/history
router.get("/signals/history", async (_req, res): Promise<void> => {
  const signals = await db
    .select()
    .from(signalsTable)
    .orderBy(desc(signalsTable.createdAt))
    .limit(50);

  res.json(signals.map(formatSignal));
});

function formatSignal(s: typeof signalsTable.$inferSelect) {
  return {
    id: s.id,
    type: s.type,
    entryPrice: s.entryPrice,
    takeProfit: s.takeProfit,
    stopLoss: s.stopLoss,
    fibLevel: s.fibLevel,
    reason: s.reason,
    status: s.status,
    timeframe: s.timeframe,
    rrRatio: s.rrRatio ?? null,
    confidence: s.confidence ?? null,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    updatedAt: s.updatedAt?.toISOString() ?? null,
  };
}

export default router;
