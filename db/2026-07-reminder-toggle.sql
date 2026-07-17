-- YORU: 設定画面(/menu)のリマインドメールON/OFFトグル用のRLS
--
-- 列 public.user_profiles.reminder_enabled は既に存在する（boolean / default true）。
-- このファイルで足すのはRLSポリシーだけ。列の追加・変更や既存行のUPDATEは一切しない。
--
-- 注意: このSupabaseプロジェクトは KASANE 等と同居している（kasane_paid / kasane_results ほか）。
-- 既存の grant や他テーブルには触れず、user_profiles の「本人の行だけ」を許可する
-- 追加に留める（追加のみなので既存の許可を狭めることはない）。
--
-- 適用方法: Supabase ダッシュボード > SQL Editor にこの内容を貼って実行。
-- 何度流しても同じ結果になる（drop policy if exists → create policy）。

alter table public.user_profiles enable row level security;

-- 本人は自分の行だけ読める（トグルの現在値の表示に使う）
drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own" on public.user_profiles
  for select to authenticated
  using (auth.uid() = id);

-- 本人は自分の行だけ更新できる（他人のidに書き換えられないよう with check も同条件）
drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own" on public.user_profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 行がまだ無いユーザーがトグルを操作したときに、自分の行を作れるようにする（upsert用）。
-- 作れるのは自分のidの行だけ。
drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own" on public.user_profiles
  for insert to authenticated
  with check (auth.uid() = id);

-- ロールバック（必要時のみ）:
-- drop policy if exists "user_profiles_select_own" on public.user_profiles;
-- drop policy if exists "user_profiles_update_own" on public.user_profiles;
-- drop policy if exists "user_profiles_insert_own" on public.user_profiles;
