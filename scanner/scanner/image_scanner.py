import os
import logging
import tempfile
from datetime import datetime, timezone
from typing import Optional

import requests
from PIL import Image

from scanner.models import ImageScanRequest, ScanResult
from scanner.security import validate_download_url, validate_file_path

logger = logging.getLogger(__name__)

# NudeNet v3 label sets
EXPLICIT_HIGH_RISK = {
    "FEMALE_BREAST_EXPOSED",
    "FEMALE_GENITALIA_EXPOSED",
    "MALE_GENITALIA_EXPOSED",
    "ANUS_EXPOSED",
}

EXPLICIT_LABELS = EXPLICIT_HIGH_RISK | {
    "BUTTOCKS_EXPOSED",
    "FEMALE_BREAST_COVERED",
    "MALE_BREAST_EXPOSED",
    "ARMPITS_EXPOSED",
}

MODEL_NAME = "NudeNet+OpenNSFW2"
MODEL_VERSION = "3.4+0.10"

DOWNLOAD_TIMEOUT = 30


class ImageScanner:
    def __init__(self):
        self._nude_detector = None
        self._nsfw_model = None
        self.nudenet_loaded = False
        self.nsfw_loaded = False

    @property
    def models_loaded(self) -> bool:
        return self.nudenet_loaded

    def load(self):
        self._load_nudenet()
        self._load_nsfw()

    def _load_nudenet(self):
        try:
            from nudenet import NudeDetector
            self._nude_detector = NudeDetector()
            self.nudenet_loaded = True
            logger.info("NudeNet loaded.")
        except Exception as exc:
            logger.error(f"NudeNet load failed: {exc}")

    def _load_nsfw(self):
        try:
            import opennsfw2 as n2
            self._nsfw_model = n2.make_open_nsfw_model()
            self.nsfw_loaded = True
            logger.info("OpenNSFW2 loaded.")
        except Exception as exc:
            logger.warning(f"OpenNSFW2 unavailable (optional): {exc}")

    # ── Public scan API ────────────────────────────────────────────────

    def scan(self, req: ImageScanRequest, frame_timestamp: Optional[float] = None) -> ScanResult:
        """Download (if URL) and scan an image. Temp files are cleaned up automatically."""
        file_path, temp_created = self._resolve_file(req.download_url, req.file_path)
        try:
            return self._scan_file(req, file_path, frame_timestamp)
        finally:
            if temp_created and file_path and os.path.exists(file_path):
                try:
                    os.unlink(file_path)
                except OSError:
                    pass

    def scan_file_path(
        self,
        content_id: int,
        content_type: str,
        file_path: str,
        frame_timestamp: Optional[float] = None,
    ) -> ScanResult:
        """Scan an already-on-disk file (used by VideoScanner for extracted frames)."""
        req = ImageScanRequest(content_id=content_id, content_type=content_type, file_path=file_path)
        return self._scan_file(req, file_path, frame_timestamp)

    # ── Decision helper (also used by VideoScanner aggregator) ────────

    def make_decision(
        self, nudity_score: float, nsfw_score: float, labels: list[str]
    ) -> tuple[str, str]:
        nr = float(os.getenv("NUDITY_REJECT_THRESHOLD", "0.85"))
        np_ = float(os.getenv("NUDITY_PENDING_THRESHOLD", "0.65"))
        nsfw_r = float(os.getenv("NSFW_REJECT_THRESHOLD", "0.85"))
        nsfw_p = float(os.getenv("NSFW_PENDING_THRESHOLD", "0.65"))

        if nudity_score >= nr:
            return "rejected", f"High-confidence nudity detected (nudity_score={nudity_score:.3f})"
        if nsfw_score >= nsfw_r:
            return "rejected", f"High NSFW score (nsfw_score={nsfw_score:.3f})"
        if nudity_score >= np_ or nsfw_score >= nsfw_p:
            return (
                "pending_review",
                f"Content flagged for manual review (nudity={nudity_score:.3f}, nsfw={nsfw_score:.3f})",
            )
        return "approved", "Content passed automated safety checks"

    # ── Internal helpers ───────────────────────────────────────────────

    def _scan_file(
        self, req: ImageScanRequest, file_path: str, frame_timestamp: Optional[float]
    ) -> ScanResult:
        nudity_score = 0.0
        nsfw_score = 0.0
        detected_labels: list[str] = []
        nudity_detected = False

        if self.nudenet_loaded:
            nudity_score, detected_labels = self._run_nudenet(file_path)
            nudity_detected = nudity_score >= 0.5 or bool(detected_labels)

        if self.nsfw_loaded:
            nsfw_score = self._run_nsfw(file_path)

        risk = max(nudity_score, nsfw_score)
        decision, reason = self.make_decision(nudity_score, nsfw_score, detected_labels)

        return ScanResult(
            content_id=req.content_id,
            content_type=req.content_type,
            nudity_detected=nudity_detected,
            nudity_score=round(nudity_score, 4),
            nsfw_score=round(nsfw_score, 4),
            detected_labels=detected_labels,
            scanned_frames_count=1,
            highest_risk_timestamp=frame_timestamp if risk >= 0.5 else None,
            decision=decision,
            reason=reason,
            model_name=MODEL_NAME,
            model_version=MODEL_VERSION,
            scanned_at=datetime.now(timezone.utc).isoformat(),
        )

    def _run_nudenet(self, file_path: str) -> tuple[float, list[str]]:
        try:
            detections = self._nude_detector.detect(file_path)
            if not detections:
                return 0.0, []

            max_score = 0.0
            labels: list[str] = []

            for det in detections:
                label = det.get("class", "")
                score = float(det.get("score", 0))
                if label in EXPLICIT_LABELS and score >= 0.35:
                    labels.append(f"{label}:{score:.2f}")
                    weight = 1.0 if label in EXPLICIT_HIGH_RISK else 0.65
                    max_score = max(max_score, score * weight)

            return min(1.0, max_score), labels
        except Exception as exc:
            logger.error(f"NudeNet scan error: {exc}")
            return 0.0, []

    def _run_nsfw(self, file_path: str) -> float:
        try:
            import opennsfw2 as n2
            import numpy as np

            img = Image.open(file_path).convert("RGB")
            arr = n2.preprocess_image(img, n2.Preprocessing.YAHOO)
            prob = float(self._nsfw_model.predict(np.expand_dims(arr, 0))[0][1])
            return round(prob, 4)
        except Exception as exc:
            logger.error(f"OpenNSFW2 scan error: {exc}")
            return 0.0

    def _resolve_file(
        self, download_url: Optional[str], file_path: Optional[str]
    ) -> tuple[str, bool]:
        if file_path and os.path.exists(file_path):
            validate_file_path(file_path)
            return file_path, False
        if download_url:
            return self._download(download_url)
        raise ValueError("Either download_url or file_path is required")

    def _download(self, url: str) -> tuple[str, bool]:
        validate_download_url(url)
        suffix = ".jpg"
        for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm", ".mov"):
            if ext in url.lower().split("?")[0]:
                suffix = ext
                break

        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        try:
            resp = requests.get(url, timeout=DOWNLOAD_TIMEOUT, stream=True)
            resp.raise_for_status()
            for chunk in resp.iter_content(chunk_size=8192):
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
