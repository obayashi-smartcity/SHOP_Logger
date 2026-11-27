// =========================================================
// 来場者アンケート → Google フォームへ送信
//  ・設問と送信先（formResponse URL / entry ID）は js/config.js の SURVEY で設定
//  ・MODE: 'scroll'（全問を1ページに縦並び・既定） / 'step'（1問1画面）
//  ・送信は no-cors（Google フォームの応答は読めないため、通信エラーのみ検知）
//  ・選択肢の文言は Google フォーム側と完全一致させること（違うと記録されません）
// =========================================================
window.createSurvey = ({ root, config, getVisitorId, onSubmitted }) => {
  const QUESTIONS = config.QUESTIONS || [];
  const MODE = config.MODE === 'step' ? 'step' : 'scroll';
  const answers = {};
  let sending = false;

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const isAnswered = (q) => {
    const v = answers[q.key];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && String(v).trim() !== '';
  };

  // ---------- 回答パーツ（単一・複数・NPS・テキスト） ----------
  // onChange(auto) … auto=true は「単一選択／NPS をタップした」（1問1画面で自動的に次へ進む合図）
  const buildAnswers = (q, box, onChange) => {
    box.innerHTML = '';
    box.className = `survey-body type-${q.type}`;
    if (q.type === 'single' || q.type === 'multi') {
      const list = el('div', 'choice-grid' + (q.options.length >= 4 || q.type === 'multi' ? ' is-2col' : ''));
      q.options.forEach((opt) => {
        const b = el('button', 'choice', opt);
        b.type = 'button';
        const selected = q.type === 'multi' ? (answers[q.key] || []).includes(opt) : answers[q.key] === opt;
        b.classList.toggle('is-selected', selected);
        b.setAttribute('aria-pressed', String(selected));
        b.addEventListener('click', () => {
          if (q.type === 'multi') {
            const cur = new Set(answers[q.key] || []);
            cur.has(opt) ? cur.delete(opt) : cur.add(opt);
            answers[q.key] = q.options.filter((o) => cur.has(o)); // フォームの選択肢順に並べる
            buildAnswers(q, box, onChange);
            onChange(false);
          } else {
            answers[q.key] = opt;
            buildAnswers(q, box, onChange);
            onChange(true);
          }
        });
        list.append(b);
      });
      box.append(list);
    } else if (q.type === 'nps') {
      const grid = el('div', 'nps-grid');
      for (let i = 0; i <= 10; i += 1) {
        const b = el('button', 'nps', String(i));
        b.type = 'button';
        const selected = answers[q.key] === String(i);
        b.classList.toggle('is-selected', selected);
        b.setAttribute('aria-pressed', String(selected));
        b.addEventListener('click', () => { answers[q.key] = String(i); buildAnswers(q, box, onChange); onChange(true); });
        grid.append(b);
      }
      const labels = el('div', 'nps-labels');
      labels.append(el('span', '', q.lowLabel || ''), el('span', '', q.highLabel || ''));
      box.append(grid, labels);
    } else {
      const input = q.type === 'textarea' ? el('textarea', 'text-field') : el('input', 'text-field');
      if (q.type === 'textarea') input.rows = 4; else input.type = 'text';
      input.placeholder = q.placeholder || '';
      input.maxLength = q.type === 'textarea' ? 500 : 60;
      input.value = answers[q.key] || '';
      input.addEventListener('input', () => { answers[q.key] = input.value; onChange(false); });
      box.append(input);
    }
  };

  // ---------- 送信 ----------
  const submit = async (setBusy, showError) => {
    if (sending) return;
    sending = true;
    setBusy(true);
    const params = new URLSearchParams();
    QUESTIONS.forEach((q) => {
      const v = answers[q.key];
      if (Array.isArray(v)) v.forEach((x) => params.append(q.entry, x));
      else if (v !== undefined && String(v).trim() !== '') params.append(q.entry, String(v).trim());
    });
    if (config.VISITOR_ENTRY) params.append(config.VISITOR_ENTRY, getVisitorId());
    try {
      await fetch(config.ACTION, { method: 'POST', mode: 'no-cors', body: params });
      onSubmitted({ ...answers });
    } catch (err) {
      console.warn('[survey] 送信失敗', err);
      showError('送信できませんでした。電波の良い場所でもう一度お試しください。');
    } finally {
      sending = false;
      setBusy(false);
    }
  };

  root.innerHTML = '';

  // =========================================================
  // スクロール形式（全問を縦に並べ、最後に送信）
  // =========================================================
  if (MODE === 'scroll') {
    const form = el('div', 'survey-list');
    const items = [];
    const progress = el('div', 'survey-sticky');
    const progressText = el('span', 'survey-step');
    const progressTrack = el('div', 'survey-track');
    const progressBar = el('span');
    progressTrack.append(progressBar);
    progress.append(progressText, progressTrack);

    const updateProgress = () => {
      const done = QUESTIONS.filter(isAnswered).length;
      progressText.textContent = `回答済み ${done} / ${QUESTIONS.length}`;
      progressBar.style.width = `${(done / QUESTIONS.length) * 100}%`;
    };

    QUESTIONS.forEach((q, i) => {
      const card = el('section', 'card survey survey-item');
      const head = el('div', 'survey-head');
      head.append(el('span', 'survey-step', `Q${i + 1}`), el('span', 'survey-req' + (q.required ? '' : ' is-optional'), q.required ? '必須' : '任意'));
      const title = el('p', 'survey-q', q.title);
      const box = el('div');
      const msg = el('p', 'survey-missing', 'この質問にお答えください');
      card.append(head, title, box, msg);
      buildAnswers(q, box, () => {
        if (isAnswered(q)) card.classList.remove('is-missing');
        updateProgress();
      });
      items.push({ q, card });
      form.append(card);
    });

    const error = el('p', 'form-error survey-error');
    const send = el('button', 'button button-primary button-center survey-submit', '送信して引換へ');
    send.type = 'button';
    send.addEventListener('click', () => {
      error.textContent = '';
      const missing = items.filter(({ q }) => q.required && !isAnswered(q));
      items.forEach(({ q, card }) => card.classList.toggle('is-missing', q.required && !isAnswered(q)));
      if (missing.length) {
        error.textContent = `未回答の必須項目が ${missing.length} 件あります`;
        const top = missing[0].card.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top, behavior: 'smooth' });
        return;
      }
      submit(
        (busy) => { send.disabled = busy; send.textContent = busy ? '送信中…' : '送信して引換へ'; },
        (m) => { error.textContent = m; }
      );
    });

    root.append(progress, form, error, send);
    updateProgress();
    return { mode: MODE };
  }

  // =========================================================
  // 1問1画面（MODE: 'step'）
  // =========================================================
  let step = 0;
  const card = el('div', 'card survey');
  const head = el('div', 'survey-head');
  const stepLabel = el('span', 'survey-step');
  const reqLabel = el('span', 'survey-req');
  head.append(stepLabel, reqLabel);
  const track = el('div', 'survey-track');
  const bar = el('span');
  track.append(bar);
  const title = el('p', 'survey-q');
  const body = el('div');
  const error = el('p', 'form-error survey-error');
  const nav = el('div', 'survey-nav');
  const back = el('button', 'button button-ghost button-center', '戻る');
  back.type = 'button';
  const next = el('button', 'button button-primary button-center', '次へ');
  next.type = 'button';
  nav.append(back, next);
  card.append(head, track, title, body, error, nav);
  root.append(card);

  const updateNav = () => {
    const q = QUESTIONS[step];
    const last = step === QUESTIONS.length - 1;
    back.style.visibility = step === 0 ? 'hidden' : 'visible';
    next.disabled = sending || (q.required && !isAnswered(q));
    next.textContent = sending ? '送信中…' : last ? '送信して引換へ' : (!q.required && !isAnswered(q) ? 'スキップ' : '次へ');
  };
  const goNext = () => {
    const q = QUESTIONS[step];
    if (q.required && !isAnswered(q)) { error.textContent = '回答を選んでください'; return; }
    if (step < QUESTIONS.length - 1) { step += 1; render(); }
    else submit(() => updateNav(), (m) => { error.textContent = m; });
  };
  const render = () => {
    const q = QUESTIONS[step];
    stepLabel.textContent = `Q${step + 1} / ${QUESTIONS.length}`;
    reqLabel.textContent = q.required ? '必須' : '任意';
    reqLabel.classList.toggle('is-optional', !q.required);
    bar.style.width = `${((step + 1) / QUESTIONS.length) * 100}%`;
    title.textContent = q.title;
    error.textContent = '';
    buildAnswers(q, body, (auto) => {
      error.textContent = '';
      updateNav();
      if (auto && step < QUESTIONS.length - 1) setTimeout(goNext, 220); // 単一選択・NPS は自動で次へ
    });
    updateNav();
    card.classList.remove('is-enter');
    void card.offsetWidth;
    card.classList.add('is-enter');
  };
  back.addEventListener('click', () => { if (step > 0) { step -= 1; render(); } });
  next.addEventListener('click', goNext);
  render();
  return { mode: MODE };
};
