// weaponLogic.js
// AIが返す「複雑さ」「意図の明確さ」スコアをもとに、
// 企画書で決めた「基準スコア＋乱数のハイブリッド」でTierを決定し、
// Tier別の確率テーブルに従って能力・ステータスを算出する。
//
// AIには数値(ATK/CD等)を直接決めさせず、スコア判定だけをさせることで、
// ゲームバランスはこちら側のコードで完全にコントロールできるようにしている。

const TIER_ORDER = ["D", "C", "B", "A", "S"];

const ABILITY_NONE_CHANCE = { D: 0.70, C: 0.50, B: 0.25, A: 0.10, S: 0.00 };
const ABILITY_TWO_CHANCE = { D: 0.00, C: 0.05, B: 0.15, A: 0.30, S: 0.60 };

const ABILITIES = ["Slow", "Burn", "SpeedUp"];

const ABILITY_VALUES = {
  Slow: {
    D: { amount: 0.10, duration: 1.0 },
    C: { amount: 0.20, duration: 1.5 },
    B: { amount: 0.30, duration: 2.0 },
    A: { amount: 0.40, duration: 3.0 },
    S: { amount: 0.50, duration: 4.0 },
  },
  Burn: {
    D: { dps: 2, duration: 2.0 },
    C: { dps: 4, duration: 2.5 },
    B: { dps: 6, duration: 3.0 },
    A: { dps: 8, duration: 3.5 },
    S: { dps: 10, duration: 4.0 },
  },
  SpeedUp: {
    D: { amount: 0.05, duration: 1.5 },
    C: { amount: 0.10, duration: 2.0 },
    B: { amount: 0.15, duration: 2.5 },
    A: { amount: 0.20, duration: 3.0 },
    S: { amount: 0.30, duration: 4.0 },
  },
};

const CATEGORY_PROFILES = {
  assault: { atkMin: 8, atkMax: 18, cdMin: 0.15, cdMax: 0.35, range: 300 },
  secondary: { atkMin: 14, atkMax: 26, cdMin: 0.4, cdMax: 0.7, range: 200 },
  melee: { atkMin: 20, atkMax: 40, cdMin: 0.6, cdMax: 1.2, range: 8 },
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// スコア(0-100、複雑さと明確さの平均)から基本Tierを決定
function baseTierFromScore(score) {
  if (score >= 81) return "S";
  if (score >= 61) return "A";
  if (score >= 41) return "B";
  if (score >= 21) return "C";
  return "D";
}

// 基準Tierに乱数の揺らぎを加える(下手な絵が化けることもある、逆もある)
function applyTierJitter(baseTier) {
  const idx = TIER_ORDER.indexOf(baseTier);
  const roll = Math.random();

  let shift = 0;
  if (roll < 0.08) {
    shift = 1; // 8%でワンランクアップ
  } else if (roll < 0.08 + 0.05) {
    shift = -1; // 5%でワンランクダウン
  } else if (roll < 0.08 + 0.05 + 0.02) {
    shift = 2; // 2%でツーランクアップ(大化け)
  }

  const newIdx = Math.min(TIER_ORDER.length - 1, Math.max(0, idx + shift));
  return TIER_ORDER[newIdx];
}

function rollAbilities(tier) {
  const r = Math.random();
  const noneChance = ABILITY_NONE_CHANCE[tier];
  const twoChance = ABILITY_TWO_CHANCE[tier];

  let count;
  if (r < noneChance) count = 0;
  else if (r < noneChance + twoChance) count = 2;
  else count = 1;

  const pool = [...ABILITIES];
  const abilities = [];
  for (let i = 0; i < count; i++) {
    const idx = randInt(0, pool.length - 1);
    const type = pool.splice(idx, 1)[0];
    abilities.push({ type, values: ABILITY_VALUES[type][tier] });
  }
  return abilities;
}

function rollStats(category, tier) {
  const profile = CATEGORY_PROFILES[category];
  const tierFactor = TIER_ORDER.indexOf(tier) / (TIER_ORDER.length - 1); // 0(D) 〜 1(S)

  const atk = Math.max(
    1,
    Math.round(profile.atkMin + (profile.atkMax - profile.atkMin) * tierFactor + randInt(-2, 2))
  );
  let cooldown = profile.cdMax - (profile.cdMax - profile.cdMin) * tierFactor;
  cooldown = Math.max(0.1, Math.round(cooldown * 100) / 100);

  return { atk, cooldown, range: profile.range };
}

/**
 * aiScoreResult: { category, complexity(0-100), clarity(0-100), isInappropriate }
 * 戻り値: 企画書のWeaponData形式
 */
function buildWeaponFromAiScore(aiScoreResult) {
  if (aiScoreResult.isInappropriate) {
    return { isInappropriate: true };
  }

  const score = Math.round((aiScoreResult.complexity + aiScoreResult.clarity) / 2);
  const baseTier = baseTierFromScore(score);
  const tier = applyTierJitter(baseTier);
  const abilities = rollAbilities(tier);
  const stats = rollStats(aiScoreResult.category, tier);

  return {
    category: aiScoreResult.category,
    tier,
    score, // デバッグ・ログ用。ゲーム内表示には使わない
    atk: stats.atk,
    cooldown: stats.cooldown,
    range: stats.range,
    abilities,
    isInappropriate: false,
  };
}

module.exports = { buildWeaponFromAiScore, CATEGORY_PROFILES, TIER_ORDER };
