import { NextRequest, NextResponse } from "next/server";
import { roleDescriptions, type AppRole, type AppUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { usernameToEmail } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  username: string;
  name: string;
  role: AppRole;
  sale_phu_trach: string | null;
  active: boolean;
  description: string | null;
};

function toAppUser(row: ProfileRow): AppUser {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    salePhuTrach: row.sale_phu_trach ?? undefined,
    active: row.active,
    description: row.description || roleDescriptions[row.role],
  };
}

async function requireBoss(request: NextRequest) {
  if (!supabaseAdmin) return { error: "Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY.", status: 500 as const };
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: "Chưa đăng nhập.", status: 401 as const };

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) return { error: "Session không hợp lệ.", status: 401 as const };

  const { data: profile } = await supabaseAdmin.from("user_profiles").select("role, active").eq("id", authData.user.id).maybeSingle();
  if (!profile?.active || profile.role !== "boss") return { error: "Chỉ Sếp mới được quản lý user.", status: 403 as const };
  return { userId: authData.user.id };
}

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ message: "Chưa cấu hình Supabase admin." }, { status: 500 });
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ message: "Chưa đăng nhập." }, { status: 401 });
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ message: "Session không hợp lệ." }, { status: 401 });

  const { data, error } = await supabaseAdmin.from("user_profiles").select("*").order("name");
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ users: (data as ProfileRow[]).map(toAppUser) });
}

export async function POST(request: NextRequest) {
  const guard = await requireBoss(request);
  if ("error" in guard) return NextResponse.json({ message: guard.error }, { status: guard.status });

  const body = await request.json();
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "").trim();
  const name = String(body.name || "").trim();
  const role = (body.role || "viewer") as AppRole;
  if (!username || !password || !name) return NextResponse.json({ message: "Thiếu tên, tài khoản hoặc mật khẩu." }, { status: 400 });

  const { data: created, error: createError } = await supabaseAdmin!.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    user_metadata: { name, username },
  });
  if (createError || !created.user) return NextResponse.json({ message: createError?.message || "Không tạo được user." }, { status: 400 });

  const row = {
    id: created.user.id,
    username,
    name,
    role,
    sale_phu_trach: body.salePhuTrach || null,
    active: body.active ?? true,
    description: body.description || roleDescriptions[role],
  };
  const { data, error } = await supabaseAdmin!.from("user_profiles").insert(row).select("*").single();
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ user: toAppUser(data as ProfileRow) });
}

export async function PATCH(request: NextRequest) {
  const guard = await requireBoss(request);
  if ("error" in guard) return NextResponse.json({ message: guard.error }, { status: guard.status });

  const body = await request.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ message: "Thiếu user id." }, { status: 400 });

  if (body.password) {
    const { error } = await supabaseAdmin!.auth.admin.updateUserById(id, { password: String(body.password) });
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.username === "string") {
    patch.username = body.username.trim().toLowerCase();
    await supabaseAdmin!.auth.admin.updateUserById(id, { email: usernameToEmail(patch.username as string) });
  }
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.role === "string") patch.role = body.role;
  if ("salePhuTrach" in body) patch.sale_phu_trach = body.salePhuTrach || null;
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.description === "string") patch.description = body.description;

  const { data, error } = await supabaseAdmin!.from("user_profiles").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ user: toAppUser(data as ProfileRow) });
}

export async function DELETE(request: NextRequest) {
  const guard = await requireBoss(request);
  if ("error" in guard) return NextResponse.json({ message: guard.error }, { status: guard.status });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ message: "Thiếu user id." }, { status: 400 });

  const { error } = await supabaseAdmin!.from("user_profiles").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
