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
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async () => {
    setLoading(true);
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      setMessage(error ? error.message : "確認メールを送りました。メールをチェックしてね。");
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

        /* 星1個 */
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
          font-family: 'Zen Maru Gothic', sans-serif;
          box-sizing: border-box;
          margin-bottom: 10px;
        }
        .login-input::placeholder { color: rgba(255,255,255,0.18); }
        .login-input:focus {
          border-color: rgba(139,92,246,0.35);
          background: rgba(255,255,255,0.06);
        }

        .login-btn {
          display: block;
          width: 100%;
          margin-top: 10px;
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
          font-family: 'Zen Maru Gothic', sans-serif;
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
            <span className="login-brand">VOICE JOURNAL</span>
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

          <button className="login-btn" onClick={handleSubmit} disabled={loading}>
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