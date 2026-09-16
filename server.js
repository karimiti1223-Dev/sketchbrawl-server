// server.js
// Robloxの HttpService からこのサーバーの /judge にPOSTすると、
// ストロークデータ → 画像化 → Claude Haikuで判定 → Tier/ステータス計算、まで行って結果を返す。

require("dotenv").config();
const express = require("express");
const { renderStrokesToPngBase64 } = require("./renderStrokes");
const { judgeImage } = require("./aiJudge");
const { buildWeaponFromAiScore } = require("./weaponLogic");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;
const SHARED_SECRET = process.env.ROBLOX_SHARED_SECRET; // Roblox側と一致させる簡易認証キー

// 簡易レート制限(1IPあたり1分間に10リクエストまで。必要に応じて調整)
const rateLimitMap = new Map();
function isRateLimited(key) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 10;

  const entry = rateLimitMap.get(key) || { count: 0, windowStart: now };
  if (now - entry.windowStart > windowMs) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  rateLimitMap.set(key, entry);
  return entry.count > maxRequests;
}

app.post("/judge", async (req, res) => {
  try {
    // Roblox側と共有しているシークレットで簡易認証(なりすましリクエスト対策)
    const authHeader = req.headers["x-sketchbrawl-secret"];
    if (!SHARED_SECRET || authHeader !== SHARED_SECRET) {
      console.log("[/judge] rejected: unauthorized (secret mismatch)");
      return res.status(401).json({ error: "unauthorized" });
    }

    const clientKey = req.ip;
    if (isRateLimited(clientKey)) {
      console.log(`[/judge] rejected: rate_limited (ip=${clientKey})`);
      return res.status(429).json({ error: "rate_limited" });
    }

    const { strokes } = req.body;
    if (!Array.isArray(strokes) || strokes.length === 0) {
      return res.status(400).json({ error: "strokes is required" });
    }
    if (strokes.length > 150) {
      return res.status(400).json({ error: "too many strokes" });
    }

    // 1. ストロークデータをPNG画像化
    const imageBase64 = renderStrokesToPngBase64(strokes);

    // 2. Claude Haikuでカテゴリ・複雑さ・明確さ・不適切判定を取得
    const aiResult = await judgeImage(imageBase64);

    // 3. スコア+乱数からTier・ステータス・能力を計算(ゲームバランスはこちら側で制御)
    const weaponData = buildWeaponFromAiScore(aiResult);

    // デバッグ用ログ(判定のたびに結果を記録。問題の切り分けに使う)
    console.log(
      `[/judge] result: isInappropriate=${aiResult.isInappropriate} category=${aiResult.category} complexity=${aiResult.complexity} clarity=${aiResult.clarity} tier=${weaponData.tier || "-"}`
    );

    return res.json(weaponData);
  } catch (err) {
    console.error("[/judge] error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`SketchBrawl judge server listening on port ${PORT}`);
});
