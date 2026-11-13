"use client";

import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import {
  Book,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Video,
} from "@/components/ui/icons";
import { useContentPreview } from "@/lib/hooks/useContentPreview";
import { useInView } from "@/lib/hooks/useInView";
import type { ContentItem, ContentType } from "@/lib/api/content";

const TYPE_META: Record<
  ContentType,
  { icon: React.ReactNode; bg: string; text: string; label: string }
> = {
  PDF: {
    icon: <FileText size={20} />,
    bg: "bg-danger/10",
    text: "text-danger",
    label: "PDF",
  },
  VIDEO: {
    icon: <Video size={20} />,
    bg: "bg-info/10",
    text: "text-info",
    label: "فيديو",
  },
  IMAGE: {
    icon: <ImageIcon size={20} />,
    bg: "bg-accent/10",
    text: "text-accent-dark",
    label: "صورة",
  },
  DOCUMENT: {
    icon: <FileText size={20} />,
    bg: "bg-info/10",
    text: "text-info",
    label: "مستند",
  },
  BOOK: {
    icon: <Book size={20} />,
    bg: "bg-accent/10",
    text: "text-accent-dark",
    label: "كتاب",
  },
  EXTERNAL_LINK: {
    icon: <LinkIcon size={20} />,
    bg: "bg-info/10",
    text: "text-info",
    label: "رابط",
  },
  TEXT: {
    icon: <FileText size={20} />,
    bg: "bg-ink-50",
    text: "text-ink-700",
    label: "نص",
  },
  SUMMARY: {
    icon: <FileText size={20} />,
    bg: "bg-success/10",
    text: "text-success",
    label: "ملخص",
  },
  LESSON_EXPLANATION: {
    icon: <FileText size={20} />,
    bg: "bg-success/10",
    text: "text-success",
    label: "شرح درس",
  },
  CHAPTER_RESOURCE: {
    icon: <FileText size={20} />,
    bg: "bg-ink-50",
    text: "text-ink-700",
    label: "مرفق فصل",
  },
};

interface ContentCardProps {
  item: ContentItem;
  actions: ActionMenuItem[];
  onOpen?: () => void;
  isOpening?: boolean;
}

export function ContentCard({
  item,
  actions,
  onOpen,
  isOpening = false,
}: ContentCardProps) {
  const meta = TYPE_META[item.content_type] ?? {
    icon: <FileText size={20} />,
    bg: "bg-ink-50",
    text: "text-ink-700",
    label: item.content_type,
  };

  const isImage = item.content_type === "IMAGE";
  const { ref: inViewRef, inView } = useInView<HTMLDivElement>("200px");
  const { url: previewUrl, isLoading: previewLoading } = useContentPreview(
    item.id,
    isImage && inView
  );

  // Build the scope trail — most specific last.
  const scopeChips: string[] = [];
  if (item.grade_name) scopeChips.push(item.grade_name);
  if (item.subject_name) scopeChips.push(item.subject_name);
  if (item.course_name) scopeChips.push(item.course_name);
  if (item.chapter_name) scopeChips.push(item.chapter_name);
  if (item.lesson_name) scopeChips.push(item.lesson_name);
  if (item.academic_year_name) scopeChips.push(item.academic_year_name);
  if (item.term_name) scopeChips.push(item.term_name);
  const isWide = scopeChips.length === 0;

  // Thumbnail area content:
  //   - Image with preview ready   → real <img>
  //   - Image still loading        → shimmer placeholder
  //   - Image with fetch error     → icon fallback
  //   - Non-image                  → icon
  const showImage = isImage && !!previewUrl;
  const showShimmer = isImage && previewLoading;

  return (
    <div
      ref={inViewRef}
      className="card flex flex-col gap-3 overflow-hidden p-0 transition-shadow hover:shadow-card-hover"
    >
      {/* Thumbnail strip (images only) — sits above the header */}
      {(showImage || showShimmer) && (
        <button
          type="button"
          onClick={onOpen}
          disabled={!onOpen}
          className={`relative aspect-[16/9] w-full overflow-hidden bg-ink-50 ${
            onOpen ? "cursor-pointer" : "cursor-default"
          }`}
          aria-label={onOpen ? `فتح ${item.title}` : undefined}
        >
          {showShimmer && (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-ink-100 via-ink-50 to-ink-100" />
          )}
          {showImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl!}
              alt={item.title}
              className="object-cover w-full h-full transition-transform hover:scale-105"
              loading="lazy"
              decoding="async"
            />
          )}
        </button>
      )}

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          {/* Icon only when no thumbnail is showing */}
          {!showImage && !showShimmer && (
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${meta.bg} ${meta.text}`}
            >
              {meta.icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold line-clamp-2 text-ink">
              {item.title}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.bg} ${meta.text}`}
              >
                {meta.label}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  item.is_published
                    ? "bg-success/10 text-success"
                    : "bg-ink-50 text-ink-400"
                }`}
              >
                <span
                  className={`h-1 w-1 rounded-full ${
                    item.is_published ? "bg-success" : "bg-ink-400"
                  }`}
                />
                {item.is_published ? "منشور" : "مسودة"}
              </span>
            </div>
          </div>
          {actions.length > 0 && <ActionMenu items={actions} />}
        </div>

        {item.description && (
          <p className="text-xs line-clamp-2 text-ink-400">{item.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-1 border-t border-line pt-2.5">
          {isWide ? (
            <span className="rounded-full bg-info/5 px-2 py-0.5 text-[10px] font-medium text-info">
              🌐 كل المؤسسة
            </span>
          ) : (
            scopeChips.map((chip, idx) => (
              <span
                key={idx}
                className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-700"
              >
                {chip}
              </span>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={onOpen}
          disabled={!onOpen || isOpening}
          className="w-full rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-accent dark:text-[#111827] dark:hover:bg-accent-dark"
        >
          {isOpening ? "جارٍ الفتح..." : "فتح المادة"}
        </button>
      </div>
    </div>
  );
}