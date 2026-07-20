# ReleaseProof demo video

`releaseproof-demo.mp4` is the upload-ready, English-narrated 1080p baseline edit. It is generated from synthetic product data and visibly claims only **Recorded Demo** fixtures.

## Rebuild

~~~powershell
python scripts/generate-demo-video.py
~~~

The project-local encoder is installed once with:

~~~powershell
python -m pip install --target .tools/video imageio-ffmpeg==0.6.0
~~~

The edit is designed for last-minute evidence swaps. Replace either of these files and rerun the same command:

- `frames/01-hero.png` — opening/live deployment frame
- `frames/02-intake.png` — request/intake or live-Qwen receipt frame

If either optional frame is absent, the generator falls back to the checked-in product screenshot. Source selection, English narration, captions, timing, and claim language live in `scripts/generate-demo-video.py`.

The reviewed English narration is cached under `voice/`, so swapping screenshots does not depend on the machine's speech voices. Delete a cached WAV only when intentionally regenerating that scene's narration.

The quiet music bed is synthesized by the generator from simple tones; it contains no third-party recording. `chapters.txt` contains upload chapters. The YouTube title, description, and upload checklist live in [`../../youtube-description.md`](../../youtube-description.md).
