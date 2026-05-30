# 夕食メニュー提案 LINE bot 🍽️

彼女とのLINEトークに招待して、「**献立**」と送ると **候補プールから3日分の夕食メニュー** を提案してくれるbotです。
メニューはトーク上のコマンドで追加・削除でき、内容は KV に永続保存されます。

- 実行環境: **Cloudflare Workers**（無料枠で完結 / Node系serverless）
- データ保存: **Workers KV**（メニュープールの永続化）

> ℹ️ **「ノート」について**: LINEのMessaging APIにはトークの「ノート」を読み取る機能がありません。
> そのため、ノートに書いたリストをbotが直接読むことはできません。
> 代わりに、ノートの内容をコピーして `一括登録 …` で貼り付ければ、そのままプールに同期できます。

## 使い方（トーク上のコマンド）

| 送る言葉 | 動作 |
| --- | --- |
| `献立` | 3日分の夕食候補をランダムに提案 |
| `一覧` | 登録メニューを一覧表示 |
| `追加 オムライス` | メニューを1つ追加 |
| `削除 カレー` | メニューを1つ削除 |
| `一括登録 カレー, 鍋, 餃子` | まとめて登録し直し（ノートの貼り付け用・改行区切りも可） |
| `ヘルプ` | 使い方を表示 |

上記以外のメッセージには反応しないので、普段の会話の邪魔になりません。

---

## セットアップ手順

### 1. LINEチャネルを作る
1. [LINE Developers](https://developers.line.biz/) にログイン
2. プロバイダー作成 →「**Messaging API**」チャネルを作成
3. 以下を控える / 発行する
   - **チャネルシークレット**（チャネル基本設定）
   - **チャネルアクセストークン（長期）**（Messaging API設定 → 発行）
4. 「応答設定」で **Webhook: 利用する** / **応答メッセージ: オフ** にする

### 2. プロジェクトの準備
```bash
cd line-dinner-bot
npm install
npx wrangler login          # 初回のみ Cloudflare 認証
```

### 3. KV ネームスペースを作成
```bash
npx wrangler kv namespace create MENUS
```
出力された `id` を `wrangler.toml` の `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` に貼り付けます。

### 4. シークレットを登録
```bash
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
```

### 5. デプロイ
```bash
npm run deploy
```
出力される URL（例: `https://line-dinner-menu-bot.<account>.workers.dev`）を控えます。

### 6. Webhook を設定
LINE Developers の「Messaging API設定」→ Webhook URL に上記URLを設定し、「検証」が成功すればOK。

### 7. botを招待
- 1対1で使う場合: BotのQRコード / IDを友だち追加
- 彼女との既存トーク（グループ）で使う場合: グループにbotを招待
  ※ 「Messaging API設定」で **グループ・複数人トークへの参加を許可** をオンにしてください。

---

## ローカル開発
```bash
npm run dev          # wrangler dev でローカル起動
npm test             # ロジックの単体テスト
```
`.dev.vars` に `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` を書くとローカルでも署名検証できます（このファイルはコミット禁止）。

## メニューの初期値
`src/index.js` の `DEFAULT_MENUS` がプール初回作成時に投入されます。お好みで編集してください。
