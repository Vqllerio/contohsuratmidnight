/* ============================================================
   A Little Love — v3 · Scene-based flow
   Sky → Unlock (in place) → Read (chapters) → Fold away
   ============================================================ */

let current = null;
let pendingPerson = null;
let typing = false;
let typeToken = 0;
let secretRevealed = false;
let musicOn = false;
let failedAttempts = 0;
let lockUntil = 0;

/* ---------------- SCENE SYSTEM ---------------- */
function showScene(name) {
  ['sky', 'unlock', 'read'].forEach(s => {
    const el = document.getElementById('scene' + s[0].toUpperCase() + s.slice(1));
    if (el) el.classList.toggle('active', s === name);
  });
  if (name === 'read') {
    const read = document.getElementById('sceneRead');
    if (read) read.scrollTop = 0;
    updateReadingProgress();
  }
}

/* ---------------- OPENED TRACKING ---------------- */
function getOpened() {
  return db.ref('opened').once('value')
    .then(snap => Object.keys(snap.val() || {}))
    .catch(err => { console.error('opened fetch failed', err); return []; });
}

function markOpened(id) {
  db.ref('opened/' + id).set({
    openedAt: new Date().toISOString(),
    opened: true
  }).catch(err => console.error('opened save failed', err));
}

/* ---------------- SKY ---------------- */
async function renderSky() {
  const arena = document.getElementById('skyArena');
  if (!arena) return;
  arena.innerHTML = '';

  const opened = await getOpened();
  arena.classList.toggle('single', PEOPLE.length === 1);

  PEOPLE.forEach(p => {
    const isOpen = opened.includes(p.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sky-envelope';
    btn.setAttribute('aria-label', `Buka surat untuk ${p.name}`);
    btn.innerHTML =
      '<div class="sky-env-body">' +
        '<div class="sky-env-flap"></div>' +
        '<div class="sky-env-pocket"></div>' +
        '<div class="sky-env-seal">' +
          (isOpen ? '💌' : p.name.charAt(0).toUpperCase()) +
        '</div>' +
      '</div>' +
      '<div class="sky-env-name">' + p.name + '</div>' +
      '<div class="sky-env-status' + (isOpen ? ' opened' : '') + '">' +
        (isOpen ? '● sudah dibuka' : '🔒 khusus ' + p.name) +
      '</div>';

    btn.addEventListener('click', () => pickPerson(p));
    btn.addEventListener('mouseenter', () => {
      const s = document.getElementById('letterHoverSound');
      if (s) { s.currentTime = 0; s.volume = 0.2; s.play().catch(() => {}); }
    });
    arena.appendChild(btn);
  });
}

/* ---------------- PICK PERSON → UNLOCK SCENE ---------------- */
function pickPerson(p) {
  pendingPerson = p;

  document.getElementById('envelopeSeal').innerText = p.name.charAt(0).toUpperCase();
  document.getElementById('unlockName').innerText = 'Halo, ' + p.name + '!';
  document.getElementById('unlockErr').innerText = '';
  document.getElementById('codeInput').value = '';
  document.getElementById('envelopeHero').classList.remove('open');
  document.getElementById('unlockPanel').classList.remove('fade-out');

  // start music on first intentional tap
  const music = document.getElementById('bgMusic');
  if (music && !musicOn) {
    music.volume = 0.4;
    music.play().then(() => {
      musicOn = true;
      document.getElementById('audioToggle').setAttribute('aria-pressed', 'true');
    }).catch(() => {});
  }
  document.getElementById('audioToggle').classList.add('visible');

  showScene('unlock');
  setTimeout(() => document.getElementById('codeInput').focus(), 500);
}

/* ---------------- BACK TO SKY ---------------- */
function backToSky() {
  history.replaceState(null, '', location.pathname);
  pendingPerson = null;
  document.getElementById('envelopeHero').classList.remove('open');
  showScene('sky');
  renderSky();
}

/* ---------------- VERIFY CODE ---------------- */
async function verifyCode() {
  const input = document.getElementById('codeInput');
  const errBox = document.getElementById('unlockErr');
  const btn = document.getElementById('unlockBtn');

  const val = input.value.trim();
  const now = Date.now();
  if (now < lockUntil) {
    errBox.innerText = `Coba lagi dalam ${Math.ceil((lockUntil - now) / 1000)} detik.`;
    return;
  }
  if (!pendingPerson || !val) {
    errBox.innerText = 'Masukkan kode dulu ya!';
    return;
  }

  btn.disabled = true;
  const label = btn.innerText;
  btn.innerText = 'Membuka...';
  errBox.innerText = '';

  try {
    const payload = await LetterCrypto.decrypt(pendingPerson.encrypted, val);
    failedAttempts = 0;

    document.getElementById('envelopeHero').classList.add('open');
    if (navigator.vibrate) navigator.vibrate([15, 40, 20]);

    const person = pendingPerson;
    setTimeout(() => enterReading(person, payload), 1250);
  } catch (err) {
    if (err && err.message === 'Browser tidak mendukung Web Crypto API') {
      errBox.innerText = 'Browser tidak mendukung. Coba Chrome/Safari terbaru.';
    } else {
      failedAttempts++;
      if (failedAttempts >= 5) {
        lockUntil = Date.now() + 30000;
        failedAttempts = 0;
        errBox.innerText = 'Tunggu 30 detik ya.';
      } else {
        errBox.innerText = 'Kode salah 😅 coba lagi ya!';
      }
      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 500);
      input.select();
    }
    btn.disabled = false;
    btn.innerText = label;
  }
}

/* ---------------- ENTER READING ---------------- */
function enterReading(person, payload) {
  current = Object.assign({}, person, payload);
  secretRevealed = false;

  history.replaceState(null, '', '?p=' + person.id);

  const read = document.getElementById('sceneRead');
  read.style.setProperty('--accent', person.accent);

  document.getElementById('letterTitle').innerText = payload.title;
  document.getElementById('letterBody').innerHTML = '';
  document.getElementById('secretMsg').classList.remove('show');
  document.getElementById('secretMsg').innerText = '';
  document.getElementById('skipArea').style.display = 'none';

  document.getElementById('awardIcon').innerText = person.awardIcon;
  document.getElementById('awardTitle').innerText = payload.awardTitle;
  document.getElementById('awardDesc').innerText = payload.awardDesc;

  document.getElementById('signature').classList.remove('charging', 'revealed');

  read.querySelectorAll('.chapter').forEach(c => c.classList.remove('in-view'));
  read.querySelectorAll('.photo-item').forEach(p => p.classList.remove('in-view'));

  renderPhotos(person.photos || []);
  markOpened(person.id);

  showScene('read');
  pendingPerson = null;

  setTimeout(() => {
    read.querySelector('.chapter-i').classList.add('in-view');
    initScrollReveal();
    startTypewriter();
  }, 500);
}

/* ---------------- SCROLL REVEAL ---------------- */
function initScrollReveal() {
  const chapters = document.querySelectorAll('#sceneRead .chapter');
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        if (entry.target.classList.contains('chapter-iv')) {
          entry.target.querySelectorAll('.photo-item').forEach((p, i) => {
            setTimeout(() => p.classList.add('in-view'), 100 + i * 110);
          });
        }
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -80px 0px' });
  chapters.forEach(c => { if (!c.classList.contains('in-view')) io.observe(c); });
}

/* ---------------- READING PROGRESS ---------------- */
function updateReadingProgress() {
  const scene = document.getElementById('sceneRead');
  const fill = document.getElementById('readingProgressFill');
  if (!scene || !fill) return;
  const max = scene.scrollHeight - scene.clientHeight;
  fill.style.height = (max > 0 ? (scene.scrollTop / max) * 100 : 0) + '%';
}
document.getElementById('sceneRead').addEventListener('scroll', updateReadingProgress, { passive: true });

/* ---------------- PHOTOS ---------------- */
function renderPhotos(photos) {
  const wall = document.getElementById('photoWall');
  if (!wall) return;
  wall.innerHTML = '';

  if (!photos || !photos.length) {
    wall.innerHTML = '<div class="photo-empty">Belum ada foto 🥲</div>';
    return;
  }

  photos.forEach((ph, i) => {
    const isObj = typeof ph === 'object' && ph !== null;
    const src = isObj ? ph.src : ph;
    const caption = isObj && ph.caption ? ph.caption : '';

    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'photo-item';
    item.style.setProperty('--rot', (Math.random() * 6 - 3).toFixed(2) + 'deg');
    item.innerHTML =
      '<img src="' + src + '" alt="Foto ' + (i + 1) + '" loading="lazy" draggable="false" />' +
      '<div class="photo-caption">' + caption + '</div>';
    item.addEventListener('click', () => openLightbox(src, caption));
    wall.appendChild(item);
  });
}

/* ---------------- LIGHTBOX ---------------- */
function openLightbox(src, caption) {
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightboxCaption').innerText = caption || '';
  document.getElementById('lightbox').classList.add('show');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('show');
}

/* ---------------- TYPEWRITER ---------------- */
function startTypewriter() {
  if (!current || !current.letter) return;
  typing = true;
  const token = ++typeToken;
  const body = document.getElementById('letterBody');
  body.innerHTML = '';
  document.getElementById('skipArea').style.display = 'block';

  const paras = current.letter;
  let pi = 0;

  const nb = {
    a:'qwsz', b:'vghn', c:'xdfv', d:'erfcxs', e:'wsdr', f:'rtgvcd', g:'tyhbvf',
    h:'yujnbg', i:'ujko', j:'uikmnh', k:'ijolm', l:'kop', m:'njk', n:'bhjm',
    o:'iklp', p:'ol', q:'wa', r:'edft', s:'wedxza', t:'rfgy', u:'yhji', v:'cfgb',
    w:'qeas', x:'zsdc', y:'tghu', z:'asx'
  };
  function wrong(c) {
    const l = c.toLowerCase(), ch = nb[l];
    if (!ch) return 'a';
    const w = ch[Math.floor(Math.random() * ch.length)];
    return c === c.toUpperCase() ? w.toUpperCase() : w;
  }

  function nextPara() {
    if (!typing || token !== typeToken) return;
    if (pi >= paras.length) { finishTyping(); return; }

    const p = document.createElement('p');
    const cursor = document.createElement('span');
    cursor.className = 'type-cursor';
    p.appendChild(cursor);
    body.appendChild(p);

    const text = paras[pi];
    let ci = 0;

    function tick() {
      if (!typing || token !== typeToken) return;
      if (ci < text.length) {
        const tc = text[ci];
        if (Math.random() < 0.012 && /[a-zA-Z]/.test(tc)) {
          cursor.insertAdjacentText('beforebegin', wrong(tc));
          setTimeout(() => {
            if (!typing || token !== typeToken) return;
            const n = cursor.previousSibling;
            if (n && n.nodeType === Node.TEXT_NODE) n.nodeValue = n.nodeValue.slice(0, -1);
            setTimeout(tick, 40 + Math.random() * 60);
          }, 60 + Math.random() * 90);
          return;
        }
        cursor.insertAdjacentText('beforebegin', tc);
        ci++;
        let d = 45 + Math.random() * 35;
        if (tc === ' ') d += 15 + Math.random() * 25;
        else if ([',', ';', ':'].includes(tc)) d += 120 + Math.random() * 80;
        else if (['.', '!', '?'].includes(tc)) d += 280 + Math.random() * 200;
        setTimeout(tick, d);
      } else {
        cursor.remove();
        pi++;
        setTimeout(nextPara, 300 + Math.random() * 300);
      }
    }
    tick();
  }
  nextPara();
}
function finishTyping() {
  typing = false;
  document.getElementById('skipArea').style.display = 'none';
  if (!current || !current.letter) return;
  document.getElementById('letterBody').innerHTML = current.letter.map(t => '<p>' + t + '</p>').join('');
}
function skipTyping() { typeToken++; finishTyping(); }

/* ---------------- SIGNATURE (long-press secret) ---------------- */
function initSignatureSecret() {
  const sig = document.getElementById('signature');
  if (!sig || sig.dataset.init === '1') return;
  sig.dataset.init = '1';

  let timer = null;
  const start = (e) => {
    if (!current || secretRevealed) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    sig.classList.add('charging');
    timer = setTimeout(() => { timer = null; sig.classList.remove('charging'); revealSecret(); }, 1500);
  };
  const end = () => { if (timer) { clearTimeout(timer); timer = null; } sig.classList.remove('charging'); };

  sig.addEventListener('pointerdown', start);
  sig.addEventListener('pointerup', end);
  sig.addEventListener('pointercancel', end);
  sig.addEventListener('pointerleave', end);
  sig.addEventListener('contextmenu', e => e.preventDefault());
  sig.setAttribute('role', 'button');
  sig.setAttribute('tabindex', '0');
  sig.setAttribute('aria-label', 'Tahan untuk membuka pesan rahasia');
  sig.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); revealSecret(); }
  });
}

function revealSecret() {
  if (!current || secretRevealed) return;
  secretRevealed = true;
  document.getElementById('signature').classList.add('revealed');
  const msg = document.getElementById('secretMsg');
  msg.innerText = current.secretMsg || '';
  msg.classList.add('show');
  if (navigator.vibrate) navigator.vibrate([12, 30, 12, 30, 20]);
  triggerConfetti();
}

/* ---------------- CLICK RIPPLE ---------------- */
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.photo-item')) return;
  if (e.target.closest('.lightbox')) return;
  const emojis = ['💖', '✨', '💫', '🌸'];
  for (let i = 0; i < 4; i++) {
    const t = document.createElement('div');
    t.className = 'cursor-trail';
    t.innerText = emojis[Math.floor(Math.random() * emojis.length)];
    const angle = (Math.PI * 2 * i) / 4 + Math.random() * 0.6;
    const dist = 40 + Math.random() * 40;
    t.style.left = e.clientX + 'px';
    t.style.top  = e.clientY + 'px';
    t.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
    t.style.setProperty('--ty', Math.sin(angle) * dist - 20 + 'px');
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1000);
  }
});

/* ---------------- SPAM LOVE ---------------- */
function spamLove(e) {
  confetti({
    particleCount: 30, spread: 60,
    origin: { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight },
    colors: ['#f5c76e', '#ff7a9c', '#fff7e3', '#ffffff']
  });
  const hearts = ['💖', '💕', '✨', '🌸', '🥰', '💫'];
  for (let i = 0; i < 8; i++) {
    const h = document.createElement('div');
    h.classList.add('floating-heart');
    h.innerText = hearts[Math.floor(Math.random() * hearts.length)];
    h.style.left = (e.clientX + (Math.random() * 100 - 50)) + 'px';
    h.style.top  = (e.clientY + (Math.random() * 20 - 10)) + 'px';
    document.body.appendChild(h);
    setTimeout(() => h.remove(), 2200);
  }
}

/* ---------------- COPY LINK ---------------- */
function copyPersonalLink(e) {
  if (!current) return;
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('p', current.id);
  const done = () => {
    const btn = e.currentTarget;
    const original = btn.innerHTML;
    btn.innerHTML = '<span aria-hidden="true">✓</span> Link tersalin! Kirim kodenya terpisah ya 🔐';
    setTimeout(() => { btn.innerHTML = original; }, 2600);
    confetti({ particleCount: 24, spread: 45, scalar: 0.7, origin: { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight } });
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url.toString()).then(done).catch(() => prompt('Copy link ini:', url.toString()));
  } else {
    prompt('Copy link ini:', url.toString());
  }
}

/* ---------------- CONFETTI ---------------- */
function triggerConfetti() {
  const count = 220;
  const base = { origin: { y: 0.6 } };
  const colors = ['#f5c76e', '#ff7a9c', '#fff7e3', '#ffffff'];
  const fire = (r, o) => confetti(Object.assign({}, base, o, { particleCount: Math.floor(count * r), colors }));
  fire(0.25, { spread: 26, startVelocity: 55 });
  fire(0.20, { spread: 60 });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
  fire(0.10, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  fire(0.10, { spread: 120, startVelocity: 45 });
}

/* ---------------- FOLD AWAY (closing ritual) ---------------- */
function foldAway() {
  if (navigator.vibrate) navigator.vibrate([10, 40, 10]);
  confetti({ particleCount: 40, spread: 80, scalar: 0.8, colors: ['#f5c76e', '#fff7e3', '#ff7a9c'] });
  setTimeout(() => backToSky(), 900);
}

/* ---------------- INIT ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  // audio toggle
  const audioBtn = document.getElementById('audioToggle');
  const music = document.getElementById('bgMusic');
  if (audioBtn && music) {
    audioBtn.addEventListener('click', () => {
      if (music.paused) {
        music.play().then(() => { musicOn = true; audioBtn.setAttribute('aria-pressed', 'true'); }).catch(() => {});
      } else {
        music.pause(); musicOn = false; audioBtn.setAttribute('aria-pressed', 'false');
      }
    });
  }

  document.getElementById('backToSky').addEventListener('click', backToSky);
  document.getElementById('unlockBtn').addEventListener('click', verifyCode);
  document.getElementById('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') verifyCode(); });

  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') closeLightbox(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

  initSignatureSecret();
  renderSky();

  // personal-link preload
  const pid = new URLSearchParams(location.search).get('p');
  if (pid) {
    const person = PEOPLE.find(x => x.id === pid);
    if (person) {
      document.getElementById('skyTitle').innerHTML = 'Surat untuk<br/>' + person.name + '.';
      document.getElementById('skySub').innerText = 'Amplopmu sudah menunggu.';
      setTimeout(() => pickPerson(person), 250);
    }
  }
});