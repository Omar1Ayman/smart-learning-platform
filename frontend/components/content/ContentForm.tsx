"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { CascadeSelect } from "@/components/common/CascadeSelect";
import { SmartSelect } from "@/components/common/SmartSelect";
import {
  ContentScopeSelector,
  type ScopeLevel,
} from "@/components/content/ContentScopeSelector";
import { Button } from "@/components/ui/Button";
import { FileDropZone } from "@/components/ui/FileDropZone";
import { ChevronDown, Loader } from "@/components/ui/icons";
import { Input } from "@/components/ui/Input";
import { listAcademicYears } from "@/lib/api/academicYears";
import { listChapters } from "@/lib/api/chapters";
import {
  FILE_CONTENT_TYPES,
  TEXT_CONTENT_TYPES,
  type ContentType,
  type UploadProgress,
} from "@/lib/api/content";
import { listLessons } from "@/lib/api/lessons";
import { listStages } from "@/lib/api/stages";
import { listSubjects } from "@/lib/api/subjects";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { contentSchema, type ContentFormValues } from "@/lib/validation/schemas";

const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  PDF: "PDF",
  VIDEO: "فيديو",
  IMAGE: "صورة",
  DOCUMENT: "مستند",
  EXTERNAL_LINK: "رابط خارجي",
  TEXT: "نص",
  BOOK: "كتاب",
  SUMMARY: "ملخّص",
  LESSON_EXPLANATION: "شرح درس",
  CHAPTER_RESOURCE: "مرفق فصل",
};

const ACCEPT_BY_TYPE: Record<string, string> = {
  PDF: ".pdf",
  VIDEO: ".mp4,.webm,.mov",
  IMAGE: ".jpg,.jpeg,.png,.webp,.gif",
  DOCUMENT: ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx",
  BOOK: ".pdf,.epub",
  CHAPTER_RESOURCE: ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip",
};

const MAX_MB_BY_TYPE: Record<string, number> = {
  PDF: 20,
  VIDEO: 300,
  IMAGE: 5,
  DOCUMENT: 20,
  BOOK: 50,
  CHAPTER_RESOURCE: 20,
};

export interface ContentInitialScope {
  stage?: string | null;
  grade?: string | null;
  group?: string | null;
  subject?: string | null;
  course?: string | null;
  chapter?: string | null;
  lesson?: string | null;
  academic_year?: string | null;
  term?: string | null;
}

interface ContentFormProps {
  onSubmit: (
    values: ContentFormValues,
    file: File | null,
    onProgress?: UploadProgress
  ) => Promise<void>;
  onCancel?: () => void;
  initialScope?: ContentInitialScope;
  lockedScope?: boolean;
  compact?: boolean;
  initialValues?: Partial<ContentFormValues>;
  initialFileName?: string;
}

function detectScopeLevel(
  item:
    | Partial<ContentFormValues>
    | Partial<ContentInitialScope>
    | null
    | undefined
): ScopeLevel {
  if (!item) return "tenant";
  if ("lesson" in item && item.lesson) return "lesson";
  if ("course" in item && item.course) return "course";
  if ("grade" in item && item.grade) return "grade";
  return "tenant";
}

export function ContentForm({
  onSubmit,
  onCancel,
  initialScope,
  lockedScope,
  compact = false,
  initialValues,
  initialFileName,
}: ContentFormProps) {
  const isEdit = !!initialValues;

  const initialLevel = detectScopeLevel(initialValues ?? initialScope);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [scopeLevel, setScopeLevel] = useState<ScopeLevel>(initialLevel);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { data: stages } = useQuery({
    queryKey: ["stages"],
    queryFn: () => listStages(),
  });
  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: () => listSubjects(),
  });
  const { data: years } = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => listAcademicYears(),
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors, isSubmitting, dirtyFields, isSubmitted },
  } = useForm<ContentFormValues>({
    resolver: zodResolver(contentSchema),
    mode: "onTouched",
    defaultValues: {
      ...(initialScope as ContentFormValues | undefined),
      ...initialValues,
    },
  });

  useUnsavedChangesWarning(
    (Object.keys(dirtyFields).length > 0 || !!file) && uploadPct === null
  );

  const contentType = useWatch({ control, name: "content_type" });
  const selectedGrade = useWatch({ control, name: "grade" });
  const selectedCourse = useWatch({ control, name: "course" });
  const selectedChapter = useWatch({ control, name: "chapter" });
  const selectedYear = useWatch({ control, name: "academic_year" });

  const needsFile = contentType && FILE_CONTENT_TYPES.includes(contentType);
  const needsUrl = contentType === "EXTERNAL_LINK";
  const needsText = contentType && TEXT_CONTENT_TYPES.includes(contentType);
  const contentTypeRegistration = register("content_type");

  const { data: chaptersForCourse } = useQuery({
    queryKey: ["chapters", "for-course", selectedCourse],
    queryFn: () => listChapters({ course: selectedCourse }),
    enabled: scopeLevel === "lesson" && !!selectedCourse,
  });
  const courseHasChapters = (chaptersForCourse?.results.length ?? 0) > 0;

  const { data: lessonsForChapter } = useQuery({
    queryKey: ["lessons", "for-chapter", selectedChapter],
    queryFn: () => listLessons({ chapter: selectedChapter }),
    enabled: scopeLevel === "lesson" && !!selectedChapter,
  });
  const chapterHasLessons = (lessonsForChapter?.results.length ?? 0) > 0;

  const errorMessages = Object.entries(errors)
    .map(([field, err]) => {
      const label =
        {
          title: "العنوان",
          content_type: "نوع المادة التعليمية",
          external_url: "الرابط الخارجي",
          text_body: "النص",
        }[field] ?? field;
      return err?.message ? `${label}: ${err.message}` : null;
    })
    .filter(Boolean) as string[];

  async function handleFormSubmit(values: ContentFormValues) {
    if (!lockedScope) {
      const destinationError = getScopeError();
      if (destinationError) {
        setScopeError(destinationError);
        return;
      }
    }

    if (needsFile && !file && !isEdit) {
      setFileError("الملف مطلوب لهذا النوع من المادة التعليمية.");
      return;
    }
    setFileError(null);

    // Normalize scope by chosen level.
    const normalized: ContentFormValues = { ...values };
    if (scopeLevel === "tenant") {
      normalized.grade = "";
      normalized.course = "";
      normalized.chapter = "";
      normalized.lesson = "";
    } else if (scopeLevel === "grade") {
      normalized.course = "";
      normalized.chapter = "";
      normalized.lesson = "";
    } else if (scopeLevel === "course") {
      normalized.chapter = "";
      normalized.lesson = "";
    }

    setUploadPct(file ? 0 : null);
    try {
      await onSubmit(normalized, file, (pct) => setUploadPct(pct));
    } finally {
      setUploadPct(null);
    }
  }

  function handleCourseChange(v: string) {
    if (v === selectedCourse) return;
    setValue("course", v, { shouldValidate: true });
    setValue("stage", "");
    setValue("grade", "");
    setValue("group", "");
    setValue("subject", "");
    setValue("academic_year", "");
    setValue("term", "");
    setValue("chapter", "");
    setValue("lesson", "");
  }

  function handleChapterChange(v: string) {
    if (v === selectedChapter) return;
    setValue("chapter", v, { shouldValidate: true });
    setValue("lesson", "");
  }

  function handleScopeChange(next: ScopeLevel) {
    if (next === scopeLevel) return;
    setScopeLevel(next);
    setValue("grade", "");
    setValue("course", "");
    setValue("chapter", "");
    setValue("lesson", "");
    setValue("stage", "");
    setValue("group", "");
    setValue("subject", "");
    setValue("academic_year", "");
    setValue("term", "");
  }

  const stageOptions = (stages?.results ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }));
  const subjectOptions = (subjects?.results ?? []).map((s) => ({
    value: s.id,
    label: s.code ? `${s.name} (${s.code})` : s.name,
  }));
  const yearOptions = (years?.results ?? []).map((y) => ({
    value: y.id,
    label: y.name,
  }));

  const isUploading = uploadPct !== null && uploadPct < 100;
  const showProgress = uploadPct !== null && !!file;
  const submitDisabled = isSubmitting || isUploading;

  function getScopeError() {
    if (scopeLevel === "grade" && !getValues("grade")) {
      return "اختر الصف الدراسي الذي ستظهر له المادة.";
    }
    if (scopeLevel === "course" && !getValues("course")) {
      return "اختر المقرر الدراسي الذي ستظهر فيه المادة.";
    }
    if (scopeLevel === "lesson") {
      if (!getValues("course")) return "اختر المقرر الدراسي أولاً.";
      if (!getValues("chapter")) return "اختر فصل المنهج.";
      if (!getValues("lesson")) return "اختر الدرس الذي ستضاف إليه المادة.";
    }
    return null;
  }

  const submitForm = handleSubmit(handleFormSubmit);

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className={`flex flex-col gap-5 pe-1 ${
        compact ? "max-h-[75vh] overflow-y-auto" : ""
      }`}
      noValidate
    >
      {isSubmitted && errorMessages.length > 0 && (
        <div className="p-3 text-sm border rounded-lg border-danger/30 bg-danger/5 text-danger">
          <p className="font-medium">
            يرجى تصحيح {errorMessages.length} حقل قبل الحفظ:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5 text-xs">
            {errorMessages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {isSubmitted && fileError && (
        <div className="p-3 text-sm border rounded-lg border-danger/30 bg-danger/5 text-danger">
          {fileError}
        </div>
      )}

      <section
        className="flex flex-col gap-4 rounded-xl border border-line p-4 sm:p-5"
        aria-labelledby="content-details-heading"
      >
        <div>
          <h3 id="content-details-heading" className="text-base font-semibold text-ink">
            1. المادة التعليمية
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            اختر النوع أولاً؛ ستظهر الحقول المناسبة له تلقائيًا.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="content_type" className="text-sm font-medium text-ink">
            نوع المادة التعليمية <span className="text-danger">*</span>
          </label>
          <select
            id="content_type"
            className="px-3 py-2 text-sm transition-all bg-paper-elevated border rounded-lg outline-none border-line text-ink focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:bg-paper-muted disabled:text-ink-400"
            {...contentTypeRegistration}
            onChange={(event) => {
              contentTypeRegistration.onChange(event);
              setValue("external_url", "");
              setValue("text_body", "");
              setFile(null);
              setFileError(null);
            }}
            disabled={isEdit || isUploading}
          >
            <option value="" disabled>
              اختر نوع المادة...
            </option>
            {Object.entries(CONTENT_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {errors.content_type && (
            <p className="text-xs text-danger">{errors.content_type.message}</p>
          )}
          {isEdit && (
            <p className="text-xs text-ink-400">
              لا يمكن تغيير النوع بعد الإنشاء.
            </p>
          )}
        </div>

        <Input
          label="عنوان المادة التعليمية"
          hint="عنوان واضح يظهر للطلاب — مثال: مذكرة الجبر أو شرح الخلية."
          required
          error={errors.title?.message}
          {...register("title")}
        />

        {needsFile && (
          <FileDropZone
            file={file}
            onChange={(f) => {
              setFile(f);
              setFileError(null);
            }}
            accept={ACCEPT_BY_TYPE[contentType as string]}
            maxSizeMB={MAX_MB_BY_TYPE[contentType as string]}
            error={fileError ?? undefined}
            disabled={isUploading}
            existingFileName={isEdit ? initialFileName : undefined}
            hint={
              isEdit
                ? "اتركه فارغاً للاحتفاظ بالملف الحالي."
                : "اسحب الملف هنا أو اضغط للاختيار."
            }
          />
        )}

        {needsUrl && (
          <Input
            label="الرابط الخارجي"
            type="url"
            placeholder="https://..."
            hint="ضع رابطًا مباشرًا لمصدر تعليمي موثوق."
            required
            error={errors.external_url?.message}
            {...register("external_url")}
          />
        )}

        {needsText && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="text_body" className="text-sm font-medium text-ink">
              النص <span className="text-danger">*</span>
            </label>
            <textarea
              id="text_body"
              rows={5}
              placeholder="اكتب الشرح أو الملخص الذي سيقرأه الطالب..."
              className={`rounded-lg border bg-paper-elevated px-3 py-2 text-sm text-ink outline-none transition-all focus:border-ink focus:ring-2 focus:ring-ink/10 ${
                errors.text_body ? "border-danger" : "border-line"
              }`}
              {...register("text_body")}
            />
            {errors.text_body && (
              <p className="text-xs text-danger">{errors.text_body.message}</p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className="text-sm font-medium text-ink">
            وصف مختصر <span className="text-ink-400">(اختياري)</span>
          </label>
          <textarea
            id="description"
            rows={2}
            placeholder="وضّح للطالب ما الذي سيتعلمه من هذه المادة."
            className="rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm text-ink outline-none transition-all focus:border-ink focus:ring-2 focus:ring-ink/10"
            {...register("description")}
          />
        </div>
      </section>

      {!lockedScope && (
        <section
          className="flex flex-col gap-4 rounded-xl border border-line p-4 sm:p-5"
          aria-labelledby="content-audience-heading"
        >
          <div>
            <h3 id="content-audience-heading" className="text-base font-semibold text-ink">
              2. من سيشاهد المادة؟
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              اختر الجمهور ثم اربط المادة بالصف أو المقرر أو الدرس الموجود. تُنشأ
              الفصول والدروس من صفحة المقرر، والمجموعة تحدد الطلاب المستهدفين.
            </p>
          </div>

          <div className="p-4 border rounded-lg border-line bg-paper-muted/30">
            <ContentScopeSelector
              value={scopeLevel}
              onChange={(next) => {
                setScopeError(null);
                handleScopeChange(next);
              }}
            />

            {scopeError && (
              <p className="mt-3 text-sm text-danger" role="alert">
                {scopeError}
              </p>
            )}

            {scopeLevel === "grade" && (
              <div className="pt-4 mt-4 border-t border-line">
                <Controller
                  name="grade"
                  control={control}
                  render={({ field }) => (
                    <CascadeSelect
                      cascadeKey="grade"
                      label="الصف الدراسي *"
                      filters={{}}
                      value={field.value ?? ""}
                      onChange={(value) => {
                        if (value !== field.value) {
                          setValue("stage", "");
                          setValue("group", "");
                        }
                        field.onChange(value);
                        setScopeError(null);
                      }}
                    />
                  )}
                />
              </div>
            )}

            {scopeLevel === "course" && (
              <div className="pt-4 mt-4 border-t border-line">
                <Controller
                  name="course"
                  control={control}
                  render={({ field }) => (
                    <CascadeSelect
                      cascadeKey="course"
                      label="المقرر الدراسي *"
                      filters={{}}
                      value={field.value ?? ""}
                      onChange={(value) => {
                        handleCourseChange(value);
                        setScopeError(null);
                      }}
                    />
                  )}
                />
                <p className="mt-1.5 text-xs text-ink-400">
                  المقرر يحدد المادة والصف والسنة الدراسية معًا.
                </p>
              </div>
            )}

            {scopeLevel === "lesson" && (
              <div className="flex flex-col gap-3 pt-4 mt-4 border-t border-line">
                <Controller
                  name="course"
                  control={control}
                  render={({ field }) => (
                    <CascadeSelect
                      cascadeKey="course"
                      label="1. المقرر الدراسي *"
                      filters={{}}
                      value={field.value ?? ""}
                      onChange={(value) => {
                        handleCourseChange(value);
                        setScopeError(null);
                      }}
                    />
                  )}
                />

                <div>
                  <Controller
                    name="chapter"
                    control={control}
                    render={({ field }) => (
                      <CascadeSelect
                        cascadeKey="chapter"
                        label="2. فصل المنهج *"
                        filters={{ course: selectedCourse || undefined }}
                        value={field.value ?? ""}
                        onChange={(value) => {
                          handleChapterChange(value);
                          setScopeError(null);
                        }}
                      />
                    )}
                  />
                  {selectedCourse && chaptersForCourse && !courseHasChapters && (
                    <p className="mt-1.5 text-xs text-ink-500">
                      لا توجد فصول منهج لهذا المقرر. أضف الفصل من صفحة المقرر ثم ارجع لإضافة المادة.{" "}
                      <Link
                        href={`/courses/${selectedCourse}`}
                        className="font-semibold text-accent hover:underline"
                      >
                        فتح صفحة المقرر
                      </Link>
                    </p>
                  )}
                </div>

                <div>
                  <Controller
                    name="lesson"
                    control={control}
                    render={({ field }) => (
                      <CascadeSelect
                        cascadeKey="lesson"
                        label="3. الدرس *"
                        filters={{ chapter: selectedChapter || undefined }}
                        value={field.value ?? ""}
                        onChange={(value) => {
                          field.onChange(value);
                          setScopeError(null);
                        }}
                      />
                    )}
                  />
                  {selectedChapter && lessonsForChapter && !chapterHasLessons && (
                    <p className="mt-1.5 text-xs text-ink-500">
                      لا توجد دروس في هذا الفصل. أضف الدرس من صفحة المقرر ثم ارجع لإضافة المادة.{" "}
                      <Link
                        href={`/courses/${selectedCourse}`}
                        className="font-semibold text-accent hover:underline"
                      >
                        فتح صفحة المقرر
                      </Link>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="border rounded-lg border-line bg-paper-muted/20">
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="flex items-center justify-between w-full p-3 text-start"
            >
              <div>
                <p className="text-sm font-medium text-ink">
                  تضييق الجمهور (اختياري)
                </p>
                <p className="mt-0.5 text-xs text-ink-400">
                  استخدم هذه الخيارات بعد تحديد الجمهور الأساسي، أو اتركها فارغة.
                </p>
              </div>
              <ChevronDown
                size={18}
                className={`shrink-0 text-ink-400 transition-transform ${
                  advancedOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {advancedOpen && (
              <div className="p-4 border-t border-line">
                <div className="grid grid-cols-2 gap-3">
                  <Controller
                    name="stage"
                    control={control}
                    render={({ field }) => (
                      <SmartSelect
                        label="المرحلة"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        options={stageOptions}
                      />
                    )}
                  />

                  <Controller
                    name="group"
                    control={control}
                    render={({ field }) => (
                      <CascadeSelect
                        cascadeKey="group"
                        label="المجموعة"
                        filters={{ grade: selectedGrade || undefined }}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    )}
                  />

                  <Controller
                    name="subject"
                    control={control}
                    render={({ field }) => (
                      <SmartSelect
                        label="المادة الدراسية"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        options={subjectOptions}
                      />
                    )}
                  />

                  <Controller
                    name="academic_year"
                    control={control}
                    render={({ field }) => (
                      <SmartSelect
                        label="السنة الدراسية"
                        value={field.value ?? ""}
                        onChange={(value) => {
                          field.onChange(value);
                          setValue("term", "");
                        }}
                        options={yearOptions}
                      />
                    )}
                  />

                  <div className="col-span-2">
                    <Controller
                      name="term"
                      control={control}
                      render={({ field }) => (
                        <CascadeSelect
                          cascadeKey="term"
                          label="الترم"
                          filters={{
                            academic_year: selectedYear || undefined,
                          }}
                          value={field.value ?? ""}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {lockedScope && (
        <div className="rounded-lg border border-info/20 bg-info/5 p-3 text-sm text-ink-600">
          ستُضاف هذه المادة إلى الدرس الحالي.
        </div>
      )}

      <div className="sticky bottom-0 flex flex-col gap-2 pt-3 -mx-1 border-t border-line bg-paper-elevated">
        {showProgress && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full transition-all rounded-full bg-ink"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
            <span className="font-mono text-xs shrink-0 tabular-nums text-ink-400">
              {uploadPct}%
            </span>
          </div>
        )}
        <p className="text-xs text-ink-400">
          {isEdit
            ? "لن تُحفظ التغييرات تلقائيًا؛ اضغط زر حفظ التعديلات."
            : "لن تُحفظ المادة تلقائيًا؛ اضغط زر الإضافة للتأكيد."}
        </p>
        <div className="flex items-center justify-between gap-3">
          {onCancel ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={submitDisabled}
            >
              إلغاء
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            onClick={() => void submitForm()}
            disabled={submitDisabled}
          >
            {isUploading ? (
              <span className="flex items-center gap-2">
                <Loader size={14} />
                جارٍ الرفع... ({uploadPct}%)
              </span>
            ) : isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader size={14} />
                جارٍ الحفظ...
              </span>
            ) : isEdit ? (
              "حفظ التعديلات"
            ) : (
              "إضافة المادة التعليمية"
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}