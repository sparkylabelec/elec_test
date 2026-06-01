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
    return errorResponse("서버 로그인 설정이 필요합니다.", 500);
  }

  const body = await request.json().catch(() => null) as { username?: string } | null;
  const username = body?.username?.trim() ?? "";

  if (!username) {
    return errorResponse("ID를 입력하세요.");
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    return errorResponse(error.message);
  }

  if (!data?.email) {
    return errorResponse("등록된 ID가 없습니다.", 404);
  }

  return NextResponse.json({ email: data.email });
}
