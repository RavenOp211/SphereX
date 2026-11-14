/* Entry point: smooth scrolling, 3-tab view switching, hash routes, guide recipes, and backend-synced sticky notes. */

/* Entrance animation that always ends fully visible, even if restarted mid-way */
function reveal(sel, y, dur, stag, delay) {
  gsap.fromTo(
    sel,
    { y: y, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      duration: dur,
      stagger: stag,
      delay: delay,
      ease: 'power3.out',
      overwrite: true,
      clearProps: 'transform,opacity'
    }
  );
}

let lenis = null;

if (window.Lenis && !reduced) {
  try {
    lenis = new Lenis({ lerp: 0.09 });
    document.documentElement.style.scrollBehavior = 'auto';

    (function lp(t) {
      lenis.raf(t);
      requestAnimationFrame(lp);
    })(performance.now());
  } catch (_) {
    lenis = null;
  }
}

/* ---------- 3-tab view switching + hash routes (defaults to Space tour) ---------- */
function setView(v, updHash) {
  const tour = v === 'tour';
  const guide = v === 'guide';
  const viewer = !tour && !guide;

  document.body.classList.toggle('tour', tour);
  document.body.classList.toggle('guide', guide);

  $('#tab-viewer').setAttribute('aria-selected', String(viewer));
  $('#tab-tour').setAttribute('aria-selected', String(tour));
  $('#tab-guide').setAttribute('aria-selected', String(guide));
  $('#labels').hidden = !tour;

  if (space.setTour) {
    space.setTour(tour);
  } else {
    space.tour = tour;
  }

  if (tour) {
    if (lenis) lenis.stop();
    window.scrollTo(0, 0);
    if (window.gsap && !reduced) {
      reveal('.dock > *', 30, 0.6, 0.08, 0);
    }
  } else {
    if (lenis) {
      lenis.start();
      lenis.resize();
    }
    window.scrollTo(0, 0);
    if (window.gsap && !reduced) {
      if (guide) {
        reveal('#guide .panel', 20, 0.55, 0.08, 0);
      } else {
        reveal('#viewer .panel', 18, 0.5, 0.07, 0);
      }
    }
  }

  if (updHash) {
    try {
      const hash = tour
        ? 'space-tour'
        : guide
          ? 'field-guide'
          : S.T.custom
            ? 'sky-viewer'
            : S.T.id;
      history.replaceState(null, '', '#' + hash);
    } catch (_) { }
  }
}

function viewFromHash(h) {
  if (h === 'field-guide') return 'guide';
  if (h === 'sky-viewer' || TARGETS.some((x) => x.id === h)) return 'viewer';
  return 'tour';
}

$('#tab-viewer').onclick = () => setView('viewer', true);
$('#tab-tour').onclick = () => setView('tour', true);
$('#tab-guide').onclick = () => setView('guide', true);

addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  const v = viewFromHash(h);

  if (v === 'tour' || v === 'guide') {
    setView(v, false);
  } else {
    const T = TARGETS.find((x) => x.id === h);
    setView('viewer', false);
    if (T && T !== S.T) {
      setTarget(T, false);
    }
  }
});

initViewer();
initSpace();

const startView = viewFromHash(location.hash.slice(1));
setView(startView, false);

if (window.gsap && !reduced && startView === 'viewer') {
  reveal('.intro > *', 16, 0.7, 0.08, 0);
  reveal('#viewer .panel', 26, 0.8, 0.1, 0.15);
}

/* ---------- Field Guide Interactive Navigation & Discovery Recipes ---------- */
(function initFieldGuide() {
  const guideEl = $('#guide');
  if (!guideEl) return;

  function findTargetByHint(keyword) {
    const k = keyword.toLowerCase();
    return TARGETS.find(
      (t) => t.id.toLowerCase().includes(k) || t.name.toLowerCase().includes(k)
    );
  }

  function applySkyControl(sel, val) {
    const el = $(sel);
    if (!el) return;
    el.value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function clickIfFound(containerSel, matchText) {
    const box = $(containerSel);
    if (!box) return;
    const btn = Array.from(box.querySelectorAll('button')).find((b) =>
      b.textContent.toLowerCase().includes(matchText.toLowerCase())
    );
    if (btn) btn.click();
  }

  guideEl.addEventListener('click', (e) => {
    const viewBtn = e.target.closest('[data-go-view]');
    if (viewBtn) {
      setView(viewBtn.dataset.goView, true);
      return;
    }

    const recipeBtn = e.target.closest('[data-recipe]');
    if (!recipeBtn) return;

    const recipe = recipeBtn.dataset.recipe;
    setView('viewer', true);

    if (recipe === 'brown-dwarf') {
      const T = findTargetByHint('wise');
      if (T && typeof setTarget === 'function') setTarget(T, true);
      clickIfFound('#lensSw', '6');
      clickIfFound('#modes', 'normal');
      clickIfFound('#sortSeg', 'reddest');
    } else if (recipe === 'fast-mover') {
      const T = findTargetByHint('barnard');
      if (T && typeof setTarget === 'function') setTarget(T, true);
      clickIfFound('#modes', 'trails');
      clickIfFound('#sortSeg', 'fastest');
    } else if (recipe === 'variable-star') {
      const T = findTargetByHint('draconis');
      if (T && typeof setTarget === 'function') setTarget(T, true);
      clickIfFound('#modes', 'spot change');
    } else if (recipe === 'wide-binary') {
      const T = findTargetByHint('indi');
      if (T && typeof setTarget === 'function') setTarget(T, true);
      applySkyControl('#fov', 14);
      clickIfFound('#modes', 'colour mix');
    }
  });
})();

/* ---------- Visitor Sticky-Note Board (Synced with Flask /api/notes + localStorage fallback) ---------- */
(function initVisitorNotes() {
  if (!$('#notesSection')) return;

  const STORAGE_KEY = 'spherex_visitor_notes_v1';

  const DEFAULT_NOTES = [
    {
      id: 'sample-1',
      author: 'Lyra_IR',
      kind: 'finding',
      tint: 'cream',
      context: 'WISE 0855 · Lens 6 · 4.71 µm',
      text: 'Switching from Lens 1 to Lens 6 makes WISE 0855 pop right out of the dark field while almost every background star vanishes.',
      photo: null,
      date: '2026-11-10',
      sample: true
    },
    {
      id: 'sample-2',
      author: 'OrbitDrift',
      kind: 'problem',
      tint: 'lavender',
      context: 'Epsilon Indi B · Zoom 3′',
      text: 'At the default 3′ zoom I could not find Epsilon Indi A at first—zooming out to 14′ revealed it right on the edge.',
      photo: null,
      date: '2026-11-11',
      sample: true
    },
    {
      id: 'sample-3',
      author: 'MiraHunter',
      kind: 'finding',
      tint: 'wisteria',
      context: 'R Draconis · Spot change',
      text: 'Using Spot change on R Draconis clearly shows the pulsation swing across the 8 epochs without the star shifting position.',
      photo: null,
      date: '2026-11-12',
      sample: true
    }
  ];

  let notes = [];
  let selectedKind = 'finding';
  let selectedTint = 'cream';
  let activeFilter = 'all';
  let pendingPhoto = null;

  async function loadNotes() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/notes`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.notes) && data.notes.length > 0) {
          notes = data.notes;
          saveLocalNotes();
          renderNotes();
          return;
        }
      }
    } catch (_) { }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          notes = parsed;
          renderNotes();
          return;
        }
      }
    } catch (_) { }

    notes = DEFAULT_NOTES.map((n) => ({ ...n }));
    renderNotes();
  }

  function saveLocalNotes() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch (_) {
      $('#noteStatus').textContent = 'Storage full — try removing an older photo note.';
    }
  }

  function esc(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function compressDataUrl(dataUrl, maxW = 840, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const cx = c.getContext('2d');
        cx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function setPendingPhoto(dataUrl, label) {
    pendingPhoto = dataUrl;
    const wrap = $('#notePreviewWrap');
    if (dataUrl) {
      $('#notePreviewImg').src = dataUrl;
      wrap.hidden = false;
      $('#notePhotoHint').textContent = label || 'Photo attached';
    } else {
      $('#notePreviewImg').removeAttribute('src');
      wrap.hidden = true;
      $('#notePhotoHint').textContent = 'or drop an image here';
      $('#notePhotoInput').value = '';
    }
  }

  async function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      $('#noteStatus').textContent = 'Please select a valid image file.';
      return;
    }
    $('#noteStatus').textContent = 'Preparing photo...';
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const compressed = await compressDataUrl(reader.result);
        setPendingPhoto(compressed, file.name.slice(0, 26));
        $('#noteStatus').textContent = '';
      } catch (_) {
        $('#noteStatus').textContent = 'Could not read that image.';
      }
    };
    reader.readAsDataURL(file);
  }

  function currentSkyContext() {
    if (typeof S === 'undefined' || !S.T) return '';
    const lensLabel = S.lens === 'all' ? 'All lenses' : `Lens ${S.lens + 1} · ${curLam().toFixed(2)} µm`;
    return `${S.T.name} · ${lensLabel}`;
  }

  function renderNotes() {
    const grid = $('#notesGrid');
    const total = notes.length;
    $('#notesCount').textContent = `${total} sticky ${total === 1 ? 'note' : 'notes'}`;

    const visible = activeFilter === 'all'
      ? notes
      : notes.filter((n) => n.kind === activeFilter);

    if (!visible.length) {
      grid.innerHTML = '<div class="notes-empty">No sticky notes in this filter yet. Pin one on the left!</div>';
      return;
    }

    grid.innerHTML = visible.map((n) => `
      <article class="sticky-card" data-tint="${esc(n.tint || 'cream')}" data-id="${esc(n.id)}">
        <div class="tools">
          <div class="dots-group" aria-hidden="true">
            <div class="circle"><span class="red box"></span></div>
            <div class="circle"><span class="yellow box"></span></div>
            <div class="circle"><span class="green box"></span></div>
          </div>
          <div class="tools-right">
            <span class="sticky-tag ${n.kind === 'problem' ? 'problem' : ''}">
              ${n.kind === 'problem' ? 'Problem' : 'Finding'}
            </span>
            <button type="button" class="sticky-del" data-del="${esc(n.id)}" title="Remove note" aria-label="Remove note">&times;</button>
          </div>
        </div>
        <div class="card__content">
          <div class="sticky-meta">
            <span class="sticky-author">${esc(n.author)}</span>
            <span>${esc(n.date)}</span>
          </div>
          ${n.context ? `<span class="sticky-context">${esc(n.context)}</span>` : ''}
          <p class="sticky-body">${esc(n.text)}</p>
          ${n.photo ? `
            <div class="sticky-photo" data-zoom="${esc(n.id)}" title="Click to enlarge photo">
              <img src="${n.photo}" alt="Attachment from ${esc(n.author)}">
            </div>
          ` : ''}
        </div>
      </article>
    `).join('');
  }

  /* Bind controls */
  $('#noteKindSeg').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    selectedKind = b.dataset.kind;
    $$('#noteKindSeg button').forEach((btn) =>
      btn.setAttribute('aria-pressed', String(btn === b))
    );
  };

  $$('#noteForm .tint-dot').forEach((dot) => {
    dot.onclick = () => {
      selectedTint = dot.dataset.tint;
      $$('#noteForm .tint-dot').forEach((d) =>
        d.setAttribute('aria-pressed', String(d === dot))
      );
    };
  });

  $('#noteUploadBtn').onclick = () => $('#notePhotoInput').click();

  $('#notePhotoInput').onchange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  };

  $('#noteSnapBtn').onclick = async () => {
    const skyCanvas = $('#sky');
    if (!skyCanvas) return;
    try {
      const snap = await compressDataUrl(skyCanvas.toDataURL('image/png'), 760, 0.84);
      setPendingPhoto(snap, 'Sky view snapshot');
      $('#noteStatus').textContent = 'Sky view captured!';
    } catch (_) {
      $('#noteStatus').textContent = 'Could not capture sky canvas.';
    }
  };

  const dropzone = $('#noteDropzone');
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });

  $('#notePreviewRm').onclick = () => setPendingPhoto(null);

  $('#noteForm').onsubmit = async (e) => {
    e.preventDefault();
    const text = $('#noteText').value.trim();
    if (!text) return;

    const author = $('#noteAuthor').value.trim() || 'Anonymous Observer';
    const attachCtx = $('#noteAttachSky').checked;
    const today = new Date().toISOString().slice(0, 10);

    const newNote = {
      id: 'note-' + Date.now(),
      author,
      kind: selectedKind,
      tint: selectedTint,
      context: attachCtx ? currentSkyContext() : '',
      text,
      photo: pendingPhoto,
      date: today
    };

    notes.unshift(newNote);
    saveLocalNotes();
    renderNotes();

    try {
      await fetch(`${BACKEND_URL}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNote)
      });
    } catch (_) { }

    $('#noteText').value = '';
    setPendingPhoto(null);
    $('#noteStatus').textContent = 'Sticky note pinned!';

    if (window.gsap && !reduced) {
      const firstCard = $('#notesGrid .sticky-card');
      if (firstCard) {
        gsap.fromTo(
          firstCard,
          { y: -14, opacity: 0, scale: 0.94 },
          { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.6)', clearProps: 'transform,opacity' }
        );
      }
    }
  };

  $('#noteFilters').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    activeFilter = b.dataset.filter;
    $$('#noteFilters button').forEach((btn) =>
      btn.setAttribute('aria-pressed', String(btn === b))
    );
    renderNotes();
  };

  $('#notesResetDemo').onclick = () => {
    notes = DEFAULT_NOTES.map((n) => ({ ...n }));
    saveLocalNotes();
    renderNotes();
    $('#noteStatus').textContent = 'Sample notes restored.';
  };

  $('#notesGrid').onclick = async (e) => {
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      const id = delBtn.dataset.del;
      notes = notes.filter((n) => n.id !== id);
      saveLocalNotes();
      renderNotes();
      try {
        await fetch(`${BACKEND_URL}/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch (_) { }
      return;
    }

    const zoomBox = e.target.closest('[data-zoom]');
    if (zoomBox) {
      const item = notes.find((n) => n.id === zoomBox.dataset.zoom);
      if (item && item.photo) {
        $('#noteLightboxImg').src = item.photo;
        $('#noteLightboxCap').textContent = `${item.author}${item.context ? ' — ' + item.context : ''}`;
        $('#noteLightbox').hidden = false;
      }
    }
  };

  const closeLightbox = () => {
    $('#noteLightbox').hidden = true;
    $('#noteLightboxImg').removeAttribute('src');
  };

  $('#noteLightboxClose').onclick = closeLightbox;
  $('#noteLightbox').onclick = (e) => {
    if (e.target === $('#noteLightbox')) closeLightbox();
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#noteLightbox').hidden) closeLightbox();
  });

  $('#notesSection').addEventListener('toggle', () => {
    if (lenis) lenis.resize();
  });

  loadNotes();
})();

/* ---------- Space Tour Random Fun Facts Card ---------- */
(function initTourFacts() {
  const card = $('#tourFactCard');
  if (!card) return;

  const FACTS = [
    {
      cat: 'SPHEREx',
      title: '102 Infrared Colours',
      text: 'SPHEREx sees the entire sky in 102 near-infrared wavelengths, creating the most colourful all-sky spectral map ever assembled.'
    },
    {
      cat: 'SPHEREx',
      title: 'Triple-Cone Sunshield',
      text: 'Three nested cone-shaped photon shields block heat from Earth and the Sun, passively cooling SPHEREx’s telescope to roughly −210 °C.'
    },
    {
      cat: 'SPHEREx',
      title: '450 Million Galaxies',
      text: 'Every six months, SPHEREx surveys the entire sky—gathering spectra for more than 450 million galaxies and 100 million Milky Way stars.'
    },
    {
      cat: 'SPHEREx',
      title: 'Hunting Cosmic Water Ice',
      text: 'SPHEREx scans cold interstellar clouds for frozen water, carbon dioxide, and carbon monoxide—the raw ingredients of oceans and life.'
    },
    {
      cat: 'SPHEREx',
      title: 'Wide-Angle Sky Cartographer',
      text: 'While Webb and Hubble zoom into tiny patches of space, SPHEREx maps the entire sky to uncover rare targets for deeper follow-up.'
    },
    {
      cat: 'SPHEREx',
      title: 'Echoes of Cosmic Inflation',
      text: 'By mapping galaxies in 3D across cosmic time, SPHEREx tests what drove the universe’s rapid expansion right after the Big Bang.'
    },
    {
      cat: 'Planets',
      title: 'Venus’s Backward Day',
      text: 'A single rotation on Venus takes 243 Earth days—longer than the 225 Earth days it takes Venus to complete one orbit around the Sun.'
    },
    {
      cat: 'Planets',
      title: 'Saturn Could Float',
      text: 'Composed mostly of hydrogen and helium, Saturn’s average density is lower than liquid water—it would float in a giant ocean.'
    },
    {
      cat: 'Planets',
      title: 'Uranus Rolls on Its Side',
      text: 'Uranus spins at a dramatic 98-degree axial tilt, likely knocked sideways by a massive planetary collision in the early Solar System.'
    },
    {
      cat: 'Planets',
      title: 'Olympus Mons on Mars',
      text: 'Mars is home to Olympus Mons, a shield volcano towering nearly 22 km high—roughly two and a half times the height of Mount Everest.'
    },
    {
      cat: 'Planets',
      title: 'Supersonic Winds on Neptune',
      text: 'Neptune whips frozen methane clouds across its atmosphere at over 2,000 km/h—faster than the speed of sound on Earth.'
    },
    {
      cat: 'Planets',
      title: 'Jupiter’s Centuries-Old Storm',
      text: 'Jupiter’s Great Red Spot is a towering anticyclonic storm wider than Earth that has been raging for hundreds of years.'
    },
    {
      cat: 'Deep Space',
      title: 'Room-Temperature Brown Dwarfs',
      text: 'Ultra-cold Y-type brown dwarfs like WISE 0855 are barely warmer than a human body, glowing almost exclusively past 4 µm in infrared light.'
    },
    {
      cat: 'Deep Space',
      title: 'Barnard’s Runaway Star',
      text: 'Barnard’s Star races across Earth’s sky faster than any other known star, shifting by the width of a full Moon every 180 years.'
    },
    {
      cat: 'Deep Space',
      title: 'Seeing Through Cosmic Dust',
      text: 'Thick interstellar dust clouds that appear pitch-black to human eyes turn transparent in infrared light, revealing newborn stars inside.'
    },
    {
      cat: 'Deep Space',
      title: 'A Billion-Ton Teaspoon',
      text: 'Neutron stars pack more mass than our Sun into a city-sized sphere—one teaspoon of neutron-star matter weighs about a billion tons.'
    },
    {
      cat: 'Deep Space',
      title: 'Telescopes Are Time Machines',
      text: 'Because light travels at a finite speed, observing galaxies billions of light-years away shows the universe as it looked billions of years ago.'
    },
    {
      cat: 'Deep Space',
      title: 'A Million Earths Inside the Sun',
      text: 'Roughly one million Earths could fit inside the Sun, yet our Sun is an ordinary G-type star among hundreds of billions in the Milky Way.'
    }
  ];

  const badgeEl = $('#tourFactTag');
  const countEl = $('#tourFactCount');
  const titleEl = $('#tourFactTitle');
  const textEl = $('#tourFactText');
  const bodyEl = $('#tourFactBody');
  const minBtn = $('#tourFactMin');
  const nextBtn = $('#tourFactNext');

  let currentIdx = Math.floor(Math.random() * FACTS.length);
  let hovered = false;
  let collapsed = false;

  function renderFact(idx, animate) {
    const f = FACTS[idx];
    const apply = () => {
      badgeEl.textContent = f.cat;
      badgeEl.dataset.cat = f.cat;
      countEl.textContent = `${idx + 1} / ${FACTS.length}`;
      titleEl.textContent = f.title;
      textEl.textContent = f.text;
    };

    if (!animate || reduced) {
      apply();
      return;
    }

    bodyEl.classList.add('swapping');
    setTimeout(() => {
      apply();
      bodyEl.classList.remove('swapping');
    }, 180);
  }

  function showRandomNext() {
    let next = currentIdx;
    while (next === currentIdx && FACTS.length > 1) {
      next = Math.floor(Math.random() * FACTS.length);
    }
    currentIdx = next;
    renderFact(currentIdx, true);
  }

  nextBtn.onclick = showRandomNext;

  minBtn.onclick = () => {
    collapsed = !collapsed;
    card.classList.toggle('is-collapsed', collapsed);
    minBtn.setAttribute('aria-expanded', String(!collapsed));
    minBtn.innerHTML = collapsed ? '+' : '&minus;';
  };

  card.addEventListener('mouseenter', () => {
    hovered = true;
  });
  card.addEventListener('mouseleave', () => {
    hovered = false;
  });

  renderFact(currentIdx, false);

  setInterval(() => {
    if (!hovered && !collapsed && document.body.classList.contains('tour')) {
      showRandomNext();
    }
  }, 14000);
})();