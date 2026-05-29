# skill.md

## 技術スタック

| 技術 | 用途 |
|---|---|
| HTML / CSS / JS（バニラ） | フロントエンド |
| Cloudflare Pages | 静的ホスティング・デプロイ |
| Cloudflare Workers（`_worker.js`） | APIサーバー（ドラッグ&ドロップデプロイ用） |
| Cloudflare Pages Functions（`functions/`） | APIサーバー（Git連携デプロイ用） |
| Cloudflare KV | 体重記録・お知らせ・チャット・意見箱の保存 |
| PWA（manifest + Service Worker） | スマホインストール・オフライン対応 |

## データ構造

```json
{
  "user": "string",
  "date": "YYYY-MM-DD",
  "weight": 0.0,
  "calories": null,
  "note": "string",
  "meals": [{ "time": "HH:mm", "text": "string" }],
  "training": [{
    "parts": ["部位"],
    "exercise": "string",
    "sets": [{ "weight": null, "reps": 0, "note": "" }]
  }]
}
```
