# booth-tap-logger（案③：スタッフが来場者のQRを読み取る）

来場者はスマホに「マイQR」（自分専用のQRコード）を表示します。各ブースのスタッフがそのQRを読み取り、「来訪・体験・購入」などのアクションをワンタップで記録します。景品引換の流れは案①（stamp-rally）と同じです。

このフォルダだけで動きます。`stamp-rally`（案①）とは、フロント、GAS、スプレッドシートを共有していません。

## 構成

```text
booth-tap-logger/
├── index.html          # 来場者：マイQR＋景品引換
├── staff.html          # スタッフ：設定（合言葉・ブース選択）→ QR読み取り
├── poster.html         # 受付掲示用「マイQR」案内ポスター（印刷用）
├── css/style.css       # デザイン（イベントLPと同じ配色・フォント）
├── js/config.js        # GAS の URL（デプロイ済み・設定済み）
├── js/visitor.js       # 来場者画面
├── js/staff.js         # スタッフ画面
├── js/vendor/qrcode.js # QR生成（qrcode-generator / MIT）
├── js/vendor/jsQR.js   # QR読取（jsQR / Apache-2.0。BarcodeDetector 非対応端末でのみ読み込み）
├── images/
└── gas/                # Drive 上の GAS と同じ内容（管理用の控え）
```

- 来場者画面：`https://obayashi-smartcity.github.io/SHOP_Logger/booth-tap-logger/`
- スタッフ画面：`https://obayashi-smartcity.github.io/SHOP_Logger/booth-tap-logger/staff.html`
- 案内ポスター：`https://obayashi-smartcity.github.io/SHOP_Logger/booth-tap-logger/poster.html`
- スプレッドシート：Drive `SHOP_Logger0.0/booth-tap-logger/booth-tap-logger_log`
- GAS：Drive `SHOP_Logger0.0/booth-tap-logger/booth-tap-logger_gas`（ウェブアプリとしてデプロイ済み）

## 当日の使い方

### スタッフ
1. `staff.html` を開き、合言葉（スクリプトプロパティ `STAFF_KEY`）を入力して「ブース一覧を読み込む」を押します。
2. 担当ブースを選び、「このブースで読み取りを開始」を押します。カメラが起動します。
3. 来場者のマイQRを枠に写すと、アクションのボタンが表示されます。該当するものをタップすると記録されます。
   - アクションが1つだけのブース（受付など）は、読み取った時点で自動的に記録されます。
   - 同じ来場者を4秒以内に続けて読み取った場合は無視されます（二重記録の防止）。
   - 記録はいったん端末に保存してから送信します。電波が悪くても、あとで自動的に再送されます（「未送信 n件」と表示されます）。
4. 次回からは設定が保存されています。ページを開いて「カメラを起動」を押すだけで再開できます。担当を変えるときは「設定を変更」を押してください。

### 来場者
- 受付の案内ポスターのQR（またはLPのリンク）から `index.html` を開くと、マイQRが表示されます。
- 「立ち寄ったブース」の数は自動で更新されます（画面に戻ったとき、および1分ごと）。
- 景品受付で「景品と引き換える」を押し、スタッフから伝えられる4桁のコード（`REDEEM_CODE`）を入力します。引き換えると引換券は「使用済」になります。

## ブースマスタ（スプレッドシートの booths シート）

| 列 | 内容 |
|---|---|
| boothId | 英数字のID。集計のキーになるので、当日は変更しないでください |
| boothName | スタッフ画面とログに表示する名前 |
| actions | 読み取り後に表示するボタン。カンマ区切り（例：`来訪,体験,購入`）。1つだけなら自動で記録されます。空欄の場合は「来訪」になります |
| active | チェックを外す（FALSE にする）と、スタッフ画面の選択肢に表示されなくなります |

マスタはスタッフ画面を開くたびに読み込み直されます。シートを書き換えるだけで反映され、再デプロイは必要ありません。

## 記録（logs シート）

列：記録日時、端末日時、source（`staff` / `visitor`）、visitorId、event、boothId、boothName、action、deviceId（スタッフ端末）、userAgent

| source | event | 意味 |
|---|---|---|
| staff | `visit` | スタッフがマイQRを読み取って記録した（action 列にアクション） |
| visitor | `open` | 来場者がマイQRの画面を開いた |
| visitor | `redeem_view` / `redeem` / `redeem_ng` / `redeem_dup` / `redeem_locked` | 引換画面を開いた / 引換成功 / コード誤り / 引換済み端末からの再申請 / 誤入力の上限に達した |

`summary` シートでは、ブース×アクションのクロス集計、時間帯別の記録数、来場者数、1人あたりの平均立ち寄りブース数が自動で集計されます。

## スクリプトプロパティ

| キー | 内容 |
|---|---|
| `SPREADSHEET_ID` | `1k_jDJ5rHhVHZehiqUw-u5aexWiWlSFc-_xCLfrNMZW8` |
| `REDEEM_CODE` | 景品引換の4桁コード（景品受付のスタッフだけに共有） |
| `STAFF_KEY` | スタッフ画面の合言葉（ブース担当者だけに共有） |

値を変更しても再デプロイは不要です。保存した時点で反映されます。

## 注意点

- マイQRは端末のブラウザに保存された匿名IDです。ブラウザのデータを消去したり、別のブラウザで開いたりすると、別のQRになります。
- 合言葉を5回続けて間違えると、その端末は10分間ロックされます。
- GAS のコードを変更したときは、「デプロイを管理 → 編集 → 新バージョン」で再デプロイしてください。こうするとURLは変わりません。
