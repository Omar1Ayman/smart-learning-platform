/**
 * Central hierarchy rules — every cascade filter in the app comes from here.
 *
 * Why a dedicated module: before this, ContentForm, TargetPicker, and
 * EnrollmentForm each had their own .filter() chains that could drift apart.
 * When one form gets the rule wrong, another form behaves differently, and
 * users get inconsistent experiences. Every rule for "given a stage and/or
 * grade, what groups are valid?" lives here, tested once, reused everywhere.
 *
 * Resolution rule for the middle level (stage without grade): a group has
 * a direct FK only to grade. If the caller specified a stage but not a
 * grade, we resolve which grades belong to that stage, then filter groups
 * whose grade is one of those. Same logic applies to courses.
 *
 * Callers that have a MORE specific filter (grade is set) take precedence
 * over the less specific one (stage). Both set is fine — the more specific
 * wins. This matches what users expect when they drill down.
 */

export interface HierarchyFilters {
  stage?: string;
  grade?: string;
  course?: string;
  chapter?: string;
  academic_year?: string;
  subject?: string;
}

// Minimal shapes — just what the filters need. Keeping these local means
// this file doesn't depend on the app's full type tree.
interface GradeLike {
  id: string;
  stage: string;
  name: string;
  order: number;
}
interface GroupLike {
  id: string;
  grade: string;
  name: string;
}
interface CourseLike {
  id: string;
  grade: string;
  subject: string;
  name: string;
}
interface ChapterLike {
  id: string;
  course: string;
  name: string;
  order: number;
}
interface LessonLike {
  id: string;
  chapter: string;
  name: string;
  order: number;
}
interface TermLike {
  id: string;
  academic_year: string;
  name: string;
}

/**
 * Given the current filter context, return the set of grade IDs that match.
 * Returns `null` when no narrowing is possible (= "show everything").
 */
function resolveGradeIds(
  filters: HierarchyFilters,
  grades: GradeLike[]
): Set<string> | null {
  if (filters.grade) return new Set([filters.grade]);
  if (filters.stage) {
    return new Set(
      grades.filter((g) => g.stage === filters.stage).map((g) => g.id)
    );
  }
  return null;
}

export function filterGrades<T extends GradeLike>(
  grades: T[],
  filters: HierarchyFilters
): T[] {
  if (!filters.stage) return grades;
  return grades.filter((g) => g.stage === filters.stage);
}

export function filterGroups<T extends GroupLike>(
  groups: T[],
  filters: HierarchyFilters,
  grades: GradeLike[]
): T[] {
  const gradeIds = resolveGradeIds(filters, grades);
  if (gradeIds === null) return groups;
  return groups.filter((g) => gradeIds.has(g.grade));
}

export function filterCourses<T extends CourseLike>(
  courses: T[],
  filters: HierarchyFilters,
  grades: GradeLike[]
): T[] {
  let result = courses;
  const gradeIds = resolveGradeIds(filters, grades);
  if (gradeIds !== null) {
    result = result.filter((c) => gradeIds.has(c.grade));
  }
  if (filters.subject) {
    result = result.filter((c) => c.subject === filters.subject);
  }
  return result;
}

export function filterChapters<T extends ChapterLike>(
  chapters: T[],
  filters: HierarchyFilters
): T[] {
  if (!filters.course) return chapters;
  return chapters.filter((c) => c.course === filters.course);
}

export function filterLessons<T extends LessonLike>(
  lessons: T[],
  filters: HierarchyFilters
): T[] {
  if (!filters.chapter) return lessons;
  return lessons.filter((l) => l.chapter === filters.chapter);
}

export function filterTerms<T extends TermLike>(
  terms: T[],
  filters: HierarchyFilters
): T[] {
  if (!filters.academic_year) return terms;
  return terms.filter((t) => t.academic_year === filters.academic_year);
}