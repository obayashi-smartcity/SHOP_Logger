# スタンプラリー QRコード画像

`js/config.js` の SPOTS（16か所）から書き出したQRコード画像です。読み取り先は本番URL（`https://obayashi-smartcity.github.io/SHOP_Logger/stamp-rally/?spot=<id>`）です。

- `card/`：掲示用のカード画像。イベント名、スポット名、QR、案内文が入っています（約1026×1480px）。
- `plain/`：QRコードだけの正方形画像（余白付き・1392×1392px）。ほかのデザインに組み込むとき用です。
- `list.csv`：No・spotId・スポット名・URL・ファイル名の一覧です。

ファイル名は `No_spotId_スポット名.png` の形式です。全32枚が正しいURLとして読み取れることを確認済みです。
スポットを追加・変更したときは、`qr.html` から印刷するか、画像を書き出し直してください。
