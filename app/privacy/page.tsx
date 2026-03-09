"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PRIVACY = {
  ja: {
    title: "プライバシーポリシー",
    updated: "最終更新：2026年3月",
    sections: [
      {
        heading: "1. 収集する情報",
        body: "本サービスでは以下の情報を収集します。\n・メールアドレス（認証目的）\n・録音した音声データ\n・音声から生成した文字起こしテキスト\n・AI解析により判定した感情・トリガー情報\n・ご自身で入力した気づきメモ",
      },
      {
        heading: "2. 情報の利用目的",
        body: "収集した情報は以下の目的で利用します。\n・本サービスの提供および表示\n・感情・トリガーのAI解析\n・サービス品質の改善および機能開発\n・障害対応・セキュリティ管理",
      },
      {
        heading: "3. AI解析について",
        body: "録音内容の文字起こしおよび感情解析にはOpenAI社のAPIを使用しています。解析のためテキストデータがOpenAI社のサーバーに送信されます。OpenAI社のプライバシーポリシーは openai.com/policies/privacy-policy をご参照ください。",
      },
      {
        heading: "4. データの保存",
        body: "音声ファイルはSupabase Storageに、テキスト・解析結果はSupabaseデータベースに暗号化した状態で保存されます。保存期間はアカウント有効期間中です。",
      },
      {
        heading: "5. 第三者への提供",
        body: "以下の場合を除き、収集したデータを第三者に提供・販売することはありません。\n・法令に基づく開示要求がある場合\n・ユーザー本人の同意がある場合",
      },
      {
        heading: "6. データの削除",
        body: "アカウント削除のリクエストをいただいた場合、30日以内にすべての個人データを削除します。削除リクエストは設定画面またはサポートへのお問い合わせにより受け付けます。",
      },
      {
        heading: "7. セキュリティ",
        body: "データへのアクセスはRow Level Security（RLS）により制御されており、他のユーザーのデータにはアクセスできません。通信はすべてHTTPSで暗号化されています。",
      },
      {
        heading: "8. Cookieおよびローカルストレージ",
        body: "本サービスはセッション管理のためにCookieおよびローカルストレージを使用します。広告目的のトラッキングは行いません。",
      },
      {
        heading: "9. ポリシーの変更",
        body: "本ポリシーを変更する場合は、アプリ内またはメールにて事前にお知らせします。",
      },
      {
        heading: "10. お問い合わせ",
        body: "プライバシーに関するご質問はサポートページよりお問い合わせください。",
      },
    ],
  },
  en: {
    title: "Privacy Policy",
    updated: "Last updated: March 2026",
    sections: [
      {
        heading: "1. Information We Collect",
        body: "We collect the following information:\n• Email address (for authentication)\n• Recorded audio data\n• Transcribed text generated from audio\n• Emotion and trigger data from AI analysis\n• Personal notes you enter manually",
      },
      {
        heading: "2. How We Use Your Information",
        body: "Collected information is used to:\n• Provide and display the Service\n• Perform AI-based emotion and trigger analysis\n• Improve service quality and develop new features\n• Handle incidents and manage security",
      },
      {
        heading: "3. AI Analysis",
        body: "We use the OpenAI API for audio transcription and emotion analysis. Text data is sent to OpenAI's servers for processing. Please refer to OpenAI's Privacy Policy at openai.com/policies/privacy-policy.",
      },
      {
        heading: "4. Data Storage",
        body: "Audio files are stored in Supabase Storage; text and analysis results are stored in an encrypted Supabase database. Data is retained for the duration of your active account.",
      },
      {
        heading: "5. Third-Party Sharing",
        body: "We do not sell or share your data with third parties except:\n• When required by law\n• With your explicit consent",
      },
      {
        heading: "6. Data Deletion",
        body: "Upon receiving an account deletion request, all personal data will be deleted within 30 days. Requests can be submitted via the settings screen or by contacting support.",
      },
      {
        heading: "7. Security",
        body: "Data access is controlled by Row Level Security (RLS), ensuring no user can access another's data. All communications are encrypted via HTTPS.",
      },
      {
        heading: "8. Cookies & Local Storage",
        body: "We use cookies and local storage for session management only. We do not engage in advertising-based tracking.",
      },
      {
        heading: "9. Policy Changes",
        body: "We will notify you of any changes to this policy via the app or email in advance.",
      },
      {
        heading: "10. Contact",
        body: "For privacy-related inquiries, please contact us through the support page.",
      },
    ],
  },
};

export default function PrivacyPage() {
  const [lang, setLang] = useState<"ja" | "en">("ja");
  const router = useRouter();
  const t = PRIVACY[lang];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;600&family=Noto+Sans+JP:wght@300;400;500&display=swap');

        .privacy-root {
          min-height: 100vh;
          background: #0a0e1a;
          font-family: 'Noto Sans JP', sans-serif;
          padding-bottom: 80px;
        }
        .privacy-header {
          position: sticky; top: 0; z-index: 10;
          padding: 20px 24px;
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(10,14,26,0.9);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .privacy-back {
          font-size: 11px; color: rgba(139,92,246,0.45);
          background: none; border: none; cursor: pointer;
          letter-spacing: 0.08em; font-family: 'Noto Sans JP', sans-serif;
          transition: color 0.2s;
        }
        .privacy-back:hover { color: rgba(139,92,246,0.9); }
        .privacy-lang-tabs {
          display: flex; gap: 4px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 20px; padding: 3px;
        }
        .privacy-lang-tab {
          font-size: 11px; color: rgba(255,255,255,0.25);
          background: none; border: none; border-radius: 16px;
          padding: 5px 14px; cursor: pointer;
          transition: all 0.2s; font-family: 'Noto Sans JP', sans-serif;
        }
        .privacy-lang-tab--active {
          background: rgba(139,92,246,0.2);
          color: rgba(167,139,250,0.9);
        }
        .privacy-body {
          max-width: 640px; margin: 0 auto;
          padding: 48px 24px 0;
        }
        .privacy-title {
          font-family: 'Zen Old Mincho', serif;
          font-size: 22px; font-weight: 400;
          color: rgba(255,255,255,0.75);
          letter-spacing: 0.06em; margin: 0 0 8px 0;
        }
        .privacy-updated {
          font-size: 11px; color: rgba(255,255,255,0.2);
          letter-spacing: 0.06em; margin: 0 0 48px 0;
        }
        .privacy-section { margin-bottom: 36px; }
        .privacy-section-heading {
          font-size: 13px; font-weight: 500;
          color: rgba(255,255,255,0.6);
          letter-spacing: 0.06em; margin: 0 0 10px 0;
        }
        .privacy-section-body {
          font-size: 13px; color: rgba(255,255,255,0.38);
          line-height: 1.9; letter-spacing: 0.03em;
          margin: 0; white-space: pre-line;
        }
        .privacy-divider {
          border: none;
          border-top: 1px solid rgba(255,255,255,0.04);
          margin: 0 0 36px 0;
        }
      `}</style>

      <div className="privacy-root">
        <header className="privacy-header">
          <button className="privacy-back" onClick={() => router.back()}>← 戻る</button>
          <div className="privacy-lang-tabs">
            <button className={`privacy-lang-tab ${lang === "ja" ? "privacy-lang-tab--active" : ""}`} onClick={() => setLang("ja")}>JP</button>
            <button className={`privacy-lang-tab ${lang === "en" ? "privacy-lang-tab--active" : ""}`} onClick={() => setLang("en")}>EN</button>
          </div>
        </header>

        <div className="privacy-body">
          <h1 className="privacy-title">{t.title}</h1>
          <p className="privacy-updated">{t.updated}</p>
          {t.sections.map((s, i) => (
            <div key={i} className="privacy-section">
              <hr className="privacy-divider" />
              <p className="privacy-section-heading">{s.heading}</p>
              <p className="privacy-section-body">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
