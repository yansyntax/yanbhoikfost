import { Router, type IRouter } from "express";
import { eq, desc, or } from "drizzle-orm";
import { db, signalsTable } from "@workspace/db";

const router: IRouter = Router();

// GET /signals/active
router.get("/signals/active", async (req, res): Promise<void> => {
  const now = new Date();
  const signals = await db
    .select()
    .from(signalsTable)
    .where(eq(signalsTable.status, "ACTIVE"))
    .orderBy(desc(signalsTable.createdAt));

  const toExpire = signals.filter((s) => new Date(s.expiresAt) < now);
  if (toExpire.length > 0) {
    await db
      .update(signalsTable)
      .set({ status: "EXPIRED" })
      .where(or(...toExpire.map((s) => eq(signalsTable.id, s.id))));
  }

  const active = signals.filter((s) => new Date(s.expiresAt) >= now);
  res.json(active.map(formatSignal));
});

// POST /signals
router.post("/signals", async (req, res): Promise<void> => {
  const body = req.body as {
    type?: string;
    entryPrice?: number;
    takeProfit?: number;
    stopLoss?: number;
    area?: string;
    reason?: string;
    timeframe?: string;
    rrRatio?: number;
    confidence?: number;
    smcContext?: string;
  };

  if (!body.type || !body.entryPrice || !body.takeProfit || !body.stopLoss || !body.area || !body.reason) {
    res.status(400).json({ error: "Missing required fields: type, entryPrice, takeProfit, stopLoss, area, reason" });
    return;
  }
  if (!["BUY", "SELL"].includes(body.type)) {
    res.status(400).json({ error: "type must be BUY or SELL" });
    return;
  }

  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours

  const [signal] = await db
    .insert(signalsTable)
    .values({
      type: body.type,
      entryPrice: body.entryPrice,
      takeProfit: body.takeProfit,
      stopLoss: body.stopLoss,
      area: body.area,
      reason: body.reason,
      timeframe: body.timeframe ?? "H1",
      rrRatio: body.rrRatio ?? null,
      confidence: body.confidence ?? null,
      smcContext: body.smcContext ?? null,
      status: "ACTIVE",
      expiresAt,
    })
    .returning();

  res.status(201).json(formatSignal(signal));
});

// PATCH /signals/:id/expire
router.patch("/signals/:id/expire", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid signal id" });
    return;
  }

  const [signal] = await db
    .update(signalsTable)
    .set({ status: "EXPIRED" })
    .where(eq(signalsTable.id, id))
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
    area: s.area,
    reason: s.reason,
    status: s.status,
    timeframe: s.timeframe,
    rrRatio: s.rrRatio ?? null,
    confidence: s.confidence ?? null,
    smcContext: s.smcContext ?? null,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    updatedAt: s.updatedAt?.toISOString() ?? null,
  };
}

export default router;
