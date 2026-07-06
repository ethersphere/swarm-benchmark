# swarm-benchmark

Reproducible, ad-hoc measurement tools for Swarm **download bandwidth** and **BZZ cost**.

We currently guesstimate both download speed and BZZ cost, with empirical evidence
putting cost anywhere from `500 MB / 1 BZZ` to `2 GB / 1 BZZ`. Bee's per-chunk
retrieval price is `(32 − PO) × 10000 × 100000 PLUR`, which is hard to translate
into real-world MB/BZZ. This CLI generates randomized datasets, uploads them,
downloads them while sampling the chequebook and per-file progress over time, and
reports the result as a chart plus derived stats (MB/s, MB/BZZ).

## Why two nodes

Cheques (the BZZ cost) are only issued when the downloading node fetches chunks
from **other peers** over SWAP. If you upload and download on the same node, the
chunks are already local and retrieval is free — you'd measure zero cost. Upload
to node A (`--bee-url` / `BEE_UPLOAD_URL`) and download from node B
(`--bee-url` / `BEE_DOWNLOAD_URL`) so chunks cross the network.

## Measuring cost

Two things make download cost read as **zero** unless you're deliberate:

1. **Payment threshold** — Bee only issues a cheque once per-peer debt crosses a
   threshold, so small downloads show no cheque. The tool also samples SWAP
   **accounting debt** (`/balances`) to catch sub-threshold cost.
2. **Full replication** — on a small mesh (e.g. bee-factory, `storageRadius=0`)
   every node stores every chunk, so a normal upload-then-download reads from the
   download node's own store for free. Use **`measure`**: it deferred-uploads and
   immediately downloads from another node in one process, so retrieval happens
   over the network before the chunks replicate. Use distinct upload/download
   nodes.

## Install

```bash
npm install
npm run build      # compiles to dist/, exposes the `swarm-bench` bin
cp .env.example .env   # set BEE_UPLOAD_URL, BEE_DOWNLOAD_URL, SWARM_BATCH_ID
```

Run without building via `npm run dev -- <command>` (uses `tsx`), or the built
binary `node dist/cli.js <command>` / `swarm-bench <command>`.

## Commands

### `generate <type>`
Create a randomized local dataset. Bytes are cryptographically random so every
4 KB Bee chunk is unique (defeats dedup/caching).

```bash
swarm-bench generate music-album -n 100          # 100 × 5 MB  (~500 MB)
swarm-bench generate website     -n 50           # 50  × 100 KB–2 MB (randomized)
swarm-bench generate large-file  -n 1            # 1   × 1 GB
```
Options: `-n/--count`, `-o/--out-dir` (default `datasets/<type>`). Writes the
files plus a `dataset.json`.

### `upload`
Stream a dataset to the upload node and write a reference manifest.

```bash
swarm-bench upload -i datasets/music-album --batch-id $SWARM_BATCH_ID -o album.manifest.json
```
Options: `--bee-url` (default `BEE_UPLOAD_URL`), `--batch-id` (default
`SWARM_BATCH_ID`), `-o/--out`, `--deferred` (default off → data is pushed to the
network before returning).

### `serial-download` / `burst-download`
Download the manifest's references — one at a time, or all in parallel — while
sampling chequebook balance/cheques and per-file progress. Waits a settle window
after the last download to capture late cheques.

```bash
swarm-bench serial-download -i album.manifest.json -o album-single.json
swarm-bench burst-download  -i album.manifest.json -o album-burst.json
```
Options: `--bee-url` (default `BEE_DOWNLOAD_URL`), `-o/--out` (`.json` or `.csv`),
`--sample-interval` (seconds, default 1), `--settle` (seconds, default 60).

### `measure`
One-shot cost measurement in a single process: **deferred-upload** a dataset to
one node, then **immediately download** it from another. Deferred upload keeps
the data on the upload node; downloading right away from a different node forces
retrieval over the network (incurring cheques / accounting debt) before pull-sync
replicates the chunks to the download node. This is the reliable way to see real
cost on a small, fully-replicating mesh (see *Measuring cost*, below).

```bash
swarm-bench generate music-album -n 24 -o datasets/album
swarm-bench measure -i datasets/album \
  --upload-bee-url http://localhost:1633 \
  --download-bee-url http://localhost:1641 \
  --batch-id $SWARM_BATCH_ID -o album.json -r album.png
```
Options: `--upload-bee-url` (default `BEE_UPLOAD_URL`), `--download-bee-url`
(default `BEE_DOWNLOAD_URL`), `--batch-id`, `--mode serial|burst` (default
`burst`), `-o/--out`, `-r/--report <png>`, `--sample-interval` (default 0.5),
`--settle` (default 60).

### `report`
Render a PNG (progress + chequebook over time) and print stats (MB/s, BZZ spent,
MB/BZZ).

```bash
swarm-bench report -i album-single.json -o album-single.png
```

## End-to-end example

```bash
swarm-bench generate music-album -n 100 -o datasets/album
swarm-bench upload -i datasets/album --batch-id $SWARM_BATCH_ID -o album.manifest.json
swarm-bench serial-download -i album.manifest.json -o album-single.json
swarm-bench report -i album-single.json -o album-single.png
```

## Records format (`.json`)

```jsonc
{
  "mode": "serial",
  "startedAt": "…", "finishedAt": "…",
  "downloadBeeUrl": "…", "sampleIntervalMs": 1000, "settleMs": 60000,
  "chequebookEnabled": true,
  "files": [
    { "name": "track-0000.bin", "reference": "…", "size": 5242880,
      "startedAt": "…", "finishedAt": "…", "durationMs": 1234,
      "bytesDownloaded": 5242880, "error": null }
  ],
  "progressSamples":  [ { "tMs": 0, "timestamp": "…", "totalBytes": 0, "perFile": {} } ],
  "chequebookSamples":[ { "tMs": 0, "timestamp": "…",
      "availableBalancePlur": "…", "totalBalancePlur": "…",
      "totalChequesValuePlur": "…", "chequeCount": 0 } ],
  "balanceSamples":   [ { "tMs": 0, "timestamp": "…",
      "netBalancePlur": "…", "owedToPeersPlur": "…",
      "owedByPeersPlur": "…", "peerCount": 4 } ]
}
```

### Two cost signals

Bee only **issues a cheque once per-peer debt crosses the payment threshold**, so
for small downloads `chequebookSamples` read zero. `balanceSamples` capture the
SWAP **accounting debt** (`/balances`), which rises immediately with retrieval —
the sensitive, sub-threshold cost signal. `report` uses the cheque delta when
present, otherwise the accounting-debt delta, for MB/BZZ.

> Note: if the download node already stores the chunks (likely in a small mesh,
> or when it's in the chunks' neighborhood), retrieval is local and free — you'll
> see zero debt. Download from a node **outside** the chunks' neighborhood.

`.csv` output merges the time series into one row per sample (per-file detail and
the file table are JSON-only, so `report` requires the `.json` records).
