// renderStrokes.js
// Robloxから送られてくるストロークデータ(座標配列)を、
// 判定AIに渡すための256x256 PNG画像にラスター化する。

const { createCanvas } = require("canvas");

const CANVAS_SIZE = 256;

/**
 * strokes: [
 *   { points: [ [x, y], [x, y], ... ] },
 *   ...
 * ]
 * Roblox側のCanvas Frame(256x256)の座標系をそのまま使う想定。
 */
function renderStrokesToPngBase64(strokes) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext("2d");

  // 背景は白で塗る(Robloxのキャンバス背景と合わせる)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const stroke of strokes) {
    const points = stroke.points;
    if (!points || points.length < 2) continue;

    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.stroke();
  }

  const buffer = canvas.toBuffer("image/png");
  return buffer.toString("base64");
}

module.exports = { renderStrokesToPngBase64, CANVAS_SIZE };
