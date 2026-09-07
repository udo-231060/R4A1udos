# Campus Chat — Java / JavaScript版

卒業研究用の学内チャット。サーバーは **Java 21 + Spring Boot 3.5.16**、画面は **JavaScript / HTML / CSS**。画面の実行・編集にNode.jsやTypeScriptは不要です。

## 起動

GitHub共同編集者だけに公開する場合は [限定公開の設定](GITHUB-ACCESS.md) を使ってください。以下はPC内で使う従来のパスワードモードです。

Java 21以上とMaven 3.6.3以上を用意し、このフォルダーで実行します。

```sh
mvn clean package
java -jar target/campus-chat-1.0.0.jar
```

[http://127.0.0.1:8080](http://127.0.0.1:8080) を開きます。「新規登録」で研究用のアカウントを作成してログインします。ログインIDは半角英数字・`_`・`-`の3〜32文字、パスワードは12文字以上・UTF-8で72バイト以内です。サンプルアカウントや共通パスワードはありません。

初期状態ではこのPCからのみアクセスできます。終了はサーバーのターミナルでCtrl+C。データは起動したフォルダーの`data/campus-chat.mv.db`に残ります。バックアップはサーバー停止後に`data`フォルダーをコピーしてください。

## 機能

- 全体チャット・連絡コードによる1対1の会話、最新100件を5秒ごとに更新。
- JPEG / PNG / WebPは8MB、MP4 / WebMは20MB。添付はDBに保存し、個人チャットの参加者以外には返しません。
- 全体チャットの動画一覧、動画のRangeリクエスト（シーク）対応。
- プロフィール、匿名レベル0〜3。表示名は投稿時点で保存され、後から設定を変えても過去の投稿は変化しません。
- 投稿ごとに独立した匿名名、会話ごとに固定した仮名。投稿レスポンスに内部アカウントID・連絡コードを含めません。
- 通報をDBへ記録（管理者通知・対応画面は未実装）。1人1分20投稿の制限。
- BCryptによるパスワード保存、Spring Securityのセッション認証・CSRF対策、HttpOnly / SameSite Cookie。
- 対応ブラウザーではWebMCPで匿名レベルの選択が可能。保存は利用者が確定します。

## 構成

| ファイル | 役割 |
| --- | --- |
| `src/main/java/jp/ac/campus/ChatService.java` | 保存、匿名名、会話の参加者確認、添付検証 |
| `src/main/java/jp/ac/campus/ChatController.java` | チャットAPI |
| `src/main/java/jp/ac/campus/AuthController.java` | 登録・CSRFトークン |
| `src/main/java/jp/ac/campus/SecurityConfig.java` | ログイン・ログアウト・アクセス制御 |
| `src/main/resources/static/app.js` | JavaScriptの画面処理 |
| `src/main/resources/static/index.html` / `app.css` | 画面とデザイン |
| `src/main/resources/schema.sql` | H2データベースのテーブル定義 |

添付を含む投稿の保存はトランザクション内で処理します。会話の同時作成・投稿制限にはアカウント行のロックを使用します。全体投稿・プロフィール・個人チャット・添付の操作は認証必須です。

## 検証

```sh
mvn test
```

14件の統合テスト：登録・ログイン・ログアウト、パスワード検証、CSRF、匿名レベルと入力検証、過去の表示名維持、会話別の仮名、第三者の閲覧・添付・投稿・通報拒否、内部ID非公開、添付形式・サイズ検証、動画一覧とRange、通報の重複、会話の同時作成、投稿数制限、最新100件の順序。

実際のHTTPと再起動後の保存を追加確認するには、ビルド後にJava 21がPATHにある状態で実行します（Node.js 22以上がこの追加検証にのみ必要）。架空データは一時ディレクトリだけに作成します。

```sh
node tests/http-smoke.mjs
```

## 既存Sites版との違い・移行

`../campus-chat/`は既存のTypeScript / Cloudflare Workers / D1 / R2版です。本フォルダーがJava / JavaScriptによる新しい研究用実装です。旧版を削除せず残しているため、既存の公開URL・データへの影響はありません。

Sitesの実行環境はCloudflare WorkersのJavaScript / WebAssemblyであり、このJavaサーバーをそのまま現在の`chatgpt.site`へ配置することはできません。公開する際はJavaが動くサーバーとHTTPSを用意してください。旧版のChatGPTログイン、アカウント、D1の投稿、R2の添付は自動移行されません。移行には元の実データのエクスポートと利用者IDの対応付けが別途必要です。

設定できる環境変数：`PORT`（8080）、`SERVER_ADDRESS`（127.0.0.1）、`DB_URL`、`DB_USER`、`DB_PASSWORD`、`COOKIE_SECURE`（false）。HTTPS運用時は`COOKIE_SECURE=true`。H2のコンソールは有効にしていません。H2ファイルDBは単一プロセスで使用します。

## 研究試作としての制限

学校の在籍確認・学校SSO・アカウント回復・ログイン試行制限・管理者の通報対応・ブロック・利用停止は未実装です。学校全体での運用にはこれらの設計が必要です。登録名は本人確認済みの実名ではありません。

添付の先頭バイトと容量は確認しますが、完全な動画デコード、長さ検査、動画変換、ウイルス検査、メタデータ除去は行いません。動画コーデックの互換性、WebMCPの実機実行、複数端末のブラウザー操作、負荷試験は未検証です。本文やメディアの内容は匿名化しません。運営者からも匿名になる仕組みや、エンドツーエンド暗号化ではありません。
