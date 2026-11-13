"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  lookupStudentByCode,
  type LookupStudentResponse,
} from "@/lib/api/attendance";

/**
 * Scanner setup test page.
 *
 * Lets an admin verify a USB barcode scanner is configured correctly
 * BEFORE a real class. Common failure modes this catches:
 *   - Scanner has a prefix/suffix that pollutes the code (e.g. "ABC-STU-...")
 *   - Scanner sends "Enter" only, not "Tab" — input loses focus
 *   - Scanner outputs a different barcode format than expected
 *   - Student cards are printed with the wrong code
 *
 * Flow:
 *   1. Page shows "امسح أي بطاقة الآن"
 *   2. Admin scans a card → the raw received code is shown
 *   3. Backend lookup: does this code match a real student?
 *   4. Green: student found, scanner works. Red: not found → diagnostics.
 */
export default function ScannerSetupPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lastResult, setLastResult] = useState<LookupStudentResponse | null>(
    null
  );
  const [scanCount, setScanCount] = useState(0);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    focusInput();
    document.addEventListener("click", focusInput);
    document.addEventListener("touchstart", focusInput);
    const id = setInterval(focusInput, 2000);
    return () => {
      document.removeEventListener("click", focusInput);
      document.removeEventListener("touchstart", focusInput);
      clearInterval(id);
    };
  }, [focusInput]);

  const lookupMutation = useMutation({
    mutationFn: (code: string) => lookupStudentByCode(code),
    onSuccess: (data) => {
      setLastResult(data);
      setScanCount((c) => c + 1);
    },
  });

  function handleScan(raw: string) {
    const code = raw.trim();
    if (!code) return;
    lookupMutation.mutate(code);
    if (inputRef.current) inputRef.current.value = "";
    focusInput();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScan(e.currentTarget.value);
    }
  }

  function reset() {
    setLastResult(null);
    if (inputRef.current) inputRef.current.value = "";
    focusInput();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {/* Hidden input — the "ear" */}
      <input
        ref={inputRef}
        type="text"
        onKeyDown={onKeyDown}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Header */}
      <div>
        <Link
          href="/attendance"
          className="text-sm text-ink-400 hover:text-ink"
        >
          ← الحضور
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">
          اختبار إعدادات الماسح
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          امسح أي بطاقة طالب للتحقق من أن الماسح يرسل الكود الصحيح
        </p>
      </div>

      {/* Hint banner */}
      <div className="rounded-lg border border-info/20 bg-info/5 px-4 py-3 text-sm text-info">
        <p className="font-medium">ℹ️ كيف تستخدم هذه الصفحة؟</p>
        <p className="mt-1 text-xs text-ink-700">
          وصّل الماسح بالكمبيوتر عبر USB، ثم امسح أي بطاقة طالب. سيظهر
          الكود المستلم من الماسح أدناه. إن لم يظهر أي شيء، انقر في أي مكان
          على الصفحة ثم أعد المسح.
        </p>
      </div>

      {/* Main scan area */}
      <div className="card p-6">
        {!lastResult && !lookupMutation.isPending && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-ink-50">
              <span className="text-5xl">📷</span>
            </div>
            <div>
              <p className="font-display text-xl font-bold text-ink">
                امسح أي بطاقة الآن
              </p>
              <p className="mt-1 text-sm text-ink-400">
                البطاقة تُمسح كأنها لوحة مفاتيح — لا تحتاج للضغط على أي زر
              </p>
            </div>
          </div>
        )}

        {lookupMutation.isPending && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ink" />
            <p className="text-sm text-ink-400">جارٍ البحث...</p>
          </div>
        )}

        {lastResult && (
          <div className="flex flex-col gap-4">
            {/* Raw code */}
            <div>
              <p className="text-xs text-ink-400">الكود المُستلَم من الماسح</p>
              <div className="mt-1 flex items-center gap-2">
                <code
                  className="flex-1 overflow-x-auto rounded-lg bg-ink-900 px-3 py-2 font-mono text-sm text-success"
                  dir="ltr"
                >
                  {lastResult.received_code}
                </code>
                {lastResult.has_whitespace && (
                  <span className="rounded-full bg-accent/10 px-2 py-1 text-[10px] font-medium text-accent-dark">
                    ⚠️ يحتوي مسافات
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10px] text-ink-400">
                الطول: {lastResult.code_length} حرف
              </p>
            </div>

            {/* Result */}
            {lastResult.found && lastResult.student ? (
              <div className="rounded-lg border border-success/30 bg-success/5 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">✅</span>
                  <div className="flex-1">
                    <p className="font-display text-base font-bold text-success">
                      الماسح يعمل بشكل صحيح
                    </p>
                    <p className="mt-1 text-sm text-ink-700">
                      تم العثور على الطالب:{" "}
                      <strong>{lastResult.student.name}</strong>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {lastResult.student.email}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-danger/30 bg-danger/5 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">❌</span>
                  <div className="flex-1">
                    <p className="font-display text-base font-bold text-danger">
                      لم يتم العثور على طالب بهذا الكود
                    </p>
                    {lastResult.hint && (
                      <p className="mt-1 text-sm text-ink-700">
                        {lastResult.hint}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button variant="secondary" onClick={reset}>
                مسح بطاقة أخرى
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Scan count */}
      {scanCount > 0 && (
        <p className="text-center text-xs text-ink-400">
          تم اختبار {scanCount} بطاقة في هذه الجلسة
        </p>
      )}

      {/* Troubleshooting */}
      <div className="card p-5">
        <h2 className="mb-3 font-display text-base font-bold text-ink">
          🔧 حل المشاكل الشائعة
        </h2>
        <details className="mb-2 rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium text-ink-700">
            لا يظهر أي كود عند المسح
          </summary>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-ink-700">
            <li>تأكد أن الماسح موصّل بـ USB ومضاؤه شغال</li>
            <li>
              انقر في أي مكان على الصفحة أولًا (المتصفح يحتاج نقرة لتفعيل
              التركيز)
            </li>
            <li>
              جرّب مسح البطاقة في Notepad أولًا — لو ظهر الكود، المشكلة في
              المتصفح، وإلا في الماسح
            </li>
          </ul>
        </details>
        <details className="mb-2 rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium text-ink-700">
            الكود يظهر لكنه مختلف عن المتوقع
          </summary>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-ink-700">
            <li>
              بعض الماسحات تضيف prefix أو suffix تلقائيًا. تحقق من إعدادات
              الماسح (غالبًا عبر Configuration Barcode في الدليل)
            </li>
            <li>
              قد يكون الماسح مضبوطًا على Code 39 بدل Code 128 — غيّره في
              الإعدادات
            </li>
            <li>
              الكود يجب أن يبدأ بـ <code className="font-mono">STU-</code>{" "}
              ويتبعه 10 أحرف hex
            </li>
          </ul>
        </details>
        <details className="rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium text-ink-700">
            رسالة &quot;يحتوي مسافات&quot; تظهر
          </summary>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-ink-700">
            <li>
              الماسح يضيف Enter (وهذا مطلوب)، لكنه قد يضيف space أو tab
              أيضًا — غيّر إعدادات الـ suffix
            </li>
          </ul>
        </details>
      </div>
    </div>
  );
}