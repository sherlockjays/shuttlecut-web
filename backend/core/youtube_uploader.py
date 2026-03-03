"""YouTube Data API v3 - 영상 업로드 유틸"""
import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def get_youtube_service(refresh_token: str):
    """저장된 refresh_token으로 YouTube API 서비스 객체 반환"""
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        scopes=SCOPES,
    )
    return build("youtube", "v3", credentials=creds, cache_discovery=False)


def upload_video(youtube, file_path: str, title: str, description: str, privacy: str = "unlisted") -> str:
    """영상을 YouTube에 업로드하고 YouTube URL 반환"""
    body = {
        "snippet": {
            "title": (title or "ShuttleCut 내보내기")[:100],
            "description": description or "",
            "tags": ["배드민턴", "ShuttleCut", "badminton"],
            "categoryId": "17",  # Sports
        },
        "status": {"privacyStatus": privacy},
    }
    media = MediaFileUpload(
        file_path,
        mimetype="video/mp4",
        resumable=True,
        chunksize=10 * 1024 * 1024,  # 10MB
    )
    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
    response = None
    while response is None:
        _, response = request.next_chunk()
    return f"https://youtu.be/{response['id']}"
