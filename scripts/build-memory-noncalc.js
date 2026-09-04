/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");

const SOURCE_HTML = "C:\\temp\\codex\\기능사복습문제\\전기기능사_2023-2024_전기회로_계산제외_정리.html";
const REVIEW_JSON = path.join(__dirname, "..", "src", "data", "review-2023-2024-circuit.json");
const OUT_JSON = path.join(__dirname, "..", "src", "data", "review-2023-2024-circuit-noncalc.json");

function toQuestionId(htmlId) {
  const match = htmlId.match(/전기기능사_(\d{4})_(\d+)회_q(\d+)/);
  if (!match) return null;
  return `review-electrician_${match[1]}_${match[2]}round_q${match[3]}`;
}

const html = fs.readFileSync(SOURCE_HTML, "utf8");
const keepIds = new Set(
  Array.from(html.matchAll(/<div class="q" id="([^"]+)"/g))
    .map((match) => toQuestionId(match[1]))
    .filter(Boolean),
);

const reviewQuestions = JSON.parse(fs.readFileSync(REVIEW_JSON, "utf8"));
const nonCalcQuestions = reviewQuestions.filter((question) => keepIds.has(question.id));
const missingIds = Array.from(keepIds).filter(
  (id) => !reviewQuestions.some((question) => question.id === id),
);

fs.writeFileSync(OUT_JSON, `${JSON.stringify(nonCalcQuestions, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  sourceIds: keepIds.size,
  imported: nonCalcQuestions.length,
  missing: missingIds,
  set1: nonCalcQuestions.slice(0, Math.ceil(nonCalcQuestions.length / 2)).length,
  set2: nonCalcQuestions.slice(Math.ceil(nonCalcQuestions.length / 2)).length,
}, null, 2));
