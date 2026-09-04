/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");

const SOURCE_HTML = "C:\\temp\\codex\\기능사복습문제\\전기기능사_2023-2024_전기회로_정리.html";
const OUT_JSON = path.join(__dirname, "..", "src", "data", "review-2023-2024-circuit.json");
const ASSET_DIR = path.join(__dirname, "..", "public", "review-assets", "2023-2024-circuit");

const answerMap = new Map([
  ["①", "1"],
  ["②", "2"],
  ["③", "3"],
  ["④", "4"],
]);

const topicRules = [
  ["자기회로", /자기|자속|기자력|자기\s*저항|투자율|릴럭턴스|히스테리시스/i],
  ["인덕턴스", /인덕턴스|코일|상호\s*인덕턴스|자체\s*인덕턴스|유도|렌츠|패러데이/i],
  ["정전용량", /콘덴서|커패시터|정전용량|전하|유전체|정전|전계|전속|방전/i],
  ["RLC", /임피던스|리액턴스|어드미턴스|공진|RLC|RL|RC|LC|품질계수|Q값/i],
  ["3상", /3상|삼상|Y결선|Δ결선|델타|와이|선간|상전압|상전류|평형/i],
  ["전력", /전력|전력량|역률|유효|무효|피상|와트|줄|열량|효율|발열/i],
  ["교류기초", /교류|주파수|주기|각속도|위상|실효값|평균값|최대값|파형/i],
  ["직류회로", /키르히호프|직류|회로망|전류계|전압계|배율기|분류기|전지/i],
  ["저항", /합성\s*저항|저항|컨덕턴스|옴의\s*법칙|전압강하|분압|분류|브리지|전구|전선/i],
  ["전자력", /플레밍|전자력|힘|토크|로렌츠|전동기|발전기|평행한\s*도체/i],
  ["측정", /계기|측정|오차|브리지|검류계|전위차계/i],
];

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function extractFirst(pattern, value, fallback = "") {
  const match = value.match(pattern);
  return match ? match[1].trim() : fallback;
}

function parseId(rawId) {
  const match = rawId.match(/전기기능사_(\d{4})_(\d+)회_q(\d+)/);
  if (!match) return { year: 0, round: 0, originalQuestionNumber: 0 };
  return {
    year: Number(match[1]),
    round: Number(match[2]),
    originalQuestionNumber: Number(match[3]),
  };
}

function imageExt(mime) {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

function writeImages(articleHtml, cardId) {
  const images = [];
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  const imagePattern = /<img[^>]+src="data:(image\/[^;]+);base64,([^"]+)"/gi;
  let imageMatch;
  let imageIndex = 1;
  while ((imageMatch = imagePattern.exec(articleHtml)) && imageIndex <= 3) {
    const ext = imageExt(imageMatch[1]);
    const fileName = `${cardId}_img${imageIndex}.${ext}`;
    const outPath = path.join(ASSET_DIR, fileName);
    fs.writeFileSync(outPath, Buffer.from(imageMatch[2], "base64"));
    images.push(`/review-assets/2023-2024-circuit/${fileName}`);
    imageIndex += 1;
  }
  return images;
}

function topicIndex(card) {
  const text = `${card.question}\n${card.explanation}`;
  const index = topicRules.findIndex(([, pattern]) => pattern.test(text));
  return index === -1 ? topicRules.length : index;
}

function parseCards(html) {
  const articles = html.match(/<article class="qa-card">[\s\S]*?<\/article>/g) ?? [];
  return articles.map((article, index) => {
    const rawId = extractFirst(/<div class="q" id="([^"]+)"/, article);
    const { year, round, originalQuestionNumber } = parseId(rawId);
    const qtext = stripTags(extractFirst(/<span class="qtext">([\s\S]*?)<\/span>/, article));
    const optsHtml = extractFirst(/<div class="opts">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="answer-explanation">/, article);
    const options = [];
    const optPattern = /<div class="opt">[\s\S]*?<span class="ocirc">([①②③④])<\/span>\s*<span>([\s\S]*?)<\/span><\/div>/g;
    let optMatch;
    while ((optMatch = optPattern.exec(optsHtml))) {
      options.push(`${optMatch[1]} ${stripTags(optMatch[2])}`);
    }

    const answerSymbol = extractFirst(/<div class="answer-title">정답\s*([①②③④])/i, article);
    const explanation = stripTags(extractFirst(/<div class="explain-body">([\s\S]*?)<\/div>/, article));
    const cardId = `review-electrician_${year}_${round}round_q${originalQuestionNumber}`;

    return {
      id: cardId,
      year,
      round,
      date: `${year}년 ${round}회`,
      number: index + 1,
      originalQuestionNumber,
      category: "전기회로",
      question: [qtext, ...options].join("\n"),
      answer: answerMap.get(answerSymbol) ?? "",
      explanation,
      images: writeImages(article, cardId),
      variant: false,
      sourceHtml: "전기기능사_2023-2024_전기회로_정리.html",
      solutionHtml: "",
    };
  });
}

const html = fs.readFileSync(SOURCE_HTML, "utf8");
const cards = parseCards(html)
  .sort((left, right) => (
    topicIndex(left) - topicIndex(right) ||
    left.year - right.year ||
    left.round - right.round ||
    left.originalQuestionNumber - right.originalQuestionNumber
  ))
  .map((card, index) => {
    const number = index + 1;
    return {
      ...card,
      number,
      question: `${number}. ${card.question}`,
    };
  });

fs.writeFileSync(OUT_JSON, `${JSON.stringify(cards, null, 2)}\n`, "utf8");
console.log(`Imported ${cards.length} review cards.`);
console.log(`Topic order: ${topicRules.map(([name]) => name).join(" -> ")}`);
