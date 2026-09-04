import rawQuestions from "@/data/questions.json";
import rawReviewCircuitQuestions from "@/data/review-2023-2024-circuit.json";
import rawMemoryCircuitQuestions from "@/data/review-2023-2024-circuit-noncalc.json";
import rawFacilitySet1Questions from "@/data/facility-set-1.json";
import rawFacilitySet2Questions from "@/data/facility-set-2.json";
import rawFacilitySet3Questions from "@/data/facility-set-3.json";
import rawMachineLectureSet1Questions from "@/data/machine-lecture-set-1.json";
import rawMachineLectureSet2Questions from "@/data/machine-lecture-set-2.json";
import rawMachineLectureSet3Questions from "@/data/machine-lecture-set-3.json";
import rawSummaryBlankQuestions from "@/data/summary-blanks.json";
import type { Category, QuizQuestion } from "@/lib/types";

export const categories: Category[] = ["전기회로", "전기기기", "전기설비"];

export const reviewCircuitQuestions = rawReviewCircuitQuestions as QuizQuestion[];
export const memoryCircuitQuestions = rawMemoryCircuitQuestions as QuizQuestion[];
export const facilitySet1Questions = rawFacilitySet1Questions as QuizQuestion[];
export const facilitySet2Questions = rawFacilitySet2Questions as QuizQuestion[];
export const facilitySet3Questions = rawFacilitySet3Questions as QuizQuestion[];
export const facilitySetQuestions = [
  ...facilitySet1Questions,
  ...facilitySet2Questions,
  ...facilitySet3Questions,
] as QuizQuestion[];
export const machineLectureSet1Questions = rawMachineLectureSet1Questions as QuizQuestion[];
export const machineLectureSet2Questions = rawMachineLectureSet2Questions as QuizQuestion[];
export const machineLectureSet3Questions = rawMachineLectureSet3Questions as QuizQuestion[];
export const machineLectureQuestions = [
  ...machineLectureSet1Questions,
  ...machineLectureSet2Questions,
  ...machineLectureSet3Questions,
] as QuizQuestion[];
export const questions = [
  ...rawQuestions,
  ...rawReviewCircuitQuestions,
  ...facilitySetQuestions,
  ...machineLectureQuestions,
] as QuizQuestion[];
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
  const activeCategories = categories.filter((category) =>
    pool.some((question) => question.category === category),
  );
  if (activeCategories.length === 0) return [];

  for (const category of activeCategories) {
    byCategory.set(
      category,
      shuffle(pool.filter((question) => question.category === category)),
    );
  }

  const targetBase = Math.floor(safeCount / activeCategories.length);
  const remainder = safeCount % activeCategories.length;
  const selected: QuizQuestion[] = [];

  activeCategories.forEach((category, index) => {
    const target = targetBase + (index < remainder ? 1 : 0);
    selected.push(...(byCategory.get(category) ?? []).slice(0, target));
  });

  if (selected.length < safeCount) {
    const selectedIds = new Set(selected.map((question) => question.id));
    selected.push(
      ...shuffle(pool.filter((question) => !selectedIds.has(question.id))).slice(0, safeCount - selected.length),
    );
  }

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
