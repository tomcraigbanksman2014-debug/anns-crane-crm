import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAccessContext, type AccessContext } from "./access";
import { isMasterAdminEmail } from "./admin";

type GuardResult = {
  ctx: AccessContext | null;
  response: NextResponse | null;
};

function isOfficeContext(ctx: AccessContext) {
  return ctx.role === "admin" || ctx.role === "staff";
}

function isAdminContext(ctx: AccessContext) {
  return ctx.role === "admin";
}

function isMasterAdminContext(ctx: AccessContext) {
  return isMasterAdminEmail(ctx.user?.email ?? null);
}

export async function requireOfficeUser() {
  const ctx = await getAccessContext();
  if (!ctx.user) redirect("/login");
  if (!isOfficeContext(ctx)) redirect("/");
  return ctx;
}

export async function requireAdmin() {
  const ctx = await getAccessContext();
  if (!ctx.user) redirect("/login");
  if (!isAdminContext(ctx)) redirect("/");
  return ctx;
}

export async function requireMasterAdmin() {
  const ctx = await getAccessContext();
  if (!ctx.user) redirect("/login");
  if (!isMasterAdminContext(ctx)) redirect("/");
  return ctx;
}

export async function requireOfficeUserApi(): Promise<GuardResult> {
  try {
    const ctx = await getAccessContext();
    if (!ctx.user) return { ctx: null, response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
    if (!isOfficeContext(ctx)) return { ctx, response: NextResponse.json({ error: "Office user access only" }, { status: 403 }) };
    return { ctx, response: null };
  } catch (error: any) {
    return { ctx: null, response: NextResponse.json({ error: error?.message || "Access check failed" }, { status: 500 }) };
  }
}

export async function requireAdminApi(): Promise<GuardResult> {
  try {
    const ctx = await getAccessContext();
    if (!ctx.user) return { ctx: null, response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
    if (!isAdminContext(ctx)) return { ctx, response: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
    return { ctx, response: null };
  } catch (error: any) {
    return { ctx: null, response: NextResponse.json({ error: error?.message || "Access check failed" }, { status: 500 }) };
  }
}

export async function requireMasterAdminApi(): Promise<GuardResult> {
  try {
    const ctx = await getAccessContext();
    if (!ctx.user) return { ctx: null, response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
    if (!isMasterAdminContext(ctx)) return { ctx, response: NextResponse.json({ error: "Masteradmin only" }, { status: 403 }) };
    return { ctx, response: null };
  } catch (error: any) {
    return { ctx: null, response: NextResponse.json({ error: error?.message || "Access check failed" }, { status: 500 }) };
  }
}
