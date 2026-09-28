import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from scanner.image_scanner import ImageScanner
from scanner.models import (
    HealthResponse,
    ImageScanRequest,
    ScanResult,
    VideoScanRequest,
)
from scanner.video_scanner import VideoScanner

load_dotenv()

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO")),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

_image_scanner: ImageScanner | None = None
_video_scanner: VideoScanner | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _image_scanner, _video_scanner
    logger.info("Loading moderation models...")
    _image_scanner = ImageScanner()
    _image_scanner.load()
    _video_scanner = VideoScanner(_image_scanner)
    logger.info(
        "Ready. NudeNet=%s  OpenNSFW2=%s",
        _image_scanner.nudenet_loaded,
        _image_scanner.nsfw_loaded,
    )
    yield
    logger.info("Scanner shutdown.")


app = FastAPI(
    title="Teezer Media Safety Scanner",
    version="1.0.0",
    docs_url=None,  # disable public docs
    redoc_url=None,
    lifespan=lifespan,
)

_origins = os.getenv("ALLOWED_ORIGINS", "http://127.0.0.1,http://localhost").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

API_KEY = os.getenv("SCANNER_API_KEY", "")


def _check_auth(request):
    if not API_KEY:
        return
    key = request.headers.get("X-Scanner-Key", "")
    if key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        status="ok",
        models_loaded=bool(_image_scanner and _image_scanner.models_loaded),
        nudenet_loaded=bool(_image_scanner and _image_scanner.nudenet_loaded),
        nsfw_loaded=bool(_image_scanner and _image_scanner.nsfw_loaded),
    )


@app.post("/scan/image", response_model=ScanResult)
async def scan_image(req: ImageScanRequest, request: Request):
    _check_auth(request)
    if not _image_scanner or not _image_scanner.models_loaded:
        raise HTTPException(status_code=503, detail="Scanner models not loaded")
    try:
        return _image_scanner.scan(req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error("Image scan failed content_id=%s: %s", req.content_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Scanner internal error")


@app.post("/scan/video", response_model=ScanResult)
async def scan_video(req: VideoScanRequest, request: Request):
    _check_auth(request)
    if not _video_scanner:
        raise HTTPException(status_code=503, detail="Scanner not ready")
    try:
        return _video_scanner.scan(req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error("Video scan failed content_id=%s: %s", req.content_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Scanner internal error")
