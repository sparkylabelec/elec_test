import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { CardProgress } from "@/lib/types";

const localKey = "electrician-quiz-progress";
const savedCardsKey = "electrician-quiz-saved-cards";

export function readLocalProgress(): Record<string, CardProgress> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(localKey) ?? "{}") as Record<string, CardProgress>;
  } catch {
    return {};
  }
}

export function writeLocalProgress(progress: Record<string, CardProgress>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localKey, JSON.stringify(progress));
}

export async function readRemoteProgress(userId?: string): Promise<Record<string, CardProgress>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !userId) return {};

  const { data, error } = await supabase
    .from("card_progress")
    .select("question_id,attempts,correct,wrong,ease_factor,interval_days,repetitions,due_at,last_quality")
    .eq("user_id", userId);

  if (error || !data) return {};

  return (data as Array<{
    question_id: string;
    attempts: number;
    correct: number;
    wrong: number;
    ease_factor: number;
    interval_days: number;
    repetitions: number;
    due_at: string;
    last_quality: number;
  }>).reduce<Record<string, CardProgress>>((acc, item) => {
    acc[item.question_id] = {
      questionId: item.question_id,
      attempts: item.attempts,
      correct: item.correct,
      wrong: item.wrong,
      easeFactor: Number(item.ease_factor),
      intervalDays: item.interval_days,
      repetitions: item.repetitions,
      dueAt: item.due_at,
      lastQuality: item.last_quality,
    };
    return acc;
  }, {});
}

function savedKey(userKey?: string) {
  return `${savedCardsKey}:${userKey || "local"}`;
}

export function readLocalSavedQuestionIds(userKey?: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(savedKey(userKey)) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function writeLocalSavedQuestionIds(questionIds: string[], userKey?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(savedKey(userKey), JSON.stringify(Array.from(new Set(questionIds))));
}

export async function readSavedQuestionIds(userId?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !userId) return [];

  const { data, error } = await supabase
    .from("saved_cards")
    .select("question_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as { question_id: string | null }[])
    .map((item) => item.question_id)
    .filter((item): item is string => typeof item === "string");
}

export async function saveCardBookmark(params: {
  userId?: string;
  questionId: string;
  saved: boolean;
}) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !params.userId) return;

  if (!params.saved) {
    await supabase
      .from("saved_cards")
      .delete()
      .eq("user_id", params.userId)
      .eq("question_id", params.questionId);
    return;
  }

  await supabase.from("saved_cards").upsert(
    {
      user_id: params.userId,
      question_id: params.questionId,
    },
    { onConflict: "user_id,question_id" },
  );
}

export async function saveAttempt(params: {
  userId?: string;
  questionId: string;
  mode: string;
  correct: boolean;
  quality: number;
  selectedAnswer: string;
  correctAnswer: string;
  progress: CardProgress;
}) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !params.userId) return;

  await supabase.from("attempts").insert({
    user_id: params.userId,
    question_id: params.questionId,
    mode: params.mode,
    correct: params.correct,
    quality: params.quality,
    selected_answer: params.selectedAnswer,
    correct_answer: params.correctAnswer,
  });

  await supabase.from("card_progress").upsert(
    {
      user_id: params.userId,
      question_id: params.questionId,
      attempts: params.progress.attempts,
      correct: params.progress.correct,
      wrong: params.progress.wrong,
      ease_factor: params.progress.easeFactor,
      interval_days: params.progress.intervalDays,
      repetitions: params.progress.repetitions,
      due_at: params.progress.dueAt,
      last_quality: params.progress.lastQuality,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,question_id" },
  );
}
