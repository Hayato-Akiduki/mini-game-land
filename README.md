# Mini Game Land

ブラウザで遊べるミニゲーム集です。Cloudflare Workers と D1 を使い、プレイヤー共通のランキングを提供します。

## 開発

```sh
pnpm install
pnpm dev
```

## 公開

```sh
pnpm db:migrate:remote
pnpm deploy:check
pnpm deploy
```

Cloudflare D1 のバインディング名は `DB`、静的ファイルのバインディング名は `ASSETS` です。

## 構成

ビルド工程はなく、`dist/client` をそのまま配信します。

- `dist/client/index.html` — 画面のHTML。下記のCSSとスクリプトを読み込みます
- `dist/client/css/app.css` — スタイル
- `dist/client/js/` — 共通処理（`bgm.js`・`input.js`・`core.js`・`init.js`・`puzzle-progress.js`）と起動処理（`main.js`）
- `dist/client/js/input.js` — キーボード・タッチ操作の共通処理。`role="button"` の要素を Enter／Space で押せるようにし、`data-nav-group` 内の `data-nav` 要素を矢印キーで移動できるようにします。ゲームのショートカットは `onGameKey`、押しっぱなしのキーは `heldKeys` で登録します（ゲーム終了時に自動で解除）
- `dist/client/js/games/<ゲームID>.js` — ゲームごとのコード（`games.<ゲームID>` を定義）
- 一時停止 — リアルタイムのゲームは `setGamePause(el,{pause,resume})` を登録します。`pause()` はゲームの時計を止めて `true` を返し、まだ始まっていない／終わっている時は `false` を返します。タブやアプリから離れると自動で一時停止し、⏸ボタン・P・Escでも止められます（`core.js`）
- 押し続けボタン — `data-repeat` を付けたボタンは押している間くり返し反応します（`data-repeat="170"` で間隔をミリ秒指定。`input.js`）
- `dist/server/` — API（Cloudflare Workers）

スクリプトは通常の `<script>` として `index.html` に書いた順に読み込まれ、同じグローバル領域を共有します。ゲームを追加するときは、`js/games/` にファイルを作り、`index.html` の `main.js` より前と `service-worker.js` の `APP_SHELL` に追加してください（`tests/client-assets.cjs` が漏れを検出します）。

## ゲームはこちらから
https://mini-game-land.akiduki2ha46.workers.dev/

## セキュリティ対策

投稿者はサーバー発行の匿名セッションで識別します。HTTPSでは `__Host-` 接頭辞付きの Secure / HttpOnly / SameSite=Strict Cookie を使い、D1にはトークンのSHA-256ハッシュのみを保存します。投稿本文の `playerId` は信用せず、セッションのIDで保存します。これはブラウザの継続利用を確認する仕組みで、人の身元確認やアカウント復旧機能ではありません。

導入時は `0002_player_sessions.sql` を含むD1マイグレーションを先に適用してください。ローカル開発では `pnpm db:migrate:local` を実行します。従来のIDには所有権を証明する秘密情報がないため、新しいオンラインIDを発行します。過去のランキングは残り、新しいIDには統合されません。端末内の進行状況は維持します。Cookieの削除・期限切れ（発行から365日）ではオンラインIDが変わります。

APIはIPごとに毎分120回、プロフィール・得点投稿はセッションごとに毎分30回、セッションAPIはIPごとに毎分10回を目安に制限します。超過時は429とRetry-Afterを返します。共有回線では複数人がIP制限を共有します。Cloudflareのレート制限は拠点ごと・結果整合であり、世界全体の厳密な回数制限ではありません。詳細は [Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) を参照してください。

書き込みには同一OriginとJSON形式を必須とし、実際に受信したバイト数で本文サイズを制限します。数値の文字列変換や丸めはせず、整数・型・範囲を検証します。レスポンスには埋め込み防止などのヘッダーを付けています。CSPは画面のインラインのイベントハンドラ（`onclick` など）を維持する最小構成で、スクリプト実行元を制限する完全なXSS対策ではありません。

得点・レベル・累計ポイントは依然としてクライアント申告です。得点にはゲームごとの上限（`dist/server/index.js` の `SCORE_CAPS`）があり、上限を超える投稿は拒否します。有効範囲内の改ざんや同じ結果の再投稿は今回の対策では防げません。ゲームごとのサーバー検証・一度限りのプレイ記録による追加対策が必要です。

検証: Node.js 24で `node tests/security.mjs` を実行します。SQLiteに実際のマイグレーションを適用して認証・入力・保存を検証し、レート制限バインディングはテスト用の応答に置き換えています。
