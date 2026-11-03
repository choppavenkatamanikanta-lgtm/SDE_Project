import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

type Bindings = { DB: D1Database };
type AppContext = Context<{ Bindings: Bindings }>;
interface HomeRow { id: string; name: string }
interface MemberRow { seq: number; id: string; home_id: string; name: string }
interface ShareRow {
  id: string;
  bill_id: string;
  member_id: string;
  amount_cents: number;
  paid_at: string | null;
  idempotency_key: string | null;
}
const app = new Hono<{ Bindings: Bindings }>();
const error = (c: AppContext, message: string, status: ContentfulStatusCode) =>
  c.json({ error: message }, status);

async function readJson(c: AppContext): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await c.req.json();
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.post("/api/homes", async (c) => {
  const body = await readJson(c);
  if (!body) return error(c, "invalid JSON payload", 400);
  if (typeof body.name !== "string" || !body.name.trim()) return error(c, "home name is required", 400);
  const id = crypto.randomUUID();
  const name = body.name.trim();
  await c.env.DB.prepare("INSERT INTO homes (id, name) VALUES (?, ?)").bind(id, name).run();
  return c.json({ id, name }, 201);
});

app.post("/api/homes/:homeId/members", async (c) => {
  const body = await readJson(c);
  if (!body) return error(c, "invalid JSON payload", 400);
  if (typeof body.name !== "string" || !body.name.trim()) return error(c, "member name is required", 400);
  const homeId = c.req.param("homeId");
  const home = await c.env.DB.prepare("SELECT id FROM homes WHERE id = ?").bind(homeId).first<HomeRow>();
  if (!home) return error(c, "home not found", 404);
  const id = crypto.randomUUID();
  const name = body.name.trim();
  await c.env.DB.prepare("INSERT INTO members (id, home_id, name) VALUES (?, ?, ?)").bind(id, homeId, name).run();
  return c.json({ id, homeId, name }, 201);
});

app.get("/api/homes/:homeId/members", async (c) => {
  const homeId = c.req.param("homeId");
  const home = await c.env.DB.prepare("SELECT id FROM homes WHERE id = ?").bind(homeId).first<HomeRow>();
  if (!home) return error(c, "home not found", 404);
  const { results } = await c.env.DB.prepare("SELECT seq, id, home_id, name FROM members WHERE home_id = ? ORDER BY seq ASC").bind(homeId).all<MemberRow>();
  return c.json({ members: (results ?? []).map(({ id, name }) => ({ id, name })) });
});

app.post("/api/homes/:homeId/bills", async (c) => {
  const body = await readJson(c);
  if (!body) return error(c, "invalid JSON payload", 400);
  if (typeof body.title !== "string" || !body.title.trim()) return error(c, "title is required", 400);
  const totalCents = body.totalCents;
  if (typeof totalCents !== "number" || !Number.isSafeInteger(totalCents) || totalCents <= 0) {
    return error(c, "total is not a positive whole number, or the home has no members", 422);
  }
  const homeId = c.req.param("homeId");
  const home = await c.env.DB.prepare("SELECT id FROM homes WHERE id = ?").bind(homeId).first<HomeRow>();
  if (!home) return error(c, "home not found", 404);
  const { results: members } = await c.env.DB.prepare("SELECT seq, id, home_id, name FROM members WHERE home_id = ? ORDER BY seq ASC").bind(homeId).all<MemberRow>();
  if (!members?.length) return error(c, "total is not a positive whole number, or the home has no members", 422);
  const billId = crypto.randomUUID();
  const title = body.title.trim();
  const base = Math.floor(totalCents / members.length);
  const remainder = totalCents % members.length;
  const shares = members.map((member, index) => ({
    id: crypto.randomUUID(),
    memberId: member.id,
    amountCents: base + (index < remainder ? 1 : 0),
    paidAt: null,
  }));
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare("INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)").bind(billId, homeId, title, totalCents),
    ...shares.map((share) => c.env.DB.prepare("INSERT INTO bill_shares (id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, ?)").bind(share.id, billId, share.memberId, share.amountCents)),
  ];
  await c.env.DB.batch(statements);
  return c.json({ id: billId, homeId, title, totalCents, shares }, 201);
});

app.get("/api/homes/:homeId/bills", async (c) => {
  const homeId = c.req.param("homeId");
  const home = await c.env.DB.prepare("SELECT id FROM homes WHERE id = ?").bind(homeId).first<HomeRow>();
  if (!home) return error(c, "home not found", 404);
  const { results: bills } = await c.env.DB.prepare("SELECT id, home_id, title, total_cents FROM bills WHERE home_id = ? ORDER BY created_at DESC").bind(homeId).all<{ id: string; home_id: string; title: string; total_cents: number }>();
  if (!bills?.length) return c.json({ bills: [] });
  const ids = bills.map((bill) => bill.id);
  const placeholders = ids.map(() => "?").join(",");
  const { results: shares } = await c.env.DB.prepare(`SELECT id, bill_id, member_id, amount_cents, paid_at, idempotency_key FROM bill_shares WHERE bill_id IN (${placeholders})`).bind(...ids).all<ShareRow>();
  const byBill = new Map<string, Array<{ id: string; memberId: string; amountCents: number; paidAt: string | null }>>();
  for (const share of shares ?? []) {
    const list = byBill.get(share.bill_id) ?? [];
    list.push({ id: share.id, memberId: share.member_id, amountCents: share.amount_cents, paidAt: share.paid_at });
    byBill.set(share.bill_id, list);
  }
  return c.json({ bills: bills.map((bill) => ({ id: bill.id, homeId: bill.home_id, title: bill.title, totalCents: bill.total_cents, shares: byBill.get(bill.id) ?? [] })) });
});

app.post("/api/bills/:billId/shares/:shareId/pay", async (c) => {
  const billId = c.req.param("billId");
  const shareId = c.req.param("shareId");
  const key = c.req.header("Idempotency-Key");
  if (!key?.trim()) return error(c, "key missing", 400);
  const share = await c.env.DB.prepare("SELECT id, bill_id, member_id, amount_cents, paid_at, idempotency_key FROM bill_shares WHERE id = ? AND bill_id = ?").bind(shareId, billId).first<ShareRow>();
  if (!share) return error(c, "bill or share not found", 404);
  if (share.paid_at !== null) {
    if (share.idempotency_key === key) return c.json({ id: share.id, memberId: share.member_id, amountCents: share.amount_cents, paidAt: share.paid_at });
    return error(c, "share already paid with a different key", 409);
  }
  const paidAt = new Date().toISOString();
  try {
    const result = await c.env.DB.prepare("UPDATE bill_shares SET paid_at = ?, idempotency_key = ? WHERE id = ? AND paid_at IS NULL").bind(paidAt, key, shareId).run();
    if (result.meta.changes === 0) {
      const current = await c.env.DB.prepare("SELECT id, member_id, amount_cents, paid_at, idempotency_key FROM bill_shares WHERE id = ?").bind(shareId).first<ShareRow>();
      if (current?.idempotency_key === key) return c.json({ id: current.id, memberId: current.member_id, amountCents: current.amount_cents, paidAt: current.paid_at });
      return error(c, "share already paid with a different key", 409);
    }
    return c.json({ id: share.id, memberId: share.member_id, amountCents: share.amount_cents, paidAt });
  } catch (cause: unknown) {
    const message = String(cause);
    if (message.includes("UNIQUE") || message.includes("uq_shares_idempotency")) return error(c, "share already paid with a different key", 409);
    throw cause;
  }
});

app.get("/api/homes/:homeId/balances", async (c) => {
  const homeId = c.req.param("homeId");
  const home = await c.env.DB.prepare("SELECT id FROM homes WHERE id = ?").bind(homeId).first<HomeRow>();
  if (!home) return error(c, "home not found", 404);
  const { results } = await c.env.DB.prepare(`SELECT m.id AS memberId, m.name AS name, COALESCE(SUM(CASE WHEN bs.paid_at IS NULL AND bs.id IS NOT NULL THEN bs.amount_cents ELSE 0 END), 0) AS outstandingCents FROM members m LEFT JOIN bill_shares bs ON bs.member_id = m.id WHERE m.home_id = ? GROUP BY m.seq, m.id, m.name ORDER BY m.seq ASC`).bind(homeId).all<{ memberId: string; name: string; outstandingCents: number }>();
  return c.json({ balances: results ?? [] });
});

export default app;
