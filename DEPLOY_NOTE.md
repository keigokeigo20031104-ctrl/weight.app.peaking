# デプロイ手順メモ

## 構成

- `_worker.js` — API エンドポイント（/api/records, /api/notice, /api/chat, /api/user-feedback, /api/ai-feedback）
- `wrangler.toml` — Workers 設定（静的ファイルは `./public` から配信）
- `public/` — 静的ファイル（HTML / manifest / sw.js / _headers）

## デプロイ前チェック

1. GitHub トップ階層に `_worker.js`、`wrangler.toml`、`public/` が見えること
2. Cloudflare Workers の **KV バインディング** `WEIGHT_LOGS` が設定済みであること
3. Cloudflare Workers の **環境変数** `GEMINI_API_KEY` が設定済みであること（AI フィードバック機能）

## デプロイコマンド

```bash
npx wrangler deploy
```
