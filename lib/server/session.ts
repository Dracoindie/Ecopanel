import type { HrRole, Organization, User } from "@prisma/client";
import { getAuth } from "@/lib/server/auth";
import { AppConfigurationError, isDatabaseMode } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";

export interface HrContext {
  user: Pick<User, "id" | "name" | "email">;
  organization: Pick<Organization, "id" | "name" | "slug">;
  role: HrRole;
  sessionId: string;
}

export async function getSessionIdentity(headers: Headers) {
  if (!isDatabaseMode()) return null;
  const auth = getAuth();
  const result = await auth.api.getSession({ headers });
  if (result?.user?.id && result.session?.id) {
    return {
      user: result.user,
      sessionId: result.session.id
    };
  }

  await getPrisma().$queryRaw`SELECT 1`;
  return null;
}

export async function getHrContext(headers: Headers): Promise<HrContext | null> {
  if (!isDatabaseMode()) return null;

  const identity = await getSessionIdentity(headers);
  if (!identity) return null;

  const membership = await getPrisma().membership.findFirst({
    where: { userId: identity.user.id },
    include: { organization: true },
    orderBy: { createdAt: "asc" }
  });

  if (!membership) return null;

  return {
    user: {
      id: identity.user.id,
      name: identity.user.name,
      email: identity.user.email
    },
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug
    },
    role: membership.role,
    sessionId: identity.sessionId
  };
}

export function canManageApplications(role: HrRole) {
  return role === "OWNER" || role === "ADMIN" || role === "RECRUITER";
}

export function canManageOrganization(role: HrRole) {
  return role === "OWNER" || role === "ADMIN";
}

export function isAuthConfigurationError(error: unknown) {
  return error instanceof AppConfigurationError;
}
