import { z } from "npm:zod@3.25.76";

const target = z.enum(["missing", "uncertain", "reactive_changes", "SCC_suspected", "LSIL/ASC-H"]);
const caseSchema = z.object({
  id: z.string().regex(/^P\d{4}$/), name: z.string().max(100),
  age: z.string().max(200), hospital: z.string().max(1000),
  date: z.string().max(2000),
  pre: z.string().max(4000), post: z.string().max(4000),
  preCategory: z.string().max(100), postCategory: z.string().max(100),
}).strict().refine(c => target.safeParse(c.preCategory).success || target.safeParse(c.postCategory).success);
const label = z.enum(["NILM", "ASC-US", "ASC-H", "LSIL", "HSIL", "腺细胞异常", "鳞状上皮癌"]);
const side = z.discriminatedUnion("status", [
  z.object({ status: z.literal("reported"), labels: z.array(label).max(7), text: z.string().max(2000).optional() }),
  z.object({ status: z.enum(["pending", "not_found", "not_done", "uncertain"]), labels: z.array(label).max(0) }),
]).refine(value => value.status !== "reported" || value.labels.length > 0 || !!value.text?.trim());
const reviewSchema = z.object({
  caseId: z.string().regex(/^P\d{4}$/), reviewerId: z.string().uuid(),
  reviewerName: z.string().trim().min(1).max(80), pre: side, post: side, note: z.string().max(2000),
}).strict();
const origins = new Set(["https://je1zzz.github.io", "http://127.0.0.1:5173", "http://localhost:5173"]);
const serviceUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

async function db(path: string, init: RequestInit = {}) {
  if (!serviceUrl || !serviceKey) throw Error("Missing server environment");
  const response = await fetch(`${serviceUrl}/rest/v1/${path}`, {
    ...init, headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) throw Error(`Database HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// PostgREST caps each page; explicitly paginate to preserve all 1,273 WSI.
async function allRows(path: string) {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = z.array(z.unknown()).parse(await db(`${path}&limit=500&offset=${offset}`));
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

Deno.serve(async request => {
  const origin = request.headers.get("Origin");
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin" });
  if (origin && origins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info");
    headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  }
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) return reply({ error: "来源不受支持" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply({ error: "仅支持 POST" }, 405);
  try {
    const code = request.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!code || code.length > 200) return reply({ error: "请输入有效访问码" }, 401);
    const hashBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
    const hash = Array.from(new Uint8Array(hashBytes), b => b.toString(16).padStart(2, "0")).join("");
    const roles = z.array(z.object({ role: z.enum(["admin", "reviewer"]) })).parse(
      await db(`cv_access?select=role&code_hash=eq.${hash}&limit=1`));
    const access = roles[0]?.role;
    if (!access) return reply({ error: "访问码不正确或已失效" }, 401);
    const raw = await request.text();
    if (raw.length > 500000) return reply({ error: "请求过大" }, 413);
    const data: unknown = JSON.parse(raw);
    const { action } = z.object({ action: z.enum(["login", "list", "save", "export", "seed"]) }).parse(data);
    if (action === "login") {
      const rows = await allRows("cv_patient_cases?select=id&order=id");
      return reply({ role: access, count: rows.length });
    }
    if (action === "list") {
      const { reviewerId } = z.object({ reviewerId: z.string().uuid() }).parse(data);
      const [caseRows, reviewRows] = await Promise.all([
        allRows("cv_patient_cases?select=payload&order=id"),
        allRows(`cv_patient_reviews?select=payload,updated_at&reviewer_id=eq.${reviewerId}&order=case_id`),
      ]);
      const cases = z.array(z.object({ payload: caseSchema })).parse(caseRows).map(r => r.payload);
      const reviews = z.array(z.object({ payload: reviewSchema, updated_at: z.string() })).parse(reviewRows)
        .map(r => ({ ...r.payload, updatedAt: r.updated_at }));
      return reply({ cases, reviews });
    }
    if (action === "save") {
      const { review } = z.object({ review: reviewSchema }).parse(data);
      const exists = z.array(z.unknown()).parse(await db(`cv_patient_cases?select=id&id=eq.${review.caseId}&limit=1`));
      if (!exists.length) return reply({ error: "病例不存在" }, 404);
      const updatedAt = z.string().parse(await db("rpc/cv_patient_save_review", { method: "POST", body: JSON.stringify({ review }) }));
      return reply({ saved: true, caseId: review.caseId, updatedAt });
    }
    if (access !== "admin") return reply({ error: "需要管理员访问码" }, 403);
    if (action === "seed") {
      const { rows } = z.object({ rows: z.array(caseSchema).min(1).max(50) }).parse(data);
      await db("cv_patient_cases?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.map(c => ({ id: c.id, payload: c }))) });
      return reply({ inserted: rows.length });
    }
    const [caseRows, reviewRows] = await Promise.all([
      allRows("cv_patient_cases?select=id,payload&order=id"),
      allRows("cv_patient_reviews?select=case_id,reviewer_name,payload,updated_at&order=case_id,reviewer_id"),
    ]);
    const cases = z.array(z.object({ id: z.string(), payload: caseSchema })).parse(caseRows);
    const reviews = z.array(z.object({ case_id: z.string(), reviewer_name: z.string(), payload: reviewSchema, updated_at: z.string() })).parse(reviewRows);
    const grouped = new Map<string, typeof reviews>();
    for (const review of reviews) { const group = grouped.get(review.case_id) || []; group.push(review); grouped.set(review.case_id, group); }
    return reply({ rows: cases.flatMap(c => {
      const matching = grouped.get(c.id);
      return (matching?.length ? matching : [null]).map(r => ({
        id: c.id, case_payload: JSON.stringify(c.payload), review_payload: r ? JSON.stringify(r.payload) : null,
        reviewer_name: r?.reviewer_name ?? null, updated_at: r?.updated_at ?? null,
      }));
    }) });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return reply({ error: "填写内容不完整，请检查后重试" }, 400);
    return reply({ error: "反馈服务暂不可用，请稍后重试" }, 503);
  }
});
