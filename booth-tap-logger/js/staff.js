// =========================================================
// スタッフ画面（設定 → QR読み取り）
//  1. 合言葉を入力してブースマスタ（スプレッドシート booths シート）を読み込む
//  2. 担当ブースを選んで読み取り画面へ
//  3. 来場者のマイQRを読み取り → アクションを選んで記録
//     （アクションが1つだけのブースは読み取った時点で自動記録）
//  記録は端末に保存してから送信。通信できないときは自動で再送します。
// =========================================================
(() => {
  const CONFIG = window.BOOTH_CONFIG || {};
  const GAS_URL = (CONFIG.GAS_URL || '').trim();
  const STORAGE_KEY = 'ew-booth-staff-v1';
  const QR_PREFIX = 'EWV1:';
  const COOLDOWN_MS = 4000; // 同じ来場者を連続で読み取ったときに無視する時間
  const $ = (id) => document.getElementById(id);

  const newId = () => {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  };
  const load = () => {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (s && s.deviceId) return { staffKey: '', booth: null, records: [], ...s };
    } catch (_) {}
    return { deviceId: newId(), staffKey: '', booth: null, records: [] };
  };
  const state = load();
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {} };
  const shortId = (id) => id.replace(/-/g, '').slice(-6).toUpperCase();
  const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const p2 = (n) => String(n).padStart(2, '0');
  const hhmm = (iso) => { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };

  // ---------- 通信 ----------
  const post = async (payload) => {
    if (!GAS_URL) throw new Error('GAS_URL が未設定です（js/config.js）');
    const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow' });
    return res.json();
  };
  const ERROR_TEXT = {
    invalid_key: '合言葉が正しくありません。',
    locked: '入力回数の上限に達しました。10分ほど待ってからお試しください。',
    not_configured: 'GAS の設定が完了していません（スクリプトプロパティを確認してください）。'
  };

  // ---------- トースト ----------
  let toastTimer = null;
  const toast = (msg, kind) => {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (kind ? ` is-${kind}` : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  };

  // ---------- 画面切替 ----------
  const show = (view) => {
    $('view-setup').hidden = view !== 'setup';
    $('view-scan').hidden = view !== 'scan';
    window.scrollTo(0, 0);
  };

  // =========================================================
  // 設定画面
  // =========================================================
  let booths = [];
  let selectedId = null;

  const renderBooths = () => {
    const list = $('booth-list');
    list.innerHTML = '';
    booths.forEach((b) => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      label.className = 'booth-option';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'booth';
      radio.value = b.id;
      radio.checked = b.id === selectedId;
      radio.addEventListener('change', () => { selectedId = b.id; $('start-scan').disabled = false; });
      const body = document.createElement('span');
      body.className = 'booth-body';
      const name = document.createElement('span');
      name.className = 'booth-name';
      name.textContent = b.name;
      const acts = document.createElement('span');
      acts.className = 'booth-actions';
      acts.textContent = b.actions.join(' / ');
      body.append(name, acts);
      label.append(radio, body);
      li.append(label);
      list.append(li);
    });
    $('booth-step').hidden = booths.length === 0;
    $('start-scan').disabled = !booths.some((b) => b.id === selectedId);
  };

  const fetchBooths = async (key) => {
    const res = await post({ action: 'booths', staffKey: key, deviceId: state.deviceId });
    if (!res || !res.ok) throw Object.assign(new Error('booths'), { code: res && res.error });
    return res.booths || [];
  };

  const onLoadBooths = async (e) => {
    e.preventDefault();
    const key = $('staff-key').value.trim();
    $('setup-error').textContent = '';
    if (!key) { $('setup-error').textContent = '合言葉を入力してください。'; return; }
    const btn = $('load-booths');
    btn.disabled = true;
    try {
      booths = await fetchBooths(key);
      state.staffKey = key;
      save();
      if (!booths.length) $('setup-error').textContent = 'ブースが登録されていません（booths シートを確認してください）。';
      renderBooths();
    } catch (err) {
      console.warn(err);
      $('setup-error').textContent = ERROR_TEXT[err.code] || (GAS_URL ? '読み込みに失敗しました。通信状況を確認してください。' : ERROR_TEXT.not_configured);
    } finally {
      btn.disabled = false;
    }
  };

  const startScan = () => {
    const b = booths.find((x) => x.id === selectedId);
    if (!b) return;
    state.booth = b;
    save();
    Object.keys(lastSeen).forEach((k) => delete lastSeen[k]); // ブースを変えたらクールダウンをリセット
    enterScan(true);
  };

  const openSetup = () => {
    scanner.stop();
    hidePanel();
    $('staff-key').value = state.staffKey || '';
    selectedId = state.booth ? state.booth.id : null;
    renderBooths();
    show('setup');
  };

  // =========================================================
  // 読み取り画面
  // =========================================================
  let panelVisitor = null;
  const lastSeen = {}; // visitorId → 最後に読み取った時刻

  const renderScanHead = () => {
    $('scan-booth').textContent = state.booth ? state.booth.name : '-';
    const mine = state.records.filter((r) => state.booth && r.boothId === state.booth.id);
    $('stat-count').textContent = mine.length;
    const pending = state.records.filter((r) => !r.sent).length;
    $('stat-pending').hidden = pending === 0;
    $('stat-pending-n').textContent = pending;

    const list = $('recent-list');
    list.innerHTML = '';
    mine.slice(-10).reverse().forEach((r) => {
      const li = document.createElement('li');
      const status = !r.sent ? '<span class="tag tag-wait">未送信</span>'
        : r.repeat ? '<span class="tag">再来訪</span>' : '<span class="tag tag-new">初来訪</span>';
      li.innerHTML = `<span class="r-time">${hhmm(r.clientTime)}</span><span class="r-id">No.${shortId(r.visitorId)}</span><span class="r-act"></span>${status}`;
      li.querySelector('.r-act').textContent = r.action;
      list.append(li);
    });
    if (!mine.length) list.innerHTML = '<li class="empty">まだ記録はありません</li>';
  };

  const record = (visitorId, action) => {
    state.records.push({
      localId: newId(), visitorId, boothId: state.booth.id, action,
      clientTime: new Date().toISOString(), sent: false, repeat: null
    });
    if (state.records.length > 300) state.records = state.records.slice(-300);
    save();
    renderScanHead();
    toast(`記録しました：No.${shortId(visitorId)}（${action}）`, 'ok');
    flush();
  };

  let flushing = false;
  const flush = async () => {
    if (flushing || !GAS_URL) return;
    const pending = state.records.filter((r) => !r.sent);
    if (!pending.length) return;
    flushing = true;
    try {
      const res = await post({
        action: 'record', staffKey: state.staffKey, deviceId: state.deviceId,
        records: pending.map(({ localId, visitorId, boothId, action, clientTime }) => ({ localId, visitorId, boothId, action, clientTime }))
      });
      if (res && res.ok) {
        (res.results || []).forEach((r) => {
          const rec = state.records.find((x) => x.localId === r.localId);
          if (!rec) return;
          rec.sent = true;
          rec.repeat = Boolean(r.repeat);
          if (!r.ok) rec.error = r.error;
        });
        save();
        renderScanHead();
      } else if (res && (res.error === 'invalid_key' || res.error === 'locked')) {
        toast('合言葉が変更されました。設定し直してください。', 'error');
        openSetup();
      }
    } catch (err) {
      console.warn('[staff] 送信失敗。あとで再送します。', err);
    } finally {
      flushing = false;
    }
  };

  const showPanel = (visitorId) => {
    panelVisitor = visitorId;
    $('action-id').textContent = shortId(visitorId);
    const box = $('action-buttons');
    box.innerHTML = '';
    state.booth.actions.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'button button-primary action-button';
      b.textContent = a;
      b.addEventListener('click', () => { record(visitorId, a); hidePanel(); });
      box.append(b);
    });
    $('action-panel').hidden = false;
    $('action-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const hidePanel = () => {
    panelVisitor = null;
    $('action-panel').hidden = true;
    msg('来場者の「マイQR」を枠の中に写してください。');
  };
  const msg = (t) => { $('scanner-msg').textContent = t || ''; };

  // QRを読み取ったときの処理
  const onDetect = (text) => {
    if (panelVisitor) return; // アクション選択中は読み取りを止める
    const id = text.startsWith(QR_PREFIX) ? text.slice(QR_PREFIX.length).trim() : '';
    if (!isUuid(id)) { msg('来場者の「マイQR」ではないようです。'); return; }
    const now = Date.now();
    if (lastSeen[id] && now - lastSeen[id] < COOLDOWN_MS) return;
    lastSeen[id] = now;
    if (navigator.vibrate) navigator.vibrate(60);
    if (state.booth.actions.length === 1) {
      record(id, state.booth.actions[0]);
    } else {
      msg('記録する内容を選んでください。');
      showPanel(id);
    }
  };

  // ---------- カメラ（BarcodeDetector → 非対応なら jsQR） ----------
  const scanner = (() => {
    let stream = null, timer = null, detector = null, busy = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const video = () => $('scanner-video');

    const loadJsQR = () => new Promise((resolve, reject) => {
      if (window.jsQR) return resolve();
      const s = document.createElement('script');
      s.src = 'js/vendor/jsQR.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('jsQR load failed'));
      document.head.append(s);
    });
    const prepare = async () => {
      if ('BarcodeDetector' in window) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          if (formats.includes('qr_code')) { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); return; }
        } catch (_) {}
      }
      detector = null;
      await loadJsQR();
    };
    const decode = async () => {
      const v = video();
      if (!v.videoWidth) return null;
      if (detector) {
        const codes = await detector.detect(v);
        return codes.length ? codes[0].rawValue : null;
      }
      const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      return code ? code.data : null;
    };
    const tick = async () => {
      if (!stream || busy) return;
      busy = true;
      try { const t = await decode(); if (t) onDetect(t); }
      catch (err) { console.warn('[staff] decode error', err); }
      finally { busy = false; }
    };
    const start = async () => {
      if (stream) return true;
      $('camera-start').hidden = true;
      msg('カメラを起動しています…');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        msg('この端末・ブラウザではカメラを使えません（HTTPS のページで開いてください）。');
        $('camera-start').hidden = false;
        return false;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        const v = video();
        v.srcObject = stream;
        await v.play();
        await prepare();
        timer = setInterval(tick, 200);
        msg('来場者の「マイQR」を枠の中に写してください。');
        return true;
      } catch (err) {
        console.warn('[staff] camera error', err);
        stop();
        const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        msg(denied ? 'カメラの使用が許可されていません。ブラウザの設定で許可してから「カメラを起動」を押してください。' : 'カメラを起動できませんでした。「カメラを起動」を押して再度お試しください。');
        $('camera-start').hidden = false;
        return false;
      }
    };
    const stop = () => {
      clearInterval(timer); timer = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
      const v = video();
      if (v) v.srcObject = null;
    };
    return { start, stop, running: () => Boolean(stream) };
  })();

  const enterScan = async (fromUserAction) => {
    renderScanHead();
    show('scan');
    if (fromUserAction) await scanner.start();
    else $('camera-start').hidden = false;
    flush();
  };

  // 保存済みのブース情報を最新のマスタで更新（名前・アクションの変更を反映）
  const refreshBooth = async () => {
    try {
      booths = await fetchBooths(state.staffKey);
      const b = booths.find((x) => x.id === state.booth.id);
      if (!b) { toast('担当ブースがマスタから外れています。設定し直してください。', 'error'); openSetup(); return; }
      state.booth = b;
      save();
      renderScanHead();
    } catch (err) {
      if (err.code === 'invalid_key' || err.code === 'locked') { toast('合言葉を入力し直してください。', 'error'); openSetup(); }
    }
  };

  // ---------- 起動 ----------
  const init = () => {
    $('key-form').addEventListener('submit', onLoadBooths);
    $('start-scan').addEventListener('click', startScan);
    $('change-setup').addEventListener('click', openSetup);
    $('camera-start').addEventListener('click', () => scanner.start());
    $('action-cancel').addEventListener('click', hidePanel);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { scanner.stop(); return; }
      if (!$('view-scan').hidden) $('camera-start').hidden = false;
      flush();
    });
    setInterval(flush, 15 * 1000);

    if (!GAS_URL) $('setup-error').textContent = ERROR_TEXT.not_configured;

    if (state.booth && state.staffKey) {
      // 設定済みなら読み取り画面から再開（カメラはボタンで起動）
      enterScan(false);
      refreshBooth();
    } else {
      openSetup();
    }
  };

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
