#!/usr/bin/env python3
"""Assemble the real-interaction ReleaseProof browser capture into a <3m demo.

The reviewed narration, voice cache, and procedural soundtrack are reused from
``generate-demo-video.py``. Only the visual layer changes: each scene is built
from frames captured from the working application by ``capture-dynamic-demo.mjs``.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
VIDEO_ROOT = ROOT / "docs" / "assets" / "video"
FRAME_ROOT = VIDEO_ROOT / "dynamic-frames"
WORK_ROOT = VIDEO_ROOT / ".dynamic-build"
WIDTH, HEIGHT, SCREEN_HEIGHT, SCREEN_TOP, FPS = 1920, 1080, 900, 64, 30


def load_baseline_module():
    source = ROOT / "scripts" / "generate-demo-video.py"
    spec = importlib.util.spec_from_file_location("releaseproof_baseline_video", source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {source}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


baseline = load_baseline_module()


def overlay_for(scene, number: int, output: Path) -> None:
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    accent = "#ff806d" if scene.accent == "danger" else "#8cff67"
    cyan = "#62f1dc"
    white = "#f3fff9"
    muted = "#9ab3aa"

    draw.rectangle((0, 0, WIDTH, SCREEN_TOP), fill="#03110d")
    draw.rectangle((0, 0, WIDTH, 6), fill=accent)
    draw.text((30, 19), f"{number:02d}  {scene.kicker}", fill=cyan, font=baseline.font(20, bold=True, mono=True))
    title = scene.title
    title_width = draw.textlength(title, font=baseline.font(26, bold=True))
    draw.text(((WIDTH - title_width) / 2, 14), title, fill=white, font=baseline.font(26, bold=True))
    # ASCII-only separator avoids font/encoding drift in last-mile encoders.
    badge = "REAL APP INTERACTION  -  SYNTHETIC SANDBOX"
    badge_width = draw.textlength(badge, font=baseline.font(16, bold=True, mono=True))
    draw.rounded_rectangle((WIDTH - badge_width - 48, 13, WIDTH - 22, 50), radius=12, fill="#0b291f", outline="#2c5d4c", width=1)
    draw.text((WIDTH - badge_width - 35, 23), badge, fill="#d9f7e9", font=baseline.font(16, bold=True, mono=True))

    bottom = SCREEN_TOP + SCREEN_HEIGHT
    draw.rectangle((0, bottom, WIDTH, HEIGHT), fill="#03110d")
    draw.rectangle((0, bottom, WIDTH, bottom + 2), fill="#275344")
    draw.text((30, bottom + 15), "ENGLISH CAPTIONS", fill=cyan, font=baseline.font(16, bold=True, mono=True))
    caption_y = bottom + 40
    for line in baseline.wrapped(scene.narration, 135):
        draw.text((30, caption_y), line, fill=white, font=baseline.font(25))
        caption_y += 30
    draw.text((1690, HEIGHT - 30), "releaseproof", fill=muted, font=baseline.font(17, bold=True, mono=True))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


def build(output: Path, keep_work: bool = False) -> None:
    manifest_path = FRAME_ROOT / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Missing {manifest_path}; run scripts/capture-dynamic-demo.mjs first")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("minimizedFinalStatus") != "rolled_back":
        raise SystemExit("Capture manifest does not prove the minimized release was recalled")
    if not manifest.get("minimizedReleaseVerified") or not manifest.get("minimizedRecallVerified"):
        raise SystemExit("Capture manifest lacks verified release/recall evidence")
    if manifest.get("deniedFinalStatus") != "denied":
        raise SystemExit("Capture manifest lacks the required hard-deny state")

    ffmpeg = baseline.ffmpeg_executable()
    if WORK_ROOT.exists():
        shutil.rmtree(WORK_ROOT)
    WORK_ROOT.mkdir(parents=True)

    scene_videos: list[Path] = []
    durations: list[float] = []
    capture_fps = int(manifest["captureFps"])
    manifest_scenes = {item["slug"]: item for item in manifest["scenes"]}

    for number, scene in enumerate(baseline.SCENES, start=1):
        source = manifest_scenes.get(scene.slug)
        if not source:
            raise SystemExit(f"Capture manifest is missing {scene.slug}")
        frame_directory = FRAME_ROOT / scene.slug
        actual_frames = len(list(frame_directory.glob("frame-*.jpg")))
        if actual_frames != int(source["frames"]):
            raise SystemExit(f"{scene.slug}: expected {source['frames']} frames, found {actual_frames}")
        voice = VIDEO_ROOT / "voice" / f"{scene.slug}.wav"
        duration = baseline.wav_duration(voice) + 1.25
        captured_duration = actual_frames / capture_fps
        if captured_duration + 0.05 < duration:
            raise SystemExit(f"{scene.slug}: captured {captured_duration:.2f}s for a {duration:.2f}s scene")

        annotation = WORK_ROOT / f"{scene.slug}-overlay.png"
        video = WORK_ROOT / f"{scene.slug}.mp4"
        overlay_for(scene, number, annotation)
        baseline.run([
            ffmpeg, "-y",
            "-framerate", str(capture_fps), "-i", frame_directory / "frame-%05d.jpg",
            "-loop", "1", "-i", annotation,
            "-i", voice,
            "-filter_complex",
            (
                f"[0:v]scale={WIDTH}:{SCREEN_HEIGHT}:flags=lanczos,fps={FPS}[screen];"
                f"color=c=#03110d:s={WIDTH}x{HEIGHT}:r={FPS}[bg];"
                f"[bg][screen]overlay=0:{SCREEN_TOP}[base];"
                "[base][1:v]overlay=0:0:shortest=1[v];"
                "[2:a]apad=pad_dur=2[a]"
            ),
            "-map", "[v]", "-map", "[a]", "-t", f"{duration:.3f}", "-r", str(FPS),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-ar", str(baseline.SAMPLE_RATE), video,
        ])
        scene_videos.append(video)
        durations.append(duration)

    total = sum(durations)
    if total >= 179:
        raise SystemExit(f"Refusing to export {total:.2f}s; the demo must remain below 180s")

    concat_file = WORK_ROOT / "concat.txt"
    concat_file.write_text("\n".join(f"file '{item.as_posix()}'" for item in scene_videos) + "\n", encoding="utf-8")
    voice_cut = WORK_ROOT / "voice-cut.mp4"
    baseline.run([ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", concat_file, "-c", "copy", voice_cut])
    music = WORK_ROOT / "procedural-ambient.wav"
    baseline.procedural_music(total + 1, music)

    output.parent.mkdir(parents=True, exist_ok=True)
    baseline.run([
        ffmpeg, "-y", "-i", voice_cut, "-i", music,
        "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:weights='1 0.55':normalize=0[a]",
        "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        "-metadata", "title=ReleaseProof Dynamic Product Demo",
        "-metadata", "comment=Real ReleaseProof UI interaction; synthetic product data; Recorded Demo model fixtures",
        output,
    ])
    baseline.write_chapters(VIDEO_ROOT / "dynamic-chapters.txt", durations)
    print(f"OUTPUT={output}")
    print(f"DURATION_SECONDS={total:.3f}")
    print(f"RESOLUTION={WIDTH}x{HEIGHT}")
    print(f"FPS={FPS}")
    print(f"CAPTURE_MANIFEST={manifest_path}")
    if not keep_work:
        shutil.rmtree(WORK_ROOT)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=VIDEO_ROOT / "releaseproof-demo-dynamic.mp4")
    parser.add_argument("--keep-work", action="store_true")
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else ROOT / args.output
    build(output, keep_work=args.keep_work)


if __name__ == "__main__":
    main()
