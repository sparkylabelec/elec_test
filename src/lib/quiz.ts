import { shuffle } from "@/lib/questions";
import type { CardProgress, ParsedCard, QuizQuestion } from "@/lib/types";

const choicePattern = /([①②③④])\s*([^①②③④]+)/g;
const labelOrder = ["①", "②", "③", "④"];
const answerToLabel: Record<string, string> = {
  "1": "①",
  "2": "②",
  "3": "③",
  "4": "④",
  "①": "①",
  "②": "②",
  "③": "③",
  "④": "④",
};

export type BlankCard = {
  prompt: string;
  answer: string;
  source: "definition" | "explanation" | "question";
};

export function cleanMathText(value: string) {
  return value
    .replace(/\\\\/g, "\\")
    .replace(/\\\(/g, "")
    .replace(/\\\)/g, "")
    .replace(/\\\[/g, "")
    .replace(/\\\]/g, "")
    .replace(/\\Omega\b/g, "Ω")
    .replace(/\\omega\b/g, "ω")
    .replace(/\\Delta\b/g, "△")
    .replace(/\\theta\b/g, "θ")
    .replace(/\\pi\b/g, "π")
    .replace(/\\mu\b/g, "μ")
    .replace(/\\times\b/g, "×")
    .replace(/\\div\b/g, "÷")
    .replace(/\\sqrt\s*\{([^}]*)\}/g, "√$1")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/\\(?=[^\w가-힣])/g, "")
    .replace(/\\/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseCard(question: QuizQuestion): ParsedCard {
  const normalized = cleanMathText(
    question.question.replace(/[❶➊]/g, "①").replace(/[❷➋]/g, "②").replace(/[❸➌]/g, "③").replace(/[❹➍]/g, "④"),
  );
  const matches = Array.from(normalized.matchAll(choicePattern));
  const answerLabel = answerToLabel[question.answer] ?? question.answer;

  if (matches.length < 2) {
    return {
      prompt: normalized,
      choices: [],
      correctText: question.answer,
    };
  }

  const firstChoiceIndex = normalized.search(choicePattern);
  const prompt = normalized.slice(0, firstChoiceIndex).trim();
  const choices = matches.map((match) => ({
    label: match[1],
    originalLabel: match[1],
    text: cleanMathText(match[2].trim()),
    isCorrect: match[1] === answerLabel,
  }));
  const shuffled = shuffle(choices).map((choice, index) => ({
    ...choice,
    label: labelOrder[index] ?? `${index + 1}.`,
  }));

  return {
    prompt,
    choices: shuffled,
    correctText: choices.find((choice) => choice.isCorrect)?.text ?? "",
  };
}

function firstUsefulSentence(text: string) {
  return cleanMathText(text)
    .split(/\n|(?<=[.。!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 14 && !line.includes("해설작성자"))[0];
}

function definitionFromExplanation(explanation: string): BlankCard | null {
  const sentence = firstUsefulSentence(explanation);
  if (!sentence) return null;

  const colonMatch = sentence.match(/^([가-힣A-Za-z0-9·\s-]{2,24})(?:\([^)]*\))?\s*[:;：]\s*(.{8,})$/);
  if (colonMatch) {
    const answer = colonMatch[1].trim();
    return {
      prompt: `다음 설명에 해당하는 용어를 쓰세요.\n\n________ : ${colonMatch[2].trim()}`,
      answer,
      source: "definition",
    };
  }

  const definitionMatch = sentence.match(/^([가-힣A-Za-z0-9·\s-]{2,24})(?:\([^)]*\))?\s*(이란|란|은|는)\s+(.{8,})$/);
  if (definitionMatch) {
    const answer = definitionMatch[1].trim();
    return {
      prompt: `다음 문장의 빈칸에 들어갈 용어를 쓰세요.\n\n________${definitionMatch[2]} ${definitionMatch[3].trim()}`,
      answer,
      source: "definition",
    };
  }

  return null;
}

export function makeBlankCard(question: QuizQuestion, card: ParsedCard): BlankCard {
  const definition = definitionFromExplanation(question.explanation);
  if (definition) return definition;

  const correct = cleanMathText(card.correctText).trim();
  const explanation = firstUsefulSentence(question.explanation);
  if (correct && explanation && explanation.includes(correct)) {
    return {
      prompt: `다음 문장의 빈칸에 들어갈 말을 쓰세요.\n\n${explanation.replace(correct, "________")}`,
      answer: correct,
      source: "explanation",
    };
  }

  if (explanation && correct) {
    return {
      prompt: `다음 설명을 보고 알맞은 답을 쓰세요.\n\n${explanation}\n\n빈칸: ________`,
      answer: correct,
      source: "explanation",
    };
  }

  const prompt = card.prompt.replace(/무엇인가\??|어느 것인가\??|옳은 것은\??|아닌 것은\??/g, "무엇인지 쓰세요.");
  return {
    prompt: `${prompt}\n\n빈칸: ________`,
    answer: correct || question.answer,
    source: "question",
  };
}

export function normalizeAnswer(value: string) {
  return cleanMathText(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.,()[\]{}'"`~!@#$%^&*_+=|\\:;<>?/-]/g, "")
    .trim();
}

export function isBlankAnswerCorrect(input: string, correctText: string) {
  const normalizedInput = normalizeAnswer(input);
  const normalizedCorrect = normalizeAnswer(correctText);
  return Boolean(normalizedCorrect) && normalizedInput === normalizedCorrect;
}

export function nextProgress(current: CardProgress | undefined, questionId: string, quality: number): CardProgress {
  const previous: CardProgress =
    current ?? {
      questionId,
      attempts: 0,
      correct: 0,
      wrong: 0,
      easeFactor: 2.5,
      intervalDays: 0,
      repetitions: 0,
      dueAt: new Date().toISOString(),
      lastQuality: 0,
    };

  const isCorrect = quality >= 3;
  let easeFactor = previous.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  easeFactor = Math.max(1.3, Number(easeFactor.toFixed(2)));

  let repetitions = previous.repetitions;
  let intervalDays = previous.intervalDays;
  if (!isCorrect) {
    repetitions = 0;
    intervalDays = 0;
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
  }

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + intervalDays);

  return {
    questionId,
    attempts: previous.attempts + 1,
    correct: previous.correct + (isCorrect ? 1 : 0),
    wrong: previous.wrong + (isCorrect ? 0 : 1),
    easeFactor,
    intervalDays,
    repetitions,
    dueAt: dueAt.toISOString(),
    lastQuality: quality,
  };
}
