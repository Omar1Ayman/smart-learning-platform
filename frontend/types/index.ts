export type Role = "OWNER" | "ADMIN" | "TEACHER" | "STUDENT";

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  tenant: TenantSummary | null;
}

export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Term {
  id: string;
  academic_year: string;
  name: string;
  start_date: string;
  end_date: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
