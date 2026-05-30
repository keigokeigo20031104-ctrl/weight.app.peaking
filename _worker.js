const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function isSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

function normalizeRecord(record) {
  const user = String(record.user || "unknown").trim() || "unknown";
  const date = String(record.date || "").trim();
  const weight = Number(record.weight);
  const calories = record.calories == null || record.calories === "" ? null : Number(record.calories);
  const note = String(record.note || "").slice(0, 240);
  const meals = Array.isArray(record.meals)
    ? record.meals.map((meal) => ({
      time: String(meal.time || "").slice(0, 5),
      text: String(meal.text || "").trim().slice(0, 120)
    })).filter((meal) => meal.text).slice(0, 30)
    : [];
  const training = Array.isArray(record.training)
    ? record.training.map((item) => ({
      parts: Array.isArray(item.parts)
        ? [...new Set(item.parts.map(normalizePart).filter(Boolean))].slice(0, 8)
        : [],
      exercise: String(item.exercise || "").trim().slice(0, 80),
      sets: Array.isArray(item.sets)
        ? item.sets.map(normalizeSet).filter(Boolean).slice(0, 20)
        : []
    })).filter((item) => item.parts.length || item.exercise || item.sets.length).slice(0, 30)
    : [];

  const grade = String(record.grade || "").trim().slice(0, 20);
  const category = String(record.category || "").trim().slice(0, 20);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!Number.isFinite(weight) || weight <= 0) return null;
  if (calories != null && (!Number.isFinite(calories) || calories < 0)) return null;

  return {
    user,
    date,
    weight: Math.round(weight * 10) / 10,
    calories: calories == null ? null : Math.round(calories),
    note,
    meals,
    training,
    grade,
    category
  };
}

function normalizeSet(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? { weight: null, reps: Math.round(value), note: "" } : null;
  }
  if (!value || typeof value !== "object") return null;
  const weightRaw = value.weight == null || value.weight === "" ? null : Number(value.weight);
  const repsRaw = value.reps == null || value.reps === "" ? null : Number(value.reps);
  const weight = Number.isFinite(weightRaw) && weightRaw >= 0 ? Math.round(weightRaw * 10) / 10 : null;
  const reps = Number.isFinite(repsRaw) && repsRaw >= 0 ? Math.round(repsRaw) : null;
  const note = String(value.note || "").trim().slice(0, 80);
  if (weight == null && reps == null && !note) return null;
  return { weight, reps, note };
}

function normalizePart(part) {
  const value = String(part || "").trim().slice(0, 30);
  return value === "二頭" || value === "三頭" ? "腕" : value;
}

function recordKey(record) {
  const userKey = encodeURIComponent(record.user).replaceAll("%", "_");
  return `record:${userKey}:${record.date}`;
}

function noticeKey(id) {
  return `notice:${id}`;
}

async function handleNoticeApi(request, env) {
  if (!isSameOrigin(request)) return json({ error: "Forbidden." }, 403);
  if (!env.WEIGHT_LOGS) return json({ error: "WEIGHT_LOGS KV binding is not configured." }, 503);

  const url = new URL(request.url);

  if (request.method === "GET") {
    const items = [];
    let cursor;
    do {
      const list = await env.WEIGHT_LOGS.list({ prefix: "notice:", cursor });
      cursor = list.cursor;
      const values = await Promise.all(list.keys.map((k) => env.WEIGHT_LOGS.get(k.name, "json")));
      values.forEach((v) => { if (v) items.push(v); });
    } while (cursor);
    items.sort((a, b) => b.postedAt.localeCompare(a.postedAt));
    return json({ notices: items });
  }

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
    const title = String(body.title || "").trim().slice(0, 100);
    const content = String(body.content || "").trim().slice(0, 1000);
    const postedBy = String(body.postedBy || "").trim().slice(0, 80);
    if (!content) return json({ error: "content is required." }, 400);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item = { id, title, content, postedBy, postedAt: new Date().toISOString() };
    await env.WEIGHT_LOGS.put(noticeKey(id), JSON.stringify(item));
    return json({ ok: true, notice: item });
  }

  if (request.method === "DELETE") {
    const id = url.searchParams.get("id") || "";
    if (!id) return json({ error: "id param required." }, 400);
    await env.WEIGHT_LOGS.delete(noticeKey(id));
    return json({ ok: true });
  }

  return json({ error: "Method not allowed." }, 405);
}

function chatRoomKey(user, admin) {
  const u = encodeURIComponent(user).replaceAll("%", "_");
  const a = encodeURIComponent(admin).replaceAll("%", "_");
  return `chat:${u}:${a}`;
}

async function handleChatApi(request, env, subpath) {
  if (!isSameOrigin(request)) return json({ error: "Forbidden." }, 403);
  if (!env.WEIGHT_LOGS) return json({ error: "WEIGHT_LOGS KV binding is not configured." }, 503);

  const url = new URL(request.url);

  if (request.method === "GET" && subpath === "/list") {
    const userParam = url.searchParams.get("user");
    const adminParam = url.searchParams.get("admin");
    const rooms = [];
    let cursor;
    do {
      const list = await env.WEIGHT_LOGS.list({ prefix: "chat:", cursor });
      cursor = list.cursor;
      const values = await Promise.all(list.keys.map((k) => env.WEIGHT_LOGS.get(k.name, "json")));
      values.forEach((room) => {
        if (!room) return;
        if (userParam && room.user !== userParam) return;
        if (adminParam && room.admin !== adminParam) return;
        const lastReadByUser = room.lastReadByUser || "";
        const lastReadByAdmin = room.lastReadByAdmin || "";
        const unreadForUser = (room.messages || []).filter((m) => m.senderType === "admin" && m.sentAt > lastReadByUser).length;
        const unreadForAdmin = (room.messages || []).filter((m) => m.senderType === "user" && m.sentAt > lastReadByAdmin).length;
        rooms.push({
          user: room.user,
          admin: room.admin,
          lastMessage: (room.messages || []).at(-1) || null,
          unreadForUser,
          unreadForAdmin
        });
      });
    } while (cursor);
    rooms.sort((a, b) => {
      const at = a.lastMessage?.sentAt || "";
      const bt = b.lastMessage?.sentAt || "";
      return bt.localeCompare(at);
    });
    return json({ rooms });
  }

  if (request.method === "GET") {
    const user = url.searchParams.get("user") || "";
    const admin = url.searchParams.get("admin") || "";
    if (!user || !admin) return json({ error: "user and admin params required." }, 400);
    const room = await env.WEIGHT_LOGS.get(chatRoomKey(user, admin), "json");
    return json({ room: room || { user, admin, messages: [], lastReadByUser: null, lastReadByAdmin: null } });
  }

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
    const user = String(body.user || "").trim().slice(0, 80);
    const admin = String(body.admin || "").trim().slice(0, 80);
    const sender = String(body.sender || "").trim().slice(0, 80);
    const senderType = body.senderType === "admin" ? "admin" : "user";
    const content = String(body.content || "").trim().slice(0, 1000);
    if (!user || !admin || !content) return json({ error: "user, admin, content are required." }, 400);
    const key = chatRoomKey(user, admin);
    const room = (await env.WEIGHT_LOGS.get(key, "json")) || { user, admin, messages: [], lastReadByUser: null, lastReadByAdmin: null };
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sentAt = new Date().toISOString();
    room.messages.push({ id, sender, senderType, content, sentAt });
    if (room.messages.length > 200) room.messages = room.messages.slice(-200);
    await env.WEIGHT_LOGS.put(key, JSON.stringify(room));
    return json({ ok: true, message: { id, sender, senderType, content, sentAt } });
  }

  if (request.method === "PATCH") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
    const user = String(body.user || "").trim();
    const admin = String(body.admin || "").trim();
    const reader = body.reader === "admin" ? "admin" : "user";
    if (!user || !admin) return json({ error: "user and admin are required." }, 400);
    const key = chatRoomKey(user, admin);
    const room = await env.WEIGHT_LOGS.get(key, "json");
    if (room) {
      if (reader === "user") room.lastReadByUser = new Date().toISOString();
      else room.lastReadByAdmin = new Date().toISOString();
      await env.WEIGHT_LOGS.put(key, JSON.stringify(room));
    }
    return json({ ok: true });
  }

  return json({ error: "Method not allowed." }, 405);
}

async function readRecords(env, deleteAfterRead = false) {
  const records = [];
  const keys = [];
  let cursor;
  do {
    const list = await env.WEIGHT_LOGS.list({ prefix: "record:", cursor });
    cursor = list.cursor;
    keys.push(...list.keys.map((item) => item.name));
    const values = await Promise.all(list.keys.map((item) => env.WEIGHT_LOGS.get(item.name, "json")));
    values.forEach((value) => {
      if (value) records.push(value);
    });
  } while (cursor);

  records.sort((a, b) => a.user.localeCompare(b.user, "ja") || a.date.localeCompare(b.date));
  if (deleteAfterRead && keys.length) {
    await Promise.all(keys.map((key) => env.WEIGHT_LOGS.delete(key)));
  }
  return records;
}

async function handleRecordsApi(request, env) {
  if (!isSameOrigin(request)) return json({ error: "Forbidden." }, 403);
  if (!env.WEIGHT_LOGS) {
    return json({ error: "WEIGHT_LOGS KV binding is not configured.", records: [] }, 503);
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const consume = url.searchParams.get("consume") === "1";
    return json({ records: await readRecords(env, consume), consumed: consume });
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON." }, 400);
    }

    const inputRecords = Array.isArray(body.records) ? body.records.slice(0, 400) : [];
    const records = inputRecords.map(normalizeRecord).filter(Boolean);
    if (records.length === 0) return json({ error: "No valid records." }, 400);

    const savedAt = new Date().toISOString();
    await Promise.all(records.map((record) => env.WEIGHT_LOGS.put(
      recordKey(record),
      JSON.stringify({ ...record, savedAt })
    )));

    return json({ ok: true, count: records.length, savedAt });
  }

  return json({ error: "Method not allowed." }, 405);
}

const USER_FB_CATEGORIES = ["バグ報告", "機能要望", "その他"];

function userFeedbackKey(id) {
  return `userfeedback:${id}`;
}

async function handleUserFeedbackApi(request, env) {
  if (!isSameOrigin(request)) return json({ error: "Forbidden." }, 403);
  if (!env.WEIGHT_LOGS) return json({ error: "WEIGHT_LOGS KV binding is not configured." }, 503);

  const url = new URL(request.url);

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
    const senderName = String(body.senderName || "").trim().slice(0, 60);
    const category = USER_FB_CATEGORIES.includes(body.category) ? body.category : "その他";
    const message = String(body.message || "").trim().slice(0, 1000);
    if (!message) return json({ error: "message is required." }, 400);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item = { id, senderName, category, message, sentAt: new Date().toISOString(), read: false };
    await env.WEIGHT_LOGS.put(userFeedbackKey(id), JSON.stringify(item));
    return json({ ok: true, id });
  }

  if (request.method === "GET") {
    const items = [];
    let cursor;
    do {
      const list = await env.WEIGHT_LOGS.list({ prefix: "userfeedback:", cursor });
      cursor = list.cursor;
      const values = await Promise.all(list.keys.map((k) => env.WEIGHT_LOGS.get(k.name, "json")));
      values.forEach((v) => { if (v) items.push(v); });
    } while (cursor);
    items.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    return json({ feedbacks: items });
  }

  if (request.method === "PATCH") {
    const id = url.searchParams.get("id") || "";
    if (!id) return json({ error: "id param required." }, 400);
    const key = userFeedbackKey(id);
    const existing = await env.WEIGHT_LOGS.get(key, "json");
    if (!existing) return json({ error: "Not found." }, 404);
    existing.read = true;
    await env.WEIGHT_LOGS.put(key, JSON.stringify(existing));
    return json({ ok: true });
  }

  if (request.method === "DELETE") {
    const id = url.searchParams.get("id") || "";
    if (!id) return json({ error: "id param required." }, 400);
    await env.WEIGHT_LOGS.delete(userFeedbackKey(id));
    return json({ ok: true });
  }

  return json({ error: "Method not allowed." }, 405);
}

// ── AI フィードバック ──
// 将来 Gemini → OpenAI / Workers AI などに切り替える場合はこの関数だけ変更する
async function generateAiFeedback(payload, env) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("NO_KEY");

  const w  = payload.weight   != null ? `${payload.weight}kg`   : "未入力";
  const kc = payload.calories != null ? `${payload.calories}kcal` : "未入力";
  const meals  = payload.meals.length   ? payload.meals.map(m => `${m.time || ""}${m.content}`).join("、")   : "未入力";
  const trains = payload.trainings.length ? payload.trainings.map(t => [t.part, t.name, t.weight, t.reps].filter(Boolean).join(" ")).join("、") : "未入力";

  const lines = [
    `日付: ${payload.date || "不明"}`,
    `体重: ${w}`,
    `摂取カロリー: ${kc}`,
    `食事: ${meals}`,
    `トレーニング: ${trains}`,
  ];
  if (payload.memo)         lines.push(`メモ: ${payload.memo}`);
  if (payload.targetWeight) lines.push(`目標体重: ${payload.targetWeight}kg`);
  if (payload.targetDate)   lines.push(`目標日: ${payload.targetDate}`);
  if (payload.goalType)     lines.push(`目的: ${payload.goalType}`);
  if (payload.category)     lines.push(`カテゴリ: ${payload.category}`);

  const systemPrompt = "あなたは体重・食事・トレーニング記録アプリのフィードバック担当です。入力者のその日の体重、食事内容、摂取カロリー、トレーニング内容、目標体重、目標期日をもとに、200字以内の日本語で具体的なフィードバックを書いてください。医療診断はしないでください。極端な食事制限や危険な減量はすすめないでください。未入力項目がある場合は、やさしく記録を促してください。体重だけで良し悪しを決めつけず、食事・トレーニング・記録の継続も見てください。前向きで、次にやることが分かる内容にしてください。200字以内で回答してください。余計な前置きや説明は不要です。";

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: lines.join("\n") }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.7 }
      })
    }
  );

  if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Empty Gemini response");
  return text.slice(0, 200);
}

async function handleAiFeedbackApi(request, env) {
  if (!isSameOrigin(request)) return json({ ok: false, message: "Forbidden." }, 403);
  if (request.method !== "POST") return json({ ok: false, message: "Method not allowed." }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, message: "Invalid JSON." }, 400); }

  const safeNum = (v) => { const n = Number(v); return (v == null || v === "" || !Number.isFinite(n)) ? null : n; };
  const safeStr = (v, max = 60) => String(v ?? "").trim().slice(0, max);
  const isDate  = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));

  const weight   = safeNum(body.weight);
  const calories = safeNum(body.calories);
  const meals    = Array.isArray(body.meals)
    ? body.meals.slice(0, 10).map(m => ({ time: safeStr(m?.time, 5), content: safeStr(m?.content, 60) })).filter(m => m.content)
    : [];
  const trainings = Array.isArray(body.trainings)
    ? body.trainings.slice(0, 10).map(t => ({
        part: safeStr(t?.part, 20), name: safeStr(t?.name, 40),
        weight: safeStr(t?.weight, 10), reps: safeStr(t?.reps, 10), sets: safeStr(t?.sets, 10)
      })).filter(t => t.part || t.name)
    : [];
  const memo         = safeStr(body.memo, 240);
  const targetWeight = safeNum(body.targetWeight);
  const targetDate   = isDate(body.targetDate) ? String(body.targetDate) : null;
  const goalType     = safeStr(body.goalType, 20);
  const category     = safeStr(body.category, 20);
  const date         = isDate(body.date) ? String(body.date) : null;

  const isEmpty = (weight == null || weight <= 0)
    && (calories == null || calories <= 0)
    && meals.length === 0
    && trainings.length === 0
    && !memo;

  if (isEmpty) {
    return json({ ok: false, message: "今日の記録がまだ入力されていません。\n体重・食事・トレーニングを入力すると、AIフィードバックを確認できます。" });
  }

  if (!env.GEMINI_API_KEY) {
    return json({ ok: false, message: "AI機能の設定がまだ完了していません。" }, 500);
  }

  try {
    const feedback = await generateAiFeedback(
      { date, weight, calories, meals, trainings, memo, targetWeight, targetDate, goalType, category },
      env
    );
    return json({ ok: true, feedback });
  } catch (err) {
    if (err?.message === "NO_KEY") return json({ ok: false, message: "AI機能の設定がまだ完了していません。" }, 500);
    return json({ ok: false, message: "AIフィードバックを取得できませんでした。時間をおいて再度お試しください。" }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/records") {
      return handleRecordsApi(request, env);
    }
    if (url.pathname === "/api/notice") {
      return handleNoticeApi(request, env);
    }
    if (url.pathname === "/api/chat" || url.pathname === "/api/chat/list") {
      return handleChatApi(request, env, url.pathname.slice("/api/chat".length) || "");
    }
    if (url.pathname === "/api/user-feedback") {
      return handleUserFeedbackApi(request, env);
    }
    if (url.pathname === "/api/ai-feedback") {
      return handleAiFeedbackApi(request, env);
    }
    // ディレクトリURLは末尾スラッシュ付きの正規URLへリダイレクト（/tracker → /tracker/ など）
    if (["/tracker", "/solo", "/admin", "/feedback"].includes(url.pathname)) {
      return Response.redirect(`${url.origin}${url.pathname}/`, 308);
    }
    return env.ASSETS.fetch(request);
  }
};
