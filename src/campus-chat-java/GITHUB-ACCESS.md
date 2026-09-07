# GitHub共同編集者だけに公開する

`github`プロファイルではGitHub Appで本人確認し、R4A1udosのcollaborators APIが204を返した人だけにチャットデータを返します。Publicリポジトリを閲覧できるだけの人は許可しません。招待は承認済みである必要があります。Privateへの変更後も同じリポジトリを確認します。

## GitHub Appの登録

1. GitHubの Settings → Developer settings → GitHub Apps → New GitHub App を開きます。
2. アプリ名を決め、Homepage URLに公開するHTTPS URLを設定します。
3. Callback URLを `https://公開ホスト/login/oauth2/code/github` に設定します。
4. WebhookのActiveを外します。Repository permissionsはMetadataのRead-onlyだけにします。アカウント権限やコードへの書き込み権限は不要です。
5. 自分のアカウントだけにインストールできる設定で作成し、R4A1udosだけにインストールします。
6. Client IDと発行したClient secretをサーバーの環境変数へ設定します。秘密値をGitHub、スクリーンショット、チャットに貼らないでください。

## 起動設定

環境変数を設定してビルドしたjarを起動します。

|変数|値|
|---|---|
|SPRING_PROFILES_ACTIVE|github|
|GITHUB_CLIENT_ID|GitHub AppのClient ID|
|GITHUB_CLIENT_SECRET|GitHub AppのClient secret|
|PUBLIC_BASE_URL|公開HTTPS URL（末尾のスラッシュなし）|

CookieはSecure・SameSite=Laxになります。HTTPS経由で利用してください。HTTPのローカルURLではログインを維持できません。資格情報が不足している場合は起動を失敗させます。

全データリクエストで共同編集者の状態を再確認します。権限削除・期限切れ・GitHub障害・API上限到達時は拒否して再ログインを求めます。トークンはサーバーメモリー内に保持し、ブラウザーやDBに保存しません。

GitHubの不変ユーザーIDで専用アカウントを作ります。従来のパスワードアカウントを名前だけで引き継ぐことはありません。既存の全体投稿は参加者が閲覧できますが、旧アカウントの個人チャットは自動移行されません。

## 公開前の確認

所有者・共同編集者・無関係なGitHubアカウントで実際にログインを試してください。公開ホストが変わる場合はCallback URLとPUBLIC_BASE_URLの両方を更新します。パスワードモードの既存サーバーを外部へ接続しないでください。

GitHub App未登録の状態では、限定公開は未完了です。常設URLとサーバー運用も別途必要です。
