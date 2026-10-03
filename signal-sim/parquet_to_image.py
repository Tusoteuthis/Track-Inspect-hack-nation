"""
Render bogie-signature parquet samples as PNG images.

Each sample file (dataset/files/sample_XXXXX_{mtb,nomtb}.parquet) holds the
columns Time, Sys1, Sys2, t_ms. Both channels are plotted against t_ms on one
figure and saved as a PNG.

Usage
-----
    python parquet_to_image.py                                   # default example file
    python parquet_to_image.py dataset/files/sample_00000_mtb.parquet
    python parquet_to_image.py dataset/stream.parquet
    python parquet_to_image.py dataset/files                     # every sample in the folder
    python parquet_to_image.py dataset/files --out images --bare  # axis-free images (e.g. for a CNN)
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # file output only, no window
import matplotlib.pyplot as plt
import pandas as pd

DEFAULT_INPUT = "dataset/files/sample_00000_mtb.parquet"
DEFAULT_OUT_DIR = "dataset/images"
DPI = 150


def render(parquet_path: Path, png_path: Path, bare: bool = False) -> None:
    df = pd.read_parquet(parquet_path)
    x = df["t_ms"] if "t_ms" in df else range(len(df))

    fig, ax = plt.subplots(figsize=(12, 4))
    ax.plot(x, df["Sys1"], label="Sys1", linewidth=1.0, color="tab:blue")
    ax.plot(x, df["Sys2"], label="Sys2", linewidth=1.0, color="tab:orange")

    if bare:
        ax.set_axis_off()
        ax.margins(x=0)
        fig.savefig(png_path, dpi=DPI, bbox_inches="tight", pad_inches=0)
    else:
        ax.set_xlabel("time [ms]")
        ax.set_ylabel("signal")
        ax.set_title(parquet_path.stem)
        ax.grid(alpha=0.3)
        ax.legend(loc="lower right")
        fig.tight_layout()
        fig.savefig(png_path, dpi=DPI)

    plt.close(fig)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", nargs="?", default=DEFAULT_INPUT,
                    help="a .parquet file or a folder of them")
    ap.add_argument("--out", default=DEFAULT_OUT_DIR, help="output folder for PNGs")
    ap.add_argument("--bare", action="store_true",
                    help="no axes, labels or legend -- just the traces")
    args = ap.parse_args()

    src = Path(args.input)
    files = sorted(src.glob("*.parquet")) if src.is_dir() else [src]
    if not files:
        raise SystemExit(f"no .parquet files found at {src}")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    for f in files:
        png = out / f"{f.stem}.png"
        render(f, png, bare=args.bare)
    print(f"{len(files)} image(s) written to {out.resolve()}")


if __name__ == "__main__":
    main()
