# weight_app_repaired

Cloudflare Pages版の体重管理アプリ修復版です。

## 復元元

- 公開URLで確認できた画面構成
- File Libraryに残っていた `_worker.js`
- File Libraryに残っていた `CLAUDE.md`
- File Libraryに残っていた `skill.md`
- File Libraryに残っていた `開発運用メモ.md`

## 含めた画面

- `/` トップ
- `/solo/` 個人用体重ログ
- `/tracker/` 管理者送信用体重ログ
- `/admin/` 管理者画面
- `/feedback/` 意見箱

## 含めた機能

- 体重・カロリー・メモ保存
- 食事記録
- トレーニング記録
- 部位別テンプレート
- 前回トレーニング呼び出し
- 負荷量 `kg × rep`
- 7日・28日負荷量
- 体重グラフ
- JSONバックアップ
- 管理者送信
- 管理者画面でサーバー取得
- お知らせ投稿
- 意見箱
- API: `/api/records`, `/api/notice`, `/api/chat`, `/api/chat/list`, `/api/user-feedback`

## Cloudflare設定

Cloudflare Pages にアップロードした後、Production Functions の KV Binding に以下を設定してください。

- Binding name: `WEIGHT_LOGS`
- KV namespace: `weight-logs`

## 注意

これは完全な元ソースのコピーではありません。
公開URLから見えたUIと、File Libraryに残っていたAPIコードをもとにした修復版です。
