/**
 * 来場者アンケート用 Google フォームの作成スクリプト（booth-tap-logger・初回だけ実行）
 * ※Webアプリ本体（Code.gs）とは別の、使い捨ての GAS プロジェクトで実行してください
 *   （フォーム作成の権限を公開中の Web アプリに持たせないため）
 * - 質問を作成し、ログイン不要・回答の編集不可などを設定
 * - 指定フォルダへ移動し、フロント（js/config.js）に貼る formResponse URL と entry ID をログに出力
 */
const SURVEY_QUESTIONS = {
  age:      { title: '年齢層を教えてください', choices: ['10代以下', '20代', '30代', '40代', '50代', '60代以上'] },
  gender:   { title: '性別を教えてください', choices: ['女性', '男性', 'その他', '回答しない'] },
  building: { title: 'お勤め先のビル名を教えてください', help: '例）〇〇ビル（該当なしの場合は空欄）' },
  nps:      { title: 'このイベントを友人や同僚にすすめたいと思いますか？', low: 'まったく思わない', high: 'とても思う' },
  interest: { title: '興味を持ったジャンルを教えてください（複数選択可）', choices: ['フード・ドリンク', '美容・健康', '雑貨・クラフト', 'セミナー・学び', 'ワークショップ・体験', '相談・カウンセリング'] },
  source:   { title: 'このイベントを何で知りましたか？', choices: ['イベントサイト', 'SNS', 'チラシ・ポスター', '勤務先・ビルからの案内', '知人の紹介', '通りがかり', 'その他'] },
  comment:  { title: 'ご感想・ご要望があればお聞かせください' },
  visitorId:{ title: 'visitorId（システム用・入力不要）' }
};

function createSurveyForm_(title, folderId) {
  const Q = SURVEY_QUESTIONS;
  const form = FormApp.create(title);
  form.setTitle(title);
  form.setDescription('このフォームは EmpoweringWOMEN の専用ページから送信されます。');
  try { form.setRequireLogin(false); } catch (e) { console.log('setRequireLogin: ' + e); }
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);
  form.setAllowResponseEdits(false);
  form.setShowLinkToRespondAgain(false);
  form.setProgressBar(false);

  const it = {};
  it.age = form.addMultipleChoiceItem().setTitle(Q.age.title).setChoiceValues(Q.age.choices);
  it.gender = form.addMultipleChoiceItem().setTitle(Q.gender.title).setChoiceValues(Q.gender.choices);
  it.building = form.addTextItem().setTitle(Q.building.title).setHelpText(Q.building.help);
  it.nps = form.addScaleItem().setTitle(Q.nps.title).setBounds(0, 10).setLabels(Q.nps.low, Q.nps.high);
  it.interest = form.addCheckboxItem().setTitle(Q.interest.title).setChoiceValues(Q.interest.choices);
  it.source = form.addMultipleChoiceItem().setTitle(Q.source.title).setChoiceValues(Q.source.choices);
  it.comment = form.addParagraphTextItem().setTitle(Q.comment.title);
  it.visitorId = form.addTextItem().setTitle(Q.visitorId.title);
  try { form.setPublished(true); } catch (e) { console.log('setPublished: ' + e); }

  DriveApp.getFileById(form.getId()).moveTo(DriveApp.getFolderById(folderId));
  return describeForm_(form);
}

// フォームの formResponse URL と各設問の entry ID をログに出力
function describeForm_(form) {
  const Q = SURVEY_QUESTIONS;
  const samples = { age: '20代', gender: '女性', building: 'S_BUILDING', nps: 7, interest: ['美容・健康'], source: 'SNS', comment: 'S_COMMENT', visitorId: 'S_VISITOR' };
  const byTitle = {};
  Object.keys(Q).forEach(function (k) { byTitle[Q[k].title] = k; });
  const resp = form.createResponse();
  form.getItems().forEach(function (item) {
    const k = byTitle[item.getTitle()];
    if (!k) return;
    const typed = item['as' + item.getType().toString().split('_').map(function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); }).join('') + 'Item']();
    resp.withItemResponse(typed.createResponse(samples[k]));
  });
  const url = resp.toPrefilledUrl();
  const entries = {};
  url.split('?')[1].split('&').forEach(function (kv) {
    const p = kv.split('=');
    const v = decodeURIComponent(p[1].replace(/\+/g, ' '));
    Object.keys(samples).forEach(function (k) {
      const s = Array.isArray(samples[k]) ? samples[k][0] : String(samples[k]);
      if (v === s) entries[k] = p[0];
    });
  });
  const safe = function (fn) { try { return fn(); } catch (e) { return 'ERR: ' + e.message; } };
  const out = {
    title: form.getTitle(),
    editUrl: safe(function () { return form.getEditUrl(); }),
    action: safe(function () { return form.getPublishedUrl().replace(/\/viewform.*$/, '/formResponse'); }),
    requiresLogin: safe(function () { return form.requiresLogin(); }),
    published: safe(function () { return form.isPublished(); }),
    entries: entries
  };
  console.log(JSON.stringify(out));
  return out;
}

// フォルダ内の既存フォームの情報を出力（作成済みのフォームを確認するとき用）
function inspectFolder_(folderId) {
  const files = DriveApp.getFolderById(folderId).getFilesByType(MimeType.GOOGLE_FORMS);
  while (files.hasNext()) describeForm_(FormApp.openById(files.next().getId()));
}


/** フォームを新規作成（実行はこれだけ） */
function setupBoothTapLoggerForm() {
  return createSurveyForm_('EmpoweringWOMEN 来場者アンケート（booth-tap-logger）', '1YFFhB7geFNUmWnmeASFkJ00u88B0OMTf');
}

/** 作成済みフォームの formResponse URL / entry ID を再確認したいとき */
function inspectForm() {
  inspectFolder_('1YFFhB7geFNUmWnmeASFkJ00u88B0OMTf');
}
