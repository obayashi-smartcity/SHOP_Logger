// QRコード印刷ページ：config.js の SPOTS から各スポットのQRを生成
(() => {
  const init = () => {
    const spots = (window.STAMP_CONFIG && window.STAMP_CONFIG.SPOTS) || [];
    // qr.html と同じフォルダの index.html を読み取り先にする
    const base = new URL('./', location.href).href;
    document.getElementById('base-url').textContent = base;

    const sheet = document.getElementById('qr-sheet');
    spots.forEach((spot) => {
      const url = `${base}?spot=${encodeURIComponent(spot.id)}`;
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();

      const card = document.createElement('article');
      card.className = 'qr-card';
      card.innerHTML = `
        <p class="brand-en">EmpoweringWOMEN</p>
        <p class="kicker">STAMP RALLY</p>
        <h2></h2>
        <div class="qr">${qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true })}</div>
        <p class="howto-text">スマホのカメラで読み取って<br>スタンプをゲット！</p>
        <p class="url"></p>`;
      card.querySelector('h2').textContent = spot.name;
      card.querySelector('.url').textContent = url;
      sheet.append(card);
    });
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
