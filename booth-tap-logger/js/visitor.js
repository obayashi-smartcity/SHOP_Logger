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
    $('visit-count').textContent = state.visitCount;
    $('ticket-count').textContent = state.visitCount;
    const used = Boolean(state.redeemedAt);
    $('go-redeem-label').textContent = used ? '引換券（使用済）を見る' : '景品と引き換える';
    $('ticket').classList.toggle('is-used', used);
    $('redeem-form').hidden = used;
    $('used-info').hidden = !used;
    if (used) $('used-at').textContent = formatDate(state.redeemedAt);
  };

  // ---------- 画面切替 ----------
  const show = (view) => {
    $('view-myqr').hidden = view !== 'myqr';
    $('view-redeem').hidden = view !== 'redeem';
    window.scrollTo(0, 0);
  };
  const openRedeem = () => {
    if (location.hash !== '#redeem') history.pushState({ redeem: true }, '', '#redeem');
    show('redeem');
    track('redeem_view');
    flush();
  };
  window.addEventListener('popstate', () => show(location.hash === '#redeem' ? 'redeem' : 'myqr'));

  // ---------- 引換 ----------
  const setError = (msg) => { $('form-error').textContent = msg || ''; };
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

    $('go-redeem').addEventListener('click', openRedeem);
    $('back-myqr').addEventListener('click', () => {
      if (history.state && history.state.redeem) { history.back(); return; }
      history.replaceState(null, '', location.pathname + location.search);
      show('myqr');
    });
    $('redeem-form').addEventListener('submit', onRedeem);
    $('code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); setError(''); });

    // 画面に戻ってきたとき・1分ごとに、立ち寄りブース数を更新
    document.addEventListener('visibilitychange', () => { if (!document.hidden) flush(); });
    setInterval(() => { if (!document.hidden) flush(); }, 60 * 1000);

    if (!GAS_URL) console.warn('[booth] js/config.js の GAS_URL が未設定です。');
    flush();
  };

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
