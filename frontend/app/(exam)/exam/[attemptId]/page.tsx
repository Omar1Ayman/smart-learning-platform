"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { ExamTimer } from "@/components/exam/ExamTimer";
import { ReviewPanel } from "@/components/exam/ReviewPanel";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState, Spinner } from "@/components/ui/States";
import { Flag } from "@/components/ui/icons";
import {
  getAttempt,
  recordAttemptEvent,
  saveAnswer,
  submitAttempt,
} from "@/lib/api/attempts";
import { extractErrorMessage, toastSuccess, toastWarning } from "@/lib/utils/toast";
import type {
  AttemptAnswerState,
  AttemptEventType,
  AttemptQuestion,
} from "@/types";

const FLAGS_STORAGE_PREFIX = "exam_flags:";
/**
 * Batch 8: fullscreen support detection.
 *
 * `requestFullscreen` on document.documentElement is NOT supported on
 * iOS Safari (only on <video> elements). Without this check, the exam
 * page's fullscreen blocker becomes a permanent dead-end on iPhones.
 */
function isFullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}
function loadFlags(attemptId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${FLAGS_STORAGE_PREFIX}${attemptId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveFlags(attemptId: string, flags: Set<string>) {
  try {
    localStorage.setItem(
      `${FLAGS_STORAGE_PREFIX}${attemptId}`,
      JSON.stringify(Array.from(flags))
    );
  } catch {
    // ignore — flags remain in memory for this session
  }
}

export default function ExamPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const router = useRouter();

  const {
    data: attempt,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["attempt", attemptId],
    queryFn: () => getAttempt(attemptId),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const [answers, setAnswers] = useState<Record<string, AttemptAnswerState>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  // A3.4 (Milestone 1, Batch 4): track questions that JUST saved
  // successfully so we can flash "✓ تم الحفظ" for 1.5s.
  const [recentlySaved, setRecentlySaved] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [eventsCount, setEventsCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [reviewMode, setReviewMode] = useState(false);
  const [savingExit, setSavingExit] = useState(false);
  const [fullscreenBypassed, setFullscreenBypassed] = useState(false);

  const seeded = useRef(false);
  const listenersAttached = useRef(false);
  const autoSubmittedRef = useRef(false);
  const currentIndexRef = useRef(0);
  const suppressExitWarning = useRef(false);
  const pendingPayloadsRef = useRef<
    Map<string, { chosen_option?: string | null; text_answer?: string }>
  >(new Map());

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    if (!attempt || seeded.current) return;
    seeded.current = true;
    setAnswers(attempt.answers || {});
    setSecondsLeft(attempt.time_remaining_seconds);
    setFlaggedIds(loadFlags(attemptId));
  }, [attempt, attemptId]);

  const policy = attempt?.tenant_policies ?? {
    force_fullscreen: false,
    auto_submit_after_tab_switches: 0,
  };

  // ---- Timer tick ----
  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const timer = setTimeout(() => {
      setSecondsLeft((s) => (s === null ? null : Math.max(0, s - 1)));
    }, 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  // ---- A3.2 (Milestone 1, Batch 4): progressive timer warnings ----
  // Fires at T-15, T-5, T-1. Each fires ONCE. The first tick seeds the
  // refs so a late-joining student doesn't get retroactive warnings.
  const warnedRef = useRef({ fifteenMin: false, fiveMin: false, oneMin: false });
  const prevMinuteRef = useRef<number | null>(null);
  useEffect(() => {
    if (secondsLeft === null) return;
    const currentMinute = Math.ceil(secondsLeft / 60);
    const prevMinute = prevMinuteRef.current;
    prevMinuteRef.current = currentMinute;

    if (prevMinute === null) {
      // First tick — mark already-crossed thresholds to avoid
      // retroactive warnings on a late join.
      if (currentMinute <= 15) warnedRef.current.fifteenMin = true;
      if (currentMinute <= 5) warnedRef.current.fiveMin = true;
      if (currentMinute <= 1) warnedRef.current.oneMin = true;
      return;
    }
    if (
      !warnedRef.current.fifteenMin &&
      prevMinute > 15 &&
      currentMinute <= 15
    ) {
      warnedRef.current.fifteenMin = true;
      toastWarning("⏱️ تبقى 15 دقيقة على انتهاء الامتحان");
    }
    if (
      !warnedRef.current.fiveMin &&
      prevMinute > 5 &&
      currentMinute <= 5
    ) {
      warnedRef.current.fiveMin = true;
      toastWarning("⏱️ تبقى 5 دقائق على انتهاء الامتحان");
    }
    if (
      !warnedRef.current.oneMin &&
      prevMinute > 1 &&
      currentMinute <= 1
    ) {
      warnedRef.current.oneMin = true;
      toastWarning("⚠️ تبقى دقيقة واحدة فقط — احفظ إجاباتك الآن!");
    }
  }, [secondsLeft]);

  // ---- Submit ----
  const submitMutation = useMutation({
    mutationFn: () => submitAttempt(attemptId),
    onSuccess: async () => {
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          // ignore
        }
      }
      toastSuccess("تم تسليم الامتحان");
      router.replace(`/results/${attemptId}`);
    },
    onError: (err) => setSaveError(extractErrorMessage(err, "تعذّر تسليم الامتحان.")),
  });

  // ---- Fullscreen tracking ----
  useEffect(() => {
    function onFsChange() {
      const isFs = !!document.fullscreenElement;
      setFullscreenActive(isFs);
      if (
        !isFs &&
        attempt?.status === "IN_PROGRESS" &&
        !submitMutation.isPending &&
        !suppressExitWarning.current  // Batch 8: Save & Exit bypasses this
      ) {
        setShowExitWarning(true);
      }
    }
    document.addEventListener("fullscreenchange", onFsChange);
    setFullscreenActive(!!document.fullscreenElement);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [attempt?.status, submitMutation.isPending]);

  // ---- Auto-submit handler (C-6) ----
  function handleAutoSubmitted(reason?: string) {
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    setAutoSubmitted(true);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    toastWarning(
      `تم تسليم الامتحان تلقائيًا${reason ? ` (${reason})` : ""}. سيتم تحويلك لصفحة النتيجة.`
    );
    setTimeout(() => router.replace(`/results/${attemptId}`), 1200);
  }

  // ---- Anti-cheat event listeners ----
  useEffect(() => {
    if (!attempt || attempt.status !== "IN_PROGRESS" || listenersAttached.current) return;
    listenersAttached.current = true;

    const lastFire: Record<string, number> = {};
    const DEBOUNCE_MS = 1500;

    async function fire(type: AttemptEventType, metadata?: Record<string, unknown>) {
      if (autoSubmittedRef.current) return;
      const now = Date.now();
      const prev = lastFire[type] ?? 0;
      if (now - prev < DEBOUNCE_MS) return;
      lastFire[type] = now;
      const response = await recordAttemptEvent(attemptId, type, metadata);
      setEventsCount((c) => c + 1);
      if (response?.detail === "auto_submitted") {
        handleAutoSubmitted(response.reason);
      }
    }

    function onVisibilityChange() {
      if (document.hidden) fire("TAB_HIDDEN");
    }
    function onCopy(e: ClipboardEvent) {
      if (e.target instanceof HTMLElement) fire("COPY_ATTEMPT");
    }
    function onPaste(e: ClipboardEvent) {
      const t = e.target;
      if (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) {
        fire("PASTE_ATTEMPT");
      }
    }
    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
      fire("RIGHT_CLICK");
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, attemptId]);

  // ---- Redirect on external state change ----
  useEffect(() => {
    if (
      attempt &&
      attempt.status !== "IN_PROGRESS" &&
      !submitMutation.isPending &&
      !autoSubmittedRef.current
    ) {
      router.replace(`/results/${attemptId}`);
    }
  }, [attempt, attemptId, router, submitMutation.isPending]);

  // ---- Auto-submit on zero ----
  useEffect(() => {
    if (
      secondsLeft === 0 &&
      attempt?.status === "IN_PROGRESS" &&
      !submitMutation.isPending &&
      !autoSubmittedRef.current
    ) {
      submitMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, attempt?.status]);

  // ---- Save (autosave) ----
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function queueSave(
    questionId: string,
    payload: { chosen_option?: string | null; text_answer?: string }
  ) {
    if (autoSubmittedRef.current) return;
    if (saveTimers.current[questionId]) clearTimeout(saveTimers.current[questionId]);
    // Batch 8: register the payload so Save & Exit can flush it.
    pendingPayloadsRef.current.set(questionId, payload);
    setSavingIds((s) => new Set(s).add(questionId));
    setSaveError(null);
    saveTimers.current[questionId] = setTimeout(async () => {
      pendingPayloadsRef.current.delete(questionId);
      try {
        await saveAnswer(attemptId, questionId, payload.chosen_option, payload.text_answer);
        // A3.4: flash "✓ تم الحفظ" for 1.5s.
        setRecentlySaved((s) => new Set(s).add(questionId));
        setTimeout(() => {
          setRecentlySaved((s) => {
            const next = new Set(s);
            next.delete(questionId);
            return next;
          });
        }, 1500);
      } catch (err) {
        if (autoSubmittedRef.current) return;
        setSaveError(extractErrorMessage(err, "تعذّر حفظ إجابتك."));
      } finally {
        setSavingIds((s) => {
          const next = new Set(s);
          next.delete(questionId);
          return next;
        });
      }
    }, 400);
  }

  const handleOptionChange = useCallback(
    (q: AttemptQuestion, optionId: string) => {
      if (autoSubmittedRef.current) return;
      setAnswers((prev) => ({ ...prev, [q.id]: { chosen_option: optionId, text_answer: "" } }));
      queueSave(q.id, { chosen_option: optionId, text_answer: "" });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleTextChange = useCallback(
    (q: AttemptQuestion, text: string) => {
      if (autoSubmittedRef.current) return;
      setAnswers((prev) => ({ ...prev, [q.id]: { chosen_option: null, text_answer: text } }));
      queueSave(q.id, { chosen_option: null, text_answer: text });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const toggleFlag = useCallback(
    (qId: string) => {
      setFlaggedIds((prev) => {
        const next = new Set(prev);
        if (next.has(qId)) next.delete(qId);
        else next.add(qId);
        saveFlags(attemptId, next);
        return next;
      });
    },
    [attemptId]
  );

  // ---- Keyboard shortcuts (F-15) ----
  useEffect(() => {
    if (!attempt || attempt.status !== "IN_PROGRESS") return;
    if (autoSubmittedRef.current) return;

    function handler(e: KeyboardEvent) {
      // Don't intercept when review panel is open.
      if (reviewMode) return;

      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const idx = currentIndexRef.current;
      const currentQ = attempt!.questions[idx];
      if (!currentQ) return;

      // 1-9 → select option
      if (/^[1-9]$/.test(e.key)) {
        const optIdx = parseInt(e.key, 10) - 1;
        const opt = currentQ.options[optIdx];
        if (opt) {
          e.preventDefault();
          handleOptionChange(currentQ, opt.id);
        }
        return;
      }

      // Arrow navigation
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(attempt!.questions.length - 1, i + 1));
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFlag(currentQ.id);
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        setReviewMode(true);
      }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [attempt, reviewMode, handleOptionChange, toggleFlag]);

  // ---- Fullscreen request ----
  async function requestFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
      setShowExitWarning(false);
    } catch {
      setSaveError("المتصفح منع الدخول للشاشة الكاملة. اسمح بالصلاحية ثم أعد المحاولة.");
    }
  }

  function handleExitWarningSubmit() {
    setShowExitWarning(false);
    submitMutation.mutate();
  }

  function handleExitWarningReenter() {
    setShowExitWarning(false);
    requestFullscreen();
  }

  function handleSubmitFromReview() {
    setReviewMode(false);
    setShowSubmitConfirm(true);
  }
    
  async function handleSaveAndExit() {
    if (savingExit) return;
    setSavingExit(true);
    setSaveError(null);

    Object.values(saveTimers.current).forEach(clearTimeout);
    saveTimers.current = {};

    const pending = Array.from(pendingPayloadsRef.current.entries());
    pendingPayloadsRef.current.clear();

    if (pending.length > 0) {
      try {
        await Promise.all(
          pending.map(([qid, payload]) =>
            saveAnswer(attemptId, qid, payload.chosen_option, payload.text_answer)
          )
        );
      } catch (err) {
        setSaveError(
          extractErrorMessage(
            err,
            "تعذّر حفظ بعض الإجابات. حاول مرة أخرى قبل المغادرة."
          )
        );
        setSavingExit(false);
        return;
      }
    }

    suppressExitWarning.current = true;

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // ignore — most browsers grant this after a user gesture
      }
    }

    // 5. Navigate.
    toastSuccess("تم حفظ إجاباتك. يمكنك الاستئناف من صفحة الامتحانات.");
    router.push("/assessments");
  }

  if (isLoading) return <Spinner />;
  if (isError || !attempt) return <ErrorState message="تعذّر تحميل الامتحان." />;
  if (attempt.status !== "IN_PROGRESS") return <Spinner />;

  const totalQuestions = attempt.questions.length;
  const currentQuestion = attempt.questions[currentIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const isAnswered = (qId: string) => {
    const a = answers[qId];
    return !!a && (!!a.chosen_option || a.text_answer.trim().length > 0);
  };
  const answeredCount = attempt.questions.filter((q) => isAnswered(q.id)).length;
  const unansweredCount = totalQuestions - answeredCount;
  const isSavingAny = savingIds.size > 0;
  const isLast = currentIndex === totalQuestions - 1;
  const isFirst = currentIndex === 0;
  const progressPct = (answeredCount / totalQuestions) * 100;
  const currentIsFlagged = currentQuestion ? flaggedIds.has(currentQuestion.id) : false;
  const currentJustSaved = currentQuestion ? recentlySaved.has(currentQuestion.id) : false;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-paper">
      {policy.force_fullscreen && !fullscreenActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur">
          {isFullscreenSupported() ? (
            // Standard path: browser supports fullscreen. Require it.
            <div className="max-w-md p-8 text-center card">
              <p className="text-4xl font-display">🔒</p>
              <h2 className="mt-4 text-xl font-bold font-display text-ink">
                الامتحان يتطلب الشاشة الكاملة
              </h2>
              <p className="mt-2 text-sm text-ink-400">
                لضمان نزاهة الامتحان، يجب أن تكون في وضع الشاشة الكاملة. لن تتمكن من
                المتابعة بدونها.
              </p>
              <Button onClick={requestFullscreen} className="w-full mt-6">
                الدخول للشاشة الكاملة
              </Button>
            </div>
          ) : fullscreenBypassed ? null : (
            // Batch 8: iOS Safari fallback. `requestFullscreen` on
            // documentElement is unsupported on iPhone/iPad. Without this
            // branch, the student would be permanently locked out.
            // We warn, log the bypass, and let them continue — the
            // teacher sees this in the attempt review (staff-side).
            <div className="max-w-md p-8 text-center card">
              <p className="text-4xl font-display">⚠️</p>
              <h2 className="mt-4 text-xl font-bold font-display text-ink">
                متصفحك لا يدعم الشاشة الكاملة
              </h2>
              <p className="mt-2 text-sm text-ink-400">
                للحصول على أفضل تجربة، يُفضّل فتح الامتحان على <strong>Chrome</strong>{" "}
                على الكمبيوتر. لكن يمكنك المتابعة الآن — سيُسجَّل هذا للمعلم.
              </p>
              <div className="flex flex-col gap-2 mt-6">
                <Button
                  onClick={() => {
                    setFullscreenBypassed(true);
                    // Best-effort: record the bypass so staff knows.
                    recordAttemptEvent(attemptId, "FULLSCREEN_EXIT", {
                      reason: "fullscreen_unsupported_browser",
                      user_agent: navigator.userAgent.slice(0, 200),
                    }).catch(() => {});
                  }}
                  className="w-full"
                >
                  المتابعة بدون شاشة كاملة
                </Button>
                <p className="text-[10px] text-ink-300">
                  يُنصح بالعودة من Chrome قبل بدء الإجابة الفعلية.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <header className="border-b shadow-sm shrink-0 border-line bg-paper-elevated">
        <div className="flex items-center max-w-4xl gap-2 px-4 pt-4 pb-3 mx-auto sm:gap-3 sm:px-6 sm:pt-5 sm:pb-4">
          {/* Batch 8: Save & Exit button. Saves all pending answers
              before leaving. The student can resume from the assessments
              page. Timer keeps running — the exam window doesn't pause. */}
          <button
            onClick={handleSaveAndExit}
            disabled={savingExit}
            className="shrink-0 rounded-lg border border-line px-2 py-1.5 text-[11px] font-medium text-ink-700 transition-colors hover:border-ink/40 hover:bg-ink-50 disabled:opacity-50 sm:px-3 sm:text-xs"
            aria-label="حفظ وخروج"
            title="سيتم حفظ إجاباتك. الوقت سيكمل — يمكنك الاستئناف لاحقًا."
          >
            {savingExit ? (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-400" />
                <span className="hidden sm:inline">حفظ...</span>
              </span>
            ) : (
              <>
                <span aria-hidden="true">💾</span>{" "}
                <span className="hidden sm:inline">حفظ وخروج</span>
              </>
            )}
          </button>

          <div className="flex-1 min-w-0 text-center">
            <h1 className="text-sm font-bold truncate font-display text-ink sm:text-base">
              {attempt.assessment_title}
            </h1>
            <p className="mt-0.5 text-[10px] text-ink-400 sm:text-xs">
              محاولة #{attempt.attempt_number}
            </p>
          </div>

          <ExamTimer secondsLeft={secondsLeft} />
        </div>

        <div className="flex items-center max-w-4xl gap-3 px-4 pb-3 mx-auto sm:px-6 sm:pb-4">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full transition-all duration-300 rounded-full bg-ink"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="w-24 text-end sm:w-28">
            {isSavingAny ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-accent-dark sm:text-xs">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                حفظ...
              </span>
            ) : currentJustSaved ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-success sm:text-xs">
                ✓ تم الحفظ
              </span>
            ) : (
              <span className="text-[10px] tabular-nums text-ink-400 sm:text-xs">
                {answeredCount} / {totalQuestions}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl px-4 py-6 mx-auto sm:px-6 sm:py-8">
          {saveError && (
            <div className="px-4 py-3 mb-4 text-sm border rounded-lg border-danger/20 bg-danger/5 text-danger">
              {saveError}
            </div>
          )}
          {eventsCount > 0 && (
            <div className="px-4 py-3 mb-4 text-xs border rounded-lg border-accent/20 bg-accent/5 text-ink-700">
              ⚠️ تم تسجيل {eventsCount} حدث مشبوه خلال هذه المحاولة. القرار النهائي للمدرس.
            </div>
          )}

          <div className="p-5 card sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
                السؤال {currentIndex + 1} من {totalQuestions}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleFlag(currentQuestion.id)}
                  className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
                    currentIsFlagged
                      ? "border-accent/40 bg-accent/10 text-accent-dark"
                      : "border-line text-ink-400 hover:border-accent/30 hover:bg-accent/5 hover:text-accent-dark"
                  }`}
                  aria-label={currentIsFlagged ? "إلغاء تعليم السؤال" : "تعليم السؤال للمراجعة"}
                  title="F"
                >
                  <Flag size={12} />
                  {currentIsFlagged ? "مُعلَّم" : "علّم"}
                </button>
                <span className="text-xs text-ink-400">{currentQuestion.points} نقطة</span>
              </div>
            </div>

            <p className="mb-5 text-base leading-relaxed text-ink sm:text-lg">
              {currentQuestion.text}
            </p>

            {(currentQuestion.question_type === "MCQ" ||
              currentQuestion.question_type === "TRUE_FALSE") && (
              <div className="flex flex-col gap-2.5 sm:gap-3" role="radiogroup">
                {currentQuestion.options.map((opt, optIdx) => {
                  const selected = currentAnswer?.chosen_option === opt.id;
                  return (
                    <label
                      key={opt.id}
                      className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all sm:min-h-0 sm:py-4 ${
                        selected
                          ? "border-ink bg-ink/5 shadow-sm"
                          : "border-line bg-paper-elevated hover:border-ink/30 hover:bg-ink-50/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${currentQuestion.id}`}
                        checked={selected}
                        onChange={() => handleOptionChange(currentQuestion, opt.id)}
                        className="w-5 h-5 shrink-0 accent-ink"
                      />
                      <span className="flex-1 text-sm leading-relaxed text-ink sm:text-base">
                        {opt.text}
                      </span>
                      {optIdx < 9 && (
                        <kbd className="hidden rounded border border-line bg-paper-muted px-1.5 py-0.5 text-[10px] font-mono text-ink-400 sm:inline-block">
                          {optIdx + 1}
                        </kbd>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            {(currentQuestion.question_type === "SHORT_ANSWER" ||
              currentQuestion.question_type === "ESSAY") && (
              <textarea
                rows={currentQuestion.question_type === "ESSAY" ? 8 : 3}
                value={currentAnswer?.text_answer ?? ""}
                onChange={(e) => handleTextChange(currentQuestion, e.target.value)}
                placeholder="اكتب إجابتك هنا..."
                className="min-h-[120px] w-full resize-y rounded-xl border-2 border-line bg-paper-elevated px-4 py-3 text-sm leading-relaxed text-ink outline-none transition-colors focus:border-ink sm:min-h-[140px] sm:text-base"
              />
            )}
          </div>
        </div>
      </main>

      <div className="shrink-0 border-t border-line bg-paper-elevated shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="max-w-4xl px-4 py-3 mx-auto sm:px-6 sm:py-4">
          <div className="pb-1 mb-3 overflow-x-auto sm:mb-4">
            <div className="flex justify-center gap-1.5 sm:gap-2">
              {attempt.questions.map((q, idx) => {
                const active = idx === currentIndex;
                const answered = isAnswered(q.id);
                const flagged = flaggedIds.has(q.id);
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold transition-all sm:h-10 sm:w-10 sm:text-sm ${
                      active
                        ? "bg-ink text-white ring-2 ring-ink/20 dark:bg-accent dark:text-[#111827] dark:ring-accent/40"
                        : answered
                        ? "bg-success/15 text-success ring-1 ring-success/30 hover:bg-success/25"
                        : "bg-ink-50 text-ink-400 hover:bg-ink-100"
                    }`}
                    aria-label={`السؤال ${idx + 1}${answered ? " — مُجاب" : " — لم يُجب"}${
                      flagged ? " — مُعلَّم" : ""
                    }`}
                    aria-current={active ? "step" : undefined}
                  >
                    {idx + 1}
                    {flagged && (
                      <span className="absolute -top-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] leading-none text-white ring-2 ring-paper-elevated">
                        🚩
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 sm:gap-3">
            <Button
              variant="secondary"
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={isFirst}
              className="flex-1 py-3 sm:py-3.5"
            >
              ← السابق
            </Button>

            <Button
              variant="secondary"
              onClick={() => setReviewMode(true)}
              className="shrink-0 px-3 py-3 sm:px-4 sm:py-3.5"
            >
              مراجعة
            </Button>

            {!isLast ? (
              <Button
                onClick={() => setCurrentIndex(currentIndex + 1)}
                className="flex-1 py-3 sm:py-3.5"
              >
                التالي →
              </Button>
            ) : (
              <Button
                onClick={() => setShowSubmitConfirm(true)}
                disabled={submitMutation.isPending || autoSubmitted}
                className="flex-1 bg-danger py-3 hover:bg-danger/90 sm:py-3.5"
              >
                {submitMutation.isPending ? "..." : "تسليم الامتحان"}
              </Button>
            )}
          </div>

          <p className="mt-2 hidden text-center text-[10px] text-ink-300 sm:block">
            <kbd className="px-1 font-mono border rounded border-line bg-paper-muted">1-9</kbd> للاختيار
            {" · "}
            <kbd className="px-1 font-mono border rounded border-line bg-paper-muted">←→</kbd> للتنقل
            {" · "}
            <kbd className="px-1 font-mono border rounded border-line bg-paper-muted">F</kbd> للتعليم
            {" · "}
            <kbd className="px-1 font-mono border rounded border-line bg-paper-muted">R</kbd> للمراجعة
          </p>
        </div>
      </div>

      <ReviewPanel
        open={reviewMode}
        onClose={() => setReviewMode(false)}
        attempt={attempt}
        answers={answers}
        flaggedIds={flaggedIds}
        currentIndex={currentIndex}
        onJumpTo={setCurrentIndex}
        onSubmit={handleSubmitFromReview}
        isSubmitting={submitMutation.isPending}
      />

      <ConfirmDialog
        open={showExitWarning}
        title="الخروج من الشاشة الكاملة"
        description={
          "لقد خرجت من وضع الشاشة الكاملة. للاستمرار في الامتحان، يجب العودة إليها. " +
          (unansweredCount > 0
            ? `لديك ${unansweredCount} سؤال لم تُجب عليه — الخروج نهائيًا سيؤدي لتسليم الامتحان تلقائيًا.`
            : "الخروج نهائيًا سيؤدي لتسليم الامتحان تلقائيًا.")
        }
        confirmLabel="تسليم الامتحان والخروج"
        cancelLabel="العودة للشاشة الكاملة"
        variant="danger"
        onConfirm={handleExitWarningSubmit}
        onCancel={handleExitWarningReenter}
        isPending={submitMutation.isPending}
      />

      <ConfirmDialog
        open={showSubmitConfirm}
        title="تسليم الامتحان"
        description={
          unansweredCount > 0
            ? `لديك ${unansweredCount} سؤال لم تُجب عليه. هل أنت متأكد من التسليم؟ لن تتمكن من التعديل بعد ذلك.`
            : "أجبت على جميع الأسئلة. هل أنت متأكد من تسليم الامتحان؟ لن تتمكن من التعديل بعد ذلك."
        }
        confirmLabel={submitMutation.isPending ? "..." : "نعم، سلّم الامتحان"}
        cancelLabel="متابعة الامتحان"
        variant="danger"
        onConfirm={() => submitMutation.mutate()}
        onCancel={() => setShowSubmitConfirm(false)}
        isPending={submitMutation.isPending}
      />
    </div>
  );
}