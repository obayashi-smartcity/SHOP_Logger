// =========================================================
// スタンプラリー設定ファイル
// ・GAS_URL：GASを「ウェブアプリ」としてデプロイしたURLを貼り付けます
// ・SPOTS  ：スタンプを置く場所。id は QR の URL（?spot=id）に使われます
//            ※id は QR 印刷後に変更しないでください（ログの集計キーになります）
// =========================================================
window.STAMP_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyV0QnEorgDuNFDThkLEBGZWczv-LqjByqbBY8TS-MDL-YHRnnscCqLkT4WMiwLAlvoqA/exec',

  // ----- 来場者アンケート（景品引換の前に表示） -----
  // 送信先は Google フォーム。ACTION を空にするとアンケートを出さずに引換画面へ進みます。
  // ※options の文言は Google フォームの選択肢と完全一致させてください（違うと記録されません）
  SURVEY: {
    ACTION: 'https://docs.google.com/forms/d/e/1FAIpQLSdaDiL_AcfoPRzeIzX7vRGD9IwYRA4a_CSlHyCENKbZE0FJug/formResponse',
    MODE: 'scroll', // 'scroll'＝全問を1ページに縦並び / 'step'＝1問1画面
    VISITOR_ENTRY: 'entry.447131235', // 端末の匿名ID（ログとの突き合わせ用）
    QUESTIONS: [
      { key: 'age', entry: 'entry.1207481889', type: 'single', required: true, title: '年齢層を教えてください',
        options: ['10代以下', '20代', '30代', '40代', '50代', '60代以上'] },
      { key: 'gender', entry: 'entry.1533974491', type: 'single', required: true, title: '性別を教えてください',
        options: ['女性', '男性', 'その他', '回答しない'] },
      { key: 'building', entry: 'entry.572930074', type: 'text', required: false, title: 'お勤め先のビル名を教えてください',
        placeholder: '例）〇〇ビル' },
      { key: 'nps', entry: 'entry.1298491185', type: 'nps', required: true, title: 'このイベントを友人や同僚にすすめたいと思いますか？',
        lowLabel: '0：まったく思わない', highLabel: '10：とても思う' },
      { key: 'interest', entry: 'entry.2034840535', type: 'multi', required: false, title: '興味を持ったジャンルを教えてください（複数選択可）',
        options: ['フード・ドリンク', '美容・健康', '雑貨・クラフト', 'セミナー・学び', 'ワークショップ・体験', '相談・カウンセリング'] },
      { key: 'source', entry: 'entry.1793069132', type: 'single', required: true, title: 'このイベントを何で知りましたか？',
        options: ['イベントサイト', 'SNS', 'チラシ・ポスター', '勤務先・ビルからの案内', '知人の紹介', '通りがかり', 'その他'] },
      { key: 'comment', entry: 'entry.288199875', type: 'textarea', required: false, title: 'ご感想・ご要望があればお聞かせください',
        placeholder: '自由にご記入ください' }
    ]
  },

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
