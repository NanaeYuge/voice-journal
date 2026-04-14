import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YORU",
  description: "夜、ひとりで抱え込む前に。今の気持ちを声に出して整理する音声日記。",
  openGraph: {
    title: "YORU",
    description: "夜、ひとりで抱え込む前に。今の気持ちを声に出して整理する音声日記。",
    url: "https://voice-journal-inky.vercel.app",
    siteName: "YORU",
    images: [
      {
        url: "https://voice-journal-inky.vercel.app/og-image.png",
        width: 1200,
        height: 630,
        alt: "YORU",
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "YORU",
    description: "夜、ひとりで抱え込む前に。今の気持ちを声に出して整理する音声日記。",
    images: ["https://voice-journal-inky.vercel.app/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}