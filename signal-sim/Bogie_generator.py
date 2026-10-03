"""
Bogie-signature signal generator.

    [ axle 1 ] --gap-- [ MTB / brake ] --gap-- [ axle 2 ]

Falling current = occupied. Each system rests at its own `baseline` before,
between and after the events.

Per-system parameters live on SystemParams_Sys1 / SystemParams_Sys2 (two named
classes sharing one field definition via _SystemParamsBase, so they can never
fall out of sync). Cross-system / grid parameters live on BogieParams.

MTB occupancy floor
-------------------
The MTB plateau runs as a straight line from `mtb_depth_start` to
`mtb_depth_end` (both measured from that system's baseline). Equal values give a
flat floor; different values tilt it. When tilted, the two MTB edges naturally
start/end at different depths -- that is the intended consequence of a sloped
floor, not a seam.
"""

from __future__ import annotations
from dataclasses import dataclass, field
import numpy as np
import pandas as pd


# --------------------------------------------------------------------------- #
# Pulse shapes
# --------------------------------------------------------------------------- #
def _hann_dip(n: int) -> np.ndarray:
    """Rounded trough (wheel): 0 at both ends, 1 at centre."""
    if n < 2:
        return np.zeros(max(n, 0))
    k = np.arange(n)
    return 0.5 * (1.0 - np.cos(2.0 * np.pi * k / (n - 1)))


def _ramp(n: int) -> np.ndarray:
    """Cosine ramp 0 -> 1 over n samples, exact at both ends."""
    if n < 2:
        return np.ones(max(n, 0))
    return 0.5 * (1.0 - np.cos(np.pi * np.arange(n) / (n - 1)))


# --------------------------------------------------------------------------- #
# Per-system parameters (one field definition, two named subclasses)
# --------------------------------------------------------------------------- #
@dataclass
class SystemParams_Sys1:
    baseline: float = 5.0            # baseline current
    timeframe_ms: float = 50.0      # gap: wheel end -> MTB start
    mtb_edge_ms: float = 20.0        # MTB edge ramp -> occupancy angle
    mtb_depth_start: float = 2.0     # MTB plateau depth at its START (from baseline)
    mtb_depth_end: float = 2.4       # MTB plateau depth at its END   (from baseline)
    axle_depth: float = 3          # wheel dip depth (from baseline)
    axle_width_ms: float = 250.0     # Occupancy length of wheel
    mtb_plateau_ms: float = 400.0    # Occupancy length of MTB
    timeframe2_ms: float | None = None   # gap MTB end -> axle2 start; None = same as timeframe_ms

    @property
    def mtb_width_ms(self) -> float:
        return 2.0 * self.mtb_edge_ms + self.mtb_plateau_ms

@dataclass
class SystemParams_Sys2:
    baseline: float = 5.0            # baseline current
    timeframe_ms: float = 100.0      # gap: wheel end -> MTB start
    mtb_edge_ms: float = 60.0        # MTB edge ramp -> occupancy angle
    mtb_depth_start: float = 1.2     # MTB plateau depth at its START (from baseline)
    mtb_depth_end: float = 1.2       # MTB plateau depth at its END   (from baseline)
    axle_depth: float = 2.5          # wheel dip depth (from baseline)
    axle_width_ms: float = 250.0     # wheel event width
    mtb_plateau_ms: float = 400.0    # MTB flat-floor length
    timeframe2_ms: float | None = None   # gap MTB end -> axle2 start; None = same as timeframe_ms

    @property
    def mtb_width_ms(self) -> float:
        return 2.0 * self.mtb_edge_ms + self.mtb_plateau_ms


@dataclass
class BogieParams:
    fs_hz: float = 1000.0                 # sample rate (shared grid)
    lead_ms: float = 80.0                 # baseline before axle 1
    trail_ms: float = 80.0                # baseline after axle 2
    total_ms: float | None = 1500.0       # final length; None = natural
    sys_drift_ms: float = 78.0            # Sys1 <-> Sys2 time offset
    direction: int = +1                   # +1 = Sys1 leads, -1 = Sys2 leads
    direction_change_ms: float | None = None
    sys1: SystemParams_Sys1 = field(default_factory=SystemParams_Sys1)
    sys2: SystemParams_Sys2 = field(default_factory=SystemParams_Sys2)


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #
def _render_channel(sp, fs, lead_ms, n_total,
                    extra_shift_ms, flip_after_ms, flip_shift_ms):
    ms = 1000.0 / fs
    base = sp.baseline
    tf1 = sp.timeframe_ms
    tf2 = tf1 if sp.timeframe2_ms is None else sp.timeframe2_ms

    a1_start = lead_ms
    a1_end = a1_start + sp.axle_width_ms
    mtb_start = a1_end + tf1
    mtb_end = mtb_start + sp.mtb_width_ms
    a2_start = mtb_end + tf2

    trace = np.full(n_total, base, dtype=float)

    def shift_for(t_ms):
        if flip_after_ms is not None and t_ms >= flip_after_ms:
            return flip_shift_ms
        return extra_shift_ms

    def idx(t):
        return int(round(t / ms))

    def place(seg, start_ms, center_ms):
        sh = shift_for(center_ms)
        i0 = idx(start_ms + sh)
        lo, hi = max(i0, 0), min(i0 + len(seg), n_total)
        if hi > lo:
            trace[lo:hi] = seg[lo - i0: hi - i0]

    # ---- axle (Hann trough), edges blend from `left` to `right` -------------
    def axle_seg(width, left, right, depth):
        n = max(int(round(width / ms)), 2)
        norm = _hann_dip(n)
        line = np.linspace(left, right, n)
        kmax = int(np.argmax(norm))
        scale = line[kmax] - (base - depth)
        return line - norm * scale

    # ---- MTB (ramp in, tilted floor, ramp out) ------------------------------
    def mtb_seg(left, right, depth_start, depth_end):
        edge_n = max(int(round(sp.mtb_edge_ms / ms)), 2)
        plat_n = max(int(round(sp.mtb_plateau_ms / ms)), 0)
        start_val = base - depth_start
        end_val = base - depth_end
        r = _ramp(edge_n)
        lead_edge = left + (start_val - left) * r          # left -> start_val
        trail_edge = end_val + (right - end_val) * r       # end_val -> right
        floor = np.linspace(start_val, end_val, plat_n) if plat_n > 0 else np.empty(0)
        return np.concatenate([lead_edge, floor, trail_edge])

    place(axle_seg(sp.axle_width_ms, base, base, sp.axle_depth),
          a1_start, a1_start + 0.5 * sp.axle_width_ms)
    place(mtb_seg(base, base, sp.mtb_depth_start, sp.mtb_depth_end),
          mtb_start, mtb_start + 0.5 * sp.mtb_width_ms)
    place(axle_seg(sp.axle_width_ms, base, base, sp.axle_depth),
          a2_start, a2_start + 0.5 * sp.axle_width_ms)
    return trace


def generate(params: BogieParams | None = None) -> pd.DataFrame:
    p = params or BogieParams()
    ms = 1000.0 / p.fs_hz

    def channel_end(sp):
        tf2 = sp.timeframe_ms if sp.timeframe2_ms is None else sp.timeframe2_ms
        return (p.lead_ms + 2 * sp.axle_width_ms + sp.timeframe_ms
                + sp.mtb_width_ms + tf2 + p.trail_ms)

    natural = max(channel_end(p.sys1), channel_end(p.sys2)) + abs(p.sys_drift_ms)
    total_ms = p.total_ms if p.total_ms is not None else natural
    n_total = int(round(total_ms / ms))

    d = 1 if p.direction >= 0 else -1
    sys2_shift = d * p.sys_drift_ms
    sys2_flip = -sys2_shift

    s1 = _render_channel(p.sys1, p.fs_hz, p.lead_ms, n_total,
                         0.0, None, 0.0)
    s2 = _render_channel(p.sys2, p.fs_hz, p.lead_ms, n_total,
                         sys2_shift, p.direction_change_ms, sys2_flip)

    t_ms = np.arange(n_total)
    time = pd.to_datetime("2026-01-01") + pd.to_timedelta(t_ms * ms, unit="ms")
    return pd.DataFrame({"Time": time, "Sys1": s1, "Sys2": s2, "t_ms": t_ms})


if __name__ == "__main__":
    df = generate()
    print(df.head())
    print("length:", len(df), "ms")
    df.to_parquet("generated_default.parquet")
    print("wrote generated_default.parquet")