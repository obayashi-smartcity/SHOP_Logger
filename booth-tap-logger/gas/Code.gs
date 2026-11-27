/**
 * ブース記録（スタッフがお客さまのQRを読み取る）/ 景品引換 API
 * Google Apps Script ウェブアプリ
 *
 * ■ スクリプトプロパティ（プロジェクトの設定 > スクリプト プロパティ）
 *   SPREADSHEET_ID : 記録先スプレッドシートのID（必須）
 *   REDEEM_CODE    : 景品引換の4桁コード（必須）
 *   STAFF_KEY      : スタッフ画面の合言葉（必須・数字や英字）
 *
 * ■ デプロイ
 *   ウェブアプリ / 次のユーザーとして実行：自分 / アクセスできるユーザー：全員
 *
 * ■ シート
 *   booths      : ブースマスタ（boothId, boothName, actions, active）
 *   logs        : すべての記録（来場者の画面操作＋スタッフの読み取り）
 *   redemptions : 景品引換（1 visitorId = 1行）
 */

const SHEET_BOOTHS = 'booths';
const SHEET_LOGS = 'logs';
const SHEET_REDEEM = 'redemptions';
const HEADERS_BOOTHS = ['boothId', 'boothName', 'actions', 'active'];
const HEADERS_LOGS = ['記録日時', '端末日時', 'source', 'visitorId', 'event', 'boothId', 'boothName', 'action', 'deviceId', 'userAgent'];
const HEADERS_REDEEM = ['引換日時', 'visitorId', 'visitCount'];
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
    switch (req.action) {
      case 'booths': return json_(staffOnly_(req, function () { return { ok: true, booths: listBooths_() }; }));
      case 'record': return json_(staffOnly_(req, function () { return record_(req); }));
      case 'status': return json_(visitorOnly_(req, function () { return status_(req.visitorId); }));
      case 'redeem': return json_(visitorOnly_(req, function () { return redeem_(req); }));
      default:       return json_(visitorOnly_(req, function () { return log_(req); }));
    }
  } catch (err) {
    console.error(err);
    const notConfigured = String(err && err.message).indexOf('NOT_CONFIGURED') === 0;
    return json_({ ok: false, error: notConfigured ? 'not_configured' : 'server_error' });
  }
}

function doGet() {
  return json_({ ok: true, service: 'booth-tap-logger' });
}

/* ---------- 認証まわり ---------- */
function visitorOnly_(req, fn) {
  if (!isValidId_(req.visitorId)) return { ok: false, error: 'bad_request' };
  return fn();
}

function staffOnly_(req, fn) {
  const expected = String(PropertiesService.getScriptProperties().getProperty('STAFF_KEY') || '').trim();
  if (!expected) throw new Error('NOT_CONFIGURED: STAFF_KEY');
  const cache = CacheService.getScriptCache();
  const failKey = 'staff_fail_' + String(req.deviceId || '').slice(0, 40);
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAIL) return { ok: false, error: 'locked' };
  if (String(req.staffKey || '').trim() !== expected) {
    cache.put(failKey, String(fails + 1), LOCK_SECONDS);
    return { ok: false, error: 'invalid_key' };
  }
  cache.remove(failKey);
  return fn();
}

/* ---------- スタッフ：ブース一覧 ---------- */
function listBooths_() {
  const sh = sheet_(SHEET_BOOTHS, HEADERS_BOOTHS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 4).getValues()
    .filter(function (r) { return String(r[0]).trim() && r[3] !== false && String(r[3]).toUpperCase() !== 'FALSE'; })
    .map(function (r) {
      const actions = String(r[2] || '').split(/[,、，]/).map(function (s) { return s.trim(); }).filter(String);
      return { id: String(r[0]).trim(), name: String(r[1] || r[0]).trim(), actions: actions.length ? actions : ['来訪'] };
    });
}

/* ---------- スタッフ：読み取り記録（オフライン時はまとめて届く） ---------- */
function record_(req) {
  const booths = {};
  listBooths_().forEach(function (b) { booths[b.id] = b; });
  const records = Array.isArray(req.records) ? req.records.slice(0, 100) : [];
  const sh = sheet_(SHEET_LOGS, HEADERS_LOGS);
  const results = records.map(function (r) {
    if (!isValidId_(r.visitorId)) return { localId: r.localId, ok: false, error: 'bad_visitor' };
    const booth = booths[String(r.boothId)];
    if (!booth) return { localId: r.localId, ok: false, error: 'unknown_booth' };
    const repeat = hasVisited_(sh, r.visitorId, booth.id);
    sh.appendRow([
      new Date(), clean_(r.clientTime, 40), 'staff', r.visitorId, 'visit',
      booth.id, booth.name, clean_(r.action, 30), clean_(req.deviceId, 40), ''
    ]);
    return { localId: r.localId, ok: true, repeat: repeat };
  });
  return { ok: true, results: results };
}

/* ---------- 来場者：画面操作ログ ---------- */
function log_(req) {
  const logs = Array.isArray(req.logs) ? req.logs.slice(0, 100) : [];
  const sh = sheet_(SHEET_LOGS, HEADERS_LOGS);
  logs.forEach(function (l) {
    sh.appendRow([new Date(), clean_(l.clientTime, 40), 'visitor', req.visitorId, clean_(l.event, 30), '', '', '', '', clean_(l.ua, 200)]);
  });
  return status_(req.visitorId);
}

/* ---------- 来場者：立ち寄りブース数・引換状況 ---------- */
function status_(visitorId) {
  return { ok: true, visitCount: countVisitedBooths_(visitorId), redeemedAt: findRedeemedAt_(visitorId) };
}

/* ---------- 来場者：景品引換 ---------- */
function redeem_(req) {
  const expected = String(PropertiesService.getScriptProperties().getProperty('REDEEM_CODE') || '').trim();
  if (!/^\d{4}$/.test(expected)) throw new Error('NOT_CONFIGURED: REDEEM_CODE');

  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + req.visitorId;
  const fails = Number(cache.get(failKey) || 0);
  const logSh = sheet_(SHEET_LOGS, HEADERS_LOGS);
  const writeLog = function (event) {
    logSh.appendRow([new Date(), clean_(req.clientTime, 40), 'visitor', req.visitorId, event, '', '', '', '', '']);
  };
  if (fails >= MAX_FAIL) { writeLog('redeem_locked'); return { ok: false, error: 'locked' }; }
  if (String(req.code || '') !== expected) {
    cache.put(failKey, String(fails + 1), LOCK_SECONDS);
    writeLog('redeem_ng');
    return { ok: false, error: 'invalid_code' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const already = findRedeemedAt_(req.visitorId);
    if (already) { writeLog('redeem_dup'); return { ok: true, already: true, redeemedAt: already }; }
    const now = new Date();
    const visitCount = countVisitedBooths_(req.visitorId);
    sheet_(SHEET_REDEEM, HEADERS_REDEEM).appendRow([now, req.visitorId, visitCount]);
    writeLog('redeem');
    cache.remove(failKey);
    return { ok: true, redeemedAt: now.toISOString(), visitCount: visitCount };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- ヘルパー ---------- */
// logs の visitorId 列（D列）から該当行を探す
function visitRows_(sh, visitorId) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 4, last - 1, 1).createTextFinder(visitorId).matchEntireCell(true).findAll()
    .map(function (cell) { return cell.getRow(); });
}

function hasVisited_(sh, visitorId, boothId) {
  return visitRows_(sh, visitorId).some(function (row) {
    const v = sh.getRange(row, 5, 1, 2).getValues()[0]; // event, boothId
    return v[0] === 'visit' && String(v[1]) === boothId;
  });
}

function countVisitedBooths_(visitorId) {
  const sh = sheet_(SHEET_LOGS, HEADERS_LOGS);
  const booths = {};
  visitRows_(sh, visitorId).forEach(function (row) {
    const v = sh.getRange(row, 5, 1, 2).getValues()[0];
    if (v[0] === 'visit') booths[v[1]] = true;
  });
  return Object.keys(booths).length;
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

/** 初期設定の確認用：エディタから実行してください */
function checkSetup() {
  const props = PropertiesService.getScriptProperties();
  console.log('SPREADSHEET_ID: OK（' + spreadsheet_().getName() + '）');
  console.log('REDEEM_CODE: ' + (/^\d{4}$/.test(String(props.getProperty('REDEEM_CODE') || '')) ? 'OK' : '未設定または4桁の数字ではありません'));
  console.log('STAFF_KEY: ' + (props.getProperty('STAFF_KEY') ? 'OK' : '未設定'));
  console.log('booths: ' + listBooths_().length + ' 件（active のみ）');
  sheet_(SHEET_LOGS, HEADERS_LOGS);
  sheet_(SHEET_REDEEM, HEADERS_REDEEM);
}
