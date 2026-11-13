import type { CurrentUser, Role } from "@/types";

const RESTRICTED_ROUTES: {
  prefix: string;
  roles?: Role[];
  requiresAuditCapability?: boolean;
}[] = [
  { prefix: "/parent", roles: ["PARENT"] },
  { prefix: "/reports", roles: ["OWNER"] },
  { prefix: "/team", roles: ["OWNER", "ADMIN"] },
  { prefix: "/settings/tenant", roles: ["OWNER", "ADMIN"] },
  { prefix: "/settings/data", roles: ["OWNER", "ADMIN"] },
  { prefix: "/settings/audit", requiresAuditCapability: true },
];

export function canAccessRoute(user: CurrentUser, pathname: string): boolean {
  const restriction = RESTRICTED_ROUTES
    .filter(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    .sort((left, right) => right.prefix.length - left.prefix.length)[0];

  if (!restriction) return true;
  if (restriction.requiresAuditCapability) {
    return user.can_view_audit_log === true;
  }
  return restriction.roles?.includes(user.role) ?? false;
}

export function safeReturnTo(
  value: string | null,
  user: CurrentUser,
): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;

    const isPlatformPath =
      url.pathname === "/platform" || url.pathname.startsWith("/platform/");
    if (isPlatformPath !== user.is_platform_admin) return null;
    if (!user.is_platform_admin && !canAccessRoute(user, url.pathname)) return null;

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
