/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataPath = path.join(root, "src", "data", "summary-blanks.json");
const outputPath = path.join(root, "public", "formula-review.html");

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const stripBlankLine = (question) => question.replace(/\n\n정답: _+$/, "");

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const formulas = data.filter((item) => String(item.id).startsWith("summary-theory-"));

const categoryCounts = formulas.reduce((acc, item) => {
  acc[item.category] = (acc[item.category] ?? 0) + 1;
  return acc;
}, {});

const cardsHtml = formulas
  .map((item, index) => {
    const question = stripBlankLine(item.question);
    return `
      <article class="formula-card" data-id="${escapeHtml(item.id)}" data-category="${escapeHtml(item.category)}">
        <div class="card-top">
          <label class="check-row">
            <input type="checkbox" class="include-check" checked />
            <span>암기모드에 추가</span>
          </label>
          <span class="meta">${index + 1}. ${escapeHtml(item.category)} · ${escapeHtml(item.explanation.split(" 공식: ")[0])}</span>
        </div>
        <div class="field">
          <span class="label">문제</span>
          <div class="content">${escapeHtml(question)}</div>
        </div>
        <div class="field">
          <span class="label">정답 공식</span>
          <div class="content formula">${escapeHtml(item.answer)}</div>
        </div>
        <div class="field">
          <span class="label">해설</span>
          <div class="content">${escapeHtml(item.explanation)}</div>
        </div>
        <label class="memo">
          <span>잘못된 공식 / 수정 지시</span>
          <textarea placeholder="예: 이 공식은 전압 기준을 V_L로 바꿔 주세요. 또는 공식 삭제"></textarea>
        </label>
      </article>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>기능사요점정리 공식 검토</title>
  <script>
    window.MathJax = {
      tex: { inlineMath: [["\\\\(", "\\\\)"], ["$", "$"]], displayMath: [["\\\\[", "\\\\]"]] },
      options: { skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"] }
    };
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
  <style>
    :root {
      color-scheme: light;
      --ink: #0f172a;
      --muted: #64748b;
      --line: #d8e1ec;
      --soft: #f6f8fb;
      --accent: #286984;
      --accent-weak: #e9f3f7;
      --danger: #9f2e2e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, "Malgun Gothic", sans-serif;
      color: var(--ink);
      background: #f8fafc;
      line-height: 1.55;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 10;
      border-bottom: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(8px);
    }
    .header-inner {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 18px 0 14px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 28px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    .summary {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }
    button, select {
      height: 38px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: white;
      color: var(--ink);
      padding: 0 12px;
      font-size: 14px;
    }
    button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: white;
    }
    button.warn {
      border-color: #f2c0c0;
      color: var(--danger);
    }
    main {
      width: min(1120px, calc(100% - 32px));
      margin: 18px auto 40px;
    }
    .formula-card {
      margin-bottom: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: white;
      padding: 16px;
    }
    .formula-card.has-note {
      border-color: #f0b8b8;
      background: #fffafa;
    }
    .formula-card.excluded {
      opacity: 0.62;
    }
    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }
    .check-row {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      white-space: nowrap;
    }
    .check-row input {
      width: 18px;
      height: 18px;
      accent-color: var(--accent);
    }
    .meta {
      color: var(--muted);
      font-size: 13px;
      text-align: right;
    }
    .field {
      display: grid;
      grid-template-columns: 88px minmax(0, 1fr);
      gap: 12px;
      padding: 10px 0;
      border-top: 1px solid #eef2f7;
    }
    .label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }
    .content {
      min-width: 0;
      white-space: pre-wrap;
      word-break: keep-all;
      overflow-wrap: anywhere;
    }
    .formula {
      font-size: 18px;
    }
    .memo {
      display: block;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #eef2f7;
    }
    .memo span {
      display: block;
      margin-bottom: 6px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }
    textarea {
      width: 100%;
      min-height: 78px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      font: inherit;
      background: var(--soft);
    }
    textarea:focus {
      outline: 2px solid var(--accent-weak);
      border-color: var(--accent);
      background: white;
    }
    .hidden { display: none; }
    @media (max-width: 720px) {
      .card-top, .field {
        display: block;
      }
      .meta {
        display: block;
        margin-top: 8px;
        text-align: left;
      }
      .label {
        display: block;
        margin-bottom: 4px;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="header-inner">
      <h1>기능사요점정리 공식 검토</h1>
      <p class="summary">
        총 ${formulas.length}개 · 전기회로 ${categoryCounts["전기회로"] ?? 0}개 · 전기기기 ${categoryCounts["전기기기"] ?? 0}개 · 전기설비 ${categoryCounts["전기설비"] ?? 0}개 ·
        선택 <strong id="selectedCount">${formulas.length}</strong>개 · 수정 지시 <strong id="noteCount">0</strong>개
      </p>
      <div class="toolbar">
        <select id="categoryFilter" aria-label="분야 필터">
          <option value="all">전체 분야</option>
          <option value="전기회로">전기회로</option>
          <option value="전기기기">전기기기</option>
          <option value="전기설비">전기설비</option>
        </select>
        <button type="button" id="selectAll">전체 선택</button>
        <button type="button" id="clearAll">전체 해제</button>
        <button type="button" id="showNotes">수정 지시만 보기</button>
        <button type="button" id="showAll">전체 보기</button>
        <button type="button" class="primary" id="downloadReview">검토 결과 JSON 저장</button>
      </div>
    </div>
  </header>
  <main id="cards">
    ${cardsHtml}
  </main>
  <script>
    const cards = [...document.querySelectorAll(".formula-card")];
    const selectedCount = document.getElementById("selectedCount");
    const noteCount = document.getElementById("noteCount");
    const storageKey = "formula-review-v1";

    function readState() {
      try {
        return JSON.parse(localStorage.getItem(storageKey) || "{}");
      } catch {
        return {};
      }
    }

    function writeState() {
      const state = {};
      cards.forEach((card) => {
        state[card.dataset.id] = {
          include: card.querySelector(".include-check").checked,
          note: card.querySelector("textarea").value
        };
      });
      localStorage.setItem(storageKey, JSON.stringify(state));
    }

    function applySavedState() {
      const state = readState();
      cards.forEach((card) => {
        const saved = state[card.dataset.id];
        if (!saved) return;
        card.querySelector(".include-check").checked = saved.include !== false;
        card.querySelector("textarea").value = saved.note || "";
      });
    }

    function refresh() {
      let selected = 0;
      let notes = 0;
      cards.forEach((card) => {
        const checked = card.querySelector(".include-check").checked;
        const note = card.querySelector("textarea").value.trim();
        card.classList.toggle("excluded", !checked);
        card.classList.toggle("has-note", Boolean(note));
        if (checked) selected += 1;
        if (note) notes += 1;
      });
      selectedCount.textContent = selected;
      noteCount.textContent = notes;
      writeState();
      if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise();
    }

    function applyFilter() {
      const category = document.getElementById("categoryFilter").value;
      cards.forEach((card) => {
        card.classList.toggle("hidden", category !== "all" && card.dataset.category !== category);
      });
    }

    function showNotesOnly() {
      cards.forEach((card) => {
        const note = card.querySelector("textarea").value.trim();
        card.classList.toggle("hidden", !note);
      });
    }

    function downloadReview() {
      const review = cards.map((card) => ({
        id: card.dataset.id,
        category: card.dataset.category,
        include: card.querySelector(".include-check").checked,
        correction: card.querySelector("textarea").value.trim()
      }));
      const blob = new Blob([JSON.stringify(review, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "formula-review-result.json";
      a.click();
      URL.revokeObjectURL(url);
    }

    applySavedState();
    refresh();
    cards.forEach((card) => {
      card.querySelector(".include-check").addEventListener("change", refresh);
      card.querySelector("textarea").addEventListener("input", refresh);
    });
    document.getElementById("categoryFilter").addEventListener("change", applyFilter);
    document.getElementById("selectAll").addEventListener("click", () => {
      cards.forEach((card) => card.querySelector(".include-check").checked = true);
      refresh();
    });
    document.getElementById("clearAll").addEventListener("click", () => {
      cards.forEach((card) => card.querySelector(".include-check").checked = false);
      refresh();
    });
    document.getElementById("showNotes").addEventListener("click", showNotesOnly);
    document.getElementById("showAll").addEventListener("click", () => {
      document.getElementById("categoryFilter").value = "all";
      cards.forEach((card) => card.classList.remove("hidden"));
    });
    document.getElementById("downloadReview").addEventListener("click", downloadReview);
  </script>
</body>
</html>
`;

fs.writeFileSync(outputPath, html, "utf8");
console.log(`wrote ${outputPath}`);
console.log(`formula cards: ${formulas.length}`);
