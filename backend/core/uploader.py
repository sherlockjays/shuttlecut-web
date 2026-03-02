"""NAS 파일 복사 + YouTube 업로드 + 댓글 작성"""

import os
import shutil
import time
import json
from pathlib import Path
from PyQt6.QtCore import QThread, pyqtSignal

# YouTube API
try:
    import google.oauth2.credentials
    import google_auth_oauthlib.flow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    from googleapiclient.errors import HttpError
    YOUTUBE_AVAILABLE = True
except ImportError:
    YOUTUBE_AVAILABLE = False

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
]
TOKEN_FILE = str(Path(__file__).parent.parent / "youtube_token.json")
CLIENT_SECRET_FILE = str(Path(__file__).parent.parent / "client_secret.json")


# ──────────────────────────────────────────────
# NAS 복사
# ──────────────────────────────────────────────

def copy_to_nas(src_video: str, src_txt: str, nas_folder: str) -> tuple[str, str]:
    """NAS 폴더로 영상 + txt 복사. (복사된 경로 반환)"""
    os.makedirs(nas_folder, exist_ok=True)
    dst_video = os.path.join(nas_folder, Path(src_video).name)
    dst_txt   = os.path.join(nas_folder, Path(src_txt).name)
    shutil.copy2(src_video, dst_video)
    shutil.copy2(src_txt, dst_txt)
    return dst_video, dst_txt


# ──────────────────────────────────────────────
# YouTube 인증
# ──────────────────────────────────────────────

def get_youtube_client():
    """OAuth2 인증 후 YouTube API 클라이언트 반환"""
    if not YOUTUBE_AVAILABLE:
        raise RuntimeError("google-api-python-client 패키지가 설치되지 않았습니다.")
    if not os.path.exists(CLIENT_SECRET_FILE):
        raise FileNotFoundError(
            f"client_secret.json 파일이 없습니다.\n"
            f"Google Cloud Console에서 OAuth 2.0 클라이언트 ID를 생성하고\n"
            f"다음 경로에 저장하세요:\n{CLIENT_SECRET_FILE}"
        )

    creds = None

    # 저장된 토큰 불러오기
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "r") as f:
            creds = google.oauth2.credentials.Credentials.from_authorized_user_info(
                json.load(f), SCOPES
            )

    # 토큰 없거나 만료
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            from google.auth.transport.requests import Request
            creds.refresh(Request())
        else:
            flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
                CLIENT_SECRET_FILE, SCOPES
            )
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())

    return build("youtube", "v3", credentials=creds)


# ──────────────────────────────────────────────
# YouTube 업로드 스레드
# ──────────────────────────────────────────────

class YouTubeUploader(QThread):
    progress = pyqtSignal(int, str)    # percent, message
    finished = pyqtSignal(str)         # video_id
    error = pyqtSignal(str)

    def __init__(self, video_path: str, title: str, timeline_txt: str, parent=None):
        super().__init__(parent)
        self.video_path = video_path
        self.title = title
        self.timeline_txt = timeline_txt   # 댓글에 붙일 타임라인 텍스트

    def run(self):
        try:
            self.progress.emit(5, "YouTube 인증 중...")
            youtube = get_youtube_client()

            # ── 영상 업로드 ──
            self.progress.emit(10, "영상 업로드 시작...")
            body = {
                "snippet": {
                    "title": self.title,
                    "description": self.timeline_txt,
                    "tags": ["배드민턴", "badminton"],
                    "categoryId": "17",   # Sports
                },
                "status": {
                    "privacyStatus": "public",
                },
            }

            media = MediaFileUpload(
                self.video_path,
                mimetype="video/mp4",
                resumable=True,
                chunksize=4 * 1024 * 1024,
            )

            request = youtube.videos().insert(
                part=",".join(body.keys()),
                body=body,
                media_body=media,
            )

            video_id = None
            while True:
                status, response = request.next_chunk()
                if status:
                    pct = 10 + int(status.progress() * 80)
                    self.progress.emit(pct, f"업로드 중... {int(status.progress()*100)}%")
                if response:
                    video_id = response["id"]
                    break

            # ── 댓글 작성 ──
            self.progress.emit(92, "타임라인 댓글 작성 중...")
            youtube.commentThreads().insert(
                part="snippet",
                body={
                    "snippet": {
                        "videoId": video_id,
                        "topLevelComment": {
                            "snippet": {
                                "textOriginal": self.timeline_txt
                            }
                        }
                    }
                }
            ).execute()

            self.progress.emit(100, "완료!")
            self.finished.emit(video_id)

        except Exception as e:
            self.error.emit(str(e))
