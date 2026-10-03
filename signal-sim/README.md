# Bogie signal simulator

Synthetic two-channel track-sensor signals of train bogies passing over a
detection point, with and without a magnetic track brake (MTB). Includes a
dataset builder for machine-learning experiments and an animated simulation of
a whole train pass.

Demo video: [media/train_pass.mp4](media/train_pass.mp4)

## Setup

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
```

## Scripts

| Script | What it does |
|---|---|
| `Bogie_generator.py` | Renders the two-channel signal of a single bogie from a parameter set. |
| `bogie_dataset.py` | Builds a paired dataset (MTB / no MTB) of random bogies into `dataset/`: per-sample parquet files, a manifest and a shuffled continuous stream. |
| `train_sim.py` | Simulates a whole train in metres (cars, bogies, speed profile, sensor noise) and writes `dataset/train_pass.parquet` with ground-truth labels. |
| `animate_train.py` | Animates the train rolling over the sensors with a live scrolling scope, and records it to MP4 or GIF. |
| `parquet_to_image.py` | Plots any parquet sample (or a folder of them) to PNG. |

## Quick start

```bash
python bogie_dataset.py                   # build the dataset
python parquet_to_image.py dataset/files  # plot every sample
python animate_train.py                   # record dataset/train_pass.mp4
python animate_train.py --show            # or watch it live
```

All signals are synthetic and all parameters are illustrative.
