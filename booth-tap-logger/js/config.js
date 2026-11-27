// =========================================================
// ブース記録（案③）設定ファイル
// ・GAS_URL：GASを「ウェブアプリ」としてデプロイしたURL
// ・ブースの一覧はスプレッドシートの booths シートで管理します（ここでは設定しません）
// =========================================================
window.BOOTH_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbwOjn5AqAfLB3xa5v2lc7HXlIjmUUV-lOkP4dCJYBaoNQGs1qVj55pXJOH804G8-_UK/exec',

  // ----- 来場者アンケート（景品引換の前に表示） -----
  // 送信先は Google フォーム。ACTION を空にするとアンケートを出さずに引換画面へ進みます。
  // ※options の文言は Google フォームの選択肢と完全一致させてください（違うと記録されません）
  SURVEY: {
    ACTION: 'https://docs.google.com/forms/d/e/1FAIpQLSdVgzXwmduZp4mf16oSzmMw1ystDyH61Pcb79upawVPFEeDyQ/formResponse',
    MODE: 'scroll', // 'scroll'＝全問を1ページに縦並び / 'step'＝1問1画面
    VISITOR_ENTRY: 'entry.1630329245', // 端末の匿名ID（ログとの突き合わせ用）
    QUESTIONS: [
      { key: 'age', entry: 'entry.585852518', type: 'single', required: true, title: '年齢層を教えてください',
        options: ['10代以下', '20代', '30代', '40代', '50代', '60代以上'] },
      { key: 'gender', entry: 'entry.1800370547', type: 'single', required: true, title: '性別を教えてください',
        options: ['女性', '男性', 'その他', '回答しない'] },
      { key: 'building', entry: 'entry.93687136', type: 'text', required: false, title: 'お勤め先のビル名を教えてください',
        placeholder: '例）〇〇ビル' },
      { key: 'nps', entry: 'entry.1970632713', type: 'nps', required: true, title: 'このイベントを友人や同僚にすすめたいと思いますか？',
        lowLabel: '0：まったく思わない', highLabel: '10：とても思う' },
      { key: 'interest', entry: 'entry.357620913', type: 'multi', required: false, title: '興味を持ったジャンルを教えてください（複数選択可）',
        options: ['フード・ドリンク', '美容・健康', '雑貨・クラフト', 'セミナー・学び', 'ワークショップ・体験', '相談・カウンセリング'] },
      { key: 'source', entry: 'entry.2043175334', type: 'single', required: true, title: 'このイベントを何で知りましたか？',
        options: ['イベントサイト', 'SNS', 'チラシ・ポスター', '勤務先・ビルからの案内', '知人の紹介', '通りがかり', 'その他'] },
      { key: 'comment', entry: 'entry.2139958786', type: 'textarea', required: false, title: 'ご感想・ご要望があればお聞かせください',
        placeholder: '自由にご記入ください' }
    ]
  }
};
