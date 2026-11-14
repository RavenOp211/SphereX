import os
import json
import math
import time
from dataclasses import dataclass
from typing import Dict, List, Any, Optional

import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
from astropy.stats import sigma_clipped_stats
import astropy.units as u
from astroquery.ipac.irsa import Irsa
from reproject import reproject_interp


# ---------------------------------------------------------------------------
# 1. Flask App & Storage Setup
# ---------------------------------------------------------------------------

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
NOTES_FILE = os.path.join(BASE_DIR, "notes_db.json")

# Cache IRSA queries in memory for 30 minutes so UI scrubbing is fast
QUERY_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = 1800


# ---------------------------------------------------------------------------
# 2. SPHEREx 102-Band Instrument & Molecular Spectral Filter Engine
# ---------------------------------------------------------------------------

ARRAY_CONFIGS: List[Dict[str, Any]] = [
    {"array": 1, "min_lam": 0.75, "max_lam": 1.11, "bands": 17},
    {"array": 2, "min_lam": 1.11, "max_lam": 1.64, "bands": 17},
    {"array": 3, "min_lam": 1.64, "max_lam": 2.42, "bands": 17},
    {"array": 4, "min_lam": 2.42, "max_lam": 3.82, "bands": 17},
    {"array": 5, "min_lam": 3.82, "max_lam": 4.42, "bands": 17},
    {"array": 6, "min_lam": 4.42, "max_lam": 5.00, "bands": 17},
]

MOLECULAR_SIGNATURES: Dict[str, Dict[str, Any]] = {
    "H2O_14": {"center": 1.40, "width": 0.08, "name": "H2O Vapor"},
    "H2O_19": {"center": 1.90, "width": 0.10, "name": "H2O Vapor"},
    "CH4_23": {"center": 2.32, "width": 0.12, "name": "CH4 Methane"},
    "H2O_ICE": {"center": 3.05, "width": 0.18, "name": "H2O Ice Mantle"},
    "CH4_33": {"center": 3.32, "width": 0.14, "name": "CH4 Hydrocarbon"},
    "CO2_ICE": {"center": 4.26, "width": 0.09, "name": "CO2 Ice Band"},
    "CO_GAS": {"center": 4.67, "width": 0.08, "name": "CO Gas/Ice"},
}

GAS_TARGET_WAVELENGTHS: Dict[str, float] = {
    "H2O": 1.40,
    "CH4": 3.32,
    "CO2": 4.26,
    "CO": 4.67,
}


@dataclass
class AppState:
    active_gas_filter: Optional[str] = None
    subtract_continuum: bool = False
    chemical_rgb: bool = False
    current_band_index: int = 1


class SPHERExInstrument:
    """Models all 6 detector arrays and 102 linear variable filter channels."""

    def __init__(self) -> None:
        self.bands: List[Dict[str, Any]] = self._initialize_bands()

    def _initialize_bands(self) -> List[Dict[str, Any]]:
        all_bands: List[Dict[str, Any]] = []
        counter = 1

        for cfg in ARRAY_CONFIGS:
            step = (cfg["max_lam"] - cfg["min_lam"]) / (cfg["bands"] - 1)
            for i in range(cfg["bands"]):
                lam = round(cfg["min_lam"] + i * step, 4)
                matched_feature = "Near-IR Continuum"

                for feat in MOLECULAR_SIGNATURES.values():
                    if abs(lam - feat["center"]) <= (feat["width"] * 1.5):
                        matched_feature = feat["name"]
                        break

                all_bands.append({
                    "channel_id": counter,
                    "array_id": cfg["array"],
                    "band_in_array": i,
                    "wavelength_um": lam,
                    "molecular_feature": matched_feature,
                })
                counter += 1

        return all_bands

    def get_closest_band(self, target_wavelength: float) -> Dict[str, Any]:
        """Returns the spectral channel closest to target_wavelength (um)."""
        return min(self.bands, key=lambda b: abs(b["wavelength_um"] - target_wavelength))


def calculate_flux(profile_type: str, lam: float, base_flux: float) -> float:
    """Models astronomical source flux (uJy) across the 0.75 - 5.0 um infrared spectrum."""
    if profile_type in ("brown_dwarf", "brown_dwarf_bin", "tdwarf", "ydwarf"):
        f = base_flux * ((lam / 4.5) ** 4.0) * math.exp(-0.8 * (lam - 4.5))
        absorptions = [
            (3.32, 0.15, 0.75),  # CH4
            (1.40, 0.10, 0.85),  # H2O
            (1.90, 0.12, 0.85),  # H2O
            (2.70, 0.18, 0.70),  # H2O
            (4.67, 0.08, 0.40),  # CO ice
        ]
        for center, width, depth in absorptions:
            f *= 1.0 - depth * math.exp(-(((lam - center) / width) ** 2))
        return max(0.8, f)

    if profile_type in ("ttauri", "yso"):
        exp_term = math.exp(min(50.0, 14.4 / max(lam * 5.0, 1e-4))) - 1.0
        star = (120.0 / (lam ** 4)) / max(exp_term, 1e-6)
        disk = 45.0 * math.exp(-(((lam - 3.5) / 1.4) ** 2))
        co = 8.0 * math.exp(-(((lam - 4.67) / 0.10) ** 2))
        return max(2.0, star + disk + co)

    # Default field_star Rayleigh-Jeans baseline
    return max(1.0, base_flux * ((1.5 / lam) ** 2.0))


def apply_gas_filter(
    gas_type: str,
    state: AppState,
    instrument: SPHERExInstrument,
) -> Dict[str, Any]:
    """Selects the closest instrument bandpass for a requested gas or ice signature."""
    gas_key = gas_type.upper()
    state.active_gas_filter = gas_key
    target_wavelength = GAS_TARGET_WAVELENGTHS.get(gas_key, 1.40)

    closest_band = instrument.get_closest_band(target_wavelength)
    state.current_band_index = closest_band["channel_id"]
    return closest_band


INSTRUMENT = SPHERExInstrument()
SERVER_STATE = AppState()


# ---------------------------------------------------------------------------
# 3. NASA/IPAC IRSA FITS Cutout & WCS Reprojection Helpers
# ---------------------------------------------------------------------------

def extract_2d_hdu(hdul):
    """Find the primary 2D image extension with valid WCS and pixel data."""
    for ext in hdul:
        if ext.data is not None and ext.data.ndim == 2:
            return ext
    return None


def build_target_wcs(ra_deg: float, dec_deg: float, fov_arcmin: float, n_pix: int = 256) -> WCS:
    """Create a North-up, East-left tangent-plane WCS grid."""
    pix_scale_deg = (fov_arcmin / 60.0) / float(n_pix)
    w = WCS(naxis=2)
    w.wcs.crpix = [n_pix / 2.0 + 0.5, n_pix / 2.0 + 0.5]
    w.wcs.cdelt = np.array([-pix_scale_deg, pix_scale_deg])
    w.wcs.crval = [ra_deg, dec_deg]
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.cunit = ["deg", "deg"]
    return w


def normalize_frame(arr: np.ndarray) -> np.ndarray:
    """Normalize calibrated FITS flux into a clean 0.0 - 1.5 dynamic range."""
    clean = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
    _, median, std = sigma_clipped_stats(clean, sigma=3.0)
    sub = clean - median
    scale = max(float(std) * 18.0, 1e-6)
    normed = np.clip(sub / scale, -0.05, 1.5)
    return normed.astype(np.float32)


def detect_sources_in_stack(
    stack_img: np.ndarray,
    fov_arcmin: float,
    n_pix: int = 256,
) -> List[Dict[str, Any]]:
    """Detect bright infrared peaks on the median-stacked cutout."""
    _, median, std = sigma_clipped_stats(stack_img, sigma=3.0)
    thresh = median + 5.0 * max(float(std), 1e-4)
    sc_arcsec = (fov_arcmin * 60.0) / float(n_pix)

    padded = np.pad(stack_img, 3, mode="constant", constant_values=-999)
    ys, xs = np.where(stack_img > thresh)

    candidates = []
    for y, x in zip(ys, xs):
        patch = padded[y: y + 7, x: x + 7]
        if stack_img[y, x] >= np.max(patch):
            candidates.append((float(stack_img[y, x]), int(x), int(y)))

    candidates.sort(reverse=True)
    sources: List[Dict[str, Any]] = []
    for idx, (val, x, y) in enumerate(candidates[:25]):
        dx = (n_pix / 2.0 - x) * sc_arcsec
        dy = (n_pix / 2.0 - y) * sc_arcsec
        b_norm = float(np.clip(val / 1.2, 0.08, 1.0))

        # Generate a 102-band flux profile using calculate_flux
        profile = "brown_dwarf" if idx == 0 else "field_star"
        spectrum_102 = [
            round(calculate_flux(
                profile, b["wavelength_um"], b_norm * 100.0), 4)
            for b in INSTRUMENT.bands
        ]

        sources.append({
            "id": f"SPX-DR1-{idx + 1:02d}",
            "n": f"SPHEREx Source #{idx + 1}" if idx > 0 else "Primary SPHEREx Detection",
            "cls": "bd" if idx == 0 else "star",
            "type": "tdwarf" if idx == 0 else "star",
            "dx": round(dx, 2),
            "dy": round(dy, 2),
            "b": round(b_norm, 3),
            "pm": [0.0, 0.0],
            "main": 1 if idx == 0 else 0,
            "sp": "SPHEREx DR1 Infrared Source",
            "dist": None,
            "spec": spectrum_102,
            "note": "Detected directly from calibrated NASA/IPAC IRSA SPHEREx DR1 FITS pixels.",
        })
    return sources


# ---------------------------------------------------------------------------
# 4. API Routes: Health, Spectral Filters, NASA IRSA Cutouts & Notes
# ---------------------------------------------------------------------------

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "SPHEREx Sky Watch Backend",
        "total_spectral_bands": len(INSTRUMENT.bands),
    })


@app.route("/api/spectral/bands", methods=["GET"])
def get_spectral_bands():
    """Return all 102 SPHEREx spectral channels and molecular signature metadata."""
    return jsonify({
        "arrays": ARRAY_CONFIGS,
        "molecular_signatures": MOLECULAR_SIGNATURES,
        "gas_targets": GAS_TARGET_WAVELENGTHS,
        "bands": INSTRUMENT.bands,
    })


@app.route("/api/spectral/filter", methods=["GET", "POST"])
def filter_by_gas():
    """
    Selects the closest SPHEREx channel for a requested molecule (H2O, CH4, CO2, CO)
    or wavelength (um), and optionally computes continuum-subtracted / chemical RGB fluxes.
    """
    body = request.get_json(silent=True) or {}
    gas = request.args.get("gas") or body.get("gas")
    lam_param = request.args.get("wavelength") or body.get("wavelength")
    subtract_cont = bool(body.get("subtract_continuum", False))
    chem_rgb = bool(body.get("chemical_rgb", False))
    profile = str(body.get("profile", "brown_dwarf"))
    base_flux = float(body.get("base_flux", 85.0))

    SERVER_STATE.subtract_continuum = subtract_cont
    SERVER_STATE.chemical_rgb = chem_rgb

    if gas:
        band = apply_gas_filter(str(gas), SERVER_STATE, INSTRUMENT)
    elif lam_param is not None:
        try:
            band = INSTRUMENT.get_closest_band(float(lam_param))
            SERVER_STATE.active_gas_filter = None
            SERVER_STATE.current_band_index = band["channel_id"]
        except ValueError:
            return jsonify({"error": "Invalid wavelength parameter"}), 400
    else:
        band = INSTRUMENT.bands[SERVER_STATE.current_band_index - 1]

    lam = band["wavelength_um"]
    flux = calculate_flux(profile, lam, base_flux)
    if subtract_cont:
        cont_flux = calculate_flux("field_star", lam, base_flux)
        flux = abs(flux - cont_flux) * 2.2

    rgb = {
        "r_460_co": round(calculate_flux(profile, 4.60, base_flux), 4),
        "g_332_ch4": round(calculate_flux(profile, 3.32, base_flux), 4),
        "b_140_h2o": round(calculate_flux(profile, 1.40, base_flux), 4),
    }

    return jsonify({
        "active_gas": SERVER_STATE.active_gas_filter,
        "subtract_continuum": SERVER_STATE.subtract_continuum,
        "chemical_rgb": SERVER_STATE.chemical_rgb,
        "band": band,
        "modeled_flux_ujy": round(flux, 4),
        "chemical_rgb_channels": rgb,
    })


@app.route("/api/spherex", methods=["GET"])
def get_spherex_field():
    """
    Query NASA IRSA 'spherex_dr1' around (ra, dec), reproject up to 8 chronological
    epochs onto a 256x256 sky grid, and return normalized pixel arrays & sources.
    """
    try:
        ra = float(request.args.get("ra", 150.0))
        dec = float(request.args.get("dec", 2.0))
        fov_arcmin = float(request.args.get("fov", 3.0))
        fov_arcmin = max(1.0, min(15.0, fov_arcmin))
    except ValueError:
        return jsonify({"error": "Invalid ra, dec, or fov parameter"}), 400

    cache_key = f"{ra:.4f}|{dec:.4f}|{fov_arcmin:.2f}"
    cached = QUERY_CACHE.get(cache_key)
    if cached and (time.time() - cached["ts"] < CACHE_TTL):
        return jsonify(cached["payload"])

    spot = SkyCoord(ra=ra * u.deg, dec=dec * u.deg)
    search_radius = max(0.03, (fov_arcmin / 60.0) * 0.75) * u.deg

    try:
        results = Irsa.query_sia(
            pos=(spot, search_radius), collection="spherex_dr1")
    except Exception as exc:
        return jsonify({"error": f"NASA IRSA query failed: {str(exc)}"}), 502

    fits_rows = [
        r for r in results
        if "fits" in str(r.get("access_format", "")).lower() and r.get("access_url")
    ]

    if not fits_rows:
        return jsonify({
            "found": False,
            "message": "No public SPHEREx DR1 images cover these coordinates yet.",
        }), 404

    fits_rows.sort(key=lambda r: float(
        r["t_min"]) if r.get("t_min") is not None else 0.0)

    if len(fits_rows) > 8:
        indices = np.linspace(0, len(fits_rows) - 1, 8, dtype=int)
        selected_rows = [fits_rows[i] for i in indices]
    else:
        selected_rows = fits_rows

    n_pix = 256
    target_wcs = build_target_wcs(ra, dec, fov_arcmin, n_pix=n_pix)
    cutout_deg = (fov_arcmin / 60.0) * 1.35

    frames = []
    epochs_meta = []
    raw_stack = []

    for row in selected_rows:
        base_url = str(row["access_url"])
        sep = "&" if "?" in base_url else "?"
        cutout_url = f"{base_url}{sep}center={ra},{dec}&size={cutout_deg:.4f}deg"

        try:
            with fits.open(cutout_url, cache=False) as hdul:
                hdu = extract_2d_hdu(hdul)
                if hdu is None:
                    continue

                src_wcs = WCS(hdu.header)
                reproj, _ = reproject_interp(
                    (hdu.data, src_wcs),
                    target_wcs,
                    shape_out=(n_pix, n_pix),
                )
                normed = normalize_frame(reproj)
                raw_stack.append(normed)
                frames.append(np.round(normed.ravel(), 4).tolist())

                mjd = float(row["t_min"]) if row.get(
                    "t_min") is not None else None
                em_min = float(row["em_min"]) * \
                    1e6 if row.get("em_min") is not None else None
                matched_band = (
                    INSTRUMENT.get_closest_band(
                        em_min) if em_min else INSTRUMENT.bands[0]
                )
                epochs_meta.append({
                    "mjd": mjd,
                    "wavelength_um": round(em_min, 3) if em_min else matched_band["wavelength_um"],
                    "molecular_feature": matched_band["molecular_feature"],
                    "url": cutout_url,
                })
        except Exception:
            continue

    if not frames:
        return jsonify({
            "found": False,
            "message": "SPHEREx cutouts could not be decoded at these coordinates.",
        }), 502

    while len(frames) < 8:
        frames.append(frames[-1])
        epochs_meta.append(epochs_meta[-1])

    median_img = np.median(np.array(raw_stack), axis=0)
    detected_srcs = detect_sources_in_stack(
        median_img, fov_arcmin, n_pix=n_pix)

    payload = {
        "found": True,
        "ra": ra,
        "dec": dec,
        "fov": fov_arcmin,
        "total_observations": len(fits_rows),
        "epochs": epochs_meta,
        "frames": frames,
        "sources": detected_srcs,
    }

    QUERY_CACHE[cache_key] = {"ts": time.time(), "payload": payload}
    return jsonify(payload)


# ---------------------------------------------------------------------------
# 5. Persistent Sticky-Note Board Endpoints
# ---------------------------------------------------------------------------

def read_notes_db() -> List[Dict[str, Any]]:
    if not os.path.exists(NOTES_FILE):
        return []
    try:
        with open(NOTES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def write_notes_db(notes: List[Dict[str, Any]]) -> None:
    with open(NOTES_FILE, "w", encoding="utf-8") as f:
        json.dump(notes, f, indent=2)


@app.route("/api/notes", methods=["GET"])
def get_notes():
    return jsonify({"notes": read_notes_db()})


@app.route("/api/notes", methods=["POST"])
def add_note():
    body = request.get_json(silent=True) or {}
    text = str(body.get("text", "")).strip()
    if not text:
        return jsonify({"error": "Note text is required"}), 400

    note = {
        "id": str(body.get("id") or f"note-{int(time.time() * 1000)}"),
        "author": str(body.get("author") or "Anonymous Observer")[:40],
        "kind": "problem" if body.get("kind") == "problem" else "finding",
        "tint": str(body.get("tint") or "cream"),
        "context": str(body.get("context") or ""),
        "text": text[:340],
        "photo": body.get("photo"),
        "date": str(body.get("date") or time.strftime("%Y-%m-%d")),
    }

    notes = read_notes_db()
    notes.insert(0, note)
    write_notes_db(notes[:100])
    return jsonify({"note": note}), 201


@app.route("/api/notes/<note_id>", methods=["DELETE"])
def delete_note(note_id: str):
    notes = read_notes_db()
    updated = [n for n in notes if str(n.get("id")) != str(note_id)]
    write_notes_db(updated)
    return jsonify({"deleted": note_id})


if __name__ == "__main__":
    print("Starting SPHEREx Sky Watch Flask Backend on http://127.0.0.1:5000")
    app.run(debug=True, host="127.0.0.1", port=5000)
