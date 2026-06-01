import rawQuestions from "@/data/questions.json";
import rawSummaryBlankQuestions from "@/data/summary-blanks.json";
import type { Category, QuizQuestion } from "@/lib/types";

export const categories: Category[] = ["전기회로", "전기기기", "전기설비"];

export const questions = rawQuestions as QuizQuestion[];
export const summaryBlankQuestions = rawSummaryBlankQuestions as QuizQuestion[];

export function getBalancedRandomQuestions(count: number) {
  return getBalancedRandomQuestionsFrom(questions, count);
}

export function getBalancedSummaryBlankQuestions(count: number) {
  return getBalancedRandomQuestionsFrom(summaryBlankQuestions, count);
}

export function getBalancedRandomQuestionsFrom(pool: QuizQuestion[], count: number) {
  const safeCount = Math.max(0, Math.min(count, pool.length));
  if (safeCount === 0) return [];

  const byCategory = new Map<Category, QuizQuestion[]>();

  for (const category of categories) {
    byCategory.set(
      category,
      shuffle(pool.filter((question) => question.category === category)),
    );
  }

  const targetBase = Math.floor(safeCount / categories.length);
  const remainder = safeCount % categories.length;
  const selected: QuizQuestion[] = [];

  categories.forEach((category, index) => {
    const target = targetBase + (index < remainder ? 1 : 0);
    selected.push(...(byCategory.get(category) ?? []).slice(0, target));
  });

  return shuffle(selected).slice(0, safeCount);
}

export function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
