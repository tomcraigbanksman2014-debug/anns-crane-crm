import AdminUsersClient from "./AdminUsersClient";
import { requireAdmin } from "../../lib/routeGuards";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireAdmin();
  return <AdminUsersClient />;
}
