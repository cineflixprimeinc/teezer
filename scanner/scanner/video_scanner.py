import os
import shutil
import subprocess
import tempfile
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests

from scanner.models import VideoScanRequest, ScanResult
from scanner.image_scanner import ImageScanner, MODEL_NAME, MODEL_VERSION
from scanner.security import validate_download_url, validate_file_path

logger = logging.getLogger(__name__)

FFMPEG_TIMEOUT = 300
VIDEO_DOWNLOAD_TIMEOUT = 180


class VideoScanner:
    def __init__(self, image_scanner: ImageScanner):
        self._img = image_scanner

    def scan(self, req: VideoScanRequest) -> ScanResult:
        frame_interval, scan_duration = self._scan_params(req)

        video_path, video_temp = self._resolve_video(req.download_url, req.file_path)
        frames_dir: Optional[str] = None

        try:
            frames_dir = tempfile.mkdtemp(prefix="reelsoo_frames_")
            frames = self._extract_frames(video_path, frames_dir, frame_interval, scan_duration)

            if not frames:
                return self._empty_result(req, "No frames could be extracted from video")

            frame_results = []
            for frame_path, ts in frames:
                r = self._img.scan_file_path(req.content_id, req.content_type, frame_path, ts)
                frame_results.append((r, ts))

            return self._aggregate(req, frame_results)

        finally:
            if frames_dir and os.path.exists(frames_dir):
                shutil.rmtree(frames_dir, ignore_errors=True)
            if video_temp and video_path and os.path.exists(video_path):
                try:
                    os.unlink(video_path)
                except OSError:
                    pass

    # ── Parameter logic ────────────────────────────────────────────────

    def _scan_params(self, req: VideoScanRequest) -> tuple[int, Optional[int]]:
        default_interval = int(os.getenv("VIDEO_FRAME_INTERVAL", "2"))
        default_duration = int(os.getenv("VIDEO_SCAN_DURATION", "120"))
        full_interval = int(os.getenv("VIDEO_FULL_SCAN_FRAME_INTERVAL", "1"))

        if req.full_scan or req.is_suspicious:
            interval = full_interval
            duration = None  # scan entire video
        else:
            interval = default_interval
            duration = default_duration

        # Short video: always scan completely
        if req.duration and duration and req.duration <= duration:
            duration = None

        return interval, duration

    # ── FFmpeg frame extraction ────────────────────────────────────────

    def _extract_frames(
        self,
        video_path: str,
        out_dir: str,
        interval: int,
        duration: Optional[int],
    ) -> list[tuple[str, float]]:
        pattern = os.path.join(out_dir, "frame_%06d.jpg")
        cmd = ["ffmpeg", "-i", video_path]

        if duration:
            cmd += ["-t", str(duration)]

        cmd += [
            "-vf", f"fps=1/{interval}",
            "-q:v", "3",
            "-f", "image2",
            pattern,
            "-loglevel", "error",
        ]

        try:
            subprocess.run(cmd, timeout=FFMPEG_TIMEOUT, check=True, capture_output=True)
        except subprocess.TimeoutExpired:
            logger.error("FFmpeg timed out extracting frames")
            return []
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.decode(errors="ignore") if exc.stderr else ""
            logger.error(f"FFmpeg error: {stderr}")
            return []

        frames = sorted(Path(out_dir).glob("frame_*.jpg"))
        return [(str(f), float(i * interval)) for i, f in enumerate(frames)]

    # ── Result aggregation ─────────────────────────────────────────────

    def _aggregate(self, req: VideoScanRequest, frame_results: list) -> ScanResult:
        max_nudity = 0.0
        max_nsfw = 0.0
        highest_risk_ts: Optional[float] = None
        all_labels: set[str] = set()
        nudity_detected = False

        for result, ts in frame_results:
            if result.nudity_score > max_nudity:
                max_nudity = result.nudity_score
                if max_nudity >= 0.5:
                    highest_risk_ts = ts

            if result.nsfw_score > max_nsfw:
                max_nsfw = result.nsfw_score
                if max_nsfw >= 0.5 and highest_risk_ts is None:
                    highest_risk_ts = ts

            all_labels.update(result.detected_labels)
            if result.nudity_detected:
                nudity_detected = True

        labels = sorted(all_labels)
        decision, reason = self._img.make_decision(max_nudity, max_nsfw, labels)

        return ScanResult(
            content_id=req.content_id,
            content_type=req.content_type,
            nudity_detected=nudity_detected,
            nudity_score=round(max_nudity, 4),
            nsfw_score=round(max_nsfw, 4),
            detected_labels=labels,
            scanned_frames_count=len(frame_results),
            highest_risk_timestamp=highest_risk_ts,
            decision=decision,
            reason=reason,
            model_name=MODEL_NAME,
            model_version=MODEL_VERSION,
            scanned_at=datetime.now(timezone.utc).isoformat(),
        )

    def _empty_result(self, req: VideoScanRequest, reason: str) -> ScanResult:
        return ScanResult(
            content_id=req.content_id,
            content_type=req.content_type,
            nudity_detected=False,
            nudity_score=0.0,
            nsfw_score=0.0,
            detected_labels=[],
            scanned_frames_count=0,
            highest_risk_timestamp=None,
            decision="pending_review",
            reason=reason,
            model_name=MODEL_NAME,
            model_version=MODEL_VERSION,
            scanned_at=datetime.now(timezone.utc).isoformat(),
        )

    # ── Download helper ────────────────────────────────────────────────

    def _resolve_video(self, download_url: Optional[str], file_path: Optional[str]) -> tuple[str, bool]:
        if file_path and os.path.exists(file_path):
            validate_file_path(file_path)
            return file_path, False
        if download_url:
            return self._download_video(download_url)
        raise ValueError("Either download_url or file_path is required")

    def _download_video(self, url: str) -> tuple[str, bool]:
        validate_download_url(url)
        suffix = ".mp4"
        for ext in (".mp4", ".webm", ".mov", ".avi"):
            if ext in url.lower().split("?")[0]:
                suffix = ext
                break

        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        try:
            resp = requests.get(url, timeout=VIDEO_DOWNLOAD_TIMEOUT, stream=True)
            resp.raise_for_status()
            for chunk in resp.iter_content(chunk_size=65536):
                tmp.write(chunk)
            tmp.flush()
            return tmp.name, True
        except Exception:
            tmp.close()
            try:
                os.unlink(tmp.name)
            except OSError:
                pass
            raise
        finally:
            tmp.close()
