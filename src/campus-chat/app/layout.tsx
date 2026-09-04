import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Campus Chat | 学内チャット',
  description:
    '全体チャット、個人チャット、画像・動画、4段階の匿名設定を備える研究試作。',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
