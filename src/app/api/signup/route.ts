import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanEnvValue(value: string | undefined) {
  return value?.replace(/\uFEFF/g, "").trim() ?? "";
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: Request) {
  const supabaseUrl = cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse("서버 가입 설정이 필요합니다. Vercel에 SUPABASE_SERVICE_ROLE_KEY를 등록하세요.", 500);
  }

  const body = await request.json().catch(() => null) as
    | { email?: string; password?: string; username?: string; fullName?: string }
    | null;

  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  const username = body?.username?.trim() || email.split("@")[0] || "user";
  const fullName = body?.fullName?.trim() || username;

  if (!email || !password) {
    return errorResponse("이메일과 비밀번호를 입력하세요.");
  }

  if (password.length < 6) {
    return errorResponse("비밀번호는 6자 이상이어야 합니다.");
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    return errorResponse(error?.message ?? "회원가입에 실패했습니다.");
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
    id: data.user.id,
    email,
    username,
    full_name: fullName,
    updated_at: new Date().toISOString(),
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(data.user.id);
    return errorResponse(profileError.message);
  }

  return NextResponse.json({ ok: true });
}
