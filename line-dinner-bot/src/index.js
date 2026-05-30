/**
 * 夕食メニュー提案 LINE bot (Cloudflare Workers)
 *
 * 「献立」と送ると、候補プールから3日分のメニューをランダムに返します。
 * メニュープールはトーク上のコマンドで編集できます（KV に永続化）。
 *
 * コマンド:
 *   献立 / こんだて        … 3日分の夕食を提案
 *   一覧 / リスト          … 登録メニューを表示
 *   追加 <名前>            … メニューを1つ追加
 *   削除 <名前>            … メニューを1つ削除
 *   一括登録 A,B,C / 改行   … 複数まとめて登録（ノートの内容の貼り付け用・上書き）
 *   ヘルプ                 … 使い方
 *
 * 必要なシークレット (wrangler secret put):
 *   LINE_CHANNEL_SECRET        … 署名検証用
 *   LINE_CHANNEL_ACCESS_TOKEN  … 返信用（長期チャネルアクセストークン）
 * 必要な KV バインディング:
 *   MENUS  … メニュープールの保存
 */

const KV_KEY = "menus";
const DAYS = 3;

// プールが空のとき最初に投入される初期メニュー
const DEFAULT_MENUS = [
  "カレー",
  "ハンバーグ",
  "肉じゃが",
  "から揚げ",
  "生姜焼き",
  "麻婆豆腐",
  "鮭の塩焼き",
  "オムライス",
  "パスタ",
  "鍋",
  "餃子",
  "親子丼",
];

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("ok", { status: 200 });
    }

    const signature = request.headers.get("x-line-signature") || "";
    const rawBody = await request.text();

    // 署名検証（なりすまし防止）
    const valid = await verifySignature(env.LINE_CHANNEL_SECRET, rawBody, signature);
    if (!valid) {
      return new Response("invalid signature", { status: 401 });
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response("bad request", { status: 400 });
    }

    const events = body.events || [];
    await Promise.all(events.map((event) => handleEvent(event, env)));

    return new Response("ok", { status: 200 });
  },
};

async function handleEvent(event, env) {
  if (event.type !== "message" || event.message.type !== "text") {
    return;
  }

  const text = event.message.text.trim();
  const reply = await buildReply(text, env);
  if (reply) {
    await replyMessage(env.LINE_CHANNEL_ACCESS_TOKEN, event.replyToken, reply);
  }
}

async function buildReply(text, env) {
  // 「一括登録 …」改行 or カンマ区切りでまとめて上書き登録（ノートの貼り付け用）
  if (text.startsWith("一括登録")) {
    const rest = text.slice("一括登録".length).trim();
    const unique = parseBulk(rest);
    if (unique.length === 0) {
      return "登録するメニューを改行かカンマ区切りで入れてね\n例:\n一括登録 カレー, ハンバーグ, 鍋";
    }
    await saveMenus(env, unique);
    return `📋 メニューを ${unique.length} 件で登録し直したよ！\n「一覧」で確認できるよ`;
  }

  // 「追加 ◯◯」
  if (text.startsWith("追加")) {
    const name = text.slice("追加".length).trim();
    if (!name) return "追加するメニュー名を入れてね（例:「追加 オムライス」）";
    const menus = await getMenus(env);
    if (menus.includes(name)) return `「${name}」はもう入ってるよ`;
    menus.push(name);
    await saveMenus(env, menus);
    return `「${name}」を追加したよ！（現在 ${menus.length} 件）`;
  }

  // 「削除 ◯◯」
  if (text.startsWith("削除")) {
    const name = text.slice("削除".length).trim();
    if (!name) return "削除するメニュー名を入れてね（例:「削除 カレー」）";
    const menus = await getMenus(env);
    if (!menus.includes(name)) return `「${name}」は見つからなかったよ`;
    const next = menus.filter((m) => m !== name);
    await saveMenus(env, next);
    return `「${name}」を削除したよ！（現在 ${next.length} 件）`;
  }

  // 「一覧」
  if (text === "一覧" || text === "リスト") {
    const menus = await getMenus(env);
    if (menus.length === 0) return "まだメニューが登録されてないよ";
    return `🍳 候補メニュー（${menus.length}件）\n` + menus.map((m) => `・${m}`).join("\n");
  }

  // 「ヘルプ」
  if (text === "ヘルプ" || text.toLowerCase() === "help") {
    return helpText();
  }

  // 「献立」など → 3日分を提案
  if (text.includes("献立") || text.includes("こんだて") || text === "夕食" || text === "ごはん") {
    const menus = await getMenus(env);
    if (menus.length === 0) return "メニューが空っぽだよ。「追加 カレー」みたいに登録してね";
    const picks = sample(menus, DAYS);
    const lines = picks.map((m, i) => `${i + 1}日目: ${m}`);
    return `🍽️ ${DAYS}日分の夕食候補だよ！\n` + lines.join("\n");
  }

  // それ以外は反応しない（普段の会話を邪魔しないため）
  return null;
}

function helpText() {
  return [
    "🤖 夕食メニューbotの使い方",
    "・「献立」… 3日分の夕食を提案",
    "・「一覧」… 登録メニューを表示",
    "・「追加 ◯◯」… メニューを追加",
    "・「削除 ◯◯」… メニューを削除",
    "・「一括登録 A, B, C」… まとめて登録し直し",
  ].join("\n");
}

/** 「一括登録」テキストを、改行/カンマ/読点で分割し重複を除いた配列にする */
export function parseBulk(rest) {
  const names = rest
    .split(/[\n,、，]/)
    .map((s) => s.replace(/^[・\-*\s]+/, "").trim())
    .filter(Boolean);
  return [...new Set(names)];
}

/** 配列から重複なしで n 件ランダム抽出（n が件数を超える場合は全件をシャッフル） */
export function sample(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

async function getMenus(env) {
  const stored = await env.MENUS.get(KV_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fallthrough to defaults */
    }
  }
  // 初回はデフォルトを保存して返す
  await saveMenus(env, DEFAULT_MENUS);
  return [...DEFAULT_MENUS];
}

async function saveMenus(env, menus) {
  await env.MENUS.put(KV_KEY, JSON.stringify(menus));
}

async function replyMessage(token, replyToken, text) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });
}

/** LINE の x-line-signature を HMAC-SHA256 で検証 */
async function verifySignature(secret, body, signature) {
  if (!secret || !signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
