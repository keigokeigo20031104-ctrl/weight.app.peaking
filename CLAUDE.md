# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## アプリ概要

入力者と管理者に分かれた体重管理Webアプリ。Cloudflare Pages `weit-rog7` 用の修復版。

## ファイル構成

```
cloudflare-pages-weight-app/
├── index.html
├── tracker/
│   ├── index.html
│   ├── manifest.webmanifest
│   └── sw.js
├── solo/
│   ├── index.html
│   ├── manifest.webmanifest
│   └── sw.js
├── admin/
│   └── index.html
├── feedback/
│   └── index.html
├── _worker.js
├── functions/api/records.js
└── _headers
```

## Cloudflare 設定

- KV Binding名: `WEIGHT_LOGS`
- KV namespace: `weight-logs`

## 注意

この修復版は、File Libraryに残っていた `_worker.js` と `CLAUDE.md`、および公開URLで確認できた画面構成をもとに再構成したもの。
公開URLから `_worker.js` の実体は直接回収できないため、File Libraryに残っていた最新版に近いAPIコードを採用している。

## 変更禁止

- `_worker.js` のAPIパスを不用意に変えない
- KV Binding名 `WEIGHT_LOGS` を変えない
- 保存データの `date` は `YYYY-MM-DD` のまま
- React/Vue/Next.js等へ置き換えない
- 外部ライブラリを追加しない
