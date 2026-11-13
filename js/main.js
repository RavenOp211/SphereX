/* Entry point: smooth scrolling, view switching, hash routes, intro animation. Loads last. */

/* Entrance animation that always ends fully visible, even if it is restarted mid-way */
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

/* ---------- view switching + hash routes (#sky names only) ---------- */
function setView(v, updHash) {
  const tour = v === 'tour';

  document.body.classList.toggle('tour', tour);
  $('#tab-viewer').setAttribute('aria-selected', String(!tour));
  $('#tab-tour').setAttribute('aria-selected', String(tour));
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
    if (lenis) lenis.start();
    if (window.gsap && !reduced) {
      reveal('#viewer .panel', 18, 0.5, 0.07, 0);
    }
  }

  if (updHash) {
    try {
      const hash = tour ? 'space-tour' : S.T.custom ? 'sky-viewer' : S.T.id;
      history.replaceState(null, '', '#' + hash);
    } catch (_) {}
  }
}

$('#tab-viewer').onclick = () => setView('viewer', true);
$('#tab-tour').onclick = () => setView('tour', true);

addEventListener('hashchange', () => {
  const h = location.hash.slice(1);

  if (h === 'space-tour') {
    setView('tour', false);
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
setView(location.hash.slice(1) === 'space-tour' ? 'tour' : 'viewer', false);

if (window.gsap && !reduced) {
  reveal('.intro > *', 16, 0.7, 0.08, 0);
  reveal('#viewer .panel', 26, 0.8, 0.1, 0.15);
}

/* ---------- Visitor Sticky-Note Board (EmmaxPlay itchy-bobcat-50) ---------- */
(function initVisitorNotes() {
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

  function loadNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          notes = parsed;
          return;
        }
      }
    } catch (_) {}
    notes = DEFAULT_NOTES.map((n) => ({ ...n }));
  }

  function saveNotes() {
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

  $('#noteForm').onsubmit = (e) => {
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
    saveNotes();
    renderNotes();

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
    saveNotes();
    renderNotes();
    $('#noteStatus').textContent = 'Sample notes restored.';
  };

  $('#notesGrid').onclick = (e) => {
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      const id = delBtn.dataset.del;
      notes = notes.filter((n) => n.id !== id);
      saveNotes();
      renderNotes();
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
  renderNotes();
})();
