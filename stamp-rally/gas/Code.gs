/**
 * スタンプラリー ログ記録 / 景品引換 API（Google Apps Script ウェブアプリ）
 *
 * ■ スクリプトプロパティ（プロジェクトの設定 > スクリプト プロパティ）
 *   SPREADSHEET_ID : 記録先スプレッドシートのID（必須）
 *   REDEEM_CODE    : 景品引換の4桁コード（必須・例 1234）
 *
 * ■ デプロイ
 *   デプロイ > 新しいデプロイ > 種類「ウェブアプリ」
 *   次のユーザーとして実行：自分 / アクセスできるユーザー：全員
 *   発行された URL をフロントの js/config.js の GAS_URL に設定
 *
 * ■ シート（無ければ自動作成）
 *   logs        : すべての行動ログ
 *   redemptions : 景品引換の記録（1 visitorId = 1行）
 */

const SHEET_LOGS = 'logs';
const SHEET_REDEEM = 'redemptions';
const HEADERS_LOGS = ['記録日時', '端末日時', 'visitorId', 'event', 'spotId', 'spotName', 'stampCount', 'userAgent', 'via'];
const HEADERS_REDEEM = ['引換日時', 'visitorId', 'stampCount', 'stamps'];
const MAX_FAIL = 5;            // コード誤入力の上限回数
const LOCK_SECONDS = 10 * 60;  // 上限到達後のロック時間（秒）

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  try {
    if (!isValidId_(req.visitorId)) return json_({ ok: false, error: 'bad_request' });
    if (req.action === 'redeem') return json_(redeem_(req));
    return json_(log_(req));
  } catch (err) {
    console.error(err);
    const notConfigured = String(err && err.message).indexOf('NOT_CONFIGURED') === 0;
    return json_({ ok: false, error: notConfigured ? 'not_configured' : 'server_error' });
  }
}

// 動作確認用（ブラウザで URL を開くと表示）
function doGet() {
  return json_({ ok: true, service: 'stamp-rally' });
}

/* ---------- ログ記録 ---------- */
function log_(req) {
  const logs = Array.isArray(req.logs) ? req.logs.slice(0, 100) : [req];
  const now = new Date();
  const rows = logs.map(function (l) {
    return [
      now,
      clean_(l.clientTime, 40),
      req.visitorId,
      clean_(l.event, 30),
      clean_(l.spotId, 40),
      clean_(l.spotName, 100),
      Number(l.stampCount) || 0,
      clean_(l.ua, 200),
      clean_(l.via, 10)
    ];
  });
  if (rows.length) appendRows_(sheet_(SHEET_LOGS, HEADERS_LOGS), rows);
  return { ok: true, redeemedAt: findRedeemedAt_(req.visitorId) };
}

/* ---------- 景品引換 ---------- */
function redeem_(req) {
  const props = PropertiesService.getScriptProperties();
  const expected = String(props.getProperty('REDEEM_CODE') || '').trim();
  if (!/^\d{4}$/.test(expected)) throw new Error('NOT_CONFIGURED: REDEEM_CODE');

  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + req.visitorId;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAIL) {
    writeLog_(req, 'redeem_locked');
    return { ok: false, error: 'locked' };
  }

  if (String(req.code || '') !== expected) {
    cache.put(failKey, String(fails + 1), LOCK_SECONDS);
    writeLog_(req, 'redeem_ng');
    return { ok: false, error: 'invalid_code' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const already = findRedeemedAt_(req.visitorId);
    if (already) {
      writeLog_(req, 'redeem_dup');
      return { ok: true, already: true, redeemedAt: already };
    }
    const now = new Date();
    const stamps = Array.isArray(req.stamps) ? req.stamps.map(function (s) { return clean_(s, 40); }).join(',') : '';
    appendRows_(sheet_(SHEET_REDEEM, HEADERS_REDEEM), [[now, req.visitorId, Number(req.stampCount) || 0, stamps]]);
    writeLog_(req, 'redeem');
    cache.remove(failKey);
    return { ok: true, redeemedAt: now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- ヘルパー ---------- */
function writeLog_(req, event) {
  appendRows_(sheet_(SHEET_LOGS, HEADERS_LOGS), [[
    new Date(), clean_(req.clientTime, 40), req.visitorId, event, '', '', Number(req.stampCount) || 0, '', ''
  ]]);
}

function findRedeemedAt_(visitorId) {
  const sh = sheet_(SHEET_REDEEM, HEADERS_REDEEM);
  const last = sh.getLastRow();
  if (last < 2) return null;
  const hit = sh.getRange(2, 2, last - 1, 1).createTextFinder(visitorId).matchEntireCell(true).findNext();
  if (!hit) return null;
  const at = sh.getRange(hit.getRow(), 1).getValue();
  return at instanceof Date ? at.toISOString() : String(at);
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('NOT_CONFIGURED: SPREADSHEET_ID');
  return SpreadsheetApp.openById(id);
}

function sheet_(name, headers) {
  const ss = spreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// appendRow は同時アクセスでも行が上書きされず、シートの行数も自動で拡張される
function appendRows_(sh, rows) {
  rows.forEach(function (r) { sh.appendRow(r); });
}

function isValidId_(id) {
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
}

// 文字数制限＋数式インジェクション対策
function clean_(v, max) {
  if (v === undefined || v === null) return '';
  let s = String(v).slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 初期設定の確認用：エディタから実行すると、シート作成とプロパティの確認を行います */
function checkSetup() {
  const props = PropertiesService.getScriptProperties();
  sheet_(SHEET_LOGS, HEADERS_LOGS);
  sheet_(SHEET_REDEEM, HEADERS_REDEEM);
  const code = String(props.getProperty('REDEEM_CODE') || '');
  console.log('SPREADSHEET_ID: OK（' + spreadsheet_().getName() + '）');
  console.log('REDEEM_CODE: ' + (/^\d{4}$/.test(code) ? 'OK' : '未設定または4桁の数字ではありません'));
}
