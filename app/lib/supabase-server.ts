import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

// サーバー側でセッションを読むためのクライアント。用途はAPIルートでの本人確認だけで、
// DB操作は従来どおり service role のクライアント（@supabase/supabase-js）で行う。
// この分担にしておけば RLS にポリシーを足す必要がない。
//
// cookieOptions.domain をサーバー側にも渡すのが要点。
// 本番(*.yururi.app)の認証Cookieは domain=.yururi.app で発行されている
// （app/lib/supabase.ts）。サーバーがトークンをリフレッシュして書き戻すときに
// domain を渡さないと host-only の重複Cookieが生まれ、同名Cookieが並ぶと
// パーサが古い host-only を拾って「ランダムログアウト」が再発する。
// localhost / *.vercel.app では domain を付けない（付けるとブラウザが拒否する）。
// 判定はブラウザ側（app/lib/supabase.ts）と同一ロジックにそろえる。
async function cookieDomain(): Promise<string | undefined> {
  const host = (await headers()).get("host") ?? "";
  return host.endsWith("yururi.app") ? ".yururi.app" : undefined;
}

export async function createServerSupabase() {
  const cookieStore = await cookies();
  const domain = await cookieDomain();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        // cookieOptions.domain は @supabase/ssr が set/remove 両方の options に
        // 展開するため（0.9.0 の dist/main/cookies.js）、options はそのまま使えばよい。
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Route Handler 以外（RSC のレンダリング中など）では set が投げる。
            // トークンの更新はブラウザ側でも行われるため、ここは無視してよい。
          }
        },
      },
      ...(domain ? { cookieOptions: { domain } } : {}),
    }
  );
}

// ログイン中のユーザーIDを返す。未ログインなら null。
// getUser() は Auth サーバーに問い合わせてJWTを検証するので、
// Cookieを差し替えただけの偽装は通らない。
export async function getSessionUserId(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
