-- YORU: 「1セッション（往復まるごと）＝1記録」対応
-- 既存の journals テーブルに、対話ループ用のカラムを加算的に追加する。
-- すべて nullable / 非破壊。旧データ（source が null / "memo" / "timecapsule"）は無変更で動く。
--
-- 適用方法: Supabase ダッシュボード > SQL Editor にこの内容を貼って実行。
-- ロールバックは各カラムを DROP するだけ（下部にコメントで記載）。

-- 往復全文（発話者つき）。例: [{"role":"user","content":"..."},{"role":"yoru","content":"..."}]
alter table public.journals
  add column if not exists messages jsonb;

-- 将来の持ち越し用（Phase2: 1セッションを一言に要約して翌日以降へ）。今は空のまま。
alter table public.journals
  add column if not exists session_summary text;

-- セッションの状態。"open"（対話中・途中保存）/ "closed"（締め済み）。
-- 途中でタブを閉じた行を後から判別・掃除できるようにする。
alter table public.journals
  add column if not exists session_status text;

-- ロールバック（必要時のみ）:
-- alter table public.journals drop column if exists messages;
-- alter table public.journals drop column if exists session_summary;
-- alter table public.journals drop column if exists session_status;
