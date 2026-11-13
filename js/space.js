/* 3D solar system scene (Three.js) and Space tour camera/labels. Needs data.js first. */

const BODIES = [];
const space = {
  ready: false,
  focus: null,
  paused: false,
  speed: reduced ? 0.25 : 1,
  tour: false,
  goalDist: 185,
  focusBody: () => {}
};

function initSpace() {
  if (typeof THREE === 'undefined') return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: $('#space'), antialias: true });
  } catch (_) {
    return;
  }

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x050813, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 3000);
  const R = mulberry(2026);
  const hits = [];
  const tmp = new THREE.Vector3();

  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  addEventListener('resize', resize);
  resize();

  scene.add(new THREE.AmbientLight(0x4a5580, 0.7));
  const sunLight = new THREE.PointLight(0xfff1d6, 1.7, 0, 0);
  scene.add(sunLight);

  // textures
  function tex(base, fn) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = base;
    x.fillRect(0, 0, 256, 128);
    if (fn) fn(x, mulberry(9));
    return new THREE.CanvasTexture(c);
  }

  const blot = (cols, n, rm) => (x, r) => {
    for (let i = 0; i < n; i++) {
      x.fillStyle = cols[Math.floor(r() * cols.length)];
      x.globalAlpha = 0.35 + 0.4 * r();
      x.beginPath();
      x.arc(r() * 256, r() * 128, 3 + r() * rm, 0, TAU);
      x.fill();
    }
    x.globalAlpha = 1;
  };

  const bnd = (cols) => (x, r) => {
    for (let y = 0; y < 128; y += 4 + r() * 6) {
      x.fillStyle = cols[Math.floor(r() * cols.length)];
      x.globalAlpha = 0.55;
      x.fillRect(0, y, 256, 3 + r() * 5);
    }
    x.globalAlpha = 1;
  };

  function glowTex() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  const glow = glowTex();
  const hitMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false
  });

  function reg(name, obj, o) {
    const b = Object.assign({ name, obj }, o);
    if (o.hitR) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(o.hitR, 8, 8), hitMat);
      h.userData.body = b;
      obj.add(h);
      hits.push(h);
    }
    BODIES.push(b);
    return b;
  }

  // stars
  let stars;
  {
    const n = 2600;
    const p = new Float32Array(n * 3);
    const c = new Float32Array(n * 3);
    const rr = mulberry(3);

    for (let i = 0; i < n; i++) {
      const u = rr() * 2 - 1;
      const t = rr() * TAU;
      const s = Math.sqrt(1 - u * u);
      const d = 1100;

      p[i * 3] = d * s * Math.cos(t);
      p[i * 3 + 1] = d * u;
      p[i * 3 + 2] = d * s * Math.sin(t);

      const w = 0.55 + 0.45 * rr();
      const warm = rr();
      c[i * 3] = w * (0.8 + 0.2 * warm);
      c[i * 3 + 1] = w * 0.9;
      c[i * 3 + 2] = w * (1 - 0.25 * warm);
    }

    const gm = new THREE.BufferGeometry();
    gm.setAttribute('position', new THREE.BufferAttribute(p, 3));
    gm.setAttribute('color', new THREE.BufferAttribute(c, 3));

    stars = new THREE.Points(
      gm,
      new THREE.PointsMaterial({
        size: 1.7,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      })
    );
    scene.add(stars);
  }

  // sun
  const sunG = new THREE.Group();
  scene.add(sunG);
  sunG.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(6, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc266 })
    )
  );

  {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        color: 0xff9a3d,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false
      })
    );
    s.scale.set(40, 40, 1);
    sunG.add(s);
  }

  reg('Sun', sunG, {
    info: 'A star about 109 times wider than Earth. Everything on this page orbits it, and its light is what the planets and asteroids reflect.',
    fact: 'Surface about 5,500 °C',
    dist: 34,
    hitR: 7
  });

  const ringMat = new THREE.LineBasicMaterial({
    color: 0x31457d,
    transparent: true,
    opacity: 0.6
  });

  function orbitRing(a, parent, rot) {
    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const t = (i / 160) * TAU;
      pts.push(new THREE.Vector3(Math.cos(t) * a, 0, Math.sin(t) * a));
    }
    const l = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      ringMat
    );
    (parent || scene).add(l);
    return l;
  }

  // planets
  const PL = [
    [
      'Mercury',
      14,
      0.9,
      '#9b9187',
      blot(['#6f675f', '#b5aca1'], 40, 6),
      'The smallest planet and the closest to the Sun. One year lasts only 88 days.',
      'Year: 88 days'
    ],
    [
      'Venus',
      20,
      1.6,
      '#d9b46f',
      bnd(['#e6c88c', '#c99a55', '#efd9a8']),
      'Wrapped in thick clouds and hotter than Mercury. It spins backwards compared with most planets.',
      'Surface about 465 °C'
    ],
    [
      'Earth',
      28,
      1.7,
      '#2c6fb5',
      blot(['#3f9a5a', '#e8eef5', '#2f7a48'], 45, 10),
      'Home. SPHEREx orbits above it, looking out at the sky instead of down at us.',
      'Year: 365 days'
    ],
    [
      'Mars',
      36,
      1.2,
      '#b4553a',
      blot(['#8a3d29', '#d98b5f'], 40, 8),
      'A cold red desert with the tallest volcano known in the solar system.',
      'Year: 687 days'
    ],
    [
      'Jupiter',
      72,
      4.6,
      '#d7b48a',
      bnd(['#c99a6b', '#e8d3b0', '#a8754d', '#f0e2c8']),
      'The biggest planet. Its gravity keeps the asteroid belt from clumping into a planet.',
      'Year: 12 Earth years'
    ],
    [
      'Saturn',
      94,
      3.9,
      '#e3cf9c',
      bnd(['#e8d6a8', '#cdb67e', '#f1e4c0']),
      'Famous for rings made of ice and rock. It is light enough to float in a big enough bathtub.',
      'Year: 29 Earth years'
    ],
    [
      'Uranus',
      112,
      2.5,
      '#8fd3d9',
      null,
      'An ice giant that rolls around the Sun tipped on its side.',
      'Year: 84 Earth years'
    ],
    [
      'Neptune',
      128,
      2.4,
      '#4d6fe0',
      null,
      'The farthest planet. A single year lasts about 165 Earth years.',
      'Year: 165 Earth years'
    ]
  ];

  const planets = [];
  let earthG;
  let earthMesh;

  PL.forEach(([name, a, r, col, fn, info, fact]) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, 40, 28),
      new THREE.MeshStandardMaterial({
        color: fn ? 0xffffff : col,
        map: fn ? tex(col, fn) : null,
        roughness: 0.9,
        metalness: 0
      })
    );

    g.add(m);
    scene.add(g);
    orbitRing(a);

    if (name === 'Saturn') {
      const rg = new THREE.Mesh(
        new THREE.RingGeometry(5.2, 8.6, 72),
        new THREE.MeshBasicMaterial({
          color: 0xcdb98a,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.7
        })
      );
      rg.rotation.x = -Math.PI / 2 + 0.45;
      g.add(rg);
    }

    const p = { g, m, a, a0: R() * TAU, w: 0.105 * Math.pow(28 / a, 1.5) };
    planets.push(p);

    const b = reg(name, g, {
      info,
      fact,
      dist: Math.max(r * 5 + 5, 12),
      hitR: name === 'Earth' ? 2.2 : Math.max(r * 1.8, 2.4)
    });

    if (name === 'Earth') {
      earthG = g;
      earthMesh = m;
      b.dist = 15;
    }
  });

  // moon + satellites around Earth
  const gold = new THREE.MeshStandardMaterial({
    color: 0xd8a847,
    metalness: 0.6,
    roughness: 0.4
  });
  const panelM = new THREE.MeshStandardMaterial({
    color: 0x1c3b8f,
    metalness: 0.3,
    roughness: 0.5,
    emissive: 0x0a1a44
  });
  const white = new THREE.MeshStandardMaterial({
    color: 0xdfe5ee,
    roughness: 0.6
  });

  function orbiter(tx, tz, rad) {
    const t = new THREE.Group();
    t.rotation.set(tx, 0, tz);
    earthG.add(t);

    const s = new THREE.Group();
    t.add(s);

    const o = new THREE.Group();
    o.position.x = rad;
    s.add(o);

    return { s, o };
  }

  const moon = orbiter(0.2, 0, 3.6);
  moon.o.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xb9b9bd, roughness: 1 })
    )
  );
  reg('Moon', moon.o, {
    info: 'Earth’s only natural satellite, about a quarter of Earth’s width. It circles us every 27 days.',
    fact: 'Orbit: 27.3 days',
    dist: 5,
    hitR: 1.1,
    vis: 45
  });

  const spx = orbiter(1.45, 0.2, 3.0);
  const sm = spx.o;
  sm.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.7), gold));

  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(
      new THREE.ConeGeometry(0.5 + i * 0.14, 0.45, 14, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xcfd6e4,
        side: THREE.DoubleSide,
        roughness: 0.5
      })
    );
    c.position.y = 0.4 + i * 0.18;
    sm.add(c);
  }

  {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.5), panelM);
    p.position.y = -0.3;
    sm.add(p);
  }

  reg('SPHEREx', sm, {
    info: 'NASA’s infrared telescope, launched in March 2025. It circles Earth in under two hours and maps the whole sky every six months in 102 colours. Drawn much larger than real size.',
    fact: 'Sees 0.75–5 µm light',
    dist: 5,
    hitR: 0.9,
    vis: 45
  });

  const iss = orbiter(0.9, 0.3, 2.6);
  const im = iss.o;
  im.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.07), white));

  [-0.45, 0.45].forEach((x) =>
    [-0.2, 0.2].forEach((z) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.3), panelM);
      p.position.set(x, 0, z + (z > 0 ? 0.12 : -0.12));
      im.add(p);
    })
  );

  reg('Space station', im, {
    info: 'The International Space Station is a crewed lab that circles Earth about every 90 minutes. Its bright streaks sometimes cross telescope pictures.',
    fact: 'Orbit: about 90 min',
    dist: 5,
    hitR: 0.9,
    vis: 45
  });

  const swT = new THREE.Group();
  swT.rotation.set(0.93, 0, 0.2);
  earthG.add(swT);
  const swS = new THREE.Group();
  swT.add(swS);

  {
    const n = 18;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      p[i * 3] = Math.cos(t) * 3.9;
      p[i * 3 + 2] = Math.sin(t) * 3.9;
    }

    const gm = new THREE.BufferGeometry();
    gm.setAttribute('position', new THREE.BufferAttribute(p, 3));
    swS.add(
      new THREE.Points(
        gm,
        new THREE.PointsMaterial({
          color: 0x9fd8ff,
          size: 0.32,
          map: glow,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      )
    );
  }

  const swo = new THREE.Group();
  swo.position.x = 3.9;
  swS.add(swo);
  reg('Satellite swarm', swo, {
    info: 'Constellations are many small satellites flying in a ring. They can leave streaks across telescope images, so astronomers learn to tell streaks from real discoveries.',
    fact: 'Hundreds to thousands per fleet',
    dist: 9,
    vis: 45
  });

  // asteroid belt
  const belt = new THREE.Group();
  scene.add(belt);
  {
    const n = 800;
    const im2 = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.34, 0),
      new THREE.MeshStandardMaterial({
        color: 0x9a948b,
        roughness: 1,
        flatShading: true
      }),
      n
    );
    const d = new THREE.Object3D();
    const r2 = mulberry(41);

    for (let i = 0; i < n; i++) {
      const a = r2() * TAU;
      const rad = 44 + r2() * 13;
      d.position.set(Math.cos(a) * rad, (r2() - 0.5) * 3, Math.sin(a) * rad);
      const s = 0.4 + r2() * 1.2;
      d.scale.set(s, s * (0.6 + r2() * 0.6), s);
      d.rotation.set(r2() * 6, r2() * 6, r2() * 6);
      d.updateMatrix();
      im2.setMatrixAt(i, d.matrix);
    }
    belt.add(im2);
  }

  const bAnchor = new THREE.Object3D();
  bAnchor.position.set(50, 0, 0);
  belt.add(bAnchor);
  reg('Asteroid belt', bAnchor, {
    info: 'Millions of rocky leftovers between Mars and Jupiter. In SPHEREx pictures, an asteroid shows up as a dot that shifts between visits.',
    fact: 'Between 2.2 and 3.2 AU',
    dist: 44
  });

  const ceres = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xa89f94, roughness: 1 })
  );
  scene.add(ceres);
  reg('Ceres', ceres, {
    info: 'The largest object in the asteroid belt, a dwarf planet about 940 km wide.',
    fact: 'Year: 4.6 Earth years',
    dist: 7,
    hitR: 2
  });

  // comet
  const cp = new THREE.Group();
  cp.rotation.set(0.35, 0.8, 0);
  scene.add(cp);

  const ca = 62;
  const ce = 0.86;
  const cb = ca * Math.sqrt(1 - ce * ce);
  {
    const pts = [];
    for (let i = 0; i <= 200; i++) {
      const E = (i / 200) * TAU;
      pts.push(new THREE.Vector3(ca * (Math.cos(E) - ce), 0, cb * Math.sin(E)));
    }
    cp.add(
      new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: 0x2f6f8f,
          transparent: true,
          opacity: 0.45
        })
      )
    );
  }

  const cometHead = new THREE.Group();
  cp.add(cometHead);
  cometHead.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xe8f6ff })
    )
  );

  {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        color: 0x9fe0ff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false
      })
    );
    s.scale.set(7, 7, 1);
    cometHead.add(s);
  }

  const TN = 70;
  const tp = new Float32Array(TN * 3);
  const tc = new Float32Array(TN * 3);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));

  cp.add(
    new THREE.Points(
      tg,
      new THREE.PointsMaterial({
        size: 2.4,
        map: glow,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    )
  );

  reg('Comet', cometHead, {
    info: 'An icy wanderer. Sunlight turns its ice to gas and dust, and that tail always points away from the Sun. Most known comets were found by people spotting a moving dot.',
    fact: 'Tail grows near the Sun',
    dist: 24,
    hitR: 3.2
  });

  const cw = 0.105 * Math.pow(28 / ca, 1.5);

  // camera control
  const cam = { th: 0.6, ph: 1.05, dist: 185, gd: 185, tgt: new THREE.Vector3() };
  space.goalDist = 185;
  let focus = null;
  const TOURD = 150;

  function focusBody(b) {
    focus = b;
    space.focus = b;

    $$('#tchips .chip').forEach((c) =>
      c.setAttribute('aria-pressed', String(!!b && c.dataset.n === b.name))
    );
    $$('.lab').forEach((l) =>
      l.classList.toggle('on', !!b && l.dataset.n === b.name)
    );

    cam.gd = b ? b.dist : space.tour ? TOURD : 185;

    const nm = b ? b.name : 'The solar system';
    const tx = b
      ? b.info
      : 'Drag to look around, scroll or pinch to zoom, and tap any label to fly there.';
    const ft = b ? b.fact : 'Sizes and distances are not to scale';

    $('#infoname').textContent = nm;
    $('#infotext').textContent = tx;
    $('#infofact').textContent = ft;

    if (window.gsap && !reduced) {
      gsap.fromTo(
        '#infoname,#infotext',
        { y: 8, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.45, stagger: 0.05, ease: 'power2.out' }
      );
    }
  }
  space.focusBody = focusBody;

  // chips + labels
  const tc2 = $('#tchips');
  const lw = $('#labels');

  BODIES.forEach((b) => {
    const c = document.createElement('button');
    c.className = 'chip';
    c.textContent = b.name;
    c.dataset.n = b.name;
    c.setAttribute('aria-pressed', 'false');
    c.onclick = () => focusBody(b);
    tc2.appendChild(c);

    const l = document.createElement('button');
    l.className = 'lab';
    l.textContent = b.name;
    l.dataset.n = b.name;
    l.onclick = () => focusBody(b);
    lw.appendChild(l);
    b.lab = l;
  });

  $('#treset').onclick = () => focusBody(null);
  $('#tpause').onclick = (e) => {
    space.paused = !space.paused;
    e.currentTarget.setAttribute('aria-pressed', String(space.paused));
    e.currentTarget.textContent = space.paused ? 'Resume' : 'Pause';
  };
  $('#tspeed').oninput = (e) => {
    space.speed = +e.target.value;
  };

  // pointer input
  const cvs = $('#space');
  const ptrs = new Map();
  let pinch = 0;
  let down = null;

  cvs.addEventListener('pointerdown', (e) => {
    cvs.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    down = { x: e.clientX, y: e.clientY, t: performance.now() };

    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
  });

  cvs.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const p = ptrs.get(e.pointerId);

    if (ptrs.size === 2) {
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) {
        cam.gd = Math.min(320, Math.max(4, (cam.gd * pinch) / d));
      }
      pinch = d;
      return;
    }

    cam.th -= (e.clientX - p[0]) * 0.005;
    cam.ph = Math.min(3.0, Math.max(0.14, cam.ph - (e.clientY - p[1]) * 0.005));
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  });

  const up = (e) => {
    ptrs.delete(e.pointerId);
    pinch = 0;

    if (
      down &&
      e.type === 'pointerup' &&
      Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 &&
      performance.now() - down.t < 450 &&
      space.tour
    ) {
      const rc = new THREE.Raycaster();
      const nd = new THREE.Vector2(
        (e.clientX / innerWidth) * 2 - 1,
        -(e.clientY / innerHeight) * 2 + 1
      );
      rc.setFromCamera(nd, camera);

      const h = rc.intersectObjects(hits, false)[0];
      if (h) focusBody(h.object.userData.body);
    }
    down = null;
  };

  cvs.addEventListener('pointerup', up);
  cvs.addEventListener('pointercancel', up);

  cvs.addEventListener(
    'wheel',
    (e) => {
      if (!space.tour) return;
      e.preventDefault();
      cam.gd = Math.min(320, Math.max(4, cam.gd * Math.exp(e.deltaY * 0.0011)));
    },
    { passive: false }
  );

  space.setTour = (t) => {
    space.tour = t;
    if (!t) {
      focusBody(null);
      cam.gd = 185;
    } else {
      cam.gd = TOURD;
    }
  };

  // loop
  let T = 0;
  let prev = performance.now();
  let rot = 0;

  function frame(now) {
    const raw = Math.min(0.05, (now - prev) / 1000);
    prev = now;

    const dt = space.paused ? 0 : raw * space.speed;
    T += dt;

    planets.forEach((p) => {
      const a = p.a0 + p.w * T;
      p.g.position.set(Math.cos(a) * p.a, 0, Math.sin(a) * p.a);
      p.m.rotation.y += dt * 0.6;
    });

    moon.s.rotation.y += dt * 0.9;
    spx.s.rotation.y += dt * 1.7;
    iss.s.rotation.y += dt * 2.1;
    swS.rotation.y += dt * 0.5;
    belt.rotation.y += dt * 0.035;

    {
      const a = T * 0.075 + 1.2;
      ceres.position.set(Math.cos(a) * 50, 0.3, Math.sin(a) * 50);
      ceres.rotation.y += dt * 0.4;
    }

    // comet via Kepler
    {
      const M = T * cw + 0.4;
      let E = M;
      for (let i = 0; i < 5; i++) {
        E = E - (E - ce * Math.sin(E) - M) / (1 - ce * Math.cos(E));
      }

      const x = ca * (Math.cos(E) - ce);
      const z = cb * Math.sin(E);
      cometHead.position.set(x, 0, z);

      const dist = Math.hypot(x, z);
      const len = Math.min(46, Math.max(5, 520 / dist));
      const ux = x / dist;
      const uz = z / dist;

      for (let i = 0; i < TN; i++) {
        const f = i / (TN - 1);
        const s = f * len;
        tp[i * 3] = x + ux * s;
        tp[i * 3 + 1] = Math.sin(f * 3) * 0.5;
        tp[i * 3 + 2] = z + uz * s;

        const k = Math.pow(1 - f, 1.6);
        tc[i * 3] = 0.55 * k;
        tc[i * 3 + 1] = 0.85 * k;
        tc[i * 3 + 2] = k;
      }

      tg.attributes.position.needsUpdate = true;
      tg.attributes.color.needsUpdate = true;
    }

    stars.rotation.y += raw * 0.004;

    // camera
    const k1 = 1 - Math.exp(-3 * raw);
    const k2 = 1 - Math.exp(-4 * raw);

    if (!space.tour || (!focus && !ptrs.size)) {
      cam.th += raw * (space.tour ? 0.05 : 0.04);
    }

    cam.dist += (cam.gd - cam.dist) * k1;

    if (focus) {
      focus.obj.getWorldPosition(tmp);
      cam.tgt.lerp(tmp, k2);
    } else {
      cam.tgt.lerp(tmp.set(0, 0, 0), k2);
    }

    const sp = Math.sin(cam.ph);
    camera.position.set(
      cam.tgt.x + cam.dist * sp * Math.cos(cam.th),
      cam.tgt.y + cam.dist * Math.cos(cam.ph),
      cam.tgt.z + cam.dist * sp * Math.sin(cam.th)
    );
    camera.lookAt(cam.tgt);
    scene.updateMatrixWorld();

    if (space.tour) {
      const w = innerWidth;
      const h = innerHeight;

      for (const b of BODIES) {
        b.obj.getWorldPosition(tmp);
        let show = true;

        if (b.vis && camera.position.distanceTo(tmp) > b.vis) {
          show = false;
        }

        const v = tmp.clone().project(camera);
        if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) {
          show = false;
        }

        b.lab.style.display = show ? '' : 'none';
        if (show) {
          b.lab.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px,${(-v.y * 0.5 + 0.5) * h}px) translate(-50%,-140%)`;
        }
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  space.ready = true;
}

