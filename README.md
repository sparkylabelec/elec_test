# 전기기능사 Flash Card Quiz

`organized_html/structured/questions.json`와 요점정리 기반 암기카드를 사용하는 Next.js 퀴즈 앱입니다.

## 주요 기능

- 이메일/비밀번호 회원가입 및 로그인
- 가입 시 이름 입력
- 가입 확인 메일 없이 즉시 가입
- 비밀번호 재설정에만 이메일 발송
- 객관식, 암기모드, 혼합 출제
- 객관식 보기 랜덤 섞기 및 정답 번호 반영
- Anki식 반복 학습: `Fail`은 복습 대기열로, `OK`는 완료 처리
- 저장 카드 복습
- 개인별 학습 통계
- 관리자 전체 회원 통계

## 로컬 실행

```bash
npm install
npm run dev
```

Supabase 환경 변수가 없으면 브라우저 로컬 저장소 기반 데모 모드로 동작합니다.

## Supabase 설정

1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase/schema.sql` 전체를 실행하거나, CLI 로그인 후 migration을 적용합니다.
3. Authentication > Providers에서 Email provider를 활성화합니다.
4. Authentication > URL Configuration에서 배포 URL을 등록합니다.
   - Site URL: `https://electrician-quiz-ten.vercel.app`
   - Redirect URLs: `https://electrician-quiz-ten.vercel.app/**`
   - 로컬 개발용: `http://localhost:3000/**`
5. 아래 값을 Vercel 환경 변수에 등록합니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 값입니다. `NEXT_PUBLIC_` 접두사를 붙이지 말고, 브라우저 코드에 노출하지 마세요. 이 앱은 가입 확인 메일을 보내지 않기 위해 서버 API에서 Supabase Admin으로 사용자를 즉시 confirmed 상태로 생성합니다.

관리자 계정은 Supabase SQL Editor에서 해당 사용자의 `profiles.is_admin` 값을 `true`로 변경하면 됩니다.

```sql
update public.profiles
set is_admin = true
where email = 'admin@example.com';
```

CLI로 적용할 경우:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

## Vercel 배포

현재 Vercel 프로젝트:

- Team: `minuxs-projects`
- Project: `electrician-quiz`
- Production URL: `https://electrician-quiz-ten.vercel.app`

환경 변수 설정 후 재배포:

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel --prod
```

## GitHub 연결

GitHub 저장소를 만든 뒤 Vercel 프로젝트와 연결합니다.

```bash
npx vercel git connect https://github.com/OWNER/REPO
```

이후 GitHub에 push하면 Vercel이 자동으로 preview/production 배포를 수행할 수 있습니다.
