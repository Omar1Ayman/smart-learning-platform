"use client";

import { useQuery } from "@tanstack/react-query";
import { listChapters } from "@/lib/api/chapters";
import { listCourses } from "@/lib/api/courses";
import { listGrades } from "@/lib/api/grades";
import { listGroups } from "@/lib/api/groups";
import { listLessons } from "@/lib/api/lessons";
import { listTerms } from "@/lib/api/terms";
import { listUsers } from "@/lib/api/users";
import {
  filterChapters,
  filterCourses,
  filterGrades,
  filterGroups,
  filterLessons,
  filterTerms,
  type HierarchyFilters,
} from "@/lib/hierarchy";

export type CascadeKey =
  | "grade"
  | "group"
  | "course"
  | "chapter"
  | "lesson"
  | "term"
  | "student"
  | "teacher";

export interface CascadeOption {
  value: string;
  label: string;
}

export interface CascadeResult {
  options: CascadeOption[];
  isLoading: boolean;
  /** A human-readable reason why options is empty — null when options aren't empty. */
  emptyReason: string | null;
}

/**
 * The one hook every cascade field uses. Given a key (what we're picking)
 * and the currently-selected parent filters, returns the right option list
 * and — critically — a smart empty reason that tells the user *why* there's
 * nothing to pick ("select the course first" vs "no chapters exist yet"),
 * not just "no options" which is the same useless message in every case.
 *
 * Data fetching uses the shared react-query cache, so opening three cascade
 * fields on the same page triggers one list request, not three.
 */
export function useCascadeOptions(
  key: CascadeKey,
  filters: HierarchyFilters = {}
): CascadeResult {
  const needsGrades = key === "grade" || key === "group" || key === "course";

  const { data: grades, isLoading: gradesLoading } = useQuery({
    queryKey: ["grades"],
    queryFn: () => listGrades(),
    enabled: needsGrades,
  });

  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: () => listGroups(),
    enabled: key === "group",
  });

  const { data: courses, isLoading: coursesLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: () => listCourses(),
    enabled: key === "course" || key === "chapter",
  });

  const { data: chapters, isLoading: chaptersLoading } = useQuery({
    queryKey: ["chapters"],
    queryFn: () => listChapters(),
    enabled: key === "chapter" || key === "lesson",
  });

  const { data: lessons, isLoading: lessonsLoading } = useQuery({
    queryKey: ["lessons"],
    queryFn: () => listLessons(),
    enabled: key === "lesson",
  });

const { data: terms, isLoading: termsLoading } = useQuery({
  queryKey: ["terms"],
  queryFn: () => listTerms(),
  enabled: key === "term",
});

  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ["users", "STUDENT"],
    queryFn: () => listUsers("STUDENT"),
    enabled: key === "student",
  });

  const { data: teachers, isLoading: teachersLoading } = useQuery({
    queryKey: ["users", "TEACHER"],
    queryFn: () => listUsers("TEACHER"),
    enabled: key === "teacher",
  });

  let options: CascadeOption[] = [];
  let rawCount = 0;
  let isLoading = false;
  let requiresParent: string | null = null;

  if (key === "grade") {
    isLoading = gradesLoading;
    const all = grades?.results ?? [];
    rawCount = all.length;
    options = filterGrades(all, filters).map((g) => ({ value: g.id, label: g.name }));
  } else if (key === "group") {
    isLoading = groupsLoading || gradesLoading;
    const allGroups = groups?.results ?? [];
    const allGrades = grades?.results ?? [];
    rawCount = allGroups.length;
    options = filterGroups(allGroups, filters, allGrades).map((g) => ({
      value: g.id,
      label: g.name,
    }));
  } else if (key === "course") {
    isLoading = coursesLoading || gradesLoading;
    const allCourses = courses?.results ?? [];
    const allGrades = grades?.results ?? [];
    rawCount = allCourses.length;
    options = filterCourses(allCourses, filters, allGrades).map((c) => ({
      value: c.id,
      label: c.name,
    }));
  } else if (key === "chapter") {
    isLoading = chaptersLoading;
    const all = chapters?.results ?? [];
    rawCount = all.length;
    if (!filters.course) {
      requiresParent = "course";
    } else {
      options = filterChapters(all, filters).map((c) => ({
        value: c.id,
        label: `${c.order}. ${c.name}`,
      }));
    }
  } else if (key === "lesson") {
    isLoading = lessonsLoading;
    const all = lessons?.results ?? [];
    rawCount = all.length;
    if (!filters.chapter) {
      requiresParent = "chapter";
    } else {
      options = filterLessons(all, filters).map((l) => ({
        value: l.id,
        label: `${l.order}. ${l.name}`,
      }));
    }
  } else if (key === "term") {
    isLoading = termsLoading;
    const all = terms?.results ?? [];
    rawCount = all.length;
    options = filterTerms(all, filters).map((t) => ({ value: t.id, label: t.name }));
  } else if (key === "student") {
    isLoading = studentsLoading;
    const all = students?.results ?? [];
    rawCount = all.length;
    options = all.map((s) => ({
      value: s.id,
      label: [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || s.email,
    }));
  } else if (key === "teacher") {
    isLoading = teachersLoading;
    const all = teachers?.results ?? [];
    rawCount = all.length;
    options = all.map((t) => ({
      value: t.id,
      label: [t.first_name, t.last_name].filter(Boolean).join(" ").trim() || t.email,
    }));
  }

  let emptyReason: string | null = null;
  if (!isLoading && options.length === 0) {
    if (requiresParent) {
      emptyReason = `اختر ${parentLabel(requiresParent)} أولاً`;
    } else if (rawCount === 0) {
      emptyReason = `لم تُضف ${pluralLabel(key)} بعد`;
    } else if (filters.grade) {
      emptyReason = `لا توجد ${pluralLabel(key)} في هذا الصف`;
    } else if (filters.stage) {
      emptyReason = `لا توجد ${pluralLabel(key)} في هذه المرحلة`;
    } else if (filters.course) {
      emptyReason = `لا توجد ${pluralLabel(key)} في هذه المادة`;
    } else if (filters.chapter) {
      emptyReason = `لا توجد ${pluralLabel(key)} في هذا الفصل`;
    } else if (filters.academic_year) {
      emptyReason = `لا توجد ${pluralLabel(key)} في هذه السنة`;
    } else if (filters.subject) {
      emptyReason = `لا توجد ${pluralLabel(key)} لهذه المادة`;
    } else {
      emptyReason = `لا توجد ${pluralLabel(key)}`;
    }
  }

  return { options, isLoading, emptyReason };
}

function parentLabel(key: string): string {
  return (
    {
      course: "المادة الدراسية",
      chapter: "الفصل",
      grade: "الصف",
      stage: "المرحلة",
      academic_year: "السنة الدراسية",
    } as Record<string, string>
  )[key] ?? key;
}

function pluralLabel(key: CascadeKey): string {
  return (
    {
      grade: "صفوف",
      group: "مجموعات",
      course: "مواد دراسية",
      chapter: "فصول",
      lesson: "دروس",
      term: "ترمات",
      student: "طلاب",
      teacher: "معلمون",
    } as Record<CascadeKey, string>
  )[key];
}