"""
Animated train pass: the train rolls over the two sensors (top panel) while a
scrolling oscilloscope draws Sys1 / Sys2 live (bottom panel).

Usage
-----
    python animate_train.py                       # record dataset/train_pass.mp4
    python animate_train.py --out run.gif         # record a GIF instead
    python animate_train.py --show                # live window, no recording
    python animate_train.py --speedup 2           # play twice as fast
    python animate_train.py --seconds 10          # only the first 10 s
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib

import numpy as np

from train_sim import MTB_SHOE_M, simulate

VIEW_BEHIND_M = 22.0   # track shown behind (left of) Sys1
VIEW_AHEAD_M = 10.0    # track shown ahead (right of) Sys1
SCOPE_S = 8.0          # scope history, seconds
COLORS = {"Sys1": "tab:blue", "Sys2": "tab:orange"}


def build_animation(tp, fps: int, speedup: float, seconds: float | None):
    import matplotlib.pyplot as plt
    from matplotlib.animation import FuncAnimation
    from matplotlib.patches import Circle, Rectangle

    fig, (ax_t, ax_s) = plt.subplots(
        2, 1, figsize=(12, 6.5), gridspec_kw={"height_ratios": [1, 1.6]})
    fig.subplots_adjust(left=0.07, right=0.98, top=0.93, bottom=0.09, hspace=0.35)

    # ---- track view ------------------------------------------------------
    ax_t.set_xlim(-VIEW_BEHIND_M, VIEW_AHEAD_M)
    ax_t.set_ylim(-0.9, 3.4)
    ax_t.set_aspect("equal")
    ax_t.set_yticks([])
    ax_t.set_xlabel("track position [m]")
    ax_t.axhline(0.0, color="0.3", lw=2, zorder=1)
    for s in tp.sensors:
        ax_t.plot(s.position_m, -0.35, marker="^", ms=11, color=COLORS[s.name], zorder=5)
    ax_t.text(0.0, -0.85, "Sys1 / Sys2", ha="center", va="bottom", fontsize=8)

    car_patches, wheel_patches, shoe_patches = [], [], []
    front = 0.0
    car_fronts = []
    for car in tp.consist:
        car_fronts.append(front)
        color = "#5b6770" if car.name == "Loco" else "#a9b8c4"
        r = Rectangle((0, 0.95), car.length_m - 0.6, 2.2, fc=color, ec="0.2", lw=1, zorder=2)
        ax_t.add_patch(r)
        car_patches.append((r, front))
        front += car.length_m
    for b in tp.bogies:
        h = 0.5 * b.wheelbase_m
        for off in (b.offset_m - h, b.offset_m + h):
            c = Circle((0, 0.46), 0.46, fc="0.15", zorder=3)
            ax_t.add_patch(c)
            wheel_patches.append((c, off))
        if b.mtb:
            sh = Rectangle((0, 0.08), MTB_SHOE_M, 0.18, fc="crimson", zorder=4)
            ax_t.add_patch(sh)
            shoe_patches.append((sh, b.offset_m))
    ax_t.plot([], [], "s", color="crimson", label="magnetic track brake")
    ax_t.legend(loc="upper right", fontsize=8, framealpha=0.9)

    # ---- scope -----------------------------------------------------------
    lines = {}
    for name, sig in tp.signals.items():
        (lines[name],) = ax_s.plot([], [], lw=1.0, color=COLORS[name], label=name)
    lo = min(s.min() for s in tp.signals.values())
    hi = max(s.max() for s in tp.signals.values())
    ax_s.set_ylim(lo - 0.3, hi + 0.3)
    ax_s.set_xlabel("time [s]")
    ax_s.set_ylabel("signal")
    ax_s.grid(alpha=0.3)
    ax_s.legend(loc="lower left", fontsize=8)
    title = fig.suptitle("")

    t_end = tp.t_s[-1] if seconds is None else min(seconds, tp.t_s[-1])
    n_frames = int(t_end * fps / speedup) + 1
    fs = 1.0 / (tp.t_s[1] - tp.t_s[0])

    def update(k):
        t = k * speedup / fps
        i = min(int(t * fs), len(tp.t_s) - 1)
        x = tp.front_m[i]
        for r, f in car_patches:
            r.set_x(x - f - r.get_width() - 0.3)
        for c, off in wheel_patches:
            c.center = (x - off, 0.46)
        for sh, off in shoe_patches:
            sh.set_x(x - off - 0.5 * MTB_SHOE_M)

        i0 = max(0, i - int(SCOPE_S * fs))
        for name, line in lines.items():
            line.set_data(tp.t_s[i0:i + 1], tp.signals[name][i0:i + 1])
        ax_s.set_xlim(t - SCOPE_S, t)

        lab = {-1: "—", 0: "bogie, no MTB", 1: "bogie WITH MTB"}[int(tp.label[i])]
        title.set_text(f"t = {t:5.2f} s    speed = {tp.speed[i]*3.6:5.1f} km/h    "
                       f"over Sys1: {lab}")
        return []

    anim = FuncAnimation(fig, update, frames=n_frames, interval=1000 / fps, blit=False)
    return fig, anim, n_frames


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="dataset/train_pass.mp4",
                    help="output file (.mp4 or .gif)")
    ap.add_argument("--show", action="store_true", help="show a live window instead")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--speedup", type=float, default=1.0, help="playback speed factor")
    ap.add_argument("--seconds", type=float, default=None, help="only the first N sim seconds")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    if not args.show:
        matplotlib.use("Agg")
    tp = simulate(seed=args.seed)
    fig, anim, n_frames = build_animation(tp, args.fps, args.speedup, args.seconds)

    if args.show:
        import matplotlib.pyplot as plt
        plt.show()
        return

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    print(f"rendering {n_frames} frames -> {out} ...")
    progress = lambda i, n: print(f"\r  frame {i + 1}/{n}", end="", flush=True)
    if out.suffix.lower() == ".gif":
        from matplotlib.animation import PillowWriter
        anim.save(out, writer=PillowWriter(fps=args.fps), progress_callback=progress)
    else:
        import imageio_ffmpeg
        from matplotlib.animation import FFMpegWriter
        matplotlib.rcParams["animation.ffmpeg_path"] = imageio_ffmpeg.get_ffmpeg_exe()
        anim.save(out, writer=FFMpegWriter(fps=args.fps, bitrate=3000),
                  dpi=120, progress_callback=progress)
    print(f"\nsaved {out.resolve()}")


if __name__ == "__main__":
    main()
