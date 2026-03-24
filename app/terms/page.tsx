"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TERMS = {
  ja: {
    title: "利用規約",
    updated: "最終更新：2026年3月",
    sections: [
      {
        heading: "第1条　サービスの概要",
        body: "Voice Journal（以下「本サービス」）は、音声録音をもとにAIが感情を分析し、自己理解を深めるための記録サービスです。",
      },
      {
        heading: "第2条　利用資格",
        body: "本サービスは18歳以上の方を対象としています。18歳未満の方はご利用いただけません。",
      },
      {
        heading: "第3条　アカウント",
        body: "ユーザーはメールアドレスとパスワードを用いてアカウントを作成します。アカウント情報の管理はユーザー自身の責任で行ってください。",
      },
      {
        heading: "第4条　音声・テキストデータの取り扱い",
        body: "録音した音声および文字起こしテキストは、本サービスの提供・改善目的でサーバーに保存されます。第三者への販売は行いません。詳細はプライバシーポリシーをご確認ください。",
      },
      {
        heading: "第5条　AI解析",
        body: "録音内容はOpenAI社のAPIを用いて感情・トリガーの分析を行います。解析結果はあくまで参考情報であり、医療・心理診断の代替ではありません。",
      },
      {
        heading: "第6条　禁止事項",
        body: "以下の行為を禁止します。\n・他者のプライバシーを侵害する内容の録音\n・サービスへの不正アクセスや改ざん\n・反社会的・違法な目的での利用",
      },
      {
        heading: "第7条　免責事項",
        body: "本サービスはメンタルヘルスの改善を保証するものではありません。緊急時は専門機関にご相談ください。",
      },
      {
        heading: "第8条　サービスの変更・終了",
        body: "当社は事前通知のうえ、サービス内容の変更または終了を行う場合があります。",
      },
      {
        heading: "第9条　準拠法",
        body: "本規約は日本法に準拠します。",
      },
    ],
  },
  en: {
    title: "Terms of Service",
    updated: "Last updated: March 2026",
    sections: [
      {
        heading: "1. Overview",
        body: "Voice Journal (the ’Service’’) is a journaling service that uses AI to analyze emotions from voice recordings and help users deepen self-understanding.",
      },
      {
        heading: "2. Eligibility",
        body: "The Service is intended for users aged 18 and older. Users under 18 are not permitted to use the Service.",
      },
      {
        heading: "3. Account",
        body: "Users create accounts using an email address and password. You are responsible for maintaining the confidentiality of your account credentials.",
      },
      {
        heading: "4. Audio & Text Data",
        body: "Recorded audio and transcribed text are stored on our servers solely for the purpose of providing and improving the Service. We do not sell your data to third parties. Please see our Privacy Policy for details.",
      },
      {
        heading: "5. AI Analysis",
        body: "Recordings are analyzed for emotion and trigger detection using the OpenAI API. Analysis results are for reference only and do not constitute medical or psychological diagnosis.",
      },
      {
        heading: "6. Prohibited Conduct",
        body: "The following are prohibited:\n• Recording content that violates others' privacy\n• Unauthorized access or tampering with the Service\n• Use for illegal or anti-social purposes",
      },
      {
        heading: "7. Disclaimer",
        body: "The Service does not guarantee mental health improvement. Please consult a professional in emergencies.",
      },
      {
        heading: "8. Changes & Termination",
        body: "We may modify or discontinue the Service with prior notice.",
      },
      {
        heading: "9. Governing Law",
        body: "These Terms are governed by the laws of Japan.",
      },
    ],
  },
};

export default function TermsPage() {
  const [lang, setLang] = useState<"ja" | "en">("ja");
  const router = useRouter();
  const t = TERMS[lang];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;600&family=Noto+Sans+JP:wght@300;400;500&display=swap');

        .terms-root {
          min-height: 100vh;
          background: #0a0e1a;
          font-family: 'Noto Sans JP', sans-serif;
          padding-bottom: 80px;
        }
        .terms-header {
          position: sticky; top: 0; z-index: 10;
          padding: 20px 24px;
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(10,14,26,0.9);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .terms-back {
          font-size: 11px; color: rgba(139,92,246,0.45);
          background: none; border: none; cursor: pointer;
          letter-spacing: 0.08em; font-family: 'Noto Sans JP', sans-serif;
          transition: color 0.2s;
        }
        .terms-back:hover { color: rgba(139,92,246,0.9); }
        .terms-lang-tabs {
          display: flex; gap: 4px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 20px; padding: 3px;
        }
        .terms-lang-tab {
          font-size: 11px; color: rgba(255,255,255,0.25);
          background: none; border: none; border-radius: 16px;
          padding: 5px 14px; cursor: pointer;
          transition: all 0.2s; font-family: 'Noto Sans JP', sans-serif;
        }
        .terms-lang-tab--active {
          background: rgba(139,92,246,0.2);
          color: rgba(167,139,250,0.9);
        }
        .terms-body {
          max-width: 640px; margin: 0 auto;
          padding: 48px 24px 0;
        }
        .terms-title {
          font-family: 'Zen Old Mincho', serif;
          font-size: 22px; font-weight: 400;
          color: rgba(255,255,255,0.75);
          letter-spacing: 0.06em; margin: 0 0 8px 0;
        }
        .terms-updated {
          font-size: 11px; color: rgba(255,255,255,0.2);
          letter-spacing: 0.06em; margin: 0 0 48px 0;
        }
        .terms-section { margin-bottom: 36px; }
        .terms-section-heading {
          font-size: 13px; font-weight: 500;
          color: rgba(255,255,255,0.6);
          letter-spacing: 0.06em; margin: 0 0 10px 0;
        }
        .terms-section-body {
          font-size: 13px; color: rgba(255,255,255,0.38);
          line-height: 1.9; letter-spacing: 0.03em;
          margin: 0; white-space: pre-line;
        }
        .terms-divider {
          border: none;
          border-top: 1px solid rgba(255,255,255,0.04);
          margin: 0 0 36px 0;
        }
      `}</style>

      <div className="terms-root">
        <header className="terms-header">
          <button className="terms-back" onClick={() => router.back()}>← 戻る</button>
          <div className="terms-lang-tabs">
            <button className={`terms-lang-tab ${lang === "ja" ? "terms-lang-tab--active" : ""}`} onClick={() => setLang("ja")}>JP</button>
            <button className={`terms-lang-tab ${lang === "en" ? "terms-lang-tab--active" : ""}`} onClick={() => setLang("en")}>EN</button>
          </div>
        </header>

        <div className="terms-body">
          <h1 className="terms-title">{t.title}</h1>
          <p className="terms-updated">{t.updated}</p>
          {t.sections.map((s, i) => (
            <div key={i} className="terms-section">
              <hr className="terms-divider" />
              <p className="terms-section-heading">{s.heading}</p>
              <p className="terms-section-body">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
