/* ============================================================
   A Little Love — App Logic (Encrypted Edition)
   ============================================================ */

let current = null;
let pendingPerson = null;
let decryptedPayload = null;
let isOpening = false;
let typing = false;
let typeToken = 0;
let sigClicks = 0;
let sigResetTimer = null;
let musicOn = false;

// Brute-force throttling
let failedAttempts = 0;
let lockUntil = 0;

/* ---------------- HUB ---------------- */
function getOpened() {
  return db.ref('opened').once('value')
    .then(snap => Object.keys(snap.val() || {}))
    .catch(err => {
      console.error('Error fetching opened letters:', err);
      return [];
    });
}

async function renderHub() {
  const grid = document.getElementById('hubGrid');
  if (!grid) return;

  grid.innerHTML = '<div class="hub-skeleton"></div>';

  try {
    const opened = await getOpened();
    grid.innerHTML = '';

    PEOPLE.forEach(p => {
      const isOpen = opened.includes(p.id);
      const item = document.createElement('div');
      item.className = 'hub-item';
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-label', `Buka surat untuk ${p.name}`);

      item.innerHTML =
        '<div class="mini-env">' +
          '<div class="mini-flap"></div>' +
          '<div class="mini-seal">' +
            (isOpen ? '💌' : p.name.charAt(0).toUpperCase()) +
          '</div>' +
        '</div>' +
        '<div class="mini-name">' + p.name + '</div>' +
        '<div class="mini-status' + (isOpen ? ' opened' : '') + '">' +
          (isOpen ? '● sudah dibuka' : '🔒 khusus ' + p.name) +
        '</div>';

      const activate = () => openModal(p);
      item.addEventListener('click', activate);
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      });

      item.addEventListener('mouseenter', () => {
        const sound = document.getElementById('letterHoverSound');
        if (sound) {
          sound.currentTime = 0;
          sound.volume = 0.2;
          sound.play().catch(() => {});
        }
      });

      grid.appendChild(item);
    });
  } catch (err) {
    console.error('Failed to render hub:', err);
    grid.innerHTML = '<div style="text-align:center;color:#ff527b;padding:20px;">Gagal memuat surat. Refresh halaman ya.</div>';
  }
}

/* ---------------- CODE MODAL ---------------- */
function openModal(p) {
  pendingPerson = p;
  document.getElementById('modalName').innerText = `Halo, ${p.name}! 🔒`;
  document.getElementById('modalErr').innerText = '';
  const input = document.getElementById('codeInput');
  input.value = '';
  input.type = 'text';           // ← visible, case-sensitive
  document.getElementById('codeModal').classList.add('show');
  setTimeout(() => input.focus(), 100);
}

function closeModal() {
  document.getElementById('codeModal').classList.remove('show');
  pendingPerson = null;
}

/* ---------------- VERIFY CODE (via DECRYPTION) ---------------- */
async function verifyCode() {
  const input = document.getElementById('codeInput');
  const errBox = document.getElementById('modalErr');
  const btn = document.querySelector('.modal-btn');

  // ⬇️ Trim whitespace — crypto layer also normalizes case
  const val = input.value.trim();

  // Throttle after repeated failures
  const now = Date.now();
  if (now < lockUntil) {
    const s = Math.ceil((lockUntil - now) / 1000);
    errBox.innerText = `Terlalu banyak percobaan. Coba lagi dalam ${s} detik.`;
    return;
  }

  if (!pendingPerson || !val) {
    errBox.innerText = 'Masukkan kode dulu ya!';
    return;
  }

  // Loading state
  if (btn) {
    btn.disabled = true;
    if (!btn.dataset.label) btn.dataset.label = btn.innerText;
    btn.innerText = 'Membuka...';
  }
  errBox.innerText = '';

  try {
    const payload = await LetterCrypto.decrypt(pendingPerson.encrypted, val);

    // ✅ Success
    decryptedPayload = payload;
    failedAttempts = 0;

    document.getElementById('codeModal').classList.remove('show');
    const person = pendingPerson;
    pendingPerson = null;
    input.value = '';

    selectPerson(person, payload);
  } catch (err) {
    // ❌ Wrong code (or unsupported browser)
    if (err && err.message === 'Browser tidak mendukung Web Crypto API') {
      errBox.innerText = 'Browser kamu tidak mendukung. Coba Chrome/Safari terbaru.';
    } else {
      failedAttempts++;
      if (failedAttempts >= 5) {
        lockUntil = Date.now() + 30000;
        failedAttempts = 0;
        errBox.innerText = 'Terlalu banyak percobaan. Tunggu 30 detik ya.';
      } else {
        errBox.innerText = 'Kode salah 😅 coba lagi ya!';
      }
      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 450);
      input.select();
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = btn.dataset.label || 'Buka Surat';
    }
  }
}

document.getElementById('codeInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') verifyCode();
});

document.getElementById('codeModal').addEventListener('click', e => {
  if (e.target.id === 'codeModal') closeModal();
});

/* ---------------- SELECT PERSON ---------------- */
function selectPerson(p, payload) {
  current = Object.assign({}, p, payload);

  // No key in URL
  history.replaceState(null, '', '?p=' + p.id);

  const letter = document.getElementById('letterContainer');
  letter.style.setProperty('--primary', p.accent);
  letter.style.setProperty('--primary-dark', p.accent);

  document.getElementById('sealInitial').innerText = p.name.charAt(0).toUpperCase();
  document.getElementById('previewTitle').innerText = 'For ' + p.name;

  document.getElementById('awardIcon').innerText = p.awardIcon;
  document.getElementById('awardTitle').innerText = payload.awardTitle;
  document.getElementById('awardDesc').innerText = payload.awardDesc;

  document.getElementById('letterTitle').innerText = payload.title;
  document.getElementById('letterBody').innerHTML = '';
  document.getElementById('secretMsg').classList.remove('show');
  document.getElementById('skipArea').style.display = 'none';
  sigClicks = 0;

  renderPhotos(p.photos || []);

  const env = document.getElementById('envelopeBox');
  env.classList.remove('open', 'fade-out');
  env.style.display = '';
  letter.classList.remove('show');
  isOpening = false;

  document.getElementById('hubView').classList.remove('show');
  document.getElementById('envelopeScreen').classList.add('show');
  window.scrollTo(0, 0);
}

function goBack() {
  history.replaceState(null, '', location.pathname);
  document.getElementById('envelopeScreen').classList.remove('show');
  document.getElementById('letterContainer').classList.remove('show');
  document.getElementById('hubView').classList.add('show');
  renderHub();
  window.scrollTo(0, 0);
}

/* ---------------- ENVELOPE OPEN ---------------- */
function openEnvelopeAnimation() {
  if (isOpening) return;

  const music = document.getElementById('bgMusic');
  if (music && !musicOn) {
    music.volume = 0.4;
    music.play().then(() => {
      musicOn = true;
      const toggle = document.getElementById('audioToggle');
      if (toggle) {
        toggle.setAttribute('aria-pressed', 'true');
        toggle.classList.add('visible');
      }
    }).catch(() => {});
  }

  isOpening = true;
  const envelope = document.getElementById('envelopeBox');
  const letter = document.getElementById('letterContainer');

  envelope.classList.add('open');
  setTimeout(() => triggerConfetti(), 650);

  setTimeout(() => {
    envelope.classList.add('fade-out');
    setTimeout(() => {
      document.getElementById('envelopeScreen').classList.remove('show');
      letter.classList.add('show');
      if (current) markOpened(current.id);
      startTypewriter();
    }, 400);
  }, 1250);
}

function markOpened(id) {
  db.ref('opened/' + id).set({
    openedAt: new Date().toISOString(),
    opened: true
  }).catch(err => console.error('Error saving opened status:', err));
}

/* ============================================================
   POLAROID CAROUSEL
   ============================================================ */
function renderPhotos(photos) {
  const track = document.getElementById('polaroidTrack');
  const dotsBox = document.getElementById('photoDots');
  if (!track || !dotsBox) return;

  track.innerHTML = '';
  dotsBox.innerHTML = '';

  if (!photos || !photos.length) {
    track.innerHTML = '<div class="carousel-empty">Belum ada foto 🥲</div>';
    updateCarouselArrows();
    return;
  }

  photos.forEach((ph, i) => {
    const isObj = typeof ph === 'object' && ph !== null;
    const src = isObj ? ph.src : ph;
    const caption = isObj && ph.caption ? ph.caption : '';

    const wrap = document.createElement('div');
    wrap.className = 'polaroid';
    wrap.innerHTML =
      '<img src="' + src + '" alt="Foto ' + (i + 1) + '" loading="lazy" draggable="false" />' +
      '<div class="polaroid-caption">' + caption + '</div>';
    track.appendChild(wrap);

    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', 'Ke foto ' + (i + 1));
    dot.addEventListener('click', () => scrollToPhoto(i));
    dotsBox.appendChild(dot);
  });

  track.scrollLeft = 0;
  requestAnimationFrame(() => {
    updateActiveDot();
    updateCarouselArrows();
  });
}

function scrollToPhoto(index) {
  const track = document.getElementById('polaroidTrack');
  if (!track) return;
  const items = track.querySelectorAll('.polaroid');
  const item = items[index];
  if (!item) return;
  const target = item.offsetLeft - (track.clientWidth - item.clientWidth) / 2;
  track.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
}

function stepCarousel(dir) {
  const track = document.getElementById('polaroidTrack');
  if (!track) return;
  const items = track.querySelectorAll('.polaroid');
  if (!items.length) return;
  const step = items[0].offsetWidth + 22;
  track.scrollBy({ left: dir * step, behavior: 'smooth' });
}

function updateActiveDot() {
  const track = document.getElementById('polaroidTrack');
  const dotsBox = document.getElementById('photoDots');
  if (!track || !dotsBox) return;
  const items = track.querySelectorAll('.polaroid');
  if (!items.length) return;

  const center = track.scrollLeft + track.clientWidth / 2;
  let closest = 0, best = Infinity;
  items.forEach((it, i) => {
    const mid = it.offsetLeft + it.offsetWidth / 2;
    const d = Math.abs(mid - center);
    if (d < best) { best = d; closest = i; }
  });

  const dots = dotsBox.querySelectorAll('.carousel-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === closest));
}

function updateCarouselArrows() {
  const track = document.getElementById('polaroidTrack');
  const prev = document.getElementById('photoPrev');
  const next = document.getElementById('photoNext');
  if (!track || !prev || !next) return;
  const max = track.scrollWidth - track.clientWidth - 2;
  prev.disabled = track.scrollLeft <= 2;
  next.disabled = track.scrollLeft >= max;
}

document.addEventListener('DOMContentLoaded', () => {
  const track = document.getElementById('polaroidTrack');
  const prev = document.getElementById('photoPrev');
  const next = document.getElementById('photoNext');
  if (!track) return;

  if (prev) prev.addEventListener('click', () => stepCarousel(-1));
  if (next) next.addEventListener('click', () => stepCarousel(1));

  track.addEventListener('scroll', () => {
    clearTimeout(track._t);
    track._t = setTimeout(() => {
      updateActiveDot();
      updateCarouselArrows();
    }, 80);
  }, { passive: true });

  track.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); stepCarousel(1); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); stepCarousel(-1); }
  });

  track.addEventListener('dragstart', e => e.preventDefault());

  let drag = null;
  track.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, scroll: track.scrollLeft, moved: false, id: e.pointerId };
  });

  track.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      drag.moved = true;
      track.classList.add('dragging');
      try { track.setPointerCapture(drag.id); } catch (_) {}
    }
    track.scrollLeft = drag.scroll - dx;
  });

  const endDrag = () => {
    if (!drag) return;
    track.classList.remove('dragging');
    drag = null;
    updateActiveDot();
    updateCarouselArrows();
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('pointerleave', endDrag);

  window.addEventListener('resize', () => {
    updateActiveDot();
    updateCarouselArrows();
  });
});

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
    a:'qwsz', b:'vghn', c:'xdfv', d:'erfcxs', e:'wsdr', f:'rtgvcd',
    g:'tyhbvf', h:'yujnbg', i:'ujko', j:'uikmnh', k:'ijolm', l:'kop',
    m:'njk', n:'bhjm', o:'iklp', p:'ol', q:'wa', r:'edft', s:'wedxza',
    t:'rfgy', u:'yhji', v:'cfgb', w:'qeas', x:'zsdc', y:'tghu', z:'asx'
  };

  function wrong(c) {
    const l = c.toLowerCase();
    const ch = nb[l];
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
        const typo = Math.random() < 0.03 && /[a-zA-Z]/.test(tc);

        if (typo) {
          cursor.insertAdjacentText('beforebegin', wrong(tc));
          setTimeout(() => {
            if (!typing || token !== typeToken) return;
            const n = cursor.previousSibling;
            if (n && n.nodeType === Node.TEXT_NODE) {
              n.nodeValue = n.nodeValue.slice(0, -1);
            }
            setTimeout(tick, Math.floor(Math.random() * 40) + 30);
          }, Math.floor(Math.random() * 70) + 50);
          return;
        }

        cursor.insertAdjacentText('beforebegin', tc);
        ci++;

        let d = Math.floor(Math.random() * 20) + 15;
        if (tc === ' ') d += Math.floor(Math.random() * 15) + 5;
        else if (['.', ',', '!', '?', ';'].includes(tc))
          d += Math.floor(Math.random() * 100) + 60;

        setTimeout(tick, d);
      } else {
        cursor.remove();
        pi++;
        setTimeout(nextPara, Math.floor(Math.random() * 200) + 200);
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
  document.getElementById('letterBody').innerHTML =
    current.letter.map(t => '<p>' + t + '</p>').join('');
}

function skipTyping() {
  typeToken++;
  finishTyping();
}

/* ---------------- SIGNATURE EASTER EGG ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  const sig = document.getElementById('signature');
  if (!sig) return;
  sig.addEventListener('click', () => {
    if (!current) return;
    sigClicks++;
    clearTimeout(sigResetTimer);
    sigResetTimer = setTimeout(() => { sigClicks = 0; }, 2500);
    if (sigClicks === 3) {
      confetti({ particleCount: 10, spread: 30, origin: { y: 0.7 }, scalar: 0.7 });
    }
    if (sigClicks >= 5) {
      sigClicks = 0;
      const msg = document.getElementById('secretMsg');
      msg.innerText = current.secretMsg || '';
      msg.classList.add('show');
      triggerConfetti();
    }
  });
});

/* ---------------- SPAM LOVE ---------------- */
function spamLove(e) {
  confetti({
    particleCount: 25, spread: 55,
    origin: {
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight
    },
    colors: ['#ff527b', '#ffbe0b', '#ff9ebb', '#ffffff']
  });
  const hearts = ['💖', '💕', '✨', '🌸', '🥰', '🧁'];
  for (let i = 0; i < 6; i++) {
    const h = document.createElement('div');
    h.classList.add('floating-heart');
    h.innerText = hearts[Math.floor(Math.random() * hearts.length)];
    h.style.left = (e.clientX + (Math.random() * 80 - 40)) + 'px';
    h.style.top  = (e.clientY + (Math.random() * 20 - 10)) + 'px';
    document.body.appendChild(h);
    setTimeout(() => h.remove(), 2100);
  }
}

/* ---------------- COPY PERSONAL LINK ---------------- */
function copyPersonalLink(e) {
  if (!current) return;
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('p', current.id);
  // ⚠️ No code in URL — share separately.

  const done = () => {
    const btn = e.currentTarget;
    const original = btn.innerHTML;
    btn.innerHTML = '<span aria-hidden="true">✓</span> Link tersalin! Kirim kodenya terpisah ya 🔐';
    setTimeout(() => { btn.innerHTML = original; }, 2600);
    confetti({
      particleCount: 20, spread: 40, scalar: 0.7,
      origin: { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight }
    });
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url.toString()).then(done).catch(() => {
      prompt('Copy link ini:', url.toString());
    });
  } else {
    prompt('Copy link ini:', url.toString());
  }
}

/* ---------------- CONFETTI ---------------- */
function triggerConfetti() {
  const count = 200;
  const base = { origin: { y: 0.6 } };
  const colors = ['#ff527b', '#ffbe0b', '#ff9ebb', '#ffffff'];
  function fire(r, o) {
    confetti(Object.assign({}, base, o, {
      particleCount: Math.floor(count * r),
      colors
    }));
  }
  fire(0.25, { spread: 26, startVelocity: 55 });
  fire(0.20, { spread: 60 });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
  fire(0.10, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  fire(0.10, { spread: 120, startVelocity: 45 });
}

/* ---------------- CURSOR TRAIL ---------------- */
let lastTrail = 0;
document.addEventListener('mousemove', e => {
  const now = Date.now();
  if (now - lastTrail < 110) return;
  lastTrail = now;
  const t = document.createElement('div');
  t.className = 'cursor-trail';
  t.innerText = ['💖', '💕', '✨', '🌸'][Math.floor(Math.random() * 4)];
  t.style.left = e.clientX + 'px';
  t.style.top  = e.clientY + 'px';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 950);
});

/* ---------------- GREETING -> MAIN ---------------- */
async function enterMainPage() {
  const greeting = document.getElementById('greetingScreen');
  const main = document.getElementById('mainContent');
  const music = document.getElementById('bgMusic');
  const audioToggle = document.getElementById('audioToggle');

  if (music) {
    music.volume = 0.4;
    music.play().then(() => {
      musicOn = true;
      audioToggle.setAttribute('aria-pressed', 'true');
    }).catch(() => {});
  }

  audioToggle.classList.add('visible');

  greeting.classList.add('hidden');

  setTimeout(async () => {
    greeting.style.display = 'none';
    main.classList.add('show');
    document.getElementById('hubView').classList.add('show');
    await renderHub();
  }, 750);
}

/* ---------------- AUDIO TOGGLE ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('audioToggle');
  const music = document.getElementById('bgMusic');
  if (!btn || !music) return;

  btn.addEventListener('click', () => {
    if (music.paused) {
      music.play().then(() => {
        musicOn = true;
        btn.setAttribute('aria-pressed', 'true');
      }).catch(() => {});
    } else {
      music.pause();
      musicOn = false;
      btn.setAttribute('aria-pressed', 'false');
    }
  });
});

/* ---------------- BACK TO TOP ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('backToTop');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) btn.classList.add('visible');
    else btn.classList.remove('visible');
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

/* ---------------- GREETING BUTTON ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('greetingOpen');
  if (btn) btn.addEventListener('click', enterMainPage);
});

/* ---------------- INIT: personal link (?p=...) ---------------- */
(function init() {
  const params = new URLSearchParams(location.search);
  const pid = params.get('p');

  if (pid) {
    const person = PEOPLE.find(x => x.id === pid);
    if (person) {
      const title = document.getElementById('greetingTitle');
      if (title) title.innerText = 'For ' + person.name;
    }
  }
})();