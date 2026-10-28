import { headers } from "next/headers";
import DemoDashboardClient from "@/components/hr/DemoDashboardClient";
import { DatabaseDashboard } from "@/components/hr/DatabaseDashboard";
import { getDataMode } from "@/lib/server/config";
import { getHrCounts, listHrApplications } from "@/lib/server/recruitment/hr";
import { getHrContext } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function HrDashboardPage() {
  if (getDataMode() === "demo") return <DemoDashboardClient />;

  const context = await getHrContext(await headers());
  if (!context) return null;
  const [counts, recent] = await Promise.all([
    getHrCounts(context.organization.id),
    listHrApplications({ organizationId: context.organization.id, page: 1, pageSize: 6 })
  ]);
  return <DatabaseDashboard organizationName={context.organization.name} userName={context.user.name} counts={counts} recent={recent} />;
}