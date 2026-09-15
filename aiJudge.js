// aiJudge.js
// Google Gemini API(無料枠)に画像を送り、
// 「カテゴリ」「複雑さスコア」「明確さスコア」「不適切判定」だけを返させる。
// Tier・ATK・CD等の具体的な数値はAIには決めさせず、weaponLogic.js側で計算する
// (ゲームバランスをコード側で完全にコントロールするため)。
//
// 無料枠で使えるモデル(2026年時点、無料枠の範囲):gemini-3.5-flash-lite
// 費用がかからない代わりに、1日あたりのリクエスト数に上限がある点に注意。
// 上限に達した場合は数時間待つか、別のAPIキー(別のGoogleアカウント)に切り替える。

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.5-flash-lite";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const SYSTEM_PROMPT = `あなたはRobloxゲーム「SketchBrawl」の武器判定AIです。
プレイヤーが描いた武器の絵(256x256の白背景に黒線で描かれた絵)を見て、以下をJSON形式のみで返してください。
説明文やコードブロックの記法は一切不要で、JSONオブジェクトのみを出力してください。

{
  "category": "assault" | "secondary" | "melee",
  "complexity": 0〜100の整数,
  "clarity": 0〜100の整数,
  "isInappropriate": true | false
}

判定基準:
- category: 絵の形状から武器の種類を推測する。銃っぽい形状(長い筒状+グリップ)は assault か secondary、
  刃物・鈍器・打撃武器っぽい形状は melee に分類する。assaultは長距離向けのライフル的な形状、
  secondaryは拳銃のような小型の形状を想定する。
- complexity: 線の数、パーツの多さ、装飾の書き込み量などから絵の複雑さを評価する(単純な棒線1本なら低スコア、
  細部まで描き込まれていれば高スコア)。
- clarity: 「これは何の武器か」が一目で伝わるかどうかを評価する(意図が明確に伝わるほど高スコア)。
- isInappropriate: 暴力的すぎる描写、性的表現、差別的シンボル、実在の攻撃的記号など、
  不適切と判断される内容が含まれる場合のみ true にする。単なる下手な絵や抽象的な絵はfalseとする。`;

async function judgeImage(imageBase64PNG) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY が .env に設定されていません");
  }

  const response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: SYSTEM_PROMPT + "\n\nこの絵を判定してJSONのみを返してください。" },
            {
              inline_data: {
                mime_type: "image/png",
                data: imageBase64PNG,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 300,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini APIエラー(${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Geminiレスポンスにテキストが含まれていません: " + JSON.stringify(data));
  }

  // 念のためコードブロック記法(```json ... ```)が付いていても剥がす
  const cleaned = text.replace(/```json|```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error("AIレスポンスのJSONパースに失敗しました: " + cleaned);
  }

  // 最低限のバリデーション(壊れた値でゲーム側に渡さないようにする)
  const category = ["assault", "secondary", "melee"].includes(parsed.category)
    ? parsed.category
    : "melee";
  const complexity = clampInt(parsed.complexity, 0, 100, 30);
  const clarity = clampInt(parsed.clarity, 0, 100, 30);
  const isInappropriate = parsed.isInappropriate === true;

  return { category, complexity, clarity, isInappropriate };
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

module.exports = { judgeImage };

