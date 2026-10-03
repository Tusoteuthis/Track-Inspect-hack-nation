"""
Distance-domain simulator for a whole train passing two track sensors.

Instead of drawing event lengths in milliseconds (as bogie_dataset.py does),
the train and the sensors are described in METRES and the train is moved
along the track with a speed profile v(t). Every sensor sample is then the
sensor's response to whatever wheels / MTB shoes are above it at that moment:

    train consist (m)  -->  position s(t) = integral of v(t)  -->  y_k(t)

Consequences that come for free:
  * Sys1 -> Sys2 drift   = sensor spacing / speed
  * dip / MTB widths     scale with 1 / speed
  * axle, bogie and car spacing follow the real geometry
  * labels are exact ground truth

The pulse shapes (Hann wheel dip, cosine-edged MTB plateau with a tilted
floor) mirror Bogie_generator.py, but are
defined over distance instead of time.

Coordinates: the track runs along +x, the train moves towards +x, Sys1 sits
at x = 0 and Sys2 a little further down the track, so Sys1 sees every axle
first.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


# --------------------------------------------------------------------------- #
# Train geometry
# --------------------------------------------------------------------------- #
@dataclass
class Car:
    name: str
    length_m: float            # over buffers
    bogie_centres_m: float     # distance between the two bogie centres
    wheelbase_m: float         # axle-to-axle inside one bogie
    mtb: tuple[bool, bool]     # MTB fitted on (front bogie, rear bogie)


LOCO = Car("Loco", 19.0, 10.0, 2.8, (False, False))


def coach(mtb: bool) -> Car:
    return Car("Coach", 26.4, 19.0, 2.5, (mtb, mtb))


DEFAULT_CONSIST = [LOCO, coach(True), coach(True), coach(False), coach(True)]


@dataclass
class Bogie:
    car_idx: int
    offset_m: float            # bogie centre, measured back from the train front
    wheelbase_m: float
    mtb: bool


def bogies_of(consist: list[Car]) -> list[Bogie]:
    out, front = [], 0.0
    for i, car in enumerate(consist):
        mid = front + 0.5 * car.length_m
        half = 0.5 * car.bogie_centres_m
        out.append(Bogie(i, mid - half, car.wheelbase_m, car.mtb[0]))
        out.append(Bogie(i, mid + half, car.wheelbase_m, car.mtb[1]))
        front += car.length_m
    return out


def train_length(consist: list[Car]) -> float:
    return sum(c.length_m for c in consist)


# --------------------------------------------------------------------------- #
# Sensors
# --------------------------------------------------------------------------- #
@dataclass
class Sensor:
    name: str
    position_m: float
    baseline: float
    axle_depth: float          # wheel dip depth (from baseline)
    mtb_depth_start: float     # MTB floor depth where the shoe is seen first
    mtb_depth_end: float       # ... and where it is seen last
    wheel_footprint_m: float   # spatial width of one wheel dip
    mtb_edge_m: float          # MTB edge ramp length
    # noise model
    noise_frac: float = 0.03   # white noise sigma, fraction of baseline
    hum_amp: float = 0.04      # 50 Hz mains pickup amplitude
    drift_std: float = 0.08    # slow baseline wander (std over the pass)
    spike_rate_hz: float = 0.15  # rare EMI spikes per second


SYS1 = Sensor("Sys1", 0.00, baseline=4.6, axle_depth=3.4,
              mtb_depth_start=1.6, mtb_depth_end=1.9,
              wheel_footprint_m=0.60, mtb_edge_m=0.25)
SYS2 = Sensor("Sys2", 0.35, baseline=3.9, axle_depth=3.0,
              mtb_depth_start=1.3, mtb_depth_end=1.5,
              wheel_footprint_m=0.70, mtb_edge_m=0.35)

MTB_SHOE_M = 1.0               # flat part of the magnetic shoe, centred in the bogie


# --------------------------------------------------------------------------- #
# Speed profile
# --------------------------------------------------------------------------- #
@dataclass
class SpeedProfile:
    v_start: float = 4.5       # m/s
    v_end: float = 2.5         # m/s
    brake_start_s: float = 8.0
    brake_dur_s: float = 15.0

    def __call__(self, t: np.ndarray) -> np.ndarray:
        x = np.clip((t - self.brake_start_s) / self.brake_dur_s, 0.0, 1.0)
        smooth = 0.5 * (1.0 - np.cos(np.pi * x))
        return self.v_start + (self.v_end - self.v_start) * smooth


# --------------------------------------------------------------------------- #
# Spatial pulse shapes  (u = sensor position relative to the bogie centre, m;
# positive u = the front half of the bogie)
# --------------------------------------------------------------------------- #
def _hann(z: np.ndarray) -> np.ndarray:
    """1 at z = 0, falling to 0 at |z| = 0.5, zero outside."""
    out = 0.5 * (1.0 + np.cos(2.0 * np.pi * z))
    return np.where(np.abs(z) < 0.5, out, 0.0)


def _soft_box(u: np.ndarray, half: float, edge: float) -> np.ndarray:
    """1 inside |u| < half, cosine ramp to 0 over `edge` metres outside."""
    r = np.clip((half + edge - np.abs(u)) / max(edge, 1e-9), 0.0, 1.0)
    return 0.5 * (1.0 - np.cos(np.pi * r))


def bogie_response(u: np.ndarray, b: Bogie, s: Sensor) -> np.ndarray:
    """Signal change (relative to baseline) caused by one bogie."""
    h = 0.5 * b.wheelbase_m
    w = s.wheel_footprint_m
    y = -s.axle_depth * (_hann((u - h) / w) + _hann((u + h) / w))
    if b.mtb:
        half = 0.5 * MTB_SHOE_M
        env = _soft_box(u, half, s.mtb_edge_m)
        # front of the shoe (u = +half) is seen first -> depth_start
        frac = np.clip((half - u) / MTB_SHOE_M, 0.0, 1.0)
        depth = s.mtb_depth_start + (s.mtb_depth_end - s.mtb_depth_start) * frac
        y -= env * depth
    return y


# --------------------------------------------------------------------------- #
# Simulation
# --------------------------------------------------------------------------- #
@dataclass
class TrainPass:
    t_s: np.ndarray
    speed: np.ndarray
    front_m: np.ndarray         # x position of the train front
    signals: dict[str, np.ndarray]
    label: np.ndarray           # -1 no bogie at Sys1, 0 bogie, 1 bogie with MTB
    bogie_id: np.ndarray        # bogie at Sys1, -1 if none
    consist: list[Car]
    bogies: list[Bogie]
    sensors: list[Sensor]

    def to_frame(self) -> pd.DataFrame:
        df = pd.DataFrame({"t_ms": self.t_s * 1000.0, "speed_mps": self.speed,
                           "front_m": self.front_m})
        for name, sig in self.signals.items():
            df[name] = sig
        df["label"] = self.label
        df["bogie_id"] = self.bogie_id
        return df


def _noise(s: Sensor, t: np.ndarray, fs: float, rng) -> np.ndarray:
    n = len(t)
    white = rng.normal(0.0, s.noise_frac * s.baseline, n)
    hum = s.hum_amp * np.sin(2 * np.pi * 50.0 * t + rng.uniform(0, 2 * np.pi))
    walk = np.cumsum(rng.normal(0.0, 1.0, n))
    walk -= np.linspace(walk[0], walk[-1], n)           # no net trend
    walk *= s.drift_std / (walk.std() + 1e-12)
    spikes = np.zeros(n)
    for i in np.flatnonzero(rng.random(n) < s.spike_rate_hz / fs):
        spikes[i:i + 3] += rng.choice([-1, 1]) * rng.uniform(0.6, 1.5)
    return white + hum + walk + spikes


def simulate(consist: list[Car] | None = None,
             sensors: list[Sensor] | None = None,
             speed: SpeedProfile | None = None,
             fs_hz: float = 1000.0,
             lead_m: float = 6.0,
             trail_m: float = 6.0,
             seed: int | None = 42) -> TrainPass:
    consist = consist or DEFAULT_CONSIST
    sensors = sensors or [SYS1, SYS2]
    speed = speed or SpeedProfile()
    rng = np.random.default_rng(seed)
    bogies = bogies_of(consist)

    # integrate the speed until the rear has cleared the last sensor
    dt = 1.0 / fs_hz
    end_x = max(s.position_m for s in sensors) + train_length(consist) + trail_m
    t_chunks, x = [], -lead_m
    t0 = 0.0
    while x < end_x:
        t = t0 + np.arange(int(fs_hz)) * dt                # one second at a time
        v = speed(t)
        xs = x + np.cumsum(v) * dt
        t_chunks.append((t, v, xs))
        x, t0 = xs[-1], t[-1] + dt
    t = np.concatenate([c[0] for c in t_chunks])
    v = np.concatenate([c[1] for c in t_chunks])
    front = np.concatenate([c[2] for c in t_chunks])
    keep = front - v * dt < end_x
    t, v, front = t[keep], v[keep], front[keep]

    signals = {}
    for s in sensors:
        y = np.full(len(t), s.baseline)
        for b in bogies:
            u = s.position_m - (front - b.offset_m)
            y += bogie_response(u, b, s)
        signals[s.name] = y + _noise(s, t, fs_hz, rng)

    # ground truth at Sys1: which bogie (if any) is over it
    ref = sensors[0]
    label = np.full(len(t), -1, dtype=np.int8)
    bogie_id = np.full(len(t), -1, dtype=np.int16)
    for i, b in enumerate(bogies):
        u = ref.position_m - (front - b.offset_m)
        over = np.abs(u) <= 0.5 * b.wheelbase_m + 0.5 * ref.wheel_footprint_m
        label[over] = 1 if b.mtb else 0
        bogie_id[over] = i

    return TrainPass(t, v, front, signals, label, bogie_id, consist, bogies, sensors)


if __name__ == "__main__":
    from pathlib import Path

    tp = simulate()
    out = Path("dataset")
    out.mkdir(exist_ok=True)
    tp.to_frame().to_parquet(out / "train_pass.parquet", index=False)
    print(f"{len(tp.t_s)} samples ({tp.t_s[-1]:.1f} s), "
          f"{len(tp.bogies)} bogies, written to {out / 'train_pass.parquet'}")
