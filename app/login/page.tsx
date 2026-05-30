"use client";

import { useState } from "react";
import { createClient } from "../lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // 同意チェック
  const [consentAll, setConsentAll] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  const allConsented = consentAll;

  const handleSubmit = async () => {
    if (isSignUp && !allConsented) {
      setMessage("すべての項目に同意してください。");
      return;
    }
    setLoading(true);
    if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { app_name: 'YORU' } },
        });
        if (error) {
            setMessage(error.message);
        } else if (data.user && data.user.identities?.length === 0) {

        setMessage("このメールアドレスはすでに登録されています。ログインしてください。");
        } else {
  // 新規登録成功
if (data.user) {
  await supabase.from("user_consents").insert({
    user_id: data.user.id,
    terms_version: "1.0",
    privacy_version: "1.0",
    ai_analysis_consent: true,
    data_storage_consent: true,
    product_improvement_consent: true,
  });

  // ウェルカムメール送信
  await fetch("/api/send-welcome", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: data.user.email }),
  });
}
setMessage("確認メールを送りました。メールをチェックしてね。");
}
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else router.push("/");
    }
    setLoading(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;600&family=Noto+Sans+JP:wght@300;400;500&display=swap');

        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0a0e1a;
          font-family: 'Noto Sans JP', sans-serif;
          padding: 24px;
          position: relative;
        }

        .login-star {
          position: fixed;
          width: 2px; height: 2px;
          border-radius: 50%;
          background: rgba(255,255,255,0.5);
          top: 22%; right: 25%;
          box-shadow: 0 0 5px rgba(255,255,255,0.2);
          animation: login-twinkle 6s ease-in-out infinite;
        }
        @keyframes login-twinkle { 0%,100% { opacity:0.5; } 50% { opacity:0.12; } }

        .login-glow {
          position: fixed;
          top: -80px; left: 50%;
          transform: translateX(-50%);
          width: 500px; height: 280px;
          background: radial-gradient(ellipse, rgba(139,92,246,0.08) 0%, transparent 65%);
          pointer-events: none;
        }

        .login-card {
          position: relative;
          z-index: 1;
          width: 100%; max-width: 340px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 22px;
          padding: 44px 32px 36px;
        }

        .login-top { text-align: center; margin-bottom: 36px; }
        .login-moon { font-size: 28px; margin-bottom: 12px; display: block; }
        .login-brand {
          font-family: 'Zen Old Mincho', serif;
          font-size: 11px;
          letter-spacing: 0.35em;
          color: rgba(139,92,246,0.45);
          display: block;
          margin-bottom: 20px;
        }
        .login-greeting {
          font-size: 19px;
          font-weight: 300;
          color: rgba(255,255,255,0.7);
          letter-spacing: 0.04em;
        }

        .login-input {
          display: block;
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 11px;
          padding: 13px 15px;
          font-size: 14px;
          color: rgba(255,255,255,0.75);
          outline: none;
          transition: border-color 0.2s, background 0.2s;
          font-family: 'Noto Sans JP', sans-serif;
          box-sizing: border-box;
          margin-bottom: 10px;
        }
        .login-input::placeholder { color: rgba(255,255,255,0.18); }
        .login-input:focus {
          border-color: rgba(139,92,246,0.35);
          background: rgba(255,255,255,0.06);
        }

        /* 同意エリア */
        .consent-wrap {
          margin: 16px 0 4px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .consent-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          cursor: pointer;
        }
        .consent-checkbox {
          width: 16px; height: 16px;
          border-radius: 4px;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.04);
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          flex-shrink: 0;
          margin-top: 2px;
          transition: all 0.2s;
          position: relative;
        }
        .consent-checkbox:checked {
          background: rgba(139,92,246,0.7);
          border-color: rgba(139,92,246,0.9);
        }
        .consent-checkbox:checked::after {
          content: "✓";
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          font-size: 10px;
          color: white;
        }
        .consent-label {
          font-size: 11px;
          color: rgba(255,255,255,0.4);
          line-height: 1.7;
          letter-spacing: 0.03em;
        }
        .consent-link {
          color: rgba(139,92,246,0.6);
          text-decoration: underline;
          cursor: pointer;
          background: none;
          border: none;
          font-size: 11px;
          font-family: 'Noto Sans JP', sans-serif;
          padding: 0;
        }
        .consent-link:hover { color: rgba(139,92,246,0.9); }

        .login-btn {
          display: block;
          width: 100%;
          margin-top: 16px;
          padding: 14px;
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
        .login-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
        .login-btn:active:not(:disabled) { transform: translateY(0); }
        .login-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .login-msg {
          margin-top: 16px;
          font-size: 12px;
          color: rgba(167,139,250,0.65);
          text-align: center;
          line-height: 1.7;
        }

        .login-sep { margin: 22px 0; border: none; border-top: 1px solid rgba(255,255,255,0.04); }

        .login-toggle {
          text-align: center;
          font-size: 12px;
          color: rgba(255,255,255,0.18);
          cursor: pointer;
          letter-spacing: 0.05em;
          transition: color 0.2s;
        }
        .login-toggle:hover { color: rgba(139,92,246,0.65); }
      `}</style>

      <div className="login-root">
        <div className="login-star" />
        <div className="login-glow" />

        <div className="login-card">
          <div className="login-top">
            <span className="login-moon">🌙</span>
            <span className="login-brand">YORU</span>
            <h1 className="login-greeting">{isSignUp ? "はじめよう" : "おかえり"}</h1>
          </div>

          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="login-input"
          />
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="login-input"
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />

          {/* 新規登録時のみ同意フロー表示 */}
          {isSignUp && (
            <div className="consent-wrap">
                <label className="consent-item">
                    <input
                        type="checkbox"
                        className="consent-checkbox"
                        checked={consentAll}
                        onChange={(e) => setConsentAll(e.target.checked)}
                    />
                        <span className="consent-label">
                            <button className="consent-link" onClick={() => window.open("/terms", "_blank")}>利用規約</button>
                        および
                        <button className="consent-link" onClick={() => window.open("/privacy", "_blank")}>プライバシーポリシー</button>
                        に同意します。
                        </span>
                </label>
            </div>
          )}

          <button
            className="login-btn"
            onClick={handleSubmit}
            disabled={loading || (isSignUp && !allConsented)}
          >
            {loading ? "..." : isSignUp ? "登録する" : "ログイン"}
          </button>

          {message && <p className="login-msg">{message}</p>}

          <hr className="login-sep" />

          <p className="login-toggle" onClick={() => { setIsSignUp(!isSignUp); setMessage(""); }}>
            {isSignUp ? "すでにアカウントがある → ログイン" : "はじめての方 → アカウントを作る"}
          </p>
        </div>
      </div>
    </>
  );
}