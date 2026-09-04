"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Bookmark, BookmarkCheck, BookOpen, Check, Eye, EyeOff, FolderOpen, LogOut, Menu, RotateCcw, Save, Shuffle, Trash2, X } from "lucide-react";
import {
  categories,
  facilitySet1Questions,
  facilitySet2Questions,
  facilitySet3Questions,
  getBalancedRandomQuestionsFrom,
  machineLectureSet1Questions,
  machineLectureSet2Questions,
  machineLectureSet3Questions,
  memoryCircuitQuestions,
  questions,
  reviewCircuitQuestions,
  shuffle,
  summaryBlankQuestions,
} from "@/lib/questions";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase";
import { displayMathText, nextProgress, parseCard } from "@/lib/quiz";
import {
  readLocalProgress,
  readLocalSavedQuestionIds,
  readRemoteProgress,
  readSavedQuestionIds,
  readSavedQuizSets,
  deleteQuizSet,
  saveAttempt,
  saveCardBookmark,
  saveQuizSet,
  writeLocalProgress,
  writeLocalSavedQuestionIds,
} from "@/lib/storage";
import type { CardProgress, Category, QuizMode, QuizQuestion, SavedQuizSet } from "@/lib/types";

type UserState = {
  id?: string;
  email: string;
  username: string;
  fullName?: string;
  isAdmin?: boolean;
};

type QuizItem = {
  question: QuizQuestion;
  mode: Exclude<QuizMode, "mixed">;
  solved: boolean;
  tries: number;
};

type SessionMode = "study" | "exam";
type LectureSubject = "전기회로" | "전기기기" | "전기설비";

type AdminMemberStats = {
  userId: string;
  email: string;
  name: string;
  username: string;
  studied: number;
  attempts: number;
  correct: number;
  wrong: number;
  accuracy: number;
  mastered: number;
  due: number;
  saved: number;
  lastAttempt: string;
};

const builtinReviewSetIds = [
  "builtin-memory-2023-2024-circuit",
  "builtin-facility-set-1",
  "builtin-facility-set-2",
  "builtin-facility-set-3",
  "builtin-machine-lecture-set-1",
  "builtin-machine-lecture-set-2",
  "builtin-machine-lecture-set-3",
];
const builtinReviewSetId = builtinReviewSetIds[0];

declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: () => Promise<void>;
    };
  }
}

const modeLabels: Record<QuizMode, string> = {
  multiple: "객관식",
  blank: "암기모드",
  mixed: "혼합",
};

type CategoryFilter = "all" | Category;

const categoryFilterLabels: Record<CategoryFilter, string> = {
  all: "전체",
  전기회로: "전기회로",
  전기기기: "전기기기",
  전기설비: "전기설비",
};

function isFormulaQuestion(question: QuizQuestion) {
  return question.id.startsWith("summary-theory-");
}

function filterByCategory(pool: QuizQuestion[], categoryFilter: CategoryFilter) {
  if (categoryFilter === "all") return pool;
  return pool.filter((question) => question.category === categoryFilter);
}

const pendingProfileKey = (emailValue: string) => `pending-profile:${emailValue.trim().toLowerCase()}`;

function formatAuthError(message = "인증 처리에 실패했습니다.") {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("email rate limit exceeded")) {
    return "이메일 전송 한도를 초과했습니다. 잠시 후 다시 시도하거나 관리자에게 SMTP 설정을 요청하세요.";
  }
  if (lowerMessage.includes("invalid")) {
    return "이메일 또는 입력값 형식이 올바르지 않습니다.";
  }
  return message;
}

export default function Home() {
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [user, setUser] = useState<UserState | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [count, setCount] = useState(30);
  const [mode, setMode] = useState<QuizMode>("multiple");
  const [sessionMode, setSessionMode] = useState<SessionMode>("study");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [formulaOnly, setFormulaOnly] = useState(false);
  const [queue, setQueue] = useState<QuizItem[]>([]);
  const [examAnswers, setExamAnswers] = useState<Record<string, { correct: boolean; item: QuizItem }>>({});
  const [quizRunId, setQuizRunId] = useState(0);
  const [cardShuffleNonce, setCardShuffleNonce] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isBack, setIsBack] = useState(false);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | "">("");
  const [progress, setProgress] = useState<Record<string, CardProgress>>({});
  const [savedQuestionIds, setSavedQuestionIds] = useState<string[]>([]);
  const [savedQuizSets, setSavedQuizSets] = useState<SavedQuizSet[]>([]);
  const [quizSetTitle, setQuizSetTitle] = useState("");
  const [quizSetMessage, setQuizSetMessage] = useState("");
  const [isSavingQuizSet, setIsSavingQuizSet] = useState(false);
  const [lectureSubject, setLectureSubject] = useState<LectureSubject>("전기설비");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminStats, setAdminStats] = useState<AdminMemberStats[]>([]);
  const [adminMessage, setAdminMessage] = useState("");
  const [isLoadingAdminStats, setIsLoadingAdminStats] = useState(false);
  const [nowTs, setNowTs] = useState(0);

  const supabase = getSupabaseBrowserClient();
  const current = queue[currentIndex];
  const parsed = useMemo(() => {
    void quizRunId;
    void cardShuffleNonce;
    return current ? parseCard(current.question) : null;
  }, [current, quizRunId, cardShuffleNonce]);
  const allQuestions = useMemo(() => [...questions, ...summaryBlankQuestions], []);
  const questionById = useMemo(() => new Map(allQuestions.map((question) => [question.id, question])), [allQuestions]);
  const defaultReviewSet = useMemo<SavedQuizSet>(
    () => ({
      id: builtinReviewSetId,
      title: "기본 문제세트: 2023-2024 전기회로 정리",
      mode: "multiple",
      categoryFilter: "전기회로",
      formulaOnly: false,
      questionCount: reviewCircuitQuestions.length,
      createdAt: "2026-06-13T00:00:00.000Z",
      items: reviewCircuitQuestions.map((question, index) => ({
        questionId: question.id,
        mode: "multiple",
        position: index,
      })),
    }),
    [],
  );
  const memoryReviewSets = useMemo<SavedQuizSet[]>(() => {
    const makeSet = (): SavedQuizSet => {
      const questionsForSet = memoryCircuitQuestions;
      return {
        ...defaultReviewSet,
        id: builtinReviewSetIds[0],
        title: "암기문제",
        categoryFilter: "전기회로",
        questionCount: questionsForSet.length,
        createdAt: "2026-06-17T00:00:00.000Z",
        items: questionsForSet.map((question, index) => ({
          questionId: question.id,
          mode: "multiple",
          position: index,
        })),
      };
    };
    return [makeSet()];
  }, [defaultReviewSet]);
  const specialLectureGroups = useMemo<Record<LectureSubject, SavedQuizSet[]>>(() => {
    const makeLectureSet = (
      id: string,
      title: string,
      questionsForSet: QuizQuestion[],
      categoryFilter: Category,
      createdAt: string,
    ): SavedQuizSet => ({
      ...defaultReviewSet,
      id,
      title,
      categoryFilter,
      questionCount: questionsForSet.length,
      createdAt,
      items: questionsForSet.map((question, index) => ({
        questionId: question.id,
        mode: "multiple",
        position: index,
      })),
    });
    return {
      전기회로: [],
      전기기기: [
        makeLectureSet("builtin-machine-lecture-set-1", "전기기기 특강문제 1", machineLectureSet1Questions, "전기기기", "2026-06-23T00:00:00.000Z"),
        makeLectureSet("builtin-machine-lecture-set-2", "전기기기 특강문제 2", machineLectureSet2Questions, "전기기기", "2026-06-23T00:00:00.000Z"),
        makeLectureSet("builtin-machine-lecture-set-3", "전기기기 특강문제 3", machineLectureSet3Questions, "전기기기", "2026-06-23T00:00:00.000Z"),
      ],
      전기설비: [
        makeLectureSet("builtin-facility-set-1", "전기설비 특강문제 1", facilitySet1Questions, "전기설비", "2026-06-22T00:00:00.000Z"),
        makeLectureSet("builtin-facility-set-2", "전기설비 특강문제 2", facilitySet2Questions, "전기설비", "2026-06-22T00:00:00.000Z"),
        makeLectureSet("builtin-facility-set-3", "전기설비 특강문제 3", facilitySet3Questions, "전기설비", "2026-06-22T00:00:00.000Z"),
      ],
    };
  }, [defaultReviewSet]);
  const visibleQuizSets = useMemo(
    () => [
      ...memoryReviewSets,
      ...savedQuizSets.filter((set) => !builtinReviewSetIds.includes(set.id)),
    ],
    [memoryReviewSets, savedQuizSets],
  );
  const activeLectureSets = specialLectureGroups[lectureSubject];
  const filteredMultipleQuestions = useMemo(
    () => filterByCategory(questions, categoryFilter),
    [categoryFilter],
  );
  const filteredSummaryQuestions = useMemo(() => {
    const categoryFiltered = filterByCategory(summaryBlankQuestions, categoryFilter);
    return formulaOnly ? categoryFiltered.filter(isFormulaQuestion) : categoryFiltered;
  }, [categoryFilter, formulaOnly]);
  const selectedPoolSize =
    mode === "blank"
      ? filteredSummaryQuestions.length
      : mode === "multiple"
        ? filteredMultipleQuestions.length
        : filteredMultipleQuestions.length + filteredSummaryQuestions.length;
  const activeMode = current?.mode ?? "multiple";
  const blankPrompt = current && activeMode === "blank" ? displayMathText(current.question.question) : "";
  const blankCorrectAnswer = current && activeMode === "blank" ? displayMathText(current.question.answer) : "";
  const remaining = queue.filter((item) => !item.solved).length;
  const solvedCount = queue.filter((item) => item.solved).length;
  const progressPercent = queue.length > 0 ? Math.round((solvedCount / queue.length) * 100) : 0;
  const isCompleteScreen = queue.length > 0 && remaining === 0 && currentIndex >= queue.length;
  const examAnswerValues = useMemo(() => Object.values(examAnswers), [examAnswers]);
  const examCorrectCount = examAnswerValues.filter((item) => item.correct).length;
  const examWrongItems = examAnswerValues
    .filter((item) => !item.correct)
    .map(({ item }) => ({ ...item, solved: false, tries: 0 }));
  const examScorePercent = queue.length > 0 ? Math.round((examCorrectCount / queue.length) * 100) : 0;
  const userStorageKey = user?.id ?? user?.email ?? "local";
  const isCurrentSaved = current ? savedQuestionIds.includes(current.question.id) : false;
  const wrongBank = useMemo(
    () =>
      filterByCategory(allQuestions, categoryFilter).filter((question) => {
        if ((progress[question.id]?.wrong ?? 0) <= 0) return false;
        if (mode === "multiple" || !formulaOnly) return true;
        return !question.id.startsWith("summary-") || isFormulaQuestion(question);
      }),
    [allQuestions, categoryFilter, formulaOnly, mode, progress],
  );
  const savedBank = useMemo(
    () => allQuestions.filter((question) => savedQuestionIds.includes(question.id)),
    [allQuestions, savedQuestionIds],
  );
  const personalStats = useMemo(() => {
    const values = Object.values(progress);
    const attempts = values.reduce((sum, item) => sum + item.attempts, 0);
    const correct = values.reduce((sum, item) => sum + item.correct, 0);
    const wrong = values.reduce((sum, item) => sum + item.wrong, 0);
    return {
      studied: values.length,
      attempts,
      correct,
      wrong,
      accuracy: correct + wrong > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0,
      mastered: values.filter((item) => item.repetitions >= 2 || item.intervalDays >= 3).length,
      due: values.filter((item) => nowTs > 0 && new Date(item.dueAt).getTime() <= nowTs).length,
      saved: savedBank.length,
    };
  }, [nowTs, progress, savedBank.length]);

  const applyAuthenticatedUser = useCallback(async (authUser: User) => {
    const fallbackName = authUser.user_metadata?.full_name ?? "";
    const fallbackUsername = authUser.user_metadata?.username ?? authUser.email?.split("@")[0] ?? "user";
    const pendingProfile =
      typeof window !== "undefined" && authUser.email
        ? JSON.parse(window.localStorage.getItem(pendingProfileKey(authUser.email)) ?? "null") as
            | { username?: string; fullName?: string }
            | null
        : null;
    let nextUser: UserState = {
      id: authUser.id,
      email: authUser.email ?? "",
      username: pendingProfile?.username || fallbackUsername,
      fullName: pendingProfile?.fullName || fallbackName,
      isAdmin: false,
    };

    if (supabase) {
      if (authUser.email && (pendingProfile?.username || pendingProfile?.fullName)) {
        await supabase.from("profiles").upsert({
          id: authUser.id,
          email: authUser.email,
          username: pendingProfile.username || fallbackUsername,
          full_name: pendingProfile.fullName || fallbackName,
          updated_at: new Date().toISOString(),
        });
        window.localStorage.removeItem(pendingProfileKey(authUser.email));
      }

      const { data } = await supabase
        .from("profiles")
        .select("username,full_name,is_admin")
        .eq("id", authUser.id)
        .maybeSingle();

      const profile = data as { username?: string | null; full_name?: string | null; is_admin?: boolean | null } | null;
      if (profile) {
        nextUser = {
          ...nextUser,
          username: profile.username || nextUser.username,
          fullName: profile.full_name || nextUser.fullName,
          isAdmin: Boolean(profile.is_admin),
        };
      }
    }

    setUser(nextUser);
  }, [supabase]);

  useEffect(() => {
    queueMicrotask(() => setNowTs(Date.now()));
    queueMicrotask(() => setProgress(readLocalProgress()));
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      if (data.user?.email) {
        void applyAuthenticatedUser(data.user);
      }
    });
  }, [applyAuthenticatedUser, supabase]);

  useEffect(() => {
    if (!user) return;

    const localSaved = readLocalSavedQuestionIds(userStorageKey);
    queueMicrotask(() => setSavedQuestionIds(localSaved));
    readSavedQuizSets(user.id, userStorageKey).then(setSavedQuizSets);

    if (!supabase || !user.id) return;
    readRemoteProgress(user.id).then((remoteProgress) => {
      const mergedProgress = { ...readLocalProgress(), ...remoteProgress };
      setProgress(mergedProgress);
      writeLocalProgress(mergedProgress);
    });
    readSavedQuestionIds(user.id).then((remoteSaved) => {
      if (remoteSaved.length === 0) return;
      const merged = Array.from(new Set([...localSaved, ...remoteSaved]));
      setSavedQuestionIds(merged);
      writeLocalSavedQuestionIds(merged, userStorageKey);
    });
  }, [supabase, user, userStorageKey]);

  useEffect(() => {
    const mathJax = window.MathJax;
    if (!mathJax?.typesetPromise) return;
    void mathJax.typesetPromise();
  }, [currentIndex, isBack, queue, result]);

  function itemModeFor(question: QuizQuestion): Exclude<QuizMode, "mixed"> {
    return question.id.startsWith("summary-") ? "blank" : "multiple";
  }

  function toItems(questionsToUse: QuizQuestion[], itemMode?: Exclude<QuizMode, "mixed">) {
    return questionsToUse.map((question) => ({
      question,
      mode: itemMode ?? itemModeFor(question),
      solved: false,
      tries: 0,
    }));
  }

  function buildItems(pool: QuizQuestion[], requestedCount: number, requestedMode: QuizMode, nextReviewOnly: boolean) {
    if (nextReviewOnly) {
      return toItems(shuffle(pool).slice(0, requestedCount));
    }

    if (requestedMode === "blank") {
      return toItems(getBalancedRandomQuestionsFrom(pool, requestedCount), "blank");
    }

    if (requestedMode === "multiple") {
      return toItems(getBalancedRandomQuestionsFrom(pool, requestedCount), "multiple");
    }

    const blankCount = Math.max(1, Math.floor(requestedCount / 2));
    const multipleCount = Math.max(1, requestedCount - blankCount);
    const multiplePool = pool.filter((question) => !question.id.startsWith("summary-"));
    const blankPool = pool.filter((question) => question.id.startsWith("summary-"));
    const mixedItems = [
      ...toItems(getBalancedRandomQuestionsFrom(multiplePool, multipleCount), "multiple"),
      ...toItems(getBalancedRandomQuestionsFrom(blankPool, blankCount), "blank"),
    ];

    if (mixedItems.length < requestedCount) {
      const selectedIds = new Set(mixedItems.map((item) => item.question.id));
      const filler = shuffle(pool.filter((question) => !selectedIds.has(question.id))).slice(0, requestedCount - mixedItems.length);
      mixedItems.push(...toItems(filler));
    }

    return shuffle(mixedItems).slice(0, requestedCount);
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage("");
    if (isAuthSubmitting) return;
    setIsAuthSubmitting(true);

    try {
      if (!hasSupabaseEnv() || !supabase) {
        setUser({
          email: email || `${username || "local"}@local.test`,
          username: username || email.split("@")[0] || "local",
          fullName: fullName || username || email.split("@")[0] || "local",
          isAdmin: false,
        });
        setAuthMessage("Supabase 환경변수가 없어 로컬 모드로 시작했습니다.");
        return;
      }

      if (authMode === "signup") {
        const signupResponse = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, username, fullName }),
        });
        const signupPayload = await signupResponse.json().catch(() => null) as { message?: string } | null;
        if (!signupResponse.ok) {
          setAuthMessage(formatAuthError(signupPayload?.message ?? "회원가입에 실패했습니다."));
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.user?.email) {
          setAuthMessage(formatAuthError(error?.message ?? "가입은 완료되었지만 자동 로그인에 실패했습니다. 로그인 탭에서 다시 로그인하세요."));
          return;
        }
        await applyAuthenticatedUser(data.user);
        return;
      }

      const loginResponse = await fetch("/api/login-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const loginPayload = await loginResponse.json().catch(() => null) as { email?: string; message?: string } | null;
      if (!loginResponse.ok || !loginPayload?.email) {
        setAuthMessage(formatAuthError(loginPayload?.message ?? "로그인에 실패했습니다."));
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email: loginPayload.email, password });
      if (error || !data.user?.email) {
        setAuthMessage(formatAuthError(error?.message ?? "로그인에 실패했습니다."));
        return;
      }
      await applyAuthenticatedUser(data.user);
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    setAuthMessage("");
    if (!resetEmail) {
      setAuthMessage("비밀번호 재설정 메일을 받을 이메일을 입력하세요.");
      return;
    }

    if (!hasSupabaseEnv() || !supabase) {
      setAuthMessage("로컬 모드에서는 비밀번호 재설정을 사용할 수 없습니다.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    });

    setAuthMessage(error ? formatAuthError(error.message) : "비밀번호 재설정 메일을 보냈습니다.");
  }

  async function handleLogout() {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setQueue([]);
    setExamAnswers({});
    setMobileMenuOpen(false);
  }

  async function startQuiz(nextReviewOnly = false) {
    const pool = nextReviewOnly
      ? wrongBank
      : mode === "blank"
        ? filteredSummaryQuestions
        : mode === "multiple"
          ? filteredMultipleQuestions
          : [...filteredMultipleQuestions, ...filteredSummaryQuestions];
    if (pool.length === 0) return;
    setQuizSetMessage("");
    const nextItems = buildItems(pool, Math.min(count, pool.length), mode, nextReviewOnly);
    setExamAnswers({});
    setQuizRunId((id) => id + 1);
    setCardShuffleNonce((id) => id + 1);
    setQueue(nextItems);
    setCurrentIndex(0);
    setIsBack(false);
    setSelected("");
    setResult("");
    setMobileMenuOpen(false);
    if (!nextReviewOnly) {
      await persistQuizSet(nextItems, quizSetTitle.trim() || defaultQuizSetTitle(nextItems), "created");
    }
  }

  function startSavedReview() {
    if (savedBank.length === 0) return;
    setQuizSetMessage("");
    setExamAnswers({});
    setQuizRunId((id) => id + 1);
    setCardShuffleNonce((id) => id + 1);
    setQueue(buildItems(savedBank, Math.min(count, savedBank.length), mode, true));
    setCurrentIndex(0);
    setIsBack(false);
    setSelected("");
    setResult("");
    setMobileMenuOpen(false);
  }

  function uniqueQuizSetItems(items: QuizItem[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.question.id)) return false;
      seen.add(item.question.id);
      return true;
    });
  }

  function quizSetItemsFromQueue() {
    return uniqueQuizSetItems(queue);
  }

  function defaultQuizSetTitle(items = quizSetItemsFromQueue()) {
    const label = categoryFilterLabels[categoryFilter] ?? "전체";
    const modeLabel = modeLabels[mode] ?? "문제";
    const savedAt = new Date().toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${label} ${modeLabel} ${uniqueQuizSetItems(items).length}문제 ${savedAt}`;
  }

  async function persistQuizSet(items: QuizItem[], title: string, source: "created" | "manual") {
    if (items.length === 0 || isSavingQuizSet) return;
    setIsSavingQuizSet(true);
    setQuizSetMessage("");

    const setItems = uniqueQuizSetItems(items);
    try {
      const result = await saveQuizSet({
        userId: user?.id,
        userKey: userStorageKey,
        title,
        mode,
        categoryFilter,
        formulaOnly,
        items: setItems.map((item) => ({
          questionId: item.question.id,
          mode: item.mode,
        })),
      });

      setSavedQuizSets((sets) => [result.set, ...sets.filter((item) => item.id !== result.set.id)]);
      setQuizSetTitle("");
      setQuizSetMessage(
        result.remote
          ? source === "created"
            ? "문제세트를 생성하고 Supabase에 저장했습니다."
            : "문제세트를 Supabase에 저장했습니다."
          : result.error
            ? `Supabase 저장 실패로 브라우저에 임시 저장했습니다: ${result.error}`
            : source === "created"
              ? "문제세트를 생성하고 브라우저에 저장했습니다."
              : "문제세트를 브라우저에 저장했습니다.",
      );
    } finally {
      setIsSavingQuizSet(false);
    }
  }

  async function handleSaveQuizSet() {
    await persistQuizSet(queue, quizSetTitle.trim() || defaultQuizSetTitle(), "manual");
  }

  function startQuizSet(savedSet: SavedQuizSet, nextSessionMode: SessionMode = sessionMode) {
    const items = savedSet.items
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((item) => {
        const question = questionById.get(item.questionId);
        if (!question) return null;
        return {
          question,
          mode: item.mode,
          solved: false,
          tries: 0,
        };
      })
      .filter((item): item is QuizItem => Boolean(item));

    if (items.length === 0) {
      setQuizSetMessage("이 문제세트의 문제를 현재 데이터에서 찾지 못했습니다.");
      return;
    }

    setSessionMode(nextSessionMode);
    setExamAnswers({});
    setQuizRunId((id) => id + 1);
    setCardShuffleNonce((id) => id + 1);
    setQueue(items);
    setCurrentIndex(0);
    setIsBack(false);
    setSelected("");
    setResult("");
    setQuizSetMessage(`저장된 문제세트 "${savedSet.title}"를 불러왔습니다.`);
    setMobileMenuOpen(false);
    setMode(savedSet.mode);
    setFormulaOnly(savedSet.formulaOnly);
    if (savedSet.categoryFilter === "all" || categories.includes(savedSet.categoryFilter as Category)) {
      setCategoryFilter(savedSet.categoryFilter as CategoryFilter);
    }
  }

  function startExamWrongReview() {
    if (examWrongItems.length === 0) return;
    setSessionMode("study");
    setExamAnswers({});
    setQuizRunId((id) => id + 1);
    setCardShuffleNonce((id) => id + 1);
    setQueue(examWrongItems);
    setCurrentIndex(0);
    setIsBack(false);
    setSelected("");
    setResult("");
    setQuizSetMessage("");
    setMobileMenuOpen(false);
  }

  async function handleDeleteQuizSet(savedSet: SavedQuizSet) {
    if (builtinReviewSetIds.includes(savedSet.id)) {
      setQuizSetMessage("기본 문제세트는 삭제할 수 없습니다.");
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`문제세트 "${savedSet.title}"를 삭제할까요?`);
      if (!confirmed) return;
    }

    const previousSets = savedQuizSets;
    setSavedQuizSets((sets) => sets.filter((item) => item.id !== savedSet.id));
    setQuizSetMessage("");

    const result = await deleteQuizSet({
      userId: user?.id,
      userKey: userStorageKey,
      setId: savedSet.id,
    });

    if (result.error) {
      setSavedQuizSets(previousSets);
      setQuizSetMessage(`문제세트 삭제에 실패했습니다: ${result.error}`);
      return;
    }

    setQuizSetMessage(
      result.remote
        ? `문제세트 "${savedSet.title}"를 Supabase에서 삭제했습니다.`
        : `문제세트 "${savedSet.title}"를 브라우저 저장소에서 삭제했습니다.`,
    );
  }

  async function loadAdminStats() {
    if (!supabase || !user?.isAdmin) return;

    setIsLoadingAdminStats(true);
    setAdminMessage("");

    const [profilesResult, progressResult, attemptsResult, savedResult] = await Promise.all([
      supabase.from("profiles").select("id,email,username,full_name,is_admin,created_at").order("created_at", { ascending: false }),
      supabase.from("card_progress").select("user_id,question_id,attempts,correct,wrong,interval_days,repetitions,due_at"),
      supabase.from("attempts").select("user_id,correct,created_at").order("created_at", { ascending: false }),
      supabase.from("saved_cards").select("user_id,question_id"),
    ]);

    if (profilesResult.error || progressResult.error || attemptsResult.error || savedResult.error) {
      setAdminMessage("관리자 통계를 불러오지 못했습니다. RLS 정책과 관리자 권한을 확인하세요.");
      setIsLoadingAdminStats(false);
      return;
    }

    const profiles = (profilesResult.data ?? []) as Array<{
      id: string;
      email: string;
      username: string | null;
      full_name: string | null;
      is_admin: boolean | null;
    }>;
    const progressRows = (progressResult.data ?? []) as Array<{
      user_id: string;
      attempts: number;
      correct: number;
      wrong: number;
      interval_days: number;
      repetitions: number;
      due_at: string;
    }>;
    const attemptRows = (attemptsResult.data ?? []) as Array<{
      user_id: string;
      correct: boolean;
      created_at: string;
    }>;
    const savedRows = (savedResult.data ?? []) as Array<{ user_id: string }>;
    const now = Date.now();

    const stats = profiles.map((profile) => {
      const userProgress = progressRows.filter((item) => item.user_id === profile.id);
      const userAttempts = attemptRows.filter((item) => item.user_id === profile.id);
      const correct = userProgress.reduce((sum, item) => sum + item.correct, 0);
      const wrong = userProgress.reduce((sum, item) => sum + item.wrong, 0);

      return {
        userId: profile.id,
        email: profile.email,
        name: profile.full_name || profile.username || profile.email,
        username: profile.username || "",
        studied: userProgress.length,
        attempts: userProgress.reduce((sum, item) => sum + item.attempts, 0),
        correct,
        wrong,
        accuracy: correct + wrong > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0,
        mastered: userProgress.filter((item) => item.repetitions >= 2 || item.interval_days >= 3).length,
        due: userProgress.filter((item) => new Date(item.due_at).getTime() <= now).length,
        saved: savedRows.filter((item) => item.user_id === profile.id).length,
        lastAttempt: userAttempts[0]?.created_at ?? "",
      };
    });

    setAdminStats(stats);
    setAdminMessage(stats.length ? "" : "회원 데이터가 없습니다.");
    setIsLoadingAdminStats(false);
  }

  function toggleSavedCard() {
    if (!current) return;
    const questionId = current.question.id;
    const nextSaved = !savedQuestionIds.includes(questionId);
    const nextIds = nextSaved
      ? [...savedQuestionIds, questionId]
      : savedQuestionIds.filter((item) => item !== questionId);

    setSavedQuestionIds(nextIds);
    writeLocalSavedQuestionIds(nextIds, userStorageKey);
    void saveCardBookmark({
      userId: user?.id,
      questionId,
      saved: nextSaved,
    });
  }

  async function grade(isCorrect: boolean, selectedAnswer: string, quality = isCorrect ? 5 : 2) {
    if (!current || !parsed) return;
    const updatedProgress = nextProgress(progress[current.question.id], current.question.id, quality);
    const nextProgressMap = { ...progress, [current.question.id]: updatedProgress };
    setProgress(nextProgressMap);
    writeLocalProgress(nextProgressMap);
    await saveAttempt({
      userId: user?.id,
      questionId: current.question.id,
      mode: activeMode,
      correct: isCorrect,
      quality,
      selectedAnswer,
      correctAnswer: activeMode === "blank" ? blankCorrectAnswer : parsed.correctText || current.question.answer,
      progress: updatedProgress,
    });

    setResult(isCorrect ? "correct" : "wrong");
    setIsBack(true);
    if (sessionMode === "exam") {
      setExamAnswers((items) => ({
        ...items,
        [String(currentIndex)]: {
          correct: isCorrect,
          item: { ...current, solved: false, tries: 0 },
        },
      }));
    }

    setQueue((items) => {
      const copy = [...items];
      const updated = { ...copy[currentIndex], tries: copy[currentIndex].tries + 1 };
      if (isCorrect) {
        updated.solved = true;
        copy[currentIndex] = updated;
      } else {
        updated.solved = true;
        copy[currentIndex] = updated;
        if (sessionMode === "study") {
          const remainingAfterCurrent = copy.filter((item, index) => index > currentIndex && !item.solved).length;
          const retryOffset = Math.min(3, remainingAfterCurrent);
          copy.splice(currentIndex + retryOffset + 1, 0, { ...updated, solved: false });
        }
      }
      return copy;
    });
  }

  function submitCurrent() {
    if (!current || !parsed) return;
    if (activeMode === "multiple") {
      const choice = parsed.choices.find((item) => item.label === selected);
      void grade(Boolean(choice?.isCorrect), choice ? `${choice.label} ${choice.text}` : "");
      return;
    }
    setIsBack(true);
  }

  function rateBlankCard(label: "Fail" | "OK") {
    if (label === "OK") {
      void grade(true, label, 5);
      return;
    }

    void grade(false, label, 1);
  }

  function nextCard() {
    const next = queue.findIndex((item, index) => index > currentIndex && !item.solved);
    if (next >= 0) {
      setCurrentIndex(next);
    } else {
      const firstUnsolved = queue.findIndex((item) => !item.solved);
      setCurrentIndex(firstUnsolved >= 0 ? firstUnsolved : queue.length);
    }
    setCardShuffleNonce((id) => id + 1);
    setIsBack(false);
    setSelected("");
    setResult("");
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#17202a]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl">
        <aside className="hidden w-72 shrink-0 border-r border-[#dce2ea] bg-white px-5 py-6 lg:block">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <BookOpen size={20} />
            전기기능사 Quiz
          </div>
          <nav className="mt-8 space-y-2 text-sm">
            <button className="w-full rounded-md bg-[#eaf2f6] px-3 py-2 text-left font-medium text-[#245c7a]">
              플래시카드
            </button>
            <button
              className="w-full rounded-md px-3 py-2 text-left text-[#526171] hover:bg-[#f2f4f7]"
              onClick={() => void startQuiz(true)}
            >
              오답 복습 ({wrongBank.length})
            </button>
            <button
              className="w-full rounded-md px-3 py-2 text-left text-[#526171] hover:bg-[#f2f4f7]"
              onClick={startSavedReview}
              disabled={savedBank.length === 0}
            >
              저장 복습 ({savedBank.length})
            </button>
          </nav>
          <div className="mt-8 grid grid-cols-3 gap-2 text-center text-xs">
            {categories.map((category) => (
              <div key={category} className="rounded-md border border-[#dce2ea] px-2 py-3">
                <div className="font-semibold">{questions.filter((item) => item.category === category).length}</div>
                <div className="mt-1 text-[#667488]">{category.replace("전기", "")}</div>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex min-h-16 items-center justify-between border-b border-[#dce2ea] bg-white px-4 sm:px-6">
            <div>
              <h1 className="text-lg font-semibold">플래시카드 퀴즈</h1>
              <p className="text-xs text-[#667488]">
                객관식 {questions.length.toLocaleString()}개 · 요점정리 빈칸 {summaryBlankQuestions.length.toLocaleString()}개 · 이미지 663개
              </p>
            </div>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden text-sm text-[#526171] sm:inline">{user.fullName || user.username || user.email}</span>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#dce2ea] bg-white hover:bg-[#f2f4f7] lg:hidden"
                  onClick={() => setMobileMenuOpen(true)}
                  title="메뉴"
                >
                  <Menu size={17} />
                </button>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#dce2ea] bg-white hover:bg-[#f2f4f7]"
                  onClick={handleLogout}
                  title="로그아웃"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : null}
          </header>

          {user && mobileMenuOpen ? (
            <button
              className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="메뉴 닫기"
            />
          ) : null}

          <div className="grid flex-1 gap-0 p-0 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-5 lg:p-6">
            <section
              className={`${
                user
                  ? mobileMenuOpen
                    ? "fixed inset-y-0 left-0 z-50 block w-[min(88vw,360px)] overflow-y-auto rounded-none border-r shadow-2xl lg:static lg:z-auto lg:block lg:h-fit lg:w-auto lg:overflow-visible lg:rounded-lg lg:border lg:shadow-none"
                    : "hidden lg:block lg:h-fit lg:border"
                  : "block h-fit rounded-lg border"
              } border-[#dce2ea] bg-white p-4 lg:rounded-lg`}
            >
              {user ? (
                <div className="mb-4 flex items-center justify-between border-b border-[#e2e8f0] pb-3 lg:hidden">
                  <div className="text-sm font-semibold">학습 메뉴</div>
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#dce2ea] bg-white hover:bg-[#f2f4f7]"
                    onClick={() => setMobileMenuOpen(false)}
                    title="닫기"
                  >
                    <X size={17} />
                  </button>
                </div>
              ) : null}
              {!user ? (
                <form className="space-y-3" onSubmit={handleAuth}>
                  <div className="flex rounded-md bg-[#f2f4f7] p-1">
                    {(["login", "signup"] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`h-9 flex-1 rounded text-sm font-medium ${authMode === item ? "bg-white shadow-sm" : "text-[#667488]"}`}
                        onClick={() => setAuthMode(item)}
                      >
                        {item === "login" ? "로그인" : "회원가입"}
                      </button>
                    ))}
                  </div>
                  {authMode === "signup" ? (
                    <>
                      <label className="block text-sm">
                        <span className="mb-1 block text-[#526171]">이름</span>
                        <input
                          className="h-10 w-full rounded-md border border-[#cfd7e2] px-3 outline-none focus:border-[#245c7a]"
                          value={fullName}
                          onChange={(event) => setFullName(event.target.value)}
                          placeholder="한민욱"
                          required
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block text-[#526171]">ID</span>
                        <input
                          className="h-10 w-full rounded-md border border-[#cfd7e2] px-3 outline-none focus:border-[#245c7a]"
                          value={username}
                          onChange={(event) => setUsername(event.target.value)}
                          placeholder="username"
                          required
                        />
                      </label>
                    </>
                  ) : (
                    <label className="block text-sm">
                      <span className="mb-1 block text-[#526171]">ID</span>
                      <input
                        className="h-10 w-full rounded-md border border-[#cfd7e2] px-3 outline-none focus:border-[#245c7a]"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="admin"
                        required
                      />
                    </label>
                  )}
                  {authMode === "signup" ? (
                    <label className="block text-sm">
                      <span className="mb-1 block text-[#526171]">Email</span>
                      <input
                        className="h-10 w-full rounded-md border border-[#cfd7e2] px-3 outline-none focus:border-[#245c7a]"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                      />
                    </label>
                  ) : null}
                  <label className="block text-sm">
                    <span className="mb-1 block text-[#526171]">Password</span>
                    <div className="flex h-10 rounded-md border border-[#cfd7e2] focus-within:border-[#245c7a]">
                      <input
                        className="min-w-0 flex-1 rounded-l-md px-3 outline-none"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className="w-10 text-[#667488]"
                        onClick={() => setShowPassword((value) => !value)}
                        title={showPassword ? "숨기기" : "보기"}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </label>
                  <button
                    className="h-10 w-full rounded-md bg-[#245c7a] font-medium text-white hover:bg-[#1f506a] disabled:opacity-60"
                    disabled={isAuthSubmitting}
                  >
                    {isAuthSubmitting ? "처리 중" : authMode === "login" ? "로그인" : "가입"}
                  </button>
                  {authMode === "login" ? (
                    <div className="space-y-2 rounded-md border border-[#e2e8f0] bg-[#fbfcfd] p-3">
                      <label className="block text-sm">
                        <span className="mb-1 block text-[#526171]">비밀번호 찾기 Email</span>
                        <input
                          className="h-10 w-full rounded-md border border-[#cfd7e2] px-3 outline-none focus:border-[#245c7a]"
                          type="email"
                          value={resetEmail}
                          onChange={(event) => setResetEmail(event.target.value)}
                          placeholder="가입한 이메일"
                        />
                      </label>
                      <button
                        type="button"
                        className="h-9 w-full rounded-md border border-[#cfd7e2] bg-white text-sm font-medium hover:bg-[#f2f4f7]"
                        onClick={handlePasswordReset}
                      >
                        비밀번호 찾기
                      </button>
                    </div>
                  ) : null}
                  {authMessage ? <p className="text-sm text-[#8a5a00]">{authMessage}</p> : null}
                </form>
              ) : (
                <div className="space-y-4">
                  <section className="rounded-md border border-[#dce2ea] bg-[#fbfcfd] p-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold">내 문제 통계</h2>
                      <span className="text-xs text-[#667488]">{user.fullName || user.username}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded border border-[#e2e8f0] bg-white p-2">
                        <div className="text-[#667488]">학습 문항</div>
                        <div className="mt-1 text-base font-semibold">{personalStats.studied}</div>
                      </div>
                      <div className="rounded border border-[#e2e8f0] bg-white p-2">
                        <div className="text-[#667488]">정답률</div>
                        <div className="mt-1 text-base font-semibold">{personalStats.accuracy}%</div>
                      </div>
                      <div className="rounded border border-[#e2e8f0] bg-white p-2">
                        <div className="text-[#667488]">정답 / 오답</div>
                        <div className="mt-1 text-base font-semibold">
                          {personalStats.correct} / {personalStats.wrong}
                        </div>
                      </div>
                      <div className="rounded border border-[#e2e8f0] bg-white p-2">
                        <div className="text-[#667488]">저장 / 복습예정</div>
                        <div className="mt-1 text-base font-semibold">
                          {personalStats.saved} / {personalStats.due}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8edf3]">
                      <div
                        className="h-full rounded-full bg-[#245c7a]"
                        style={{
                          width: `${allQuestions.length > 0 ? Math.round((personalStats.mastered / allQuestions.length) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-[#667488]">숙달 {personalStats.mastered}개</p>
                  </section>

                  {user.isAdmin ? (
                    <section className="rounded-md border border-[#dce2ea] bg-[#fbfcfd] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold">관리자 회원 통계</h2>
                        <button
                          className="h-8 rounded-md border border-[#cfd7e2] bg-white px-2 text-xs font-medium hover:bg-[#f2f4f7]"
                          onClick={loadAdminStats}
                          disabled={isLoadingAdminStats}
                        >
                          {isLoadingAdminStats ? "불러오는 중" : "전체 보기"}
                        </button>
                      </div>
                      {adminMessage ? <p className="mt-2 text-xs text-[#8a5a00]">{adminMessage}</p> : null}
                      {adminStats.length > 0 ? (
                        <div className="mt-3 max-h-72 overflow-auto rounded border border-[#e2e8f0] bg-white">
                          <table className="w-full min-w-[520px] text-left text-xs">
                            <thead className="sticky top-0 bg-[#f2f4f7] text-[#526171]">
                              <tr>
                                <th className="px-2 py-2">회원</th>
                                <th className="px-2 py-2">학습</th>
                                <th className="px-2 py-2">정답률</th>
                                <th className="px-2 py-2">오답</th>
                                <th className="px-2 py-2">저장</th>
                                <th className="px-2 py-2">최근</th>
                              </tr>
                            </thead>
                            <tbody>
                              {adminStats.map((item) => (
                                <tr key={item.userId} className="border-t border-[#edf1f5]">
                                  <td className="px-2 py-2">
                                    <div className="font-medium text-[#17202a]">{item.name}</div>
                                    <div className="text-[#667488]">{item.email}</div>
                                  </td>
                                  <td className="px-2 py-2">{item.studied}</td>
                                  <td className="px-2 py-2">{item.accuracy}%</td>
                                  <td className="px-2 py-2">{item.wrong}</td>
                                  <td className="px-2 py-2">{item.saved}</td>
                                  <td className="px-2 py-2">
                                    {item.lastAttempt ? new Date(item.lastAttempt).toLocaleDateString() : "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  <label className="block text-sm">
                    <span className="mb-1 block text-[#526171]">문제 개수</span>
                    <input
                      className="h-10 w-full rounded-md border border-[#cfd7e2] px-3 outline-none focus:border-[#245c7a]"
                      type="number"
                      min={3}
                      max={120}
                      value={count}
                      onChange={(event) => setCount(Number(event.target.value))}
                    />
                  </label>
                  <div>
                    <span className="mb-1 block text-sm text-[#526171]">문제세트 모드</span>
                    <div className="grid grid-cols-2 rounded-md bg-[#f2f4f7] p-1">
                      {([
                        ["study", "공부모드"],
                        ["exam", "시험모드"],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          className={`h-9 rounded text-sm font-medium ${sessionMode === value ? "bg-white shadow-sm" : "text-[#667488]"}`}
                          onClick={() => setSessionMode(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="mb-1 block text-sm text-[#526171]">출제 방식</span>
                    <div className="grid grid-cols-3 rounded-md bg-[#f2f4f7] p-1">
                      {(Object.keys(modeLabels) as QuizMode[]).map((item) => (
                        <button
                          key={item}
                          className={`h-9 rounded text-sm font-medium ${mode === item ? "bg-white shadow-sm" : "text-[#667488]"}`}
                          onClick={() => setMode(item)}
                        >
                          {modeLabels[item]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="mb-1 block text-sm text-[#526171]">과목 선택</span>
                    <div className="grid grid-cols-2 gap-1 rounded-md bg-[#f2f4f7] p-1 sm:grid-cols-4">
                      {(["all", ...categories] as CategoryFilter[]).map((item) => (
                        <button
                          key={item}
                          className={`h-9 rounded text-sm font-medium ${categoryFilter === item ? "bg-white shadow-sm" : "text-[#667488]"}`}
                          onClick={() => setCategoryFilter(item)}
                        >
                          {categoryFilterLabels[item]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {mode !== "multiple" ? (
                    <div>
                      <span className="mb-1 block text-sm text-[#526171]">암기 범위</span>
                      <div className="grid grid-cols-2 rounded-md bg-[#f2f4f7] p-1">
                        <button
                          className={`h-9 rounded text-sm font-medium ${!formulaOnly ? "bg-white shadow-sm" : "text-[#667488]"}`}
                          onClick={() => setFormulaOnly(false)}
                        >
                          요점정리 전체
                        </button>
                        <button
                          className={`h-9 rounded text-sm font-medium ${formulaOnly ? "bg-white shadow-sm" : "text-[#667488]"}`}
                          onClick={() => setFormulaOnly(true)}
                        >
                          공식외우기
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-[#667488]">
                        {categoryFilterLabels[categoryFilter]} {formulaOnly ? "공식" : "암기"} {filteredSummaryQuestions.length.toLocaleString()}개
                      </p>
                    </div>
                  ) : null}
                  <p className="rounded-md border border-[#e2e8f0] bg-[#fbfcfd] px-3 py-2 text-xs text-[#667488]">
                    현재 선택 조건으로 출제 가능한 문제 {selectedPoolSize.toLocaleString()}개
                  </p>
                  <label className="block text-sm">
                    <span className="mb-1 block text-[#526171]">문제세트 이름</span>
                    <input
                      className="h-10 w-full rounded-md border border-[#cfd7e2] px-3 outline-none focus:border-[#245c7a]"
                      value={quizSetTitle}
                      onChange={(event) => setQuizSetTitle(event.target.value)}
                      placeholder="비워 두면 자동 이름으로 저장"
                    />
                  </label>
                  <button
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#245c7a] font-medium text-white hover:bg-[#1f506a]"
                    onClick={() => void startQuiz(false)}
                    disabled={selectedPoolSize === 0 || isSavingQuizSet}
                  >
                    <Shuffle size={16} />
                    {isSavingQuizSet ? "생성·저장 중" : "랜덤 생성·저장"}
                  </button>
                  <button
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#cfd7e2] bg-white font-medium hover:bg-[#f2f4f7]"
                    onClick={() => void startQuiz(true)}
                    disabled={wrongBank.length === 0}
                  >
                    <RotateCcw size={16} />
                    오답 복습
                  </button>
                  <button
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#cfd7e2] bg-white font-medium hover:bg-[#f2f4f7] disabled:opacity-40"
                    onClick={startSavedReview}
                    disabled={savedBank.length === 0}
                  >
                    <Bookmark size={16} />
                    저장 복습 ({savedBank.length})
                  </button>
                  <section className="rounded-md border border-[#e2e8f0] bg-[#fbfcfd] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold">문제세트</h2>
                      <span className="text-xs text-[#667488]">{visibleQuizSets.length}개</span>
                    </div>
                    {queue.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <input
                          className="h-10 w-full rounded-md border border-[#cfd7e2] px-3 text-sm outline-none focus:border-[#245c7a]"
                          value={quizSetTitle}
                          onChange={(event) => setQuizSetTitle(event.target.value)}
                          placeholder="문제세트 이름"
                        />
                        <button
                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#cfd7e2] bg-white text-sm font-medium hover:bg-[#f2f4f7] disabled:opacity-40"
                          onClick={handleSaveQuizSet}
                          disabled={isSavingQuizSet}
                        >
                          <Save size={16} />
                          {isSavingQuizSet ? "저장 중" : "현재 문제세트 저장"}
                        </button>
                      </div>
                    ) : null}
                    {quizSetMessage ? <p className="mt-2 text-xs text-[#8a5a00]">{quizSetMessage}</p> : null}
                    <div className="mt-3 rounded-md border border-[#dbe3ef] bg-[#f8fafc] p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-[#0f172a]">특강문제</h3>
                        <span className="text-xs text-[#667488]">회원공통 · 삭제불가</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 rounded-md bg-[#eef2f6] p-1">
                        {(["전기회로", "전기기기", "전기설비"] as LectureSubject[]).map((subject) => (
                          <button
                            key={subject}
                            className={[
                              "h-8 rounded text-xs font-medium",
                              lectureSubject === subject
                                ? "bg-white text-[#0f172a] shadow-sm"
                                : "text-[#667488] hover:bg-white/70",
                            ].join(" ")}
                            onClick={() => setLectureSubject(subject)}
                          >
                            {subject}
                          </button>
                        ))}
                      </div>
                      {activeLectureSets.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {activeLectureSets.map((lectureSet) => (
                            <div
                              key={lectureSet.id}
                              className="rounded-md border border-[#e2e8f0] bg-white px-3 py-2"
                            >
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <BookOpen size={15} />
                                <span className="min-w-0 flex-1 truncate">{lectureSet.title}</span>
                                <span className="text-xs font-normal text-[#667488]">{lectureSet.questionCount}문제</span>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-1">
                                <button
                                  className="h-8 rounded-md border border-[#cfd7e2] bg-white text-xs font-medium hover:bg-[#f2f4f7]"
                                  onClick={() => startQuizSet(lectureSet, "study")}
                                >
                                  공부모드
                                </button>
                                <button
                                  className="h-8 rounded-md border border-[#245c7a] bg-[#eaf2f6] text-xs font-medium text-[#245c7a] hover:bg-[#dcecf4]"
                                  onClick={() => startQuizSet(lectureSet, "exam")}
                                >
                                  시험모드
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 rounded-md border border-dashed border-[#cfd7e2] bg-white px-3 py-2 text-xs text-[#667488]">
                          이 과목의 특강문제는 준비 중입니다.
                        </p>
                      )}
                    </div>
                    {visibleQuizSets.length > 0 ? (
                      <div className="mt-3 max-h-64 space-y-2 overflow-auto">
                        {visibleQuizSets.slice(0, 12).map((savedSet) => (
                          <div
                            key={savedSet.id}
                            className="flex items-start gap-2 rounded-md border border-[#e2e8f0] bg-white px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <button
                                className="w-full text-left hover:text-[#245c7a]"
                                onClick={() => startQuizSet(savedSet)}
                              >
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <FolderOpen size={15} />
                                  <span className="min-w-0 flex-1 truncate">{savedSet.title}</span>
                                </div>
                                <div className="mt-1 text-xs text-[#667488]">
                                  {savedSet.questionCount}문제 · {modeLabels[savedSet.mode] ?? savedSet.mode} ·{" "}
                                  {new Date(savedSet.createdAt).toLocaleDateString()}
                                </div>
                              </button>
                              <div className="mt-2 grid grid-cols-2 gap-1">
                                <button
                                  className="h-8 rounded-md border border-[#cfd7e2] bg-white text-xs font-medium hover:bg-[#f2f4f7]"
                                  onClick={() => startQuizSet(savedSet, "study")}
                                >
                                  공부
                                </button>
                                <button
                                  className="h-8 rounded-md border border-[#245c7a] bg-[#eaf2f6] text-xs font-medium text-[#245c7a] hover:bg-[#dcecf4]"
                                  onClick={() => startQuizSet(savedSet, "exam")}
                                >
                                  시험
                                </button>
                              </div>
                            </div>
                            {builtinReviewSetIds.includes(savedSet.id) ? (
                              <span className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-[#cfd7e2] px-2 text-xs font-medium text-[#526171]">
                                기본
                              </span>
                            ) : (
                              <button
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#f1c7c7] text-[#a33a3a] hover:bg-[#fff1f1]"
                              onClick={() => handleDeleteQuizSet(savedSet)}
                              title="문제세트 삭제"
                              aria-label={`${savedSet.title} 삭제`}
                            >
                              <Trash2 size={15} />
                            </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-[#667488]">생성한 문제 묶음을 저장하면 여기에 표시됩니다.</p>
                    )}
                  </section>
                </div>
              )}
            </section>

            <section className="min-h-[calc(100svh-4rem)] bg-white p-4 sm:p-6 lg:min-h-[620px] lg:rounded-lg lg:border lg:border-[#dce2ea]">
              {isCompleteScreen ? (
                <div className="flex h-full min-h-[540px] items-center justify-center text-center">
                  <div className="max-w-sm">
                    {sessionMode === "exam" ? (
                      <>
                        <Check className="mx-auto mb-3 text-[#245c7a]" size={38} />
                        <p className="text-lg font-semibold text-[#17202a]">시험 완료</p>
                        <p className="mt-2 text-sm leading-6 text-[#526171]">
                          점수 {examScorePercent}점 · {examCorrectCount}/{queue.length} 정답
                        </p>
                        <div className="mt-4 rounded-md border border-[#dce2ea] bg-[#fbfcfd] px-4 py-3 text-sm text-[#344252]">
                          틀린 문제 {examWrongItems.length}개
                        </div>
                        <div className="mt-5 grid gap-2 sm:grid-cols-2">
                          <button
                            className="h-10 rounded-md bg-[#245c7a] px-4 font-medium text-white disabled:opacity-40"
                            onClick={startExamWrongReview}
                            disabled={examWrongItems.length === 0}
                          >
                            틀린 문제 반복 학습
                          </button>
                          <button
                            className="h-10 rounded-md border border-[#cfd7e2] px-4 font-medium hover:bg-[#f2f4f7] disabled:opacity-40"
                            onClick={() => void startQuiz(false)}
                          >
                            새 랜덤 생성
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <Check className="mx-auto mb-3 text-[#27633f]" size={38} />
                        <p className="text-lg font-semibold text-[#17202a]">퀴즈 완료</p>
                        <p className="mt-2 text-sm leading-6 text-[#526171]">
                          이번 문제세트의 모든 카드를 맞혔습니다.
                        </p>
                        <div className="mt-5 grid gap-2 sm:grid-cols-2">
                          <button
                            className="h-10 rounded-md bg-[#245c7a] px-4 font-medium text-white disabled:opacity-40"
                            onClick={() => void startQuiz(false)}
                          >
                            새 랜덤 생성
                          </button>
                          <button
                            className="h-10 rounded-md border border-[#cfd7e2] px-4 font-medium hover:bg-[#f2f4f7] disabled:opacity-40"
                            onClick={() => void startQuiz(true)}
                            disabled={wrongBank.length === 0}
                          >
                            오답 복습
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : !current || !parsed ? (
                <div className="flex h-full min-h-[540px] items-center justify-center text-center text-[#667488]">
                  <div>
                    <BookOpen className="mx-auto mb-3" size={34} />
                    <p className="font-medium text-[#17202a]">문제 세트를 생성하세요</p>
                    <p className="mt-1 text-sm">회로·기기·설비가 동일 비율로 출제됩니다.</p>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[540px] flex-col">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#526171]">
                    <span className="rounded-full bg-[#eaf2f6] px-2 py-1 text-[#245c7a]">{current.question.category}</span>
                    <span>
                      {current.question.round === 0
                        ? current.question.date
                        : `${current.question.year}년 ${current.question.round}회`}
                    </span>
                    <span>{current.question.number}번</span>
                    <span>{modeLabels[activeMode]}</span>
                    <span>{sessionMode === "exam" ? "시험모드" : "공부모드"}</span>
                    <span>남은 문제 {remaining}</span>
                    <button
                      className={`ml-auto inline-flex h-8 items-center gap-1 rounded-md border px-2 font-medium ${
                        isCurrentSaved
                          ? "border-[#245c7a] bg-[#eaf2f6] text-[#245c7a]"
                          : "border-[#dce2ea] bg-white text-[#526171] hover:bg-[#f2f4f7]"
                      }`}
                      onClick={toggleSavedCard}
                      title={isCurrentSaved ? "저장 해제" : "저장"}
                    >
                      {isCurrentSaved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
                      {isCurrentSaved ? "저장됨" : "저장"}
                    </button>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-[#667488]">
                      <span>진행률</span>
                      <span>
                        {solvedCount}/{queue.length} ({progressPercent}%)
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#e8edf3]">
                      <div
                        className="h-full rounded-full bg-[#245c7a] transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex-1">
                    <div className={`${isBack ? "hidden lg:block" : "block"} rounded-lg border border-[#dce2ea] bg-[#fbfcfd] p-4`}>
                      <div className="whitespace-pre-wrap text-[15px] leading-7">
                        {activeMode === "blank" ? blankPrompt : parsed.prompt}
                      </div>
                      {current.question.images.length > 0 ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {current.question.images.map((src) => (
                            <img key={src} src={src} alt="" className="max-h-72 rounded border border-[#dce2ea] bg-white object-contain" />
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {activeMode === "multiple" ? (
                      <div className={`${isBack ? "hidden lg:grid" : "grid"} mt-4 gap-2`}>
                        {parsed.choices.map((choice) => (
                          <button
                            key={`${choice.label}-${choice.text}`}
                            className={`rounded-md border px-3 py-3 text-left text-sm leading-6 ${
                              selected === choice.label ? "border-[#245c7a] bg-[#eaf2f6]" : "border-[#dce2ea] hover:bg-[#f7f9fb]"
                            }`}
                            onClick={() => setSelected(choice.label)}
                            disabled={isBack}
                          >
                            <span className="mr-2 font-semibold">{choice.label}</span>
                            {choice.text}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {isBack ? (
                      <div
                        className={`mt-4 rounded-lg border p-4 ${
                          result === "correct"
                            ? "border-[#a8d8bd] bg-[#f1fbf5]"
                            : result === "wrong"
                              ? "border-[#f0c2bd] bg-[#fff6f4]"
                              : "border-[#dce2ea] bg-white"
                        }`}
                      >
                        {result ? (
                          <div className="flex items-center gap-2 font-semibold">
                            {result === "correct" ? <Check size={18} /> : <X size={18} />}
                            {result === "correct" ? "OK" : "Fail"}
                          </div>
                        ) : null}
                        <p className="mt-2 text-sm">
                          정답: <strong>{activeMode === "blank" ? blankCorrectAnswer : parsed.correctText || current.question.answer}</strong>
                        </p>
                        {current.question.explanation ? (
                          <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#344252]">
                            {displayMathText(current.question.explanation)}
                          </div>
                        ) : null}
                        {activeMode === "blank" && !result ? (
                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <button
                              className="h-10 rounded-md border border-[#f0c2bd] bg-[#fff6f4] font-medium text-[#8a2f25] hover:bg-[#ffece8]"
                              onClick={() => rateBlankCard("Fail")}
                            >
                              Fail
                            </button>
                            <button
                              className="h-10 rounded-md border border-[#a8d8bd] bg-[#f1fbf5] font-medium text-[#27633f] hover:bg-[#e5f7ec]"
                              onClick={() => rateBlankCard("OK")}
                            >
                              OK
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {!isBack ? (
                      <button
                        className="h-10 rounded-md bg-[#245c7a] px-4 font-medium text-white disabled:opacity-40"
                        onClick={submitCurrent}
                        disabled={activeMode === "multiple" ? !selected : false}
                      >
                        {activeMode === "blank" ? "정답 보기" : "제출"}
                      </button>
                    ) : activeMode === "blank" && !result ? null : (
                      <button className="h-10 rounded-md bg-[#245c7a] px-4 font-medium text-white" onClick={nextCard}>
                        다음
                      </button>
                    )}
                    {activeMode === "multiple" && sessionMode === "study" ? (
                      <button
                        className="h-10 rounded-md border border-[#cfd7e2] px-4 font-medium hover:bg-[#f2f4f7] disabled:opacity-40"
                        onClick={() => setIsBack(true)}
                        disabled={isBack}
                      >
                        뒤집기
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

