import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMasterAdminEmail } from "../../../../lib/admin";
import { requireAdminApi } from "../../../../lib/routeGuards";
import { writeAuditLog } from "../../../../lib/audit";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Server missing Supabase env vars");
  }

  return createClient(supabaseUrl, serviceKey);
}

async function getTargetUserById(admin: ReturnType<typeof getAdminClient>, id: string) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new Error(error.message);
    }

    const users = data?.users ?? [];
    const found = users.find((u) => u.id === id);
    if (found) return found;

    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdminApi();
    if (auth.response) return auth.response;
    const user = auth.ctx!.user;

    const body = await req.json().catch(() => ({}));
    const password = String(body?.password ?? "");

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const admin = getAdminClient();
    const targetUser = await getTargetUserById(admin, params.id);

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const masterAdminEmail = getMasterAdminEmail();
    const targetEmail = String(targetUser.email ?? "").toLowerCase();

    if (targetEmail === masterAdminEmail) {
      return NextResponse.json(
        { error: "The master admin account cannot be changed here" },
        { status: 403 }
      );
    }

    const mergedMetadata = {
      ...(targetUser.user_metadata ?? {}),
      must_change_password: true,
      password_changed_at: null,
    };

    const { error } = await admin.auth.admin.updateUserById(params.id, {
      password,
      user_metadata: mergedMetadata,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "reset_password",
      entity_type: "staff_user",
      entity_id: params.id,
      meta: {
        target_email: targetUser.email ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdminApi();
    if (auth.response) return auth.response;
    const user = auth.ctx!.user;

    const admin = getAdminClient();
    const targetUser = await getTargetUserById(admin, params.id);

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const masterAdminEmail = getMasterAdminEmail();
    const targetEmail = String(targetUser.email ?? "").toLowerCase();
    const actorEmail = String(user.email ?? "").toLowerCase();
    const targetRole = String(targetUser.user_metadata?.role ?? "staff").toLowerCase();

    if (targetEmail === masterAdminEmail) {
      return NextResponse.json(
        { error: "The master admin account cannot be deleted" },
        { status: 403 }
      );
    }

    if (targetEmail === actorEmail) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    if (targetRole === "operator") {
      await admin.from("operators").delete().eq("email", targetEmail);
    }

    const { error } = await admin.auth.admin.deleteUser(params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_username: user.email ? user.email.split("@")[0] : null,
      action: "delete_user",
      entity_type: "staff_user",
      entity_id: params.id,
      meta: {
        target_email: targetUser.email ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
