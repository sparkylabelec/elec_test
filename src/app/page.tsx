"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Bookmark, BookmarkCheck, BookOpen, Check, Eye, EyeOff, LogOut, RotateCcw, Shuffle, X } from "lucide-react";
import {
  categories,
  getBalancedRandomQuestions,
  getBalancedSummaryBlankQuestions,
  questions,
  shuffle,
  summaryBlankQuestions,
} from "@/lib/questions";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase";
import { cleanMathText, nextProgress, parseCard } from "@/lib/quiz";
import {
  readLocalProgress,
  readLocalSavedQuestionIds,
  readRemoteProgress,
  readSavedQuestionIds,
  saveAttempt,
  saveCardBookmark,
  writeLocalProgress,
  writeLocalSavedQuestionIds,
} from "@/lib/storage";
import type { CardProgress, QuizMode, QuizQuestion } from "@/lib/types";

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

const modeLabels: Record<QuizMode, string> = {
  multiple: "객관식",
  blank: "암기모드",
  mixed: "혼합",
};

const pendingProfileKey = (emailValue: string) => `pending-profile:${emailValue.trim().toLowerCase()}`;

export default function Home() {
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [user, setUser] = useState<UserState | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [count, setCount] = useState(30);
  const [mode, setMode] = useState<QuizMode>("multiple");
  const [queue, setQueue] = useState<QuizItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isBack, setIsBack] = useState(false);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | "">("");
  const [progress, setProgress] = useState<Record<string, CardProgress>>({});
  const [savedQuestionIds, setSavedQuestionIds] = useState<string[]>([]);
  const [adminStats, setAdminStats] = useState<AdminMemberStats[]>([]);
  const [adminMessage, setAdminMessage] = useState("");
  const [isLoadingAdminStats, setIsLoadingAdminStats] = useState(false);
  const [nowTs, setNowTs] = useState(0);

  const supabase = getSupabaseBrowserClient();
  const current = queue[currentIndex];
  const parsed = useMemo(() => (current ? parseCard(current.question) : null), [current]);
  const allQuestions = useMemo(() => [...questions, ...summaryBlankQuestions], []);
  const activeMode = current?.mode ?? "multiple";
  const blankPrompt = current && activeMode === "blank" ? cleanMathText(current.question.question) : "";
  const blankCorrectAnswer = current && activeMode === "blank" ? cleanMathText(current.question.answer) : "";
  const remaining = queue.filter((item) => !item.solved).length;
  const solvedCount = queue.filter((item) => item.solved).length;
  const progressPercent = queue.length > 0 ? Math.round((solvedCount / queue.length) * 100) : 0;
  const userStorageKey = user?.id ?? user?.email ?? "local";
  const isCurrentSaved = current ? savedQuestionIds.includes(current.question.id) : false;
  const wrongBank = useMemo(
    () =>
      allQuestions.filter(
        (question) => (progress[question.id]?.wrong ?? 0) > 0,
      ),
    [allQuestions, progress],
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
      return toItems(getBalancedSummaryBlankQuestions(requestedCount), "blank");
    }

    if (requestedMode === "multiple") {
      return toItems(getBalancedRandomQuestions(requestedCount), "multiple");
    }

    const blankCount = Math.max(1, Math.floor(requestedCount / 2));
    const multipleCount = Math.max(1, requestedCount - blankCount);
    return shuffle([
      ...toItems(getBalancedRandomQuestions(multipleCount), "multiple"),
      ...toItems(getBalancedSummaryBlankQuestions(blankCount), "blank"),
    ]).slice(0, requestedCount);
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage("");

    if (!hasSupabaseEnv() || !supabase) {
      setUser({
        email,
        username: username || email.split("@")[0] || "local",
        fullName: fullName || username || email.split("@")[0] || "local",
        isAdmin: false,
      });
      setAuthMessage("Supabase 환경변수가 없어 로컬 모드로 시작했습니다.");
      return;
    }

    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) {
        setAuthMessage(error.message);
        return;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(pendingProfileKey(email), JSON.stringify({ username, fullName }));
      }
      if (data.user) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: data.user.id,
          email,
          username,
          full_name: fullName,
          updated_at: new Date().toISOString(),
        });
        if (profileError && !data.session) {
          setAuthMessage("가입 확인 메일을 확인하세요. 이름은 첫 로그인 때 저장됩니다.");
          return;
        }
      }
      setAuthMessage("가입 확인 메일을 확인하세요.");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user?.email) {
      setAuthMessage(error?.message ?? "로그인에 실패했습니다.");
      return;
    }
    await applyAuthenticatedUser(data.user);
  }

  async function handlePasswordReset() {
    setAuthMessage("");
    if (!email) {
      setAuthMessage("비밀번호 재설정 메일을 받을 이메일을 입력하세요.");
      return;
    }

    if (!hasSupabaseEnv() || !supabase) {
      setAuthMessage("로컬 모드에서는 비밀번호 재설정을 사용할 수 없습니다.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    });

    setAuthMessage(error ? error.message : "비밀번호 재설정 메일을 보냈습니다.");
  }

  async function handleLogout() {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setQueue([]);
  }

  function startQuiz(nextReviewOnly = false) {
    const pool = nextReviewOnly
      ? wrongBank
      : mode === "blank"
        ? summaryBlankQuestions
        : mode === "multiple"
          ? questions
          : [...questions, ...summaryBlankQuestions];
    if (pool.length === 0) return;
    setQueue(buildItems(pool, Math.min(count, pool.length), mode, nextReviewOnly));
    setCurrentIndex(0);
    setIsBack(false);
    setSelected("");
    setResult("");
  }

  function startSavedReview() {
    if (savedBank.length === 0) return;
    setQueue(buildItems(savedBank, Math.min(count, savedBank.length), mode, true));
    setCurrentIndex(0);
    setIsBack(false);
    setSelected("");
    setResult("");
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

    setQueue((items) => {
      const copy = [...items];
      const updated = { ...copy[currentIndex], tries: copy[currentIndex].tries + 1 };
      if (isCorrect) {
        updated.solved = true;
        copy[currentIndex] = updated;
      } else {
        copy[currentIndex] = updated;
        copy.push({ ...updated, solved: false });
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
    setCurrentIndex(next >= 0 ? next : Math.min(currentIndex + 1, queue.length - 1));
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
              onClick={() => startQuiz(true)}
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
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#dce2ea] bg-white hover:bg-[#f2f4f7]"
                  onClick={handleLogout}
                  title="로그아웃"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : null}
          </header>

          <div className="grid flex-1 gap-5 p-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:p-6">
            <section className="h-fit rounded-lg border border-[#dce2ea] bg-white p-4">
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
                          placeholder="홍길동"
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
                        />
                      </label>
                    </>
                  ) : null}
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
                  <button className="h-10 w-full rounded-md bg-[#245c7a] font-medium text-white hover:bg-[#1f506a]">
                    {authMode === "login" ? "로그인" : "가입"}
                  </button>
                  {authMode === "login" ? (
                    <button
                      type="button"
                      className="h-9 w-full rounded-md border border-[#cfd7e2] bg-white text-sm font-medium hover:bg-[#f2f4f7]"
                      onClick={handlePasswordReset}
                    >
                      비밀번호 찾기
                    </button>
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
                  <button
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#245c7a] font-medium text-white hover:bg-[#1f506a]"
                    onClick={() => startQuiz(false)}
                  >
                    <Shuffle size={16} />
                    랜덤 생성
                  </button>
                  <button
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#cfd7e2] bg-white font-medium hover:bg-[#f2f4f7]"
                    onClick={() => startQuiz(true)}
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
                </div>
              )}
            </section>

            <section className="min-h-[620px] rounded-lg border border-[#dce2ea] bg-white p-4 sm:p-6">
              {!current || !parsed ? (
                <div className="flex h-full min-h-[540px] items-center justify-center text-center text-[#667488]">
                  <div>
                    <BookOpen className="mx-auto mb-3" size={34} />
                    <p className="font-medium text-[#17202a]">문제 세트를 생성하세요.</p>
                    <p className="mt-1 text-sm">회로·기기·설비가 동일 비율로 섞입니다.</p>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[540px] flex-col">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#526171]">
                    <span className="rounded-full bg-[#eaf2f6] px-2 py-1 text-[#245c7a]">{current.question.category}</span>
                    <span>
                      {current.question.date === "요점정리"
                        ? "요점정리"
                        : `${current.question.year}년 제${current.question.round}회`}
                    </span>
                    <span>{current.question.number}번</span>
                    <span>{modeLabels[activeMode]}</span>
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
                    <div className="rounded-lg border border-[#dce2ea] bg-[#fbfcfd] p-4">
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
                      <div className="mt-4 grid gap-2">
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
                            {cleanMathText(current.question.explanation)}
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
                    {activeMode === "multiple" ? (
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
