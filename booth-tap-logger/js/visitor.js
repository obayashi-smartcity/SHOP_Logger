// =========================================================
// 来場者画面（マイQR＋景品引換）
//  ・匿名IDを端末の localStorage に保存し、QRコードにして表示
//  ・スタッフがそのQRを読み取ると、GAS 側でブース記録される
//  ・立ち寄りブース数・引換状況は GAS から取得
// =========================================================
(() => {
  const CONFIG = window.BOOTH_CONFIG || {};
  const GAS_URL = (CONFIG.GAS_URL || '').trim();
  const STORAGE_KEY = 'ew-booth-visitor-v1';
  const QR_PREFIX = 'EWV1:'; // スタッフ画面はこの接頭辞のQRだけを受け付ける
  const $ = (id) => document.getElementById(id);
  const SURVEY_ON = Boolean(CONFIG.SURVEY && CONFIG.SURVEY.ACTION && window.createSurvey);

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
      if (s && s.id) return { visitCount: 0, redeemedAt: null, pending: [], ...s };
    } catch (_) {}
    return { id: newId(), visitCount: 0, redeemedAt: null, pending: [] };
  };
  const state = load();
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {} };
  const shortId = () => state.id.replace(/-/g, '').slice(-6).toUpperCase();

  // ---------- 通信 ----------
  const post = async (payload) => {
    if (!GAS_URL) throw new Error('GAS_URL が未設定です（js/config.js）');
    const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow' });
    return res.json();
  };
  const applyStatus = (res) => {
    if (!res || !res.ok) return;
    if (typeof res.visitCount === 'number') state.visitCount = res.visitCount;
    if (res.redeemedAt) state.redeemedAt = res.redeemedAt;
    save();
    render();
  };
  const track = (event) => {
    state.pending.push({ event, clientTime: new Date().toISOString(), ua: navigator.userAgent.slice(0, 200) });
    if (state.pending.length > 100) state.pending = state.pending.slice(-100);
    save();
  };
  // 未送信ログの送信（ついでに最新の状況も受け取る）
  const flush = async () => {
    if (!GAS_URL) return;
    const queue = state.pending.slice();
    try {
      const res = await post(queue.length
        ? { action: 'log', visitorId: state.id, logs: queue }
        : { action: 'status', visitorId: state.id });
      if (res && res.ok) state.pending = state.pending.slice(queue.length);
      applyStatus(res);
    } catch (err) {
      console.warn('[booth] 通信に失敗しました。次回再送します。', err);
    }
  };

  // ---------- 描画 ----------
  const renderQr = () => {
    const qr = qrcode(0, 'M');
    qr.addData(QR_PREFIX + state.id);
    qr.make();
    $('myqr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
  };
  const formatDate = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const render = () => {
    $('myqr-id').textContent = shortId();
    $('ticket-id').textContent = shortId();
    ['visit-count', 'ticket-count', 'header-count'].forEach((id) => { $(id).textContent = state.visitCount; });
    const used = Boolean(state.redeemedAt);
    $('ticket').classList.toggle('is-used', used);
    // 未引換かつアンケート未回答なら、引換券の前にアンケートを表示
    const needSurvey = SURVEY_ON && !used && !state.surveyDoneAt;
    $('survey-wrap').hidden = !needSurvey;
    $('redeem-main').hidden = needSurvey;
    $('redeem-title').textContent = needSurvey ? 'アンケート' : '景品引換券';
    $('ticket-status').textContent = used ? '使用済' : '未使用';
    $('redeem-state').textContent = used ? '使用済' : '未使用';
    $('redeem-state').classList.toggle('is-used', used);
    $('redeem-form').hidden = used;
    $('used-info').hidden = !used;
    if (used) $('used-at').textContent = formatDate(state.redeemedAt);
  };

  // ---------- 画面切替 ----------
  const show = (view) => {
    ['myqr', 'redeem'].forEach((v) => {
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
  const goMyQr = () => {
    if (history.state && history.state.redeem) { history.back(); return; }
    history.replaceState(null, '', location.pathname + location.search);
    show('myqr');
  };
  const openRedeem = () => {
    if (location.hash === '#redeem') return;
    history.pushState({ redeem: true }, '', '#redeem');
    show('redeem');
    track('redeem_view');
    flush();
  };
  window.addEventListener('popstate', () => show(location.hash === '#redeem' ? 'redeem' : 'myqr'));

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
      await flush();
      const res = await post({ action: 'redeem', visitorId: state.id, code, clientTime: new Date().toISOString() });
      if (res && res.ok) {
        state.redeemedAt = res.redeemedAt || new Date().toISOString();
        if (typeof res.visitCount === 'number') state.visitCount = res.visitCount;
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

  // ---------- 起動 ----------
  const init = () => {
    track('open');
    save();
    renderQr();
    render();
    show(location.hash === '#redeem' ? 'redeem' : 'myqr');

    document.querySelectorAll('.tab[data-tab]').forEach((t) => {
      t.addEventListener('click', () => (t.dataset.tab === 'redeem' ? openRedeem() : goMyQr()));
    });
    // つかいかた（ヘルプシート）：初回だけ自動で表示
    const openHelp = () => { $('help-sheet').hidden = false; $('help-backdrop').hidden = false; };
    const closeHelp = () => { $('help-sheet').hidden = true; $('help-backdrop').hidden = true; state.helpSeen = true; save(); };
    $('open-help').addEventListener('click', openHelp);
    $('close-help').addEventListener('click', closeHelp);
    $('help-backdrop').addEventListener('click', closeHelp);
    if (!state.helpSeen && location.hash !== '#redeem') openHelp();
    $('redeem-form').addEventListener('submit', onRedeem);
    $('code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); setError(''); renderOtp(); });
    $('code').addEventListener('focus', () => $('otp').classList.add('is-focused'));
    $('code').addEventListener('blur', () => $('otp').classList.remove('is-focused'));
    renderOtp();

    // アンケート（Google フォームへ送信 → 完了したら4桁コード入力へ）
    if (SURVEY_ON) {
      window.createSurvey({
        root: $('survey-root'),
        config: CONFIG.SURVEY,
        getVisitorId: () => state.id,
        onSubmitted: () => {
          state.surveyDoneAt = new Date().toISOString();
          track('survey_submit');
          save();
          render();
          window.scrollTo(0, 0);
          flush();
        }
      });
    }

    // 画面に戻ってきたとき・1分ごとに、立ち寄りブース数を更新
    document.addEventListener('visibilitychange', () => { if (!document.hidden) flush(); });
    setInterval(() => { if (!document.hidden) flush(); }, 60 * 1000);

    if (!GAS_URL) console.warn('[booth] js/config.js の GAS_URL が未設定です。');
    flush();
  };

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
