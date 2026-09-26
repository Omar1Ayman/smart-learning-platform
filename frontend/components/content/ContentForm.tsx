"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { SmartSelect } from "@/components/common/SmartSelect";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FILE_CONTENT_TYPES, TEXT_CONTENT_TYPES, type ContentType } from "@/lib/api/content";
import { listCourses } from "@/lib/api/courses";
import { listGrades } from "@/lib/api/grades";
import { listGroups } from "@/lib/api/groups";
import { listStages } from "@/lib/api/stages";
import { listSubjects } from "@/lib/api/subjects";
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

interface ContentFormProps {
  onSubmit: (values: ContentFormValues, file: File | null) => Promise<void>;
}

export function ContentForm({ onSubmit }: ContentFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const { data: stages } = useQuery({ queryKey: ["stages"], queryFn: listStages });
  const { data: grades } = useQuery({ queryKey: ["grades"], queryFn: listGrades });
  const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: () => listGroups() });
  const { data: subjects } = useQuery({ queryKey: ["subjects"], queryFn: listSubjects });
  const { data: courses } = useQuery({ queryKey: ["courses"], queryFn: listCourses });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ContentFormValues>({ resolver: zodResolver(contentSchema) });

  const contentType = useWatch({ control, name: "content_type" });
  const needsFile = contentType && FILE_CONTENT_TYPES.includes(contentType);
  const needsUrl = contentType === "EXTERNAL_LINK";
  const needsText = contentType && TEXT_CONTENT_TYPES.includes(contentType);

  async function handleFormSubmit(values: ContentFormValues) {
    if (needsFile && !file) {
      setFileError("الملف مطلوب لهذا النوع من المحتوى.");
      return;
    }
    setFileError(null);
    await onSubmit(values, file);
  }

  const scopeOptions = (list: { id: string; name: string }[] | undefined) =>
    (list ?? []).map((item) => ({ value: item.id, label: item.name }));

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto" noValidate>
      <Input label="العنوان" error={errors.title?.message} {...register("title")} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink-700">نوع المحتوى</label>
        <select
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
          {...register("content_type")}
          defaultValue=""
        >
          <option value="" disabled>
            اختر نوعًا
          </option>
          {Object.entries(CONTENT_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {errors.content_type && <p className="text-xs text-danger">{errors.content_type.message}</p>}
      </div>

      {needsFile && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink-700">الملف</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
          />
          {fileError && <p className="text-xs text-danger">{fileError}</p>}
        </div>
      )}
      {needsUrl && (
        <Input label="الرابط الخارجي" error={errors.external_url?.message} {...register("external_url")} />
      )}
      {needsText && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink-700">النص</label>
          <textarea
            rows={5}
            className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink"
            {...register("text_body")}
          />
          {errors.text_body && <p className="text-xs text-danger">{errors.text_body.message}</p>}
        </div>
      )}

      <div className="rounded-lg border border-line p-3">
        <p className="mb-3 text-sm font-medium text-ink-700">
          النطاق <span className="font-normal text-ink-400">(اختياري — اتركه فارغًا ليكون أوسع)</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Controller
            name="stage"
            control={control}
            render={({ field }) => (
              <SmartSelect label="المرحلة" value={field.value ?? ""} onChange={field.onChange} options={scopeOptions(stages?.results)} />
            )}
          />
          <Controller
            name="grade"
            control={control}
            render={({ field }) => (
              <SmartSelect label="الصف" value={field.value ?? ""} onChange={field.onChange} options={scopeOptions(grades?.results)} />
            )}
          />
          <Controller
            name="group"
            control={control}
            render={({ field }) => (
              <SmartSelect label="المجموعة" value={field.value ?? ""} onChange={field.onChange} options={scopeOptions(groups?.results)} />
            )}
          />
          <Controller
            name="subject"
            control={control}
            render={({ field }) => (
              <SmartSelect label="المادة" value={field.value ?? ""} onChange={field.onChange} options={scopeOptions(subjects?.results)} />
            )}
          />
          <Controller
            name="course"
            control={control}
            render={({ field }) => (
              <SmartSelect label="الكورس" value={field.value ?? ""} onChange={field.onChange} options={scopeOptions(courses?.results)} />
            )}
          />
        </div>
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
      </Button>
    </form>
  );
}
