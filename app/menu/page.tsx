"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase";
import { useRouter } from "next/navigation";

export default function MenuPage() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  // 認証ガード：未ログインなら /login へ。現在のメールアドレスを初期表示。
  useEffect(() => {
    const checkUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) { router.push("/login"); return; }
      setEmail(data.user.email ?? "");
    };
    checkUser();
  }, [router, supabase]);

  const handleEmailChange = async () => {
    if (!email) { setEmailMessage("メールアドレスを入力してね。"); return; }
    setEmailLoading(true);
    setEmailMessage("");
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: "https://yoru.yururi.app/menu" }
    );
    if (error) {
      setEmailMessage(error.message);
    } else {
      setEmailMessage("確認メールを送信しました。メールをチェックしてね。");
    }
    setEmailLoading(false);
  };

  const handlePasswordChange = async () => {
    if (!newPassword) { setPasswordMessage("新しいパスワードを入力してね。"); return; }
    if (newPassword !== newPasswordConfirm) {
      setPasswordMessage("確認用のパスワードが一致しないよ。");
      return;
    }
    setPasswordLoading(true);
    setPasswordMessage("");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordMessage(error.message);
    } else {
      setPasswordMessage("パスワードを変更しました。");
      setNewPassword("");
      setNewPasswordConfirm("");
    }
    setPasswordLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;600&family=Noto+Sans+JP:wght@300;400;500&display=swap');

        .menu-root {
          min-height: 100vh;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          background: #0a0e1a;
          font-family: 'Noto Sans JP', sans-serif;
          padding: 56px 24px;
          position: relative;
        }

        .menu-star {
          position: fixed;
          width: 2px; height: 2px;
          border-radius: 50%;
          background: rgba(255,255,255,0.5);
          top: 18%; right: 22%;
          box-shadow: 0 0 5px rgba(255,255,255,0.2);
          animation: menu-twinkle 6s ease-in-out infinite;
        }
        @keyframes menu-twinkle { 0%,100% { opacity:0.5; } 50% { opacity:0.12; } }

        .menu-glow {
          position: fixed;
          top: -80px; left: 50%;
          transform: translateX(-50%);
          width: 500px; height: 280px;
          background: radial-gradient(ellipse, rgba(139,92,246,0.08) 0%, transparent 65%);
          pointer-events: none;
        }

        .menu-wrap {
          position: relative;
          z-index: 1;
          width: 100%; max-width: 340px;
        }

        .menu-top { text-align: center; margin-bottom: 28px; }
        .menu-brand {
          font-family: 'Zen Old Mincho', serif;
          font-size: 11px;
          letter-spacing: 0.35em;
          color: rgba(139,92,246,0.45);
          display: block;
          margin-bottom: 14px;
        }
        .menu-title {
          font-size: 19px;
          font-weight: 300;
          color: rgba(255,255,255,0.7);
          letter-spacing: 0.08em;
          margin: 0;
        }

        .menu-back {
          display: block;
          margin: 0 auto 24px;
          background: none;
          border: none;
          color: rgba(255,255,255,0.28);
          font-size: 12px;
          font-family: 'Noto Sans JP', sans-serif;
          letter-spacing: 0.08em;
          cursor: pointer;
          transition: color 0.2s;
        }
        .menu-back:hover { color: rgba(139,92,246,0.65); }

        .menu-card {
          width: 100%;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 18px;
          padding: 24px 22px;
          margin-bottom: 16px;
        }
        .menu-section-label {
          font-family: 'Zen Old Mincho', serif;
          font-size: 12px;
          color: rgba(255,255,255,0.55);
          letter-spacing: 0.12em;
          margin: 0 0 16px 0;
        }

        .menu-input {
          display: block;
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 11px;
          padding: 12px 14px;
          font-size: 14px;
          color: rgba(255,255,255,0.75);
          outline: none;
          transition: border-color 0.2s, background 0.2s;
          font-family: 'Noto Sans JP', sans-serif;
          box-sizing: border-box;
          margin-bottom: 10px;
        }
        .menu-input::placeholder { color: rgba(255,255,255,0.18); }
        .menu-input:focus {
          border-color: rgba(139,92,246,0.35);
          background: rgba(255,255,255,0.06);
        }

        .menu-btn {
          display: block;
          width: 100%;
          margin-top: 6px;
          padding: 12px;
          border-radius: 50px;
          border: none;
          background: linear-gradient(135deg, #5b21b6 0%, #8b5cf6 100%);
          color: rgba(255,255,255,0.9);
          font-size: 13px;
          font-weight: 400;
          letter-spacing: 0.14em;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.15s;
          font-family: 'Noto Sans JP', sans-serif;
          box-shadow: 0 6px 24px rgba(91,33,182,0.35);
        }
        .menu-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
        .menu-btn:active:not(:disabled) { transform: translateY(0); }
        .menu-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .menu-msg {
          margin-top: 12px;
          font-size: 12px;
          color: rgba(167,139,250,0.65);
          text-align: center;
          line-height: 1.7;
        }

        .menu-links {
          display: flex;
          justify-content: center;
          gap: 18px;
          margin: 4px 0 16px;
        }
        .menu-link {
          background: none;
          border: none;
          color: rgba(139,92,246,0.6);
          font-size: 12px;
          font-family: 'Noto Sans JP', sans-serif;
          letter-spacing: 0.06em;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 3px;
          padding: 0;
          transition: color 0.2s;
        }
        .menu-link:hover { color: rgba(139,92,246,0.9); }

        .menu-logout-btn {
          display: block;
          width: 100%;
          padding: 12px;
          border-radius: 50px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.02);
          color: rgba(255,255,255,0.55);
          font-size: 13px;
          font-family: 'Noto Sans JP', sans-serif;
          letter-spacing: 0.14em;
          cursor: pointer;
          transition: all 0.2s;
        }
        .menu-logout-btn:hover {
          color: rgba(255,255,255,0.8);
          border-color: rgba(255,255,255,0.18);
        }

        .menu-danger {
          margin-top: 8px;
          padding: 20px 22px;
          border-radius: 18px;
          border: 1px solid rgba(255,100,100,0.12);
          background: rgba(255,100,100,0.02);
        }
        .menu-danger-label {
          font-family: 'Zen Old Mincho', serif;
          font-size: 12px;
          color: rgba(255,150,150,0.5);
          letter-spacing: 0.12em;
          margin: 0 0 14px 0;
        }
        .menu-delete-btn {
          display: block;
          width: 100%;
          padding: 12px;
          border-radius: 50px;
          border: 1px solid rgba(255,100,100,0.15);
          background: rgba(255,100,100,0.04);
          color: rgba(255,150,150,0.4);
          font-size: 13px;
          font-family: 'Noto Sans JP', sans-serif;
          letter-spacing: 0.14em;
          cursor: not-allowed;
        }
        .menu-delete-note {
          margin-top: 12px;
          font-size: 11px;
          color: rgba(255,255,255,0.3);
          line-height: 1.8;
          letter-spacing: 0.03em;
          text-align: center;
        }
        .menu-delete-note a {
          color: rgba(139,92,246,0.6);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .menu-delete-note a:hover { color: rgba(139,92,246,0.9); }
      `}</style>

      <div className="menu-root">
        <div className="menu-star" />
        <div className="menu-glow" />

        <div className="menu-wrap">
          <div className="menu-top">
            <span className="menu-brand">YORU</span>
            <h1 className="menu-title">設定</h1>
          </div>
          <button className="menu-back" onClick={() => router.push("/")}>← もどる</button>

          {/* メールアドレス変更 */}
          <div className="menu-card">
            <p className="menu-section-label">メールアドレス</p>
            <input
              type="email"
              placeholder="メールアドレス"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="menu-input"
            />
            <button
              className="menu-btn"
              onClick={handleEmailChange}
              disabled={emailLoading}
            >
              {emailLoading ? "..." : "メールアドレスを変更"}
            </button>
            {emailMessage && <p className="menu-msg">{emailMessage}</p>}
          </div>

          {/* パスワード変更 */}
          <div className="menu-card">
            <p className="menu-section-label">パスワード</p>
            <input
              type="password"
              placeholder="新しいパスワード"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="menu-input"
            />
            <input
              type="password"
              placeholder="新しいパスワード（確認）"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              className="menu-input"
              onKeyDown={(e) => e.key === "Enter" && handlePasswordChange()}
            />
            <button
              className="menu-btn"
              onClick={handlePasswordChange}
              disabled={passwordLoading}
            >
              {passwordLoading ? "..." : "パスワードを変更"}
            </button>
            {passwordMessage && <p className="menu-msg">{passwordMessage}</p>}
          </div>

          {/* 規約・プライバシー */}
          <div className="menu-card">
            <div className="menu-links">
              <button className="menu-link" onClick={() => router.push("/terms")}>利用規約</button>
              <button className="menu-link" onClick={() => router.push("/privacy")}>プライバシーポリシー</button>
            </div>
            <button className="menu-logout-btn" onClick={handleLogout}>ログアウト</button>
          </div>

          {/* アカウント削除（準備中） */}
          <div className="menu-danger">
            <p className="menu-danger-label">アカウント削除</p>
            <button className="menu-delete-btn" disabled>準備中</button>
            <p className="menu-delete-note">
              どうしても削除したい場合は<br />
              <a href="mailto:hello@yoru-voice.com">お問い合わせ</a>ください。
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
