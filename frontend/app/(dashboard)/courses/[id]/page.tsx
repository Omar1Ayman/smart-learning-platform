"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";
import { useState } from "react";
import { ChapterForm, type ChapterFormValues } from "@/components/academics/ChapterForm";
import { LessonForm, type LessonFormValues } from "@/components/academics/LessonForm";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { createChapter } from "@/lib/api/chapters";
import { getCourseDetail } from "@/lib/api/courses";
import { createLesson } from "@/lib/api/lessons";
import { useCanWrite } from "@/lib/auth/useCanWrite";
import { useActiveYearStore } from "@/lib/hooks/useActiveYear";
import { toastError, toastSuccess } from "@/lib/utils/toast";

export default function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();
  const activeYearId = useActiveYearStore((state) => state.activeYearId);
  const activeYearStatus = useActiveYearStore(
    (state) => state.activeYearStatus,
  );
  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  const [lessonTarget, setLessonTarget] = useState<{
    id: string;
    name: string;
    lessonsCount: number;
  } | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["course-detail", id],
    queryFn: () => getCourseDetail(id),
  });

  async function handleCreateChapter(values: ChapterFormValues) {
    try {
      await createChapter({ course: id, ...values });
      await queryClient.invalidateQueries({ queryKey: ["course-detail", id] });
      setChapterModalOpen(false);
      toastSuccess("تمت إضافة الفصل إلى المقرر");
    } catch (error) {
      toastError(error, "تعذّرت إضافة الفصل.");
      throw error;
    }
  }

  async function handleCreateLesson(values: LessonFormValues) {
    if (!lessonTarget) return;
    try {
      await createLesson({ chapter: lessonTarget.id, ...values });
      await queryClient.invalidateQueries({ queryKey: ["course-detail", id] });
      setLessonTarget(null);
      toastSuccess("تمت إضافة الدرس إلى الفصل");
    } catch (error) {
      toastError(error, "تعذّرت إضافة الدرس.");
      throw error;
    }
  }

  if (isLoading) return <Spinner />;
  if (isError || !data)
    return <ErrorState message="تعذّر تحميل بيانات المادة." />;

  const { course, chapters, teachers, groups, assessments, content } = data;
  const canManageStructure =
    canWrite &&
    (activeYearStatus === "ACTIVE" || activeYearStatus === "CLOSING") &&
    course.academic_year === activeYearId;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <Link href="/courses" className="text-sm text-ink-400 hover:text-ink">
          ← المقررات الدراسية
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">
          {course.name}
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          {course.grade_name} · {course.subject_name}
          {course.academic_year_name && ` · ${course.academic_year_name}`}
          {course.term_name && ` · ${course.term_name}`}
        </p>
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-ink">
              فصول المنهج والدروس ({chapters.length})
            </h2>
            <p className="mt-1 text-xs text-ink-500">
              الفصل هنا جزء من المنهج، وليس مجموعة الطلاب. أضف الفصول والدروس هنا، ثم أضف الملفات والفيديوهات من صفحة الدرس.
            </p>
          </div>
          {canManageStructure && (
            <Button onClick={() => setChapterModalOpen(true)}>
              + إضافة فصل
            </Button>
          )}
        </div>
        {chapters.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <EmptyState
              title="لا توجد فصول بعد"
              description="ابدأ بإضافة فصل من المنهج لهذا المقرر، ثم أضف الدروس داخله."
            />
            {canManageStructure && (
              <Button variant="secondary" onClick={() => setChapterModalOpen(true)}>
                + أضف أول فصل
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {chapters.map((ch) => (
              <div
                key={ch.id}
                id={`chapter-${ch.id}`}
                className="rounded-lg border border-line p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">
                    {ch.order}. {ch.name}
                  </p>
                  {canManageStructure && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setLessonTarget({
                          id: ch.id,
                          name: ch.name,
                          lessonsCount: ch.lessons.length,
                        })
                      }
                    >
                      + إضافة درس
                    </Button>
                  )}
                </div>
                {ch.lessons.length === 0 ? (
                  <p className="mt-2 text-xs text-ink-400">
                    لا توجد دروس بعد. أضف أول درس من هنا.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {ch.lessons.map((l) => (
                      <li key={l.id}>
                        <Link
                          href={`/lessons/${l.id}`}
                          className="text-sm text-ink-700 hover:underline"
                        >
                          {l.order}. {l.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {!canManageStructure && (
        <p className="text-xs text-ink-400">
          إضافة الفصول والدروس متاحة لمالك أو مسؤول المؤسسة ضمن السنة الحالية،
          ما دامت السنة تسمح بالتعديل.
        </p>
      )}

      <QuickCreateModal
        open={canManageStructure && chapterModalOpen}
        onClose={() => setChapterModalOpen(false)}
        title={`إضافة فصل — ${course.name}`}
      >
        <ChapterForm
          onSubmit={handleCreateChapter}
          onCancel={() => setChapterModalOpen(false)}
          defaultOrder={chapters.length + 1}
        />
      </QuickCreateModal>

      <QuickCreateModal
        open={canManageStructure && !!lessonTarget}
        onClose={() => setLessonTarget(null)}
        title={`إضافة درس — ${lessonTarget?.name ?? ""}`}
      >
        {lessonTarget && (
          <LessonForm
            onSubmit={handleCreateLesson}
            onCancel={() => setLessonTarget(null)}
            defaultOrder={lessonTarget.lessonsCount + 1}
          />
        )}
      </QuickCreateModal>

      {/* Teachers */}
      <section className="card p-5">
        <h2 className="mb-3 font-display text-base font-bold text-ink">
          المعلمون ({teachers.length})
        </h2>
        {teachers.length === 0 ? (
          <p className="text-sm text-ink-400">لم يُسند معلمون لهذه المادة.</p>
        ) : (
          <ul className="divide-y divide-line">
            {teachers.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/team/${t.id}`}
                    className="text-sm font-medium text-ink hover:underline"
                  >
                    {t.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-400">{t.scope_label}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Groups */}
      <section className="card p-5">
        <h2 className="mb-3 font-display text-base font-bold text-ink">
          المجموعات ({groups.length})
        </h2>
        {groups.length === 0 ? (
          <p className="text-sm text-ink-400">لا توجد مجموعات مسجلة.</p>
        ) : (
          <ul className="divide-y divide-line">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/groups/${g.id}`}
                    className="text-sm font-medium text-ink hover:underline"
                  >
                    {g.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {g.academic_year} · {g.student_count} طالب
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Assessments */}
      <section className="card p-5">
        <h2 className="mb-3 font-display text-base font-bold text-ink">
          الامتحانات ({assessments.length})
        </h2>
        {assessments.length === 0 ? (
          <p className="text-sm text-ink-400">لا توجد امتحانات مرتبطة.</p>
        ) : (
          <ul className="divide-y divide-line">
            {assessments.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/assessments/${a.id}/edit`}
                    className="text-sm font-medium text-ink hover:underline"
                  >
                    {a.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-400">{a.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Content */}
      <section className="card p-5">
        <h2 className="mb-3 font-display text-base font-bold text-ink">
          المواد التعليمية ({content.count})
        </h2>
        {content.count === 0 ? (
          <p className="text-sm text-ink-400">لا يوجد محتوى بعد.</p>
        ) : (
          <ul className="divide-y divide-line">
            {content.recent.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{c.title}</p>
                  <p className="mt-0.5 text-xs text-ink-400">{c.content_type}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}