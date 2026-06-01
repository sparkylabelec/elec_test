export type Category = "전기회로" | "전기기기" | "전기설비";

export type QuizQuestion = {
  id: string;
  year: number;
  round: number;
  date: string;
  number: number;
  category: Category;
  question: string;
  answer: string;
  explanation: string;
  images: string[];
  variant: boolean;
  sourceHtml: string;
  solutionHtml: string;
};

export type Choice = {
  label: string;
  text: string;
  originalLabel: string;
  isCorrect: boolean;
};

export type ParsedCard = {
  prompt: string;
  choices: Choice[];
  correctText: string;
};

export type QuizMode = "multiple" | "blank" | "mixed";

export type CardProgress = {
  questionId: string;
  attempts: number;
  correct: number;
  wrong: number;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  dueAt: string;
  lastQuality: number;
};
