# Campus Chat

学内全体チャット、1対1の会話、画像・ショート動画、匿名レベル0〜3の研究試作。

## 実装済み

- 全体チャットと個人チャット（最新100件を5秒ごとに取得）。
- 相手が共有した32文字の連絡コードで会話を開始。
- JPEG/PNG/WebP画像は8MB、MP4/WebM動画は20MBまで添付。
- 動画一覧とブラウザー標準の再生機能。
- プロフィールと匿名設定をサーバーに保存。初期レベル1。
- 表示名は投稿時に固定。内部の利用者IDやファイルの保存キーは他の利用者に返さない。
- 個人チャットと添付に参加者チェックを適用。
- 通報の記録（通知や管理画面は未実装）。

## 前提・制限

ChatGPTログインを利用する所有者限定の試作版です。学校の在籍確認は未実装であり、学校全員が参加する運用はまだ開始していません。外部へ公開範囲を広げる前に、学校の認証・管理体制を実装してください。

動画の長さの検査・変換や画像等のメタデータ除去は未実装です。ブラウザーが対応する動画コーデックが必要です。匿名レベルは他の参加者に見える名前の制御で、完全匿名や暗号化された個人チャットを保証しません。大規模な同時利用の性能は未測定です。

## 環境

Node.js 22.13以上、pnpmを利用します。試作時はNode.js 24.19、pnpm 11.19で検証しました。ライブラリのバージョンはpackage.jsonとpnpm-lock.yamlに記録しています。

## ローカル起動

このフォルダーで実行します。

```sh
pnpm install
pnpm build
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_good_mattie_franklin.sql
pnpm dev
```

データベースの作成は初回だけ行います。表示されたローカルURLを開き、ログインを選ぶと公式のローカルテスト用ユーザーで利用できます。本番のログインとは別の仕組みです。

## 検証

```sh
node --experimental-strip-types --test tests/privacy.test.ts
pnpm exec tsc --noEmit
```

ローカルサーバー起動中のAPI検証は、ローカル専用の架空データを追加してから実行します。テスト投稿はローカルDBに残ります。

```sh
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file tests/fixtures.sql
node tests/api.smoke.mjs
```

検証内容：匿名レベルの入力制限、表示名の固定、内部IDの非公開、画像の保存と取得、非参加者の会話・添付拒否、個人チャットの作成、通報記録。実際の複数端末でのブラウザー操作、動画コーデック互換性、負荷試験は未検証です。WebMCPは匿名レベルの選択だけを公開し、保存は利用者が確定します。対応環境でのWebMCP実行検証は未実施です。

## 構成

- app/campus-chat.tsx：画面
- app/api/chat/route.ts：API
- lib/privacy.ts：表示名・公開レスポンス・参加者判定
- lib/server.ts：認証・保存の共通処理
- db/schema.ts、drizzle/：データベース構造

Cloudflare Workers、D1、R2に対応したSitesの構成です。認証ヘッダーはSitesの信頼できる配信経路を前提にしています。単独の公開サーバーへ移植する場合は、認証処理も実装し直してください。
