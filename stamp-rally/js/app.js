// =========================================================
// スタンプラリー本体
//  ・状態（匿名ID・スタンプ・引換済み）は端末の localStorage に保存
//  ・ログは GAS（ウェブアプリ）へ送信し、スプレッドシートに記録
//  ・引換は GAS 側で 4桁コードを照合し、1端末1回に制限
// =========================================================
(() => {
  const CONFIG = window.STAMP_CONFIG || {};
  const SPOTS = Array.isArray(CONFIG.SPOTS) ? CONFIG.SPOTS : [];
  const GAS_URL = (CONFIG.GAS_URL || '').trim();
  const STORAGE_KEY = 'ew-stamp-rally-v1';
  const $ = (id) => document.getElementById(id);

  // ---------- 状態 ----------
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
      if (s && s.id) return { stamps: {}, redeemedAt: null, pending: [], ...s };
    } catch (_) { /* 壊れていたら作り直す */ }
    return { id: newId(), stamps: {}, redeemedAt: null, pending: [] };
  };
  const state = load();
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {} };
  const stampCount = () => Object.keys(state.stamps).length;
  const spotById = (id) => SPOTS.find((s) => s.id === id);

  // ---------- 通信 ----------
  // Content-Type を付けない（text/plain）ことで CORS のプリフライトを回避
  const post = async (payload) => {
    if (!GAS_URL) throw new Error('GAS_URL が未設定です（js/config.js）');
    const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow' });
    return res.json();
  };

  const baseLog = (event, extra = {}) => ({
    action: 'log',
    visitorId: state.id,
    event,
    stampCount: stampCount(),
    clientTime: new Date().toISOString(),
    ua: navigator.userAgent.slice(0, 200),
    ...extra
  });

  // 未送信ログをまとめて送る（通信失敗時は次回に再送）
  const flush = async () => {
    if (!GAS_URL || state.pending.length === 0) return;
    const queue = state.pending.slice();
    try {
      const res = await post({ action: 'log', visitorId: state.id, logs: queue });
      state.pending = state.pending.slice(queue.length);
      if (res && res.redeemedAt && !state.redeemedAt) state.redeemedAt = res.redeemedAt;
      save();
      render();
    } catch (err) {
      console.warn('[stamp-rally] ログ送信に失敗しました。次回再送します。', err);
    }
  };
  const track = (event, extra) => {
    state.pending.push(baseLog(event, extra));
    if (state.pending.length > 100) state.pending = state.pending.slice(-100);
    save();
  };

  // ---------- 描画 ----------
  const checkIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const render = (newSpotId) => {
    const n = stampCount();
    const no = state.id.replace(/-/g, '').slice(-6).toUpperCase();
    ['stamp-count', 'header-count', 'ticket-count'].forEach((id) => { $(id).textContent = n; });
    $('stamp-total').textContent = SPOTS.length;
    $('progress-bar').style.width = SPOTS.length ? `${Math.min(100, (n / SPOTS.length) * 100)}%` : '0';
    $('ticket-id').textContent = no;
    $('card-id').textContent = no;

    const grid = $('stamp-grid');
    grid.innerHTML = '';
    SPOTS.forEach((spot, i) => {
      const got = Boolean(state.stamps[spot.id]);
      const li = document.createElement('li');
      li.className = 'stamp' + (got ? ' is-got' : '') + (spot.id === newSpotId ? ' is-new' : '');
      const mark = document.createElement('span');
      mark.className = 'stamp-mark';
      if (got) mark.innerHTML = checkIcon; else mark.textContent = String(i + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'stamp-name';
      name.textContent = spot.short || spot.name;
      li.title = spot.name;
      li.setAttribute('aria-label', `${spot.name}：${got ? '取得済み' : '未取得'}`);
      li.append(mark, name);
      grid.append(li);
    });

    const used = Boolean(state.redeemedAt);
    $('ticket').classList.toggle('is-used', used);
    $('ticket-status').textContent = used ? '使用済' : '未使用';
    $('redeem-form').hidden = used;
    $('used-info').hidden = !used;
    if (used) $('used-at').textContent = formatDate(state.redeemedAt);
  };
  const formatDate = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // ---------- 画面切替 ----------
  const show = (view) => {
    ['stamps', 'redeem'].forEach((v) => {
      const el = $(`view-${v}`);
      const on = v === view;
      if (on && el.hidden) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; } // 遷移アニメを再生
      el.hidden = !on;
    });
    document.querySelectorAll('.tab[data-tab]').forEach((t) => {
      const on = t.dataset.tab === view;
      t.classList.toggle('is-active', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  };
  const goStamps = () => {
    if (history.state && history.state.redeem) { history.back(); return; }
    history.replaceState(null, '', location.pathname + location.search);
    show('stamps');
  };
  const openRedeem = () => {
    if (location.hash === '#redeem') return;
    history.pushState({ redeem: true }, '', '#redeem');
    show('redeem');
    track('redeem_view');
    flush();
  };
  window.addEventListener('popstate', () => show(location.hash === '#redeem' ? 'redeem' : 'stamps'));

  // ---------- モーダル ----------
  const openModal = ({ kicker, title, spot, hanko, muted }) => {
    $('modal-kicker').textContent = kicker;
    $('modal-title').textContent = title;
    $('modal-spot').textContent = spot || '';
    $('modal-hanko-text').textContent = hanko;
    $('modal-hanko').classList.toggle('is-muted', Boolean(muted));
    $('modal').hidden = false;
    document.body.classList.add('modal-open');
    $('modal-close').focus();
  };
  const closeModal = () => {
    $('modal').hidden = true;
    document.body.classList.remove('modal-open');
  };

  // ---------- 引換 ----------
  const setError = (msg) => {
    $('form-error').textContent = msg || '';
    const otp = $('otp');
    otp.classList.remove('is-error');
    if (msg) { void otp.offsetWidth; otp.classList.add('is-error'); }
  };
  // 4桁コード入力（1つの input を4マスで表示）
  const renderOtp = () => {
    const v = $('code').value;
    document.querySelectorAll('#otp .otp-cell').forEach((c, i) => {
      c.textContent = v[i] || '';
      c.classList.toggle('is-active', i === Math.min(v.length, 3));
    });
    $('redeem-submit').disabled = v.length !== 4;
  };
  const ERROR_TEXT = {
    invalid_code: 'コードが正しくありません。スタッフにご確認ください。',
    locked: '入力回数の上限に達しました。しばらくしてからお試しいただくか、スタッフにお声がけください。',
    not_configured: 'システムの設定が完了していません。スタッフにお声がけください。'
  };
  const onRedeem = async (e) => {
    e.preventDefault();
    const code = $('code').value.trim();
    if (!/^\d{4}$/.test(code)) { setError('4桁の数字を入力してください。'); return; }
    setError('');
    const btn = $('redeem-submit');
    btn.disabled = true;
    try {
      await flush(); // 引換前に未送信ログを送っておく
      const res = await post({
        action: 'redeem',
        visitorId: state.id,
        code,
        stampCount: stampCount(),
        stamps: Object.keys(state.stamps),
        clientTime: new Date().toISOString()
      });
      if (res && res.ok) {
        state.redeemedAt = res.redeemedAt || new Date().toISOString();
        save();
        render();
        $('code').value = '';
        renderOtp();
      } else {
        setError(ERROR_TEXT[res && res.error] || '引き換えできませんでした。スタッフにお声がけください。');
      }
    } catch (err) {
      console.error(err);
      setError(GAS_URL ? '通信に失敗しました。電波の良い場所でもう一度お試しください。' : ERROR_TEXT.not_configured);
    } finally {
      btn.disabled = false;
    }
  };

  // ---------- スポット処理（QRの読み取り結果） ----------
  // via: 'url'＝カメラアプリ等でURLを開いた / 'camera'＝ページ内カメラで読み取った
  const handleSpot = (spotId, via) => {
    const spot = spotById(spotId);
    if (!spot) {
      track('unknown_spot', { spotId: String(spotId).slice(0, 40), via });
      openModal({ kicker: 'SORRY', title: 'このQRコードは読み取れませんでした', spot: '', hanko: '?', muted: true });
      return null;
    }
    if (state.stamps[spot.id]) {
      track('restamp', { spotId: spot.id, spotName: spot.name, via });
      openModal({ kicker: 'ALREADY', title: 'このスタンプは取得済みです', spot: spot.name, hanko: '済', muted: true });
      return null;
    }
    state.stamps[spot.id] = new Date().toISOString();
    track('stamp', { spotId: spot.id, spotName: spot.name, via });
    openModal({ kicker: 'STAMP GET!', title: 'スタンプをゲットしました', spot: spot.name, hanko: 'GET' });
    return spot.id;
  };

  // ---------- ページ内QRスキャナー ----------
  // BarcodeDetector（Android Chrome 等）を優先し、無い端末（iPhone 等）は jsQR を読み込んで解析
  const scanner = (() => {
    let stream = null, timer = null, detector = null, busy = false, lastBad = '';
    const video = () => $('scanner-video');
    const msg = (t) => { $('scanner-msg').textContent = t || ''; };
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const loadJsQR = () => new Promise((resolve, reject) => {
      if (window.jsQR) return resolve();
      const s = document.createElement('script');
      s.src = 'js/vendor/jsQR.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('jsQR load failed'));
      document.head.append(s);
    });

    const prepareDecoder = async () => {
      if ('BarcodeDetector' in window) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          if (formats.includes('qr_code')) { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); return; }
        } catch (_) { /* フォールバック */ }
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

    // QRの中身から spot を取り出す（このスタンプラリーのURL以外は無視）
    const spotFromText = (text) => {
      try {
        const url = new URL(text, location.href);
        const here = new URL('./', location.href);
        if (url.origin !== here.origin || !url.pathname.startsWith(here.pathname)) return null;
        return url.searchParams.get('spot');
      } catch (_) { return null; }
    };

    const tick = async () => {
      if (!stream || busy) return;
      busy = true;
      try {
        const text = await decode();
        if (text) {
          const spotId = spotFromText(text);
          if (spotId) {
            close();
            const newSpotId = handleSpot(spotId, 'camera');
            save();
            render(newSpotId);
            flush();
          } else if (text !== lastBad) {
            lastBad = text;
            msg('スタンプラリーのQRコードではないようです');
          }
        }
      } catch (err) {
        console.warn('[stamp-rally] decode error', err);
      } finally {
        busy = false;
      }
    };

    const open = async () => {
      $('scanner').hidden = false;
      document.body.classList.add('modal-open');
      msg('カメラを起動しています…');
      lastBad = '';
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        msg('この端末ではカメラを起動できません。スマホのカメラアプリで読み取ってください。');
        track('camera_unsupported');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        const v = video();
        v.srcObject = stream;
        await v.play();
        await prepareDecoder();
        msg('');
        track('camera_open');
        timer = setInterval(tick, 200);
      } catch (err) {
        console.warn('[stamp-rally] camera error', err);
        const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        msg(denied
          ? 'カメラの使用が許可されていません。ブラウザの設定で許可するか、スマホのカメラアプリで読み取ってください。'
          : 'カメラを起動できませんでした。スマホのカメラアプリで読み取ってください。');
        track(denied ? 'camera_denied' : 'camera_error');
        stopStream();
      }
      save();
    };

    const stopStream = () => {
      clearInterval(timer); timer = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
      const v = video();
      if (v) v.srcObject = null;
    };

    const close = () => {
      stopStream();
      $('scanner').hidden = true;
      document.body.classList.remove('modal-open');
    };

    return { open, close };
  })();

  // ---------- 起動 ----------
  const init = () => {
    const params = new URLSearchParams(location.search);
    const spotId = params.get('spot');
    let newSpotId = null;

    if (spotId) {
      newSpotId = handleSpot(spotId, 'url');
      // 再読み込みで二重記録しないよう URL から spot を外す
      params.delete('spot');
      const qs = params.toString();
      history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
    } else {
      track('open');
    }
    save();

    render(newSpotId);
    show(location.hash === '#redeem' ? 'redeem' : 'stamps');

    document.querySelectorAll('.tab[data-tab]').forEach((t) => {
      t.addEventListener('click', () => {
        const tab = t.dataset.tab;
        if (tab === 'scan') scanner.open();
        else if (tab === 'redeem') openRedeem();
        else goStamps();
      });
    });
    $('modal-close').addEventListener('click', closeModal);
    // あそびかた（ヘルプシート）：初回だけ自動で表示
    const openHelp = () => { $('help-sheet').hidden = false; $('help-backdrop').hidden = false; };
    const closeHelp = () => { $('help-sheet').hidden = true; $('help-backdrop').hidden = true; state.helpSeen = true; save(); };
    $('open-help').addEventListener('click', openHelp);
    $('close-help').addEventListener('click', closeHelp);
    $('help-backdrop').addEventListener('click', closeHelp);
    if (!state.helpSeen && !spotId && location.hash !== '#redeem') openHelp();
    $('close-scanner').addEventListener('click', scanner.close);
    document.addEventListener('visibilitychange', () => { if (document.hidden) scanner.close(); });
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
    $('redeem-form').addEventListener('submit', onRedeem);
    $('code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); setError(''); renderOtp(); });
    $('code').addEventListener('focus', () => $('otp').classList.add('is-focused'));
    $('code').addEventListener('blur', () => $('otp').classList.remove('is-focused'));
    renderOtp();

    if (!GAS_URL) console.warn('[stamp-rally] js/config.js の GAS_URL が未設定のため、ログは端末内に保留されます。');
    flush();
  };

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
