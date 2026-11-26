// =========================================================
// スタンプラリー設定ファイル
// ・GAS_URL：GASを「ウェブアプリ」としてデプロイしたURLを貼り付けます
// ・SPOTS  ：スタンプを置く場所。id は QR の URL（?spot=id）に使われます
//            ※id は QR 印刷後に変更しないでください（ログの集計キーになります）
// =========================================================
window.STAMP_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyV0QnEorgDuNFDThkLEBGZWczv-LqjByqbBY8TS-MDL-YHRnnscCqLkT4WMiwLAlvoqA/exec',

  SPOTS: [
    { id: 'entrance', name: '受付', short: '受付' },
    { id: 'talk',     name: 'トークイベント', short: 'TALK' },
    { id: 'b01', name: '『フレバコ』アートワークショップ byカコ企画', short: 'カコ企画' },
    { id: 'b02', name: 'しなやかライフ研究所', short: 'しなやか' },
    { id: 'b03', name: 'floraがっこう', short: 'flora' },
    { id: 'b04', name: '株式会社ダリアジェンヌ', short: 'ダリア' },
    { id: 'b05', name: '合同会社bellecoloris', short: 'belle' },
    { id: 'b06', name: 'オーラルユニバース', short: 'オーラル' },
    { id: 'b07', name: 'Fun Fun Kitchen', short: 'FunFun' },
    { id: 'b08', name: '尾花英里香', short: '尾花' },
    { id: 'b09', name: 'MHDL 建築デザイン造形研究室', short: 'MHDL' },
    { id: 'b10', name: '美姿勢コンシェルジュ', short: '美姿勢' },
    { id: 'b11', name: '株式会社湖光商事', short: '湖光' },
    { id: 'b12', name: '365+1', short: '365+1' },
    { id: 'b13', name: '時々珈琲焙煎所', short: '珈琲' },
    { id: 'b14', name: '今日も今日とてフォカッチャ', short: 'フォカッチャ' }
  ]
};
