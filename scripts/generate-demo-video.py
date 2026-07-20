#!/usr/bin/env python3
"""Generate the upload-ready ReleaseProof demo video from replaceable product frames.

The build is deliberately deterministic and offline after the project-local FFmpeg
runtime is installed. Replace any source image at the documented path and rerun to
produce an updated edit without touching the narration or timing code.
"""

from __future__ import annotations

import argparse
import math
import os
import shutil
import subprocess
import sys
import textwrap
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = ROOT / "docs" / "assets" / "video"
FRAME_ROOT = OUTPUT_ROOT / "frames"
VOICE_ROOT = OUTPUT_ROOT / "voice"
TOOLS_ROOT = ROOT / ".tools" / "video"
WIDTH, HEIGHT, FPS = 1920, 1080, 30
SAMPLE_RATE = 48_000


@dataclass(frozen=True)
class Scene:
    slug: str
    kicker: str
    title: str
    narration: str
    bullets: tuple[str, ...]
    image_candidates: tuple[Path, ...]
    accent: str = "mint"


SCENES = (
    Scene(
        "01-hook",
        "PROOF-CARRYING DATA RELEASE AUTOPILOT",
        "Every dataset release needs a recall path.",
        "Publishing a dataset is easy. The hard questions are what left, to whom, for what purpose, until when, and whether you can call it back. ReleaseProof makes every temporary release carry its own proof and recall path.",
        ("Synthetic data only", "Recorded Demo mode is visibly disclosed"),
        (FRAME_ROOT / "01-hero.png", ROOT / "public" / "screenshots" / "release-room.png"),
    ),
    Scene(
        "02-interpret",
        "STEP 01  /  INTERPRET",
        "A messy brief becomes a typed intent.",
        "Qwen turns the request into a typed release intent and proposes only read-only context queries. The server validates and rebinds those calls before dispatch. In this baseline recording, deterministic fixtures are clearly labeled; no live-model result is claimed.",
        ("Recipient, dataset, purpose, requested fields, TTL", "Read-only evidence plan", "Model prose never becomes authority"),
        (FRAME_ROOT / "02-intake.png", ROOT / "public" / "samples" / "access-request-ticket.png"),
    ),
    Scene(
        "03-minimize",
        "STEP 02  /  MINIMIZE",
        "Raw request in. Smallest safe manifest out.",
        "Northstar asks for raw records, direct identifiers, consent override, and seventy-two hours. Deterministic policy removes email, phone, raw export, and override; it keeps only aggregate and profile reads and caps this confidential release at eight hours.",
        ("Removed: email, phone, raw export, consent override", "Allowed: aggregate.read, profile.read", "TTL: 72 hours requested -> 8 hours effective"),
        (ROOT / "public" / "screenshots" / "release-room.png", FRAME_ROOT / "02-intake.png"),
    ),
    Scene(
        "04-authorize",
        "STEP 03  /  AUTHORIZE",
        "The owner approves the exact effective manifest.",
        "The data owner reviews the bound recipient, dataset, fields, tier, and expiry, not the vague original request. A stable idempotency key creates one sandbox share. Completion appears only after a read-back matches the approved manifest and unique share identity.",
        ("Named owner checkpoint", "Idempotent sandbox clean-room write", "Read-after-release verification"),
        (ROOT / "public" / "architecture.png", ROOT / "public" / "screenshots" / "release-room.png"),
    ),
    Scene(
        "05-proof",
        "STEP 04  /  PROVE",
        "A proof packet, not a chat transcript.",
        "The audit joins grounded evidence, deterministic findings, owner consent, the write receipt, and observed state. Every event commits to the previous hash, so deletion, insertion, or reordering is detectable. The proof follows the release through its lifecycle.",
        ("Grounded evidence", "Policy + approval + write receipt", "Hash-linked observed state"),
        (ROOT / "public" / "architecture.png", ROOT / "public" / "devpost-thumbnail-3x2.png"),
    ),
    Scene(
        "06-deny",
        "FAIL CLOSED",
        "Unverified vendor. No approval. No write path.",
        "A second request says to ignore vendor onboarding because the work is urgent. The recipient is unverified, so deterministic policy denies it. Embedded instructions remain untrusted data, and no owner approval or release execution path exists after the hard deny.",
        ("recipient.unverified", "Policy outcome: DENY", "share.grant is unreachable"),
        (FRAME_ROOT / "02-intake.png", ROOT / "public" / "samples" / "access-request-ticket.png"),
        accent="danger",
    ),
    Scene(
        "07-recall",
        "VERIFIED RECALL",
        "Expiry is not enough.",
        "The owner can recall the exact sandbox share immediately. ReleaseProof reports success only after the system observes that share inactive or absent. Recall blocks future synthetic access; it does not claim to erase a copy a recipient may already have made.",
        ("Recall the exact share identity", "Verify inactive or absent", "Never claim retroactive deletion"),
        (ROOT / "public" / "screenshots" / "release-room.png", ROOT / "public" / "architecture.png"),
    ),
    Scene(
        "08-close",
        "RELEASEPROOF",
        "Interpret with Qwen. Authorize with policy and people. Prove with reality.",
        "ReleaseProof packages the web app and API as one Alibaba-ready container: Qwen integration for interpretation, deterministic code for authority, a human for consent, and verification for truth. Every dataset release needs a recall path.",
        ("16 / 16 safety evaluations", "Alibaba-ready single container", "MIT licensed public source"),
        (ROOT / "public" / "architecture.png", ROOT / "public" / "devpost-thumbnail.png"),
    ),
)


def ffmpeg_executable() -> Path:
    sys.path.insert(0, str(TOOLS_ROOT))
    try:
        import imageio_ffmpeg  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "FFmpeg runtime missing. Run: python -m pip install --target .tools/video imageio-ffmpeg==0.6.0"
        ) from exc
    return Path(imageio_ffmpeg.get_ffmpeg_exe())


def font(size: int, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    fonts = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    filename = "consolab.ttf" if mono and bold else "consola.ttf" if mono else "seguisb.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(fonts / filename), size=size)


def first_existing(candidates: tuple[Path, ...]) -> Path:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("No scene image found: " + ", ".join(map(str, candidates)))


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    scale = max(size[0] / image.width, size[1] / image.height)
    resized = image.resize((math.ceil(image.width * scale), math.ceil(image.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 2
    return resized.crop((left, top, left + size[0], top + size[1]))


def wrapped(text: str, width: int) -> list[str]:
    return textwrap.wrap(text, width=width, break_long_words=False, break_on_hyphens=False)


def rounded_panel(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: str, outline: str | None = None, radius: int = 28) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=2 if outline else 1)


def make_slide(scene: Scene, scene_number: int, output: Path) -> None:
    background = Image.new("RGB", (WIDTH, HEIGHT), "#03110d")
    source = Image.open(first_existing(scene.image_candidates)).convert("RGB")
    source = cover(source, (1050, 750))
    source = ImageEnhance.Contrast(source).enhance(1.06)
    source = ImageEnhance.Color(source).enhance(0.9)
    source = source.filter(ImageFilter.GaussianBlur(radius=0.15))
    overlay = Image.new("RGBA", source.size, (2, 14, 11, 70))
    source = Image.alpha_composite(source.convert("RGBA"), overlay).convert("RGB")
    background.paste(source, (830, 58))

    draw = ImageDraw.Draw(background)
    accent = "#ff806d" if scene.accent == "danger" else "#8cff67"
    cyan = "#62f1dc"
    white = "#f3fff9"
    muted = "#9ab3aa"
    panel = "#071b15"
    border = "#193c31"

    draw.rectangle((0, 0, WIDTH, 10), fill=accent)
    draw.text((70, 55), f"{scene_number:02d}  {scene.kicker}", fill=cyan, font=font(24, bold=True, mono=True))

    y = 118
    for line in wrapped(scene.title, 27):
        draw.text((70, y), line, fill=white, font=font(58, bold=True))
        y += 68
    y += 30
    for bullet in scene.bullets:
        rounded_panel(draw, (70, y, 745, y + 78), panel, border, radius=20)
        draw.ellipse((94, y + 27, 110, y + 43), fill=accent)
        draw.text((132, y + 20), bullet, fill="#d8eee5", font=font(27, bold=False))
        y += 94

    rounded_panel(draw, (800, 32, 1900, 835), "#071812", border, radius=32)
    background.paste(source, (830, 58))
    draw.rounded_rectangle((830, 58, 1880, 808), radius=20, outline="#2a5d4d", width=2)

    if scene.accent == "danger":
        rounded_panel(draw, (1160, 690, 1815, 770), "#351611", "#ff806d", radius=18)
        draw.text((1205, 710), "HARD DENY  /  NO SHARE CREATED", fill="#ffd6ce", font=font(27, bold=True, mono=True))
    elif scene.slug == "03-minimize":
        rounded_panel(draw, (1150, 665, 1815, 770), "#0a2819", "#8cff67", radius=18)
        draw.text((1188, 686), "72h  ->  8h", fill="#b8ff9f", font=font(38, bold=True, mono=True))
        draw.text((1490, 694), "identifiers removed", fill="#d8eee5", font=font(24, bold=True))

    # Full narration remains on screen for the entire scene as an accurate English caption.
    rounded_panel(draw, (45, 850, 1875, 1050), "#061712", "#235143", radius=24)
    draw.text((75, 874), "ENGLISH CAPTIONS", fill=cyan, font=font(19, bold=True, mono=True))
    caption_y = 910
    for line in wrapped(scene.narration, 116):
        draw.text((75, caption_y), line, fill=white, font=font(28))
        caption_y += 34
    draw.text((1682, 1010), "releaseproof", fill=muted, font=font(20, bold=True, mono=True))
    output.parent.mkdir(parents=True, exist_ok=True)
    background.save(output, quality=96)


def synthesize_voice(text: str, output: Path) -> None:
    command = [
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(ROOT / "scripts" / "synthesize-demo-voice.ps1"),
        "-Text",
        text,
        "-OutputPath",
        str(output),
        "-Rate",
        "-1",
    ]
    subprocess.run(command, check=True, cwd=ROOT)


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as audio:
        return audio.getnframes() / audio.getframerate()


def run(command: list[str | Path]) -> None:
    subprocess.run([str(item) for item in command], check=True, cwd=ROOT)


def procedural_music(seconds: float, output: Path) -> None:
    """Create a quiet original ambient bed; no third-party recording is used."""
    count = int(seconds * SAMPLE_RATE)
    t = np.arange(count, dtype=np.float64) / SAMPLE_RATE
    slow = 0.5 + 0.5 * np.sin(2 * np.pi * t / 16.0)
    tones = (
        0.017 * np.sin(2 * np.pi * 110.0 * t)
        + 0.010 * np.sin(2 * np.pi * 164.81 * t)
        + 0.008 * np.sin(2 * np.pi * 220.0 * t)
    ) * (0.35 + 0.65 * slow)
    fade = np.minimum(np.minimum(t / 2.5, (seconds - t) / 3.0), 1.0).clip(0.0, 1.0)
    pcm = np.int16(np.clip(tones * fade, -1.0, 1.0) * 32767)
    with wave.open(str(output), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(SAMPLE_RATE)
        audio.writeframes(pcm.tobytes())


def write_chapters(path: Path, durations: list[float]) -> None:
    cursor = 0.0
    lines = ["ReleaseProof demo chapters", ""]
    for scene, duration in zip(SCENES, durations, strict=True):
        minutes = int(cursor // 60)
        seconds = int(cursor % 60)
        lines.append(f"{minutes}:{seconds:02d} {scene.title}")
        cursor += duration
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build(output: Path, keep_work: bool = False) -> None:
    ffmpeg = ffmpeg_executable()
    work = OUTPUT_ROOT / ".build"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    durations: list[float] = []
    scene_videos: list[Path] = []

    for index, scene in enumerate(SCENES, start=1):
        slide = work / f"{scene.slug}.png"
        voice = VOICE_ROOT / f"{scene.slug}.wav"
        video = work / f"{scene.slug}.mp4"
        make_slide(scene, index, slide)
        if not voice.exists():
            VOICE_ROOT.mkdir(parents=True, exist_ok=True)
            synthesize_voice(scene.narration, voice)
        duration = wav_duration(voice) + 1.25
        durations.append(duration)
        scene_videos.append(video)
        run([
            ffmpeg, "-y", "-loop", "1", "-framerate", str(FPS), "-i", slide,
            "-i", voice, "-t", f"{duration:.3f}",
            "-vf", f"scale={WIDTH}:{HEIGHT},format=yuv420p",
            "-af", "apad=pad_dur=2", "-r", str(FPS),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
            "-c:a", "aac", "-b:a", "160k", "-ar", str(SAMPLE_RATE), video,
        ])

    concat_file = work / "concat.txt"
    concat_file.write_text("\n".join(f"file '{path.as_posix()}'" for path in scene_videos) + "\n", encoding="utf-8")
    voice_cut = work / "voice-cut.mp4"
    run([ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", concat_file, "-c", "copy", voice_cut])

    total = sum(durations)
    if total >= 179.0:
        raise SystemExit(f"Refusing to export {total:.2f}s video; it must stay below 180s")
    music = work / "procedural-ambient.wav"
    procedural_music(total + 1.0, music)
    output.parent.mkdir(parents=True, exist_ok=True)
    run([
        ffmpeg, "-y", "-i", voice_cut, "-i", music,
        "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:weights='1 0.55':normalize=0[a]",
        "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", "-metadata", "title=ReleaseProof Demo", "-metadata", "comment=Procedural original soundtrack; synthetic product data only",
        output,
    ])
    write_chapters(OUTPUT_ROOT / "chapters.txt", durations)
    print(f"OUTPUT={output}")
    print(f"DURATION_SECONDS={total:.3f}")
    print(f"RESOLUTION={WIDTH}x{HEIGHT}")
    print(f"FPS={FPS}")
    if not keep_work:
        shutil.rmtree(work)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUTPUT_ROOT / "releaseproof-demo.mp4")
    parser.add_argument("--keep-work", action="store_true")
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else ROOT / args.output
    build(output, keep_work=args.keep_work)


if __name__ == "__main__":
    main()
