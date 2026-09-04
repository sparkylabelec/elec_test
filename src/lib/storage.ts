import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { CardProgress, QuizMode, SavedQuizSet } from "@/lib/types";

const localKey = "electrician-quiz-progress";
const savedCardsKey = "electrician-quiz-saved-cards";
const savedQuizSetsKey = "electrician-quiz-saved-sets";

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

function quizSetsKey(userKey?: string) {
  return `${savedQuizSetsKey}:${userKey || "local"}`;
}

function createLocalSetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `local-${crypto.randomUUID()}`;
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

export function readLocalQuizSets(userKey?: string): SavedQuizSet[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(quizSetsKey(userKey)) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is SavedQuizSet => {
      return Boolean(item && typeof item.id === "string" && Array.isArray(item.items));
    });
  } catch {
    return [];
  }
}

export function writeLocalQuizSets(sets: SavedQuizSet[], userKey?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(quizSetsKey(userKey), JSON.stringify(sets));
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

export async function readSavedQuizSets(userId?: string, userKey?: string): Promise<SavedQuizSet[]> {
  const localSets = readLocalQuizSets(userKey);
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !userId) return localSets;

  const { data: setRows, error: setError } = await supabase
    .from("quiz_sets")
    .select("id,title,mode,category_filter,formula_only,question_count,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (setError || !setRows) return localSets;

  const ids = (setRows as { id: string }[]).map((item) => item.id);
  if (ids.length === 0) return localSets;

  const { data: itemRows } = await supabase
    .from("quiz_set_items")
    .select("set_id,position,question_id,item_mode")
    .in("set_id", ids)
    .order("position", { ascending: true });

  const itemMap = new Map<string, SavedQuizSet["items"]>();
  for (const item of (itemRows ?? []) as Array<{
    set_id: string;
    position: number;
    question_id: string;
    item_mode: "multiple" | "blank";
  }>) {
    const list = itemMap.get(item.set_id) ?? [];
    list.push({
      questionId: item.question_id,
      mode: item.item_mode,
      position: item.position,
    });
    itemMap.set(item.set_id, list);
  }

  const remoteSets = (setRows as Array<{
    id: string;
    title: string;
    mode: QuizMode;
    category_filter: string;
    formula_only: boolean;
    question_count: number;
    created_at: string;
  }>).map((item) => ({
    id: item.id,
    title: item.title,
    mode: item.mode,
    categoryFilter: item.category_filter,
    formulaOnly: item.formula_only,
    questionCount: item.question_count,
    createdAt: item.created_at,
    items: (itemMap.get(item.id) ?? []).sort((left, right) => left.position - right.position),
  }));

  const remoteIds = new Set(remoteSets.map((item) => item.id));
  return [...remoteSets, ...localSets.filter((item) => !remoteIds.has(item.id))];
}

export async function saveQuizSet(params: {
  userId?: string;
  userKey?: string;
  title: string;
  mode: QuizMode;
  categoryFilter: string;
  formulaOnly: boolean;
  items: Array<{ questionId: string; mode: "multiple" | "blank" }>;
}): Promise<{ set: SavedQuizSet; remote: boolean; error?: string }> {
  const createdAt = new Date().toISOString();
  const fallbackSet: SavedQuizSet = {
    id: createLocalSetId(),
    title: params.title,
    mode: params.mode,
    categoryFilter: params.categoryFilter,
    formulaOnly: params.formulaOnly,
    questionCount: params.items.length,
    createdAt,
    items: params.items.map((item, index) => ({
      questionId: item.questionId,
      mode: item.mode,
      position: index,
    })),
  };

  const saveLocal = (error?: string) => {
    const nextSets = [fallbackSet, ...readLocalQuizSets(params.userKey)].slice(0, 100);
    writeLocalQuizSets(nextSets, params.userKey);
    return { set: fallbackSet, remote: false, error };
  };

  const supabase = getSupabaseBrowserClient();
  if (!supabase || !params.userId) return saveLocal();

  const { data: setRow, error: setError } = await supabase
    .from("quiz_sets")
    .insert({
      user_id: params.userId,
      title: params.title,
      mode: params.mode,
      category_filter: params.categoryFilter,
      formula_only: params.formulaOnly,
      question_count: params.items.length,
    })
    .select("id,title,mode,category_filter,formula_only,question_count,created_at")
    .single();

  if (setError || !setRow) return saveLocal(setError?.message);

  const typedSetRow = setRow as {
    id: string;
    title: string;
    mode: QuizMode;
    category_filter: string;
    formula_only: boolean;
    question_count: number;
    created_at: string;
  };

  const { error: itemsError } = await supabase.from("quiz_set_items").insert(
    params.items.map((item, index) => ({
      set_id: typedSetRow.id,
      position: index,
      question_id: item.questionId,
      item_mode: item.mode,
    })),
  );

  if (itemsError) return saveLocal(itemsError.message);

  return {
    remote: true,
    set: {
      id: typedSetRow.id,
      title: typedSetRow.title,
      mode: typedSetRow.mode,
      categoryFilter: typedSetRow.category_filter,
      formulaOnly: typedSetRow.formula_only,
      questionCount: typedSetRow.question_count,
      createdAt: typedSetRow.created_at,
      items: params.items.map((item, index) => ({
        questionId: item.questionId,
        mode: item.mode,
        position: index,
      })),
    },
  };
}

export async function deleteQuizSet(params: {
  userId?: string;
  userKey?: string;
  setId: string;
}): Promise<{ remote: boolean; error?: string }> {
  const localSets = readLocalQuizSets(params.userKey);
  const hasLocalSet = localSets.some((set) => set.id === params.setId);

  if (hasLocalSet) {
    writeLocalQuizSets(
      localSets.filter((set) => set.id !== params.setId),
      params.userKey,
    );
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase || !params.userId || params.setId.startsWith("local-")) {
    return { remote: false };
  }

  const { error } = await supabase
    .from("quiz_sets")
    .delete()
    .eq("id", params.setId)
    .eq("user_id", params.userId);

  if (error) return { remote: false, error: error.message };
  return { remote: true };
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
