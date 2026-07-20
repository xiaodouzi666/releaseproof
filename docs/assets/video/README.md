# ReleaseProof demo video

The public [2:42 dynamic demo](https://youtu.be/QkooIqjEFiY) is a real browser interaction with the ReleaseProof app. It selects a preset, starts a workflow, reviews the Requested-to-Effective minimization receipt, approves the exact manifest, observes release verification, opens audit evidence, demonstrates a hard deny, recalls the released share, verifies rollback, and opens the architecture view.

All recipients, datasets, agreements, and share state in the recording are synthetic. The video visibly labels the run **Recorded Demo** and does not claim a successful live-Qwen invocation.

## Rebuild the dynamic demo

The dynamic build reuses the reviewed narration, cached English voice tracks, and procedural soundtrack from `scripts/generate-demo-video.py`. Start a local production build in recorded-demo mode:

~~~powershell
pnpm build
$env:PORT = "8791"
$env:DASHSCOPE_API_KEY = ""
pnpm start
~~~

In a second terminal, capture and assemble the real interaction:

~~~powershell
node scripts/capture-dynamic-demo.mjs http://127.0.0.1:8791
python scripts/generate-dynamic-demo-video.py
~~~

The capture script drives headless Chrome and writes timestamped frames plus a manifest under `dynamic-frames/`. Set `CHROME_PATH` if Chrome is not installed at its default Windows location. The generator refuses to export unless the manifest proves a verified release, verified recall, hard-deny state, complete frame counts, and a total duration below three minutes.

Generated frames, QA captures, build intermediates, and `releaseproof-demo-dynamic.mp4` are intentionally ignored by Git. The upload chapters remain reviewable in [`dynamic-chapters.txt`](dynamic-chapters.txt).

## Baseline assets

`releaseproof-demo.mp4` is the earlier tracked baseline edit. Its checked-in narration, source frames, and voice cache remain inputs to the reproducible dynamic generator. The project-local encoder can be installed with:

~~~powershell
python -m pip install --target .tools/video imageio-ffmpeg==0.6.0
~~~

The quiet music bed is synthesized by the generator from simple tones and contains no third-party recording. The YouTube title, disclosure, description, and upload checklist live in [`../../youtube-description.md`](../../youtube-description.md).
