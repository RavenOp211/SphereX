/* DATA LAYER: object classes, simulated spectra, targets, catalog generator, and live NASA SPHEREx DR1 loader. */

const BACKEND_URL = 'http://127.0.0.1:5000';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const TAU = Math.PI * 2;
const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;

function mulberry(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function gauss(r) {
  return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(TAU * r());
}

/* SPHEREx: six detector arrays, each with a linear variable filter, 17 bands each = 102 bands */
const BANDS = [
  [0.75, 1.09],
  [1.09, 1.62],
  [1.62, 2.42],
  [2.42, 3.82],
  [3.82, 4.42],
  [4.42, 5.0]
];

const TINT = [
  [111, 168, 255],
  [98, 214, 195],
  [182, 224, 106],
  [255, 209, 102],
  [255, 154, 77],
  [255, 92, 92]
];

const LENS_TXT = [
  'Shortest light. Hot and ordinary stars are brightest here. Very cold objects are almost invisible.',
  'Near-infrared. Red dwarfs and warm brown dwarfs start to stand out from normal stars.',
  'Cool giant stars and galaxies glow strongly. Dust begins to show.',
  'Mid-infrared. Water and carbon-rich ices leave dips and bumps here. Dusty objects brighten.',
  'Stars fade, while cold brown dwarfs and warm asteroids brighten. Good for hunting the coldest objects.',
  'Longest colour. Only the coolest, dustiest objects stay bright. Most stars nearly vanish.'
];

const bandLam = (d, j) => BANDS[d][0] + ((j + 0.5) / 17) * (BANDS[d][1] - BANDS[d][0]);
const specMid = (i) => (BANDS[i][0] + BANDS[i][1]) / 2;

const EPOCHS = [
  '2025-06-01',
  '2025-08-15',
  '2025-11-01',
  '2026-01-15',
  '2026-04-01',
  '2026-06-15',
  '2026-09-01',
  '2026-11-01'
];

const EY = EPOCHS.map((d) => 2000 + (Date.parse(d) - Date.UTC(2000, 0, 1)) / 31557600000);
const TMID = (EY[0] + EY[EY.length - 1]) / 2;
const NE = EPOCHS.length;

/* Object classes used for sorting and filtering */
const CLASSES = {
  star: { label: 'Stars', col: '#8fb8ff' },
  red: { label: 'Red dwarfs', col: '#ff9a6b' },
  bd: { label: 'Brown dwarfs', col: '#ff5fa2' },
  giant: { label: 'Giants and variables', col: '#ffd166' },
  young: { label: 'Young stars', col: '#6fe0a8' },
  gal: { label: 'Galaxies', col: '#c79bff' },
  qso: { label: 'Quasars', col: '#72d6ff' },
  mover: { label: 'Asteroids and comets', col: '#ff7a3d' }
};

const CLS_KEYS = Object.keys(CLASSES);

/* Typical spectrum shapes (relative flux versus wavelength in micrometres) */
const g = (l, c, w) => Math.exp(-((l - c) * (l - c)) / (2 * w * w));

const SPEC = {
  hot: (l) => 1.0 * Math.pow(1.25 / l, 2.0),
  star: (l) => 0.9 * Math.pow(1.25 / l, 1.5),
  red: (l) => 0.85 * Math.pow(1.25 / l, 1.1) + 0.08 * g(l, 1.6, 0.15),
  tdwarf: (l) => 0.05 + 0.9 * g(l, 1.27, 0.13) + 0.5 * g(l, 1.6, 0.1) + 0.55 * g(l, 4.1, 0.4),
  ydwarf: (l) => 0.003 + 0.02 * g(l, 1.2, 0.1) + 1.0 * g(l, 4.5, 0.5),
  mira: (l) => Math.max(0.03, 0.2 + 0.9 * g(l, 2.0, 0.8) + 0.5 * g(l, 4.3, 0.7) - 0.25 * g(l, 2.7, 0.25)),
  yso: (l) => 0.25 + 0.5 * g(l, 1.3, 0.5) + 0.22 * l,
  gal: (l) => 0.12 + 0.8 * g(l, 1.6, 0.9) + 0.3 * g(l, 3.3, 0.2),
  qso: (l) => 0.25 * Math.pow(l / 1.25, 0.9),
  ast: (l) => 0.35 + 0.12 * l + 0.5 / (1 + Math.exp(-(l - 3.6) * 2.2))
};

/* What each spectrum type means, shown in the details card */
const KINDS = {
  hot: {
    title: 'Hot star',
    text: 'A hot, blue-white star. Its light is brightest at short infrared colours and fades quickly toward longer ones.',
    look: 'Brightest in lenses 1 and 2. Nearly gone in lens 6.'
  },
  star: {
    title: 'Ordinary star',
    text: 'A Sun-like or orange star. Its infrared light fades smoothly toward longer colours.',
    look: 'Bright in short colours and steady over time.'
  },
  red: {
    title: 'Red dwarf',
    text: 'A small, cool star. It is faint to the eye but shines well in near-infrared light.',
    look: 'Peaks in lenses 1 to 3. Often shows noticeable motion if it is nearby.'
  },
  tdwarf: {
    title: 'T-type brown dwarf',
    text: 'A failed star, too light to burn hydrogen. Methane in its air carves dips into its spectrum, with glows near 1.3 and 4 µm.',
    look: 'Appears in lens 2 and again in lens 5. Looks red in the Colour mix view.'
  },
  ydwarf: {
    title: 'Y-type brown dwarf',
    text: 'One of the coldest brown dwarfs, about as cold as a freezer. It is dark in short colours and glows near 4.5 µm.',
    look: 'Vanishes in lenses 1 to 3, then shines in lens 5 and 6. Fast movers when nearby.'
  },
  mira: {
    title: 'Pulsating giant star',
    text: 'A cool giant that swells and shrinks, so its brightness rises and falls over months. Water in its atmosphere absorbs near 2.7 µm.',
    look: 'Strongest in lens 3. Use Spot change to see its brightness shift.'
  },
  yso: {
    title: 'Young star with a disk',
    text: 'A young star surrounded by dust and gas. Dust adds extra glow at longer colours, and passing clumps can dim the star.',
    look: 'Gets relatively brighter toward lens 5 and 6. Often variable.'
  },
  gal: {
    title: 'Galaxy',
    text: 'A distant system of billions of stars. It looks fuzzy rather than pointlike, with a bump of starlight near 1.6 µm and a dust feature near 3.3 µm.',
    look: 'Soft, extended blob that does not move.'
  },
  qso: {
    title: 'Quasar',
    text: 'The bright core of a distant galaxy, powered by a black hole. Its light rises steadily toward longer colours.',
    look: 'Faint point that gets brighter in lenses 4 to 6. Does not move.'
  },
  ast: {
    title: 'Asteroid or comet',
    text: 'A rocky or icy body in our own solar system. It reflects sunlight and glows from its own warmth at longer colours. It moves far faster than any star.',
    look: 'Brighter in lens 5 and 6. Use Spot change or Trails to see it jump between pictures.'
  }
};

/* Colour = log10( flux at 4.5 µm / flux at 1.25 µm ); negative is blue, positive is red */
const colorIndex = (s) => {
  if (Array.isArray(s.spec) && s.spec.length >= 102) {
    const f125 = Math.max(1e-4, s.spec[22] || 0.01);
    const f450 = Math.max(1e-4, s.spec[88] || 0.01);
    return Math.log10(f450 / f125);
  }
  const sp = SPEC[s.type] || SPEC.star;
  return Math.log10((sp(4.5) + 1e-4) / (sp(1.25) + 1e-4)) + (s.cj || 0);
};

const R2 = mulberry(77);
const irreg = Array.from({ length: NE }, () => 0.35 + 0.65 * R2());

const TARGETS = [
  {
    id: 'nasa-cosmos',
    name: 'NASA Live (COSMOS)',
    ra: '10h00m00.0s',
    dec: '+02d00m00s',
    ra0: 150.0,
    dec0: 2.0,
    fov: 3,
    isLiveNasa: true,
    tip: '<b>Live NASA SPHEREx DR1 pixels</b> fetched directly from NASA/IPAC IRSA at RA 150.0°, Dec +2.0°. Use <b>Spot change</b>, <b>Brightness boost</b>, or click any detected source.',
    srcs: []
  },
  {
    id: 'barnards-star',
    name: "Barnard's Star",
    ra: '17h57m48.5s',
    dec: '+4d41m36s',
    fov: 3,
    tip: "A red dwarf only 6 light-years away. No other known star crosses our sky faster. Watch it slide.",
    srcs: [
      {
        n: "Barnard's Star",
        cls: 'red',
        type: 'red',
        dx: 0,
        dy: 0,
        b: 0.95,
        pm: [-0.80, 10.33],
        main: 1,
        sp: 'M4 V red dwarf',
        dist: 5.96,
        note: 'The fastest-moving star known across our sky, at about 10 arcseconds per year.'
      }
    ]
  },
  {
    id: 'epsilon-indi',
    name: 'Epsilon Indi B',
    ra: '22h04m10.5s',
    dec: '-56d46m58s',
    fov: 3,
    tip: "Two brown dwarfs so close they look like one dot, orbiting a star. Zoom out to <b>14′ or more</b> to spot the star on the right edge.",
    srcs: [
      {
        n: 'Epsilon Indi Ba + Bb',
        cls: 'bd',
        type: 'tdwarf',
        dx: 0,
        dy: 0,
        b: 0.55,
        pm: [3.97, -2.54],
        main: 1,
        sp: 'T1 + T6 brown dwarf pair',
        dist: 11.9,
        note: 'Two brown dwarfs orbiting each other. Together they circle the star Epsilon Indi A.'
      },
      {
        n: 'Epsilon Indi A',
        cls: 'star',
        type: 'star',
        dx: -401,
        dy: -11.7,
        b: 1,
        pm: [3.97, -2.54],
        cat: 1,
        sp: 'K5 V orange dwarf',
        dist: 11.9,
        note: 'The orange star that the brown-dwarf pair orbits. It shares the pair’s motion across the sky.'
      }
    ]
  },
  {
    id: 'wise-0855',
    name: 'WISE 0855',
    ra: '08h55m10.831s',
    dec: '-7d14m42.53s',
    fov: 3,
    tip: "One of the coldest brown dwarfs known, and fast. It glows in the longest colours, so try <b>lens 5 or 6</b>, then lens 1.",
    srcs: [
      {
        n: 'WISE 0855',
        cls: 'bd',
        type: 'ydwarf',
        dx: 0,
        dy: 0,
        b: 0.95,
        pm: [-8.0, 0.7],
        main: 1,
        sp: 'Y-type brown dwarf, about −20 °C',
        dist: 7.4,
        note: 'Moves about 8 arcseconds per year. It is almost invisible at short infrared colours.'
      }
    ]
  },
  {
    id: 'rw-aurigae',
    name: 'RW Aurigae',
    ra: '05h07m49.6s',
    dec: '+30d24m05s',
    fov: 2.5,
    tip: "A young star whose brightness changes unpredictably as clumps of dust pass in front. Watch it fade and recover.",
    srcs: [
      {
        n: 'RW Aurigae',
        cls: 'young',
        type: 'yso',
        dx: 0,
        dy: 0,
        b: 0.8,
        pm: [0, -0.2],
        main: 1,
        vr: irreg,
        sp: 'Young star with a dusty disk',
        dist: 500,
        note: 'Its light dims irregularly when dust passes in front of it. Distance is approximate.'
      }
    ]
  },
  {
    id: 'r-draconis',
    name: 'R Draconis',
    ra: '16h32m41.2s',
    dec: '+66d45m18s',
    fov: 2.5,
    tip: "A giant star that swells and shrinks, brightening and fading about every 8 months. It stays put but its brightness moves.",
    srcs: [
      {
        n: 'R Draconis',
        cls: 'giant',
        type: 'mira',
        dx: 0,
        dy: 0,
        b: 0.95,
        pm: [0, 0],
        main: 1,
        sp: 'Mira-type pulsating giant, period about 245 days',
        dist: null,
        vr: EY.map((y) => 0.12 + 0.88 * (0.5 + 0.5 * Math.cos(TAU * (y - 2025.2) / (245 / 365.25)))),
        note: 'Pulsates with a period of roughly 8 months, so its infrared brightness swings widely.'
      }
    ]
  }
];

/* Coordinates */
function parseRA(s) {
  s = String(s).trim().toLowerCase();
  let m = s.match(/^(\d+)\s*[h: ]\s*(\d+)\s*[m: ]\s*([\d.]+)\s*s?$/);
  if (m) {
    return (+m[1] + m[2] / 60 + m[3] / 3600) * 15;
  }
  m = s.match(/^[\d.]+$/);
  return m ? +s : NaN;
}

function parseDec(s) {
  s = String(s).trim().toLowerCase();
  let m = s.match(/^([+-]?)(\d+)\s*[d°: ]\s*(\d+)\s*[m':′ ]\s*([\d.]+)\s*(?:s|"|″)?$/);
  if (m) {
    return (m[1] === '-' ? -1 : 1) * (+m[2] + m[3] / 60 + m[4] / 3600);
  }
  m = s.match(/^[+-]?[\d.]+$/);
  return m ? +s : NaN;
}

function fmtRA(d, dp) {
  d = (((d % 360) + 360) % 360) / 15;
  const h = Math.floor(d);
  const m = Math.floor((d - h) * 60);
  const s = ((d - h) * 60 - m) * 60;
  const padLen = dp === 0 ? 2 : 4;
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m${s.toFixed(dp == null ? 1 : dp).padStart(padLen, '0')}s`;
}

function fmtDec(d) {
  const sg = d < 0 ? '-' : '+';
  d = Math.abs(d);
  const D = Math.floor(d);
  const m = Math.floor((d - D) * 60);
  const s = ((d - D) * 60 - m) * 60;
  return `${sg}${String(D).padStart(2, '0')}°${String(m).padStart(2, '0')}′${s.toFixed(0).padStart(2, '0')}″`;
}

TARGETS.forEach((T) => {
  if (T.ra0 == null) T.ra0 = parseRA(T.ra);
  if (T.dec0 == null) T.dec0 = parseDec(T.dec);
});

const desig = (T, s) => {
  const ra = (((T.ra0 + s.dx / (3600 * Math.cos((T.dec0 * Math.PI) / 180))) % 360) + 360) % 360 / 15;
  const dc = T.dec0 + s.dy / 3600;
  const h = Math.floor(ra);
  const m = Math.floor((ra - h) * 60);
  const sec = ((ra - h) * 60 - m) * 60;
  const a = Math.abs(dc);
  const D = Math.floor(a);
  const dm = Math.floor((a - D) * 60);
  const ds = Math.floor(((a - D) * 60 - dm) * 60);

  return `SPX-SIM J${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}${sec.toFixed(1).padStart(4, '0')}${dc < 0 ? '-' : '+'}${String(D).padStart(2, '0')}${String(dm).padStart(2, '0')}${String(ds).padStart(2, '0')}`;
};

/* Simulated background field around each target: a mix of every object class */
function addField(T) {
  if (T.isLiveNasa) return;
  const r = mulberry(hashStr(T.id) + 11);
  const R = 450;
  const mix = [
    ['star', 0.5],
    ['red', 0.13],
    ['gal', 0.09],
    ['qso', 0.06],
    ['giant', 0.06],
    ['young', 0.05],
    ['bd', 0.06],
    ['mover', 0.05]
  ];

  const pick = () => {
    let u = r();
    let a = 0;
    for (const [k, w] of mix) {
      a += w;
      if (u < a) return k;
    }
    return 'star';
  };

  for (let i = 0; i < 260; i++) {
    const c = pick();
    const u = r();
    const s = {
      cls: c,
      dx: (r() * 2 - 1) * R,
      dy: (r() * 2 - 1) * R,
      bg: 1
    };

    if (c === 'star') {
      s.type = r() < 0.3 ? 'hot' : 'star';
      s.b = 0.03 + 0.45 * u * u * u;
      s.pm = [(r() - 0.5) * 0.08, (r() - 0.5) * 0.08];
      s.sp = s.type === 'hot' ? 'B/A-type star' : 'G/K-type star';
      s.dist = Math.round(300 + r() * 4500);
    } else if (c === 'red') {
      s.type = 'red';
      s.b = 0.03 + 0.3 * u * u;
      s.pm = [(r() - 0.5) * 0.5, (r() - 0.5) * 0.5];
      s.sp = 'M-type red dwarf';
      s.dist = Math.round(40 + r() * 500);
    } else if (c === 'gal') {
      s.type = 'gal';
      s.b = 0.05 + 0.22 * u;
      s.pm = [0, 0];
      s.ext = 1.7 + r() * 1.2;
      s.sp = 'Galaxy';
      s.dist = null;
    } else if (c === 'qso') {
      s.type = 'qso';
      s.b = 0.05 + 0.17 * u;
      s.pm = [0, 0];
      s.sp = 'Quasar';
      s.dist = null;
    } else if (c === 'giant') {
      s.type = 'mira';
      s.b = 0.12 + 0.3 * u;
      s.pm = [(r() - 0.5) * 0.02, (r() - 0.5) * 0.02];
      s.sp = 'Pulsating giant';
      s.dist = Math.round(800 + r() * 5000);
      const ph = r() * TAU;
      const per = 0.4 + r() * 0.5;
      s.vr = EY.map((y) => 0.15 + 0.85 * (0.5 + 0.5 * Math.cos(TAU * (y / per) + ph)));
    } else if (c === 'young') {
      s.type = 'yso';
      s.b = 0.08 + 0.3 * u;
      s.pm = [(r() - 0.5) * 0.03, (r() - 0.5) * 0.03];
      s.sp = 'Young star with disk';
      s.dist = Math.round(400 + r() * 1200);
      s.vr = EY.map(() => 0.6 + 0.4 * r());
    } else if (c === 'bd') {
      s.type = r() < 0.6 ? 'tdwarf' : 'ydwarf';
      s.b = 0.1 + 0.25 * u;
      s.pm = [(r() - 0.5) * 2.4, (r() - 0.5) * 2.4];
      s.sp = s.type === 'tdwarf' ? 'T-type brown dwarf' : 'Y-type brown dwarf';
      s.dist = Math.round(15 + r() * 60);
    } else {
      s.type = 'ast';
      s.b = 0.1 + 0.3 * u;
      const a = r() * TAU;
      const sp = 25 + r() * 40;
      s.pm = [Math.cos(a) * sp, Math.sin(a) * sp];
      s.sp = 'Main-belt asteroid';
      s.dist = null;
      s.n = 'Moving object';
    }

    s.n = desig(T, s);
    s.cj = (r() - 0.5) * 0.3;
    T.srcs.push(s);
  }

  T.srcs.forEach((s) => {
    if (!s.id) s.id = desig(T, s);
  });
}

function makeCustom(ra, dec) {
  const id = 'custom-' + ra.toFixed(3) + '-' + dec.toFixed(3);
  const r = mulberry(hashStr(id));
  const ang = r() * TAU;
  const sp = 4 + r() * 5;

  const T = {
    id,
    name: 'Custom patch',
    ra0: ra,
    dec0: dec,
    fov: 4,
    custom: 1,
    tip: 'A simulated patch at your coordinates with one hidden mover. Zoom out and use <b>Spot change</b> to find it.',
    srcs: [
      {
        n: 'Hidden mover',
        cls: 'bd',
        type: r() < 0.5 ? 'tdwarf' : 'ydwarf',
        dx: (r() - 0.5) * 40,
        dy: (r() - 0.5) * 40,
        b: 0.6,
        pm: [Math.cos(ang) * sp, Math.sin(ang) * sp],
        main: 1,
        sp: 'Brown dwarf (simulated)',
        dist: null,
        note: 'A hidden fast-moving brown dwarf placed here for you to find.'
      }
    ]
  };

  addField(T);
  return T;
}

/* ---- Live NASA SPHEREx DR1 API Bridge ---- */
const nasaCache = new Map();

async function fetchLiveSpherexPatch(raDeg, decDeg, fovArcmin = 3) {
  const key = `${raDeg.toFixed(4)}|${decDeg.toFixed(4)}|${fovArcmin}`;
  if (nasaCache.has(key)) return nasaCache.get(key);

  const url = `${BACKEND_URL}/api/spherex?ra=${encodeURIComponent(raDeg)}&dec=${encodeURIComponent(decDeg)}&fov=${encodeURIComponent(fovArcmin)}&max_epochs=${NE}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    let errMsg = `HTTP ${resp.status}`;
    try {
      const errJson = await resp.json();
      if (errJson.error) errMsg = errJson.error;
    } catch (_) { }
    throw new Error(errMsg);
  }

  const payload = await resp.json();
  if (!payload.epochs || !payload.epochs.length) {
    throw new Error('No SPHEREx DR1 exposures returned');
  }

  const realEpochs = payload.epochs.map((ep) => {
    const arr = new Float32Array(N * N);
    if (Array.isArray(ep.pixels)) {
      const len = Math.min(arr.length, ep.pixels.length);
      for (let i = 0; i < len; i++) {
        arr[i] = ep.pixels[i];
      }
    }
    return {
      date: ep.date || '2025-06-01',
      mjd: ep.mjd_date || 0,
      wavelength_um: ep.wavelength_um || 2.0,
      band_index: ep.band_index ?? 0,
      lens_index: ep.lens_index ?? 0,
      obs_id: ep.obs_id || 'SPHEREx-DR1',
      pixels: arr
    };
  });

  const liveTarget = {
    id: `nasa-${raDeg.toFixed(3)}-${decDeg.toFixed(3)}`,
    name: `NASA DR1 (${raDeg.toFixed(2)}°, ${decDeg >= 0 ? '+' : ''}${decDeg.toFixed(2)}°)`,
    ra: fmtRA(raDeg),
    dec: fmtDec(decDeg),
    ra0: raDeg,
    dec0: decDeg,
    fov: fovArcmin,
    isLiveNasa: true,
    realEpochs,
    totalObservations: payload.total_observations || realEpochs.length,
    tip: `<b>Real NASA SPHEREx DR1 data</b> (${payload.total_observations} observations found on IRSA, showing ${realEpochs.length} reprojected epochs). Click any detected source or toggle <b>Spot change</b>.`,
    srcs: Array.isArray(payload.srcs) ? payload.srcs : []
  };

  nasaCache.set(key, liveTarget);
  return liveTarget;
}

TARGETS.forEach(addField);