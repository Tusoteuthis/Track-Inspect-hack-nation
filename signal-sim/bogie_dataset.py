"""
Paired synthetic dataset builder for the bogie-signature generator.

For every pair it draws one random parameter set inside the specification
windows and renders TWO traces from it:

    label 1 ("mtb")    -- as drawn (bogie with magnetic track brake)
    label 0 ("nomtb")  -- identical parameters except
                          mtb_depth_start = mtb_depth_end = 0

Axle anchoring
--------------
The same wheel passes both detection systems, so both axles must sit exactly
`sys_drift_ms` apart in the two channels. The renderer lays each channel out by
accumulating its own event lengths, so a single constant shift only aligns the
first event. With ANCHOR_AXLES the sampler fixes this:

  * Sys2 is shifted by `drift + (axle_width1 - axle_width2) / 2`, which aligns
    the axle-1 CENTRES (not their leading edges).
  * Sys2's `timeframe_ms` is DERIVED so that its axle-centre-to-axle-centre
    span matches Sys1's. Draws whose derived gap falls outside the specified
    range are rejected, never clipped.

Both axle centres and the MTB centre then coincide at exactly `drift`.

Outputs (under OUT_DIR)
-----------------------
files/sample_XXXXX_{mtb,nomtb}.parquet   one file per sample
all_samples.parquet                      every sample stacked (long format)
stream.parquet                           all samples concatenated into one
                                         continuous recording, shuffled
manifest.csv                             one row per sample + all parameters
stream_index.csv                         where each sample sits in the stream
"""

from __future__ import annotations

import math
import shutil
from pathlib import Path

import numpy as np
import pandas as pd

try:
    from Bogie_generator import BogieParams, SystemParams_Sys1, SystemParams_Sys2, _render_channel
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "Bogie_generator.py must sit next to this file. Note that "
        "_render_channel is a private name -- if you rename or refactor it, "
        "update this import."
    ) from exc

# =========================================================================== #
# >>> RUN SETTINGS -- the knobs you actually touch <<<
# =========================================================================== #
N_PAIRS = 5          # pairs to generate -> 2 * N_PAIRS samples/files
SEED = 42              # int for reproducible datasets, None for random
OUT_DIR = "dataset"    # output folder
CLEAN_OUT_DIR = True   # wipe previous outputs first (see notes below)

NOISE_FRAC = 0.03      # Gaussian noise sigma as a fraction of that system's
                       # baseline (0.03 = 3 %). Set 0.0 for clean traces.

STREAM_GAP_MS = 300.0  # quiet baseline bridge between samples in the stream
BUILD_STREAM = True    # write stream.parquet
WRITE_FILES = True     # write the individual per-sample parquet files

ANCHOR_AXLES = True    # align BOTH axles at exactly sys_drift_ms (see docstring)
# =========================================================================== #


# --------------------------------------------------------------------------- #
# Parameter specification: (low, high, max |sys1 - sys2|)
# --------------------------------------------------------------------------- #
# mtb_edge_ms delta is 30, not the originally specified 150: with ANCHOR_AXLES
# the |tf1 - tf2| <= 10 coupling caps the surviving edge difference at ~28 ms
# anyway, so a wider draw only multiplies rejections without widening the data.
SPEC = {
    "baseline":        (5.0, 5.0, 0.0),
    "timeframe_ms":    (10.0, 80.0, 10.0),
    "mtb_edge_ms":     (0.0, 300.0, 30.0),
    "mtb_depth_start": (0.2, 3.0, 0.8),
    "mtb_depth_end":   (0.2, 3.0, 0.5),
    "axle_depth":      (2.0, 4.0, 0.2),
    "axle_width_ms":   (300.0, 400.0, 20.0),
    "mtb_plateau_ms":  (150.0, 500.0, 20.0),
}
FIELDS = list(SPEC)

DEPTH_END_SWING = 0.6        # mtb_depth_end = mtb_depth_start - a, a in +-this
MIN_DEPTH_RATIO = 1.1        # axle_depth / mtb_depth_start >= this
MAX_WIDTH_RATIO = 0.9        # axle_width_ms / mtb_plateau_ms <= this
DRIFT_RANGE = (40.0, 120.0)  # sys_drift_ms

# Apply MIN_DEPTH_RATIO to mtb_depth_end as well, so a tilted MTB floor can
# never end up deeper than the wheel dip. Set False to follow the written
# spec literally (which constrains mtb_depth_start only).
RATIO_ALSO_ON_DEPTH_END = True

MAX_DRAW_ATTEMPTS = 5000     # per pair; guards against an unsatisfiable SPEC
TOL = 1e-6

# Fixed grid parameters
FS_HZ = 1000.0
LEAD_MS = 80.0
TRAIL_MS = 80.0
DIRECTION = +1

NEUTRAL = {"mtb_depth_start": 0.0, "mtb_depth_end": 0.0}


# --------------------------------------------------------------------------- #
# Sampling
# --------------------------------------------------------------------------- #
class _Reject(Exception):
    """Coupling windows collapsed -- redraw the whole pair."""


class SpecError(ValueError):
    """A drawn pair violated the specification, or SPEC is unsatisfiable."""


def _draw(rng, lo, hi):
    if hi < lo:
        raise _Reject
    return float(rng.uniform(lo, hi))


def _win(lo, hi, center, delta):
    """Range `lo..hi` intersected with `center +- delta`."""
    return max(lo, center - delta), min(hi, center + delta)


def _depth_cap(axle_depth):
    return min(SPEC["mtb_depth_start"][1], axle_depth / MIN_DEPTH_RATIO)


def _plateau_floor(axle_width):
    return max(SPEC["mtb_plateau_ms"][0], axle_width / MAX_WIDTH_RATIO)


def _mtb_width(s):
    return 2.0 * s["mtb_edge_ms"] + s["mtb_plateau_ms"]


def axle_span(s):
    """Axle-1 centre to axle-2 centre, in ms. The physical bogie wheelbase."""
    return s["axle_width_ms"] + 2.0 * s["timeframe_ms"] + _mtb_width(s)


def sample_pair(rng):
    """One draw of sys1/sys2 parameters. Raises _Reject on an empty window."""
    s1, s2 = {}, {}

    # --- fields with no cross-coupling beyond their own window --------------
    for key in ("baseline", "mtb_edge_ms"):
        lo, hi, delta = SPEC[key]
        s1[key] = _draw(rng, lo, hi)
        s2[key] = _draw(rng, *_win(lo, hi, s1[key], delta))

    # --- axle_depth before mtb_depth_start (ratio coupling) -----------------
    lo, hi, delta = SPEC["axle_depth"]
    s1["axle_depth"] = _draw(rng, lo, hi)
    s2["axle_depth"] = _draw(rng, *_win(lo, hi, s1["axle_depth"], delta))

    # --- mtb_depth_start, inside the ratio cap ------------------------------
    # drawn inside the already-capped window rather than drawn then clamped,
    # so the 1.1 ratio holds exactly instead of via rejection.
    d_lo, d_hi, d_delta = SPEC["mtb_depth_start"]
    cap1, cap2 = _depth_cap(s1["axle_depth"]), _depth_cap(s2["axle_depth"])

    s1["mtb_depth_start"] = _draw(rng, d_lo, min(cap1, d_hi))
    s2["mtb_depth_start"] = _draw(
        rng,
        max(d_lo, s1["mtb_depth_start"] - d_delta),
        min(cap2, d_hi, s1["mtb_depth_start"] + d_delta),
    )

    # --- mtb_depth_end = start - a, then coupled -----------------------------
    e_lo, e_hi, e_delta = SPEC["mtb_depth_end"]
    hi1 = min(cap1, e_hi) if RATIO_ALSO_ON_DEPTH_END else e_hi
    hi2 = min(cap2, e_hi) if RATIO_ALSO_ON_DEPTH_END else e_hi
    s1["mtb_depth_end"] = _draw(
        rng,
        max(e_lo, s1["mtb_depth_start"] - DEPTH_END_SWING),
        min(hi1, s1["mtb_depth_start"] + DEPTH_END_SWING),
    )
    s2["mtb_depth_end"] = _draw(
        rng,
        max(e_lo, s2["mtb_depth_start"] - DEPTH_END_SWING, s1["mtb_depth_end"] - e_delta),
        min(hi2, s2["mtb_depth_start"] + DEPTH_END_SWING, s1["mtb_depth_end"] + e_delta),
    )

    # --- axle_width before mtb_plateau (ratio coupling) ---------------------
    lo, hi, delta = SPEC["axle_width_ms"]
    s1["axle_width_ms"] = _draw(rng, lo, hi)
    s2["axle_width_ms"] = _draw(rng, *_win(lo, hi, s1["axle_width_ms"], delta))

    _, p_hi, p_delta = SPEC["mtb_plateau_ms"]
    s1["mtb_plateau_ms"] = _draw(rng, _plateau_floor(s1["axle_width_ms"]), p_hi)
    s2["mtb_plateau_ms"] = _draw(
        rng, *_win(_plateau_floor(s2["axle_width_ms"]), p_hi,
                   s1["mtb_plateau_ms"], p_delta)
    )

    # --- timeframe: drawn for sys1, DERIVED for sys2 when anchoring ---------
    t_lo, t_hi, t_delta = SPEC["timeframe_ms"]
    s1["timeframe_ms"] = _draw(rng, t_lo, t_hi)
    if ANCHOR_AXLES:
        # solve axle_span(s2) == axle_span(s1) for s2's gap
        s2["timeframe_ms"] = 0.5 * (
            axle_span(s1) - s2["axle_width_ms"] - _mtb_width(s2)
        )
        if not (t_lo <= s2["timeframe_ms"] <= t_hi):
            raise _Reject
        if abs(s2["timeframe_ms"] - s1["timeframe_ms"]) > t_delta:
            raise _Reject
    else:
        s2["timeframe_ms"] = _draw(rng, *_win(t_lo, t_hi, s1["timeframe_ms"], t_delta))

    drift = _draw(rng, *DRIFT_RANGE)
    return s1, s2, drift


def sys2_shift_ms(s1, s2, drift):
    """Constant offset applied to the whole Sys2 channel."""
    if not ANCHOR_AXLES:
        return drift
    # centre-align axle 1; the derived timeframe then centre-aligns axle 2
    return drift + 0.5 * (s1["axle_width_ms"] - s2["axle_width_ms"])


def validate(s1, s2, drift):
    """Explicit checks (not asserts -- these survive `python -O`)."""
    def bad(msg):
        raise SpecError(msg)

    for key, (lo, hi, delta) in SPEC.items():
        for tag, s in (("sys1", s1), ("sys2", s2)):
            if not (lo - TOL <= s[key] <= hi + TOL):
                bad(f"{tag}.{key} = {s[key]:.4f} outside [{lo}, {hi}]")
        if abs(s1[key] - s2[key]) > delta + TOL:
            bad(f"|sys1.{key} - sys2.{key}| = {abs(s1[key]-s2[key]):.4f} > {delta}")

    for tag, s in (("sys1", s1), ("sys2", s2)):
        if abs(s["mtb_depth_start"] - s["mtb_depth_end"]) > DEPTH_END_SWING + TOL:
            bad(f"{tag} depth swing > {DEPTH_END_SWING}")
        if s["axle_depth"] / s["mtb_depth_start"] < MIN_DEPTH_RATIO - TOL:
            bad(f"{tag} axle_depth/mtb_depth_start < {MIN_DEPTH_RATIO}")
        if s["axle_width_ms"] / s["mtb_plateau_ms"] > MAX_WIDTH_RATIO + TOL:
            bad(f"{tag} axle_width/mtb_plateau > {MAX_WIDTH_RATIO}")
        if RATIO_ALSO_ON_DEPTH_END and s["axle_depth"] / s["mtb_depth_end"] < MIN_DEPTH_RATIO - TOL:
            bad(f"{tag} axle_depth/mtb_depth_end < {MIN_DEPTH_RATIO}")

    if not (DRIFT_RANGE[0] - TOL <= drift <= DRIFT_RANGE[1] + TOL):
        bad(f"sys_drift_ms = {drift:.4f} outside {DRIFT_RANGE}")

    if ANCHOR_AXLES:
        sh = sys2_shift_ms(s1, s2, drift)
        # event centres, measured from the common lead
        c1 = [0.5 * s1["axle_width_ms"]]
        c1.append(s1["axle_width_ms"] + s1["timeframe_ms"] + 0.5 * _mtb_width(s1))
        c1.append(axle_span(s1) + 0.5 * s1["axle_width_ms"])
        c2 = [0.5 * s2["axle_width_ms"] + sh]
        c2.append(s2["axle_width_ms"] + s2["timeframe_ms"] + 0.5 * _mtb_width(s2) + sh)
        c2.append(axle_span(s2) + 0.5 * s2["axle_width_ms"] + sh)
        for name, a, b in zip(("axle1", "mtb", "axle2"), c1, c2):
            if abs((b - a) - drift) > 1e-6:
                bad(f"{name} centres offset by {b-a:.4f} ms, expected {drift:.4f}")


# --------------------------------------------------------------------------- #
# Fixed analysis window
# --------------------------------------------------------------------------- #
def window_ms():
    """Longest signal the spec can produce, rounded up to a round number."""
    worst = (
        LEAD_MS
        + 2 * SPEC["axle_width_ms"][1]
        + 2 * SPEC["timeframe_ms"][1]
        + (2 * SPEC["mtb_edge_ms"][1] + SPEC["mtb_plateau_ms"][1])
        + TRAIL_MS
        + DRIFT_RANGE[1]
        + 0.5 * SPEC["axle_width_ms"][2]   # centre-alignment shift
    )
    return float(math.ceil(worst / 100.0) * 100.0)


WINDOW_MS = window_ms()
N_SAMPLES_PER_TRACE = int(round(WINDOW_MS / (1000.0 / FS_HZ)))


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #
def _cos_ramp(n):
    """Cosine ramp 0 -> 1 over n samples (local copy, no private import)."""
    if n < 2:
        return np.ones(max(n, 0))
    return 0.5 * (1.0 - np.cos(np.pi * np.arange(n) / (n - 1)))


def build_params(s1, s2, drift):
    return BogieParams(
        fs_hz=FS_HZ,
        lead_ms=LEAD_MS,
        trail_ms=TRAIL_MS,
        total_ms=WINDOW_MS,
        sys_drift_ms=drift,
        direction=DIRECTION,
        direction_change_ms=None,
        sys1=SystemParams_Sys1(**s1),
        sys2=SystemParams_Sys2(**s2),
    )


def render(p, shift_ms, rng):
    """Render both channels on the shared grid and add noise."""
    n = int(round(p.total_ms / (1000.0 / p.fs_hz)))
    s1 = _render_channel(p.sys1, p.fs_hz, p.lead_ms, n, 0.0, None, 0.0)
    s2 = _render_channel(p.sys2, p.fs_hz, p.lead_ms, n, shift_ms, None, 0.0)
    if NOISE_FRAC > 0.0:
        s1 = s1 + rng.normal(0.0, NOISE_FRAC * p.sys1.baseline, n)
        s2 = s2 + rng.normal(0.0, NOISE_FRAC * p.sys2.baseline, n)
    return s1, s2


def bridge(n, base_from, base_to, rng):
    """Smooth baseline transition used to glue stream segments together."""
    if n <= 0:
        return np.empty(0)
    seg = base_from + (base_to - base_from) * _cos_ramp(n)
    if NOISE_FRAC > 0.0:
        seg = seg + rng.normal(0.0, NOISE_FRAC * 0.5 * (base_from + base_to), n)
    return seg


# --------------------------------------------------------------------------- #
# Main build
# --------------------------------------------------------------------------- #
def _prepare_out_dir(out: Path):
    """Remove OUR previous outputs only -- never touches unrelated files."""
    if CLEAN_OUT_DIR and out.exists():
        if (out / "files").is_dir():
            shutil.rmtree(out / "files")
        for name in ("all_samples.parquet", "stream.parquet",
                     "manifest.csv", "stream_index.csv"):
            (out / name).unlink(missing_ok=True)
    (out / "files").mkdir(parents=True, exist_ok=True)


def build(n_pairs=N_PAIRS, seed=SEED, out_dir=OUT_DIR):
    rng = np.random.default_rng(seed)
    out = Path(out_dir)
    _prepare_out_dir(out)

    ms = 1000.0 / FS_HZ
    t_ms = np.arange(N_SAMPLES_PER_TRACE) * ms
    time_col = pd.to_datetime("2026-01-01") + pd.to_timedelta(t_ms, unit="ms")

    manifest, blocks, samples = [], [], []
    rejects = 0

    for pair_id in range(n_pairs):
        for attempt in range(MAX_DRAW_ATTEMPTS):
            try:
                s1, s2, drift = sample_pair(rng)
                break
            except _Reject:
                rejects += 1
        else:
            raise SpecError(
                f"no valid draw in {MAX_DRAW_ATTEMPTS} attempts -- SPEC is "
                f"probably unsatisfiable. With ANCHOR_AXLES the usual cause is "
                f"a timeframe_ms range or coupling too tight to absorb the "
                f"axle_width / mtb width differences."
            )
        validate(s1, s2, drift)
        shift = sys2_shift_ms(s1, s2, drift)

        variants = {
            "mtb": (s1, s2),
            "nomtb": ({**s1, **NEUTRAL}, {**s2, **NEUTRAL}),
        }
        for tag, (v1, v2) in variants.items():
            label = 1 if tag == "mtb" else 0
            sample_id = f"{pair_id:05d}_{tag}"
            a, b = render(build_params(v1, v2, drift), shift, rng)

            if WRITE_FILES:
                pd.DataFrame(
                    {"Time": time_col, "Sys1": a, "Sys2": b, "t_ms": t_ms}
                ).to_parquet(out / "files" / f"sample_{sample_id}.parquet", index=False)

            blocks.append(pd.DataFrame({
                "sample_id": sample_id, "pair_id": pair_id,
                "label": np.int8(label), "t_ms": t_ms, "Sys1": a, "Sys2": b,
            }))
            samples.append((sample_id, pair_id, label, a, b,
                            v1["baseline"], v2["baseline"]))

            row = {
                "sample_id": sample_id, "pair_id": pair_id, "label": label,
                "variant": tag, "file": f"files/sample_{sample_id}.parquet",
                "sys_drift_ms": drift, "sys2_shift_ms": shift,
                "axle_span_ms": axle_span(v1),
                "window_ms": WINDOW_MS, "noise_frac": NOISE_FRAC,
            }
            row.update({f"sys1_{k}": v1[k] for k in FIELDS})
            row.update({f"sys2_{k}": v2[k] for k in FIELDS})
            manifest.append(row)

    pd.DataFrame(manifest).to_csv(out / "manifest.csv", index=False)
    pd.concat(blocks, ignore_index=True).to_parquet(out / "all_samples.parquet", index=False)

    if BUILD_STREAM:
        _write_stream(samples, out, rng, ms)

    total = rejects + n_pairs
    print(f"pairs: {n_pairs}   samples: {2 * n_pairs}   "
          f"draws: {total} ({100.0 * n_pairs / total:.1f} % accepted)")
    print(f"window: {WINDOW_MS:.0f} ms ({N_SAMPLES_PER_TRACE} samples)  "
          f"noise: {NOISE_FRAC:.1%}  anchored: {ANCHOR_AXLES}")
    print(f"written to {out.resolve()}")


def _write_stream(samples, out, rng, ms):
    """Concatenate every sample into one continuous recording, shuffled."""
    order = rng.permutation(len(samples))
    gap_n = int(round(STREAM_GAP_MS / ms))

    chunks1, chunks2, labels, ids, index = [], [], [], [], []
    prev1 = prev2 = None
    cursor = 0

    for k in order:
        sample_id, pair_id, label, a, b, base1, base2 = samples[k]
        g1 = bridge(gap_n, prev1 if prev1 is not None else base1, base1, rng)
        g2 = bridge(gap_n, prev2 if prev2 is not None else base2, base2, rng)
        for arr1, arr2, lab, sid in ((g1, g2, -1, ""), (a, b, label, sample_id)):
            chunks1.append(arr1)
            chunks2.append(arr2)
            labels.append(np.full(len(arr1), lab, dtype=np.int8))
            ids.append(np.full(len(arr1), sid, dtype=object))
        index.append({"sample_id": sample_id, "pair_id": pair_id, "label": label,
                      "start_idx": cursor + gap_n,
                      "end_idx": cursor + gap_n + len(a)})
        cursor += gap_n + len(a)
        prev1, prev2 = base1, base2

    chunks1.append(bridge(gap_n, prev1, prev1, rng))
    chunks2.append(bridge(gap_n, prev2, prev2, rng))
    labels.append(np.full(gap_n, -1, dtype=np.int8))
    ids.append(np.full(gap_n, "", dtype=object))

    s1 = np.concatenate(chunks1)
    s2 = np.concatenate(chunks2)
    pd.DataFrame({
        "t_ms": np.arange(len(s1)) * ms, "Sys1": s1, "Sys2": s2,
        "label": np.concatenate(labels), "sample_id": np.concatenate(ids),
    }).to_parquet(out / "stream.parquet", index=False)
    pd.DataFrame(index).to_csv(out / "stream_index.csv", index=False)
    print(f"stream: {len(s1)} samples ({len(s1) * ms / 1000:.1f} s)")


if __name__ == "__main__":
    build()
