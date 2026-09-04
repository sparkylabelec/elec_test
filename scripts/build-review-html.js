/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "src", "data", "review-2023-2024-circuit.json");
const OUT_PATH = path.join(__dirname, "..", "public", "review-2023-2024-circuit-sorted.html");

const choicePattern = /([①②③④])\s*([^①②③④]+)/g;
const answerSymbols = {
  "1": "①",
  "2": "②",
  "3": "③",
  "4": "④",
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatText(value) {
  return escapeHtml(value)
    .replace(/\n/g, "<br>");
}

function parseQuestion(question) {
  const normalized = question.replace(/\r/g, "").trim();
  const firstChoice = normalized.search(/[①②③④]/);
  if (firstChoice < 0) {
    return { prompt: normalized, choices: [] };
  }

  const prompt = normalized.slice(0, firstChoice).trim();
  const choicesText = normalized.slice(firstChoice);
  const choices = Array.from(choicesText.matchAll(choicePattern)).map((match) => ({
    symbol: match[1],
    text: match[2].trim(),
  }));
  return { prompt, choices };
}

function renderCard(card) {
  const parsed = parseQuestion(card.question);
  const correctSymbol = answerSymbols[card.answer] ?? card.answer;
  const imageHtml = card.images
    .map((src, index) => (
      `<figure class="qimg"><img src="${escapeHtml(src)}" alt="${card.number}번 그림 ${index + 1}"></figure>`
    ))
    .join("");
  const choicesHtml = parsed.choices
    .map((choice) => {
      const correctClass = choice.symbol === correctSymbol ? " correct" : "";
      return `<div class="opt${correctClass}"><span class="ocirc">${choice.symbol}</span><span>${formatText(choice.text)}</span></div>`;
    })
    .join("");

  return `<article class="qa-card" id="${escapeHtml(card.id)}">
    <div class="q">
      <div class="meta">
        <span>${card.year}년 ${card.round}회</span>
        <span>원문 ${card.originalQuestionNumber ?? card.number}번</span>
      </div>
      <div class="qtext">${formatText(parsed.prompt)}</div>
      ${imageHtml}
      <div class="opts">${choicesHtml}</div>
    </div>
    <div class="answer-explanation">
      <div class="answer-title">정답 ${escapeHtml(correctSymbol)}</div>
      <div class="explain-body">${formatText(card.explanation)}</div>
    </div>
  </article>`;
}

const cards = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>전기기능사 2023-2024 전기회로 정렬 문제세트</title>
<script>
window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
    displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
    processEscapes: true
  },
  svg: { fontCache: 'global' }
};
</script>
<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
<style>
  :root {
    --line: #d8e0ea;
    --ink: #17202a;
    --muted: #64748b;
    --accent: #245c7a;
    --soft: #eff6ff;
    --ok: #27633f;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: var(--ink);
    background: #f6f7f9;
    font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    line-height: 1.58;
  }
  .wrap {
    max-width: 1100px;
    margin: 0 auto;
    padding: 26px 18px 56px;
    background: #fff;
  }
  header {
    border-bottom: 3px solid #0f172a;
    padding-bottom: 14px;
    margin-bottom: 18px;
  }
  h1 {
    margin: 0 0 6px;
    font-size: 1.45rem;
    letter-spacing: 0;
  }
  .sub {
    color: var(--muted);
    font-size: .9rem;
  }
  .topic {
    margin: 0 0 18px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fbfcfd;
    color: #334155;
    font-size: .92rem;
  }
  .qa-list {
    column-count: 2;
    column-gap: 22px;
    column-fill: balance;
  }
  .qa-card {
    display: inline-block;
    width: 100%;
    margin: 0 0 16px;
    break-inside: avoid;
    page-break-inside: avoid;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    overflow: hidden;
  }
  .q {
    padding: 14px;
    border-bottom: 1px solid var(--line);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 9px;
    color: var(--muted);
    font-size: .75rem;
  }
  .qtext {
    font-weight: 700;
    font-size: 1rem;
  }
  .qimg {
    margin: 12px 0 6px;
  }
  .qimg img {
    max-width: 100%;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: #fff;
  }
  .opts {
    margin-top: 10px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 16px;
  }
  .opt {
    display: flex;
    gap: 6px;
    align-items: baseline;
    min-width: 0;
  }
  .opt.correct {
    color: var(--ok);
    font-weight: 800;
  }
  .ocirc {
    flex: 0 0 auto;
    color: var(--muted);
  }
  .answer-explanation {
    padding: 12px 14px 13px;
    background: var(--soft);
  }
  .answer-title {
    color: #dc2626;
    font-weight: 800;
    margin-bottom: 5px;
    font-size: .95rem;
  }
  .explain-body {
    color: #243044;
    font-size: .93rem;
  }
  @media (max-width: 820px) {
    .qa-list { column-count: 1; }
    .wrap { padding: 22px 14px 44px; }
  }
  @media (max-width: 560px) {
    .opts { grid-template-columns: 1fr; }
  }
  @media print {
    body { background: #fff; }
    .wrap { max-width: none; padding: 0; }
    .qa-list { column-count: 2; column-gap: 18px; }
    .qa-card { margin-bottom: 10px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>전기기능사 2023-2024 전기회로 정렬 문제세트</h1>
    <div class="sub">총 ${cards.length}문항 · 유사 주제 연속 학습용 · 수식 MathJax 렌더링 · 이미지 포함</div>
  </header>
  <div class="topic">정렬 순서: 자기회로 → 인덕턴스 → 정전용량 → RLC → 3상 → 전력 → 교류기초 → 직류회로 → 저항 → 전자력 → 측정</div>
  <main class="qa-list">
    ${cards.map(renderCard).join("\n")}
  </main>
</div>
</body>
</html>
`;

fs.writeFileSync(OUT_PATH, html, "utf8");
console.log(`Saved ${cards.length} cards to ${OUT_PATH}`);
