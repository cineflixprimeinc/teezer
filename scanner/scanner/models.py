from pydantic import BaseModel
from typing import Optional


class ImageScanRequest(BaseModel):
    content_id: int
    content_type: str
    download_url: Optional[str] = None
    file_path: Optional[str] = None


class VideoScanRequest(BaseModel):
    content_id: int
    content_type: str
    download_url: Optional[str] = None
    file_path: Optional[str] = None
    duration: Optional[int] = None
    is_suspicious: bool = False
    full_scan: bool = False


class ScanResult(BaseModel):
    content_id: int
    content_type: str
    nudity_detected: bool
    nudity_score: float
    nsfw_score: float
    detected_labels: list[str]
    scanned_frames_count: int
    highest_risk_timestamp: Optional[float] = None
    decision: str
    reason: str
    model_name: str
    model_version: str
    scanned_at: str


class HealthResponse(BaseModel):
    status: str
    models_loaded: bool
    nudenet_loaded: bool
    nsfw_loaded: bool
