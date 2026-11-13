*About the pictures. The sky is simulated from each target's catalog position and measured motion, with eight example dates between mid-2025 and late 2026. The named targets use real positions and motions. The surrounding objects and all spectra are typical shapes, not SPHEREx pixels. To use real cutouts, replace the data layer in js/data.js and the image functions in js/sky.js.*

To plug real NASA SPHEREx discoveries into your website, you need a three-part pipeline: a preprocessing script to convert NASA's scientific files into web-ready formats, a structured JSON feed for coordinates and descriptions, and targeted swaps in data.js and sky.js (as noted in your footer) so your existing overlays, spectrum charts, and lab controls work seamlessly with real observations.   

1. Convert NASA's Raw Data (Preprocessing Step)
NASA archives (such as IRSA) distribute infrared mission data as FITS image cubes/cutouts and astronomical catalog tables (FITS/CSV/VOTable), which web browsers cannot natively read or render. Before the website can display them, run an offline preprocessing script (for example, in Python using astropy and reproject) whenever new discoveries are released:

2. Replace the Simulated Catalog (js/data.js)
Currently, data.js defines 5 hardcoded TARGETS and runs addField(T) to procedurally generate 260 fake background objects around each one.
   -Remove addField(T) for real targets so only actual detected objects appear in the object list, colour map, and click targets.   

   -Store discoveries as clean JSON (either inside TARGETS or loaded dynamically via fetch('data/discoveries.json') once you have dozens of targets) using your existing field names plus a spec array of 102 real flux measurements:

   
JSON{
  "id": "spx-discovery-001",
  "name": "SPHEREx J1429+3312",
  "ra": "14h29m18.4s",
  "dec": "+33d12m09s",
  "fov": 3,
  "epochs": ["2025-07-12", "2025-09-28", "2026-01-19", "2026-04-04"],
  "tip": "Newly identified cold brown dwarf showing deep methane and water-ice absorption.",
  "cutoutBase": "assets/cutouts/spx-discovery-001/",
  "srcs": [
    {
      "id": "SPX J142918.4+331209",
      "n": "SPHEREx J1429+3312",
      "cls": "bd",
      "type": "ydwarf",
      "dx": 0,
      "dy": 0,
      "b": 0.92,
      "pm": [-1.42, 0.88],
      "main": 1,
      "sp": "Y0 brown dwarf (confirmed)",
      "dist": 18.4,
      "note": "NASA discovery description: Faint object undetected in optical surveys, isolated via its 4.5 µm thermal peak.",
      "spec": [0.004, 0.005, "... 102 measured flux values ..."]
    }
  ]
}

(Note: Setting bg: 0 or omitting bg automatically hides the "Simulated object" badge in your Object Details card.)   

3. Swap the Synthetic Renderer (js/sky.js)
In sky.js, three functions currently generate fake data: fluxAt(), drawSpec(), and render(). Everything else—overlays(), updateDetails(), updateList(), and drawMap()—already works off the coordinates and fluxes those functions return.   

-Use real spectra in fluxAt() and drawSpec(): Update fluxAt(s, e, lam) to check if s.spec exists before falling back to the synthetic SPEC[s.type] formula:   

JavaScriptfunction fluxAt(s, e, lam) {
  const v = s.vr ? s.vr[e] : 1;
  if (s.spec) {
    if (lam == null) {
      const avg = s.spec.reduce((sum, val) => sum + val, 0) / s.spec.length;
      return v * avg;
    }
    const idx = S.lens * 17 + S.band;
    return v * (s.spec[idx] ?? 0);
  }
  // Fallback for simulated targets
  const sp = SPEC[s.type];
  if (lam == null) {
    let a = 0;
    for (let i = 0; i < 6; i++) a += sp(specMid(i));
    return (s.b * v * a) / 6;
  }
  return s.b * v * sp(lam);
}

Similarly, in drawSpec(), plot s.spec[i] directly instead of SPEC[s.type](l) + gauss(r) * 0.012.  

 -Load real NASA photos in render() / paint(): Instead of filling Float32Array(N * N) with Gaussian noise and synthetic star blobs inside render(e, lam, ch), preload the matching cutout image (epoch_${e}_band_${bandIndex}.png) for the active target:   
 
 -To keep all lab modes working (Brightness boost, Colour mix, Spot change, Trails): Draw the loaded single-band NASA PNG onto an offscreen canvas, read its pixel brightness array into the Float32Array returned by render(), and let your existing paint() loop handle the false-color mixing, frame subtraction, and asinh brightness stretching untouched.   
 
 -For pre-colored NASA press photos: Draw the loaded HTMLImageElement directly onto ctx inside paint() (ctx.drawImage(cutoutImg, 0, 0, SZ, SZ)) and immediately call overlays()—your target rings, selection brackets, N/E compass, and hover RA/Dec readouts will line up automatically.   
 
 4. Organize Hosting for Many Discoveries
 If NASA releases hundreds of photos and objects over time:
 
 -Folder structure: Store a lightweight master index (data/index.json with just target names, IDs, and coordinates) and separate per-target files (data/targets/<id>.json + assets/cutouts/<id>/...) on a static CDN, GitHub Pages, or cloud storage bucket (like Supabase Storage or AWS S3).
 
 -Lazy loading: Only fetch a target's heavy cutout images and full source list when the user clicks its chip in Step 1, keeping initial page load instant regardless of how large the NASA archive grows. 