# stamp-rally（案①：QRスタンプラリー）

EmpoweringWOMEN（2026/12/5）の会場で使うスタンプラリーです。会場内のQRコードを読み取るとスタンプがたまり、受付で4桁のコードを入力すると景品と引き換えられます。来場者の行動ログはスプレッドシートに記録されます。

このフォルダだけで動きます。`booth-tap-logger`（案③）とは、フロント、GAS、スプレッドシートを共有していません。

## 構成

```text
stamp-rally/
├── index.html          # スタンプ帳と景品引換の画面
├── qr.html             # 各スポットのQRコード（印刷用）
├── css/style.css       # デザイン（イベントLPと同じ配色・フォント）
├── js/config.js        # ★GAS の URL とスポット一覧（ここだけ編集すればOK）
├── js/app.js           # 本体
├── js/qr.js            # QR印刷ページ用
├── js/vendor/qrcode.js # QR生成ライブラリ（qrcode-generator / MIT）
├── js/vendor/jsQR.js   # QR読取ライブラリ（jsQR / Apache-2.0。BarcodeDetector 非対応端末でのみ読み込み）
├── images/             # ヒーロー画像・favicon（LPから縮小コピー）
└── gas/
    ├── Code.gs         # GAS（Drive 上の GAS と同じ内容。管理用の控え）
    └── appsscript.json
```

- 公開URL（GitHub Pages）：`https://obayashi-smartcity.github.io/SHOP_Logger/stamp-rally/`
- QR印刷：`https://obayashi-smartcity.github.io/SHOP_Logger/stamp-rally/qr.html`
- 記録先：Drive `SHOP_Logger0.0/stamp-rally/stamp-rally_log`（スプレッドシート）
- GAS：Drive `SHOP_Logger0.0/stamp-rally/stamp-rally_gas`（ウェブアプリとしてデプロイ済み。URL は `js/config.js` に設定済み）

## 仕組み

```text
スマホ（カメラアプリでQR読取 → index.html?spot=b03 を開く
　　　 or ページ内「カメラでQRを読み取る」→ その場でスタンプ）
   │  匿名ID・スタンプは端末の localStorage に保存
   │  ログは POST で送信（通信できない場合は端末内に保留し、次回まとめて再送）
   ▼
GAS ウェブアプリ（doPost）
   │  log    → logs シートに追記
   │  redeem → 4桁コードを照合し、redemptions シートに記録（1端末1回まで）
   ▼
スプレッドシート（logs / redemptions / summary）
```

- 景品引換に必要なスタンプ数は決めていません。スタンプが0個でも引換画面に進めます。
- 引換コードは、GAS のスクリプトプロパティ `REDEEM_CODE` に保存しています。フロントのコードには含めていません。
- コードを5回続けて間違えると、その端末は10分間入力できなくなります。
- 引換が終わると引換券は「使用済」の表示に変わります。サーバー側にも記録が残るので、同じ端末で再度引き換えることはできません。

## 記録されるログ（logs シート）

| event | 意味 |
|---|---|
| `open` | QRを使わずにページを開いた |
| `stamp` | 新しいスタンプを取得した |
| `restamp` | 取得済みのスポットのQRを再度読み取った |
| `unknown_spot` | 登録されていない spot のURLを開いた |
| `redeem_view` | 景品引換画面を開いた |
| `redeem` / `redeem_ng` / `redeem_dup` / `redeem_locked` | 引換成功 / コード誤り / 引換済み端末からの再申請 / 誤入力の上限に達した |

| `camera_open` / `camera_denied` / `camera_error` / `camera_unsupported` | ページ内カメラの起動 / 許可されなかった / 起動に失敗した / 端末が非対応 |

列：記録日時（サーバー時刻）、端末日時、visitorId、event、spotId、spotName、stampCount、userAgent、via（`url`＝カメラアプリで読み取り / `camera`＝ページ内カメラで読み取り）

`summary` シートには、ユニーク端末数、スポット別スタンプ数、時間帯別スタンプ数、イベント種別ごとの件数が自動で集計されます。

## セットアップ手順（2026/11/27 GAS デプロイまで完了済み。作り直す場合の手順）

1. **GAS を作成する**
   Drive の `SHOP_Logger0.0/stamp-rally` フォルダで「新規 → その他 → Google Apps Script」を選び、名前を `stamp-rally_gas` にします。
   `gas/Code.gs` の中身をすべて貼り付けて保存します。
2. **タイムゾーンを設定する**
   「プロジェクトの設定」で、タイムゾーンを `(GMT+09:00) 日本標準時` にします。
3. **スクリプトプロパティを登録する**
   「プロジェクトの設定 → スクリプト プロパティ」に次の2つを追加します。
   - `SPREADSHEET_ID` = `1vgneOXlYpxn4q7FU0ZOX1nvjZwlgdAASzmm9g4jRvTQ`
   - `REDEEM_CODE` = 任意の4桁の数字（例：`2580`）。当日スタッフにだけ共有してください。
4. **動作を確認する**
   エディタで `checkSetup` を実行し、権限を承認します。ログに `OK` と表示されれば設定は完了です。
5. **デプロイする**
   「デプロイ → 新しいデプロイ → ウェブアプリ」を選び、実行ユーザーを「自分」、アクセスできるユーザーを「全員」にします。
   ※社内の Google Workspace の設定で「全員」が選べない場合、来場者のスマホからは送信できません。管理者に確認してください。
6. **フロントにURLを設定する**
   発行されたURLを `js/config.js` の `GAS_URL` に貼り付け、commit / push します。
7. **GitHub Pages を有効にする**
   リポジトリの Settings → Pages で `main` ブランチの `/ (root)` を指定します。
8. **QRコードを印刷する**
   `qr.html` を開いて印刷し、各ブースに掲示します。

## スポットの追加・変更

`js/config.js` の `SPOTS` を編集します。`id` は QR のURL（`?spot=id`）とログの集計キーになるので、QRを印刷した後は変更しないでください。名前（`name`、`short`）は後から変えても問題ありません。

## デザイン

- スマホ表示を基本にしています（PCでは中央に 480px 幅で表示）。配色とフォントはイベントLPと同じです。
- 画面の構成は、ヘッダー（ブランド名と状態表示）、メイン（カード型）、下部の固定メニュー（片手で操作できる位置）の3つです。
- 4桁コードは4マスの入力欄です。数字キーボードが開き、4桁そろうまで「引き換える」は押せません。

## 注意点

- スタンプは端末のブラウザに保存されます。ブラウザのデータを消去したり、別のブラウザで開いたりすると、別の来場者として扱われます。
- spot のURLを手入力すれば、QRを読み取らなくてもスタンプを取得できます。ゆるい仕組みであることを前提に運用してください。
- GAS のコードを変更したときは、「デプロイを管理 → 編集 → 新バージョン」で再デプロイしてください。こうするとURLは変わりません。
