import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
APP_BASE_URL = os.getenv("APP_BASE_URL", "https://wjdwoghk.synology.me")


def send_email(to: str, subject: str, html: str):
    if not SMTP_USER or not SMTP_PASSWORD:
        print(f"[EMAIL] SMTP 미설정 — to={to} subject={subject}")
        return
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"ShuttleCut <{SMTP_USER}>"
    msg["To"] = to
    msg.attach(MIMEText(html, "html", "utf-8"))
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_USER, to, msg.as_string())


def send_verification_email(to: str, token: str):
    url = f"{APP_BASE_URL}/api/auth/verify-email?token={token}"
    send_email(
        to,
        "[ShuttleCut] 이메일 인증을 완료해주세요",
        f"""
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#1f2937;color:#f9fafb;border-radius:12px;">
          <h2 style="margin-top:0;">🏸 ShuttleCut 이메일 인증</h2>
          <p>가입해 주셔서 감사합니다! 아래 버튼을 눌러 인증을 완료해 주세요.</p>
          <a href="{url}"
             style="display:inline-block;margin:16px 0;padding:12px 28px;
                    background:#2563eb;color:#fff;border-radius:8px;
                    text-decoration:none;font-weight:600;">
            이메일 인증하기
          </a>
          <p style="color:#9ca3af;font-size:13px;">링크는 24시간 후 만료됩니다.<br>본인이 가입하지 않았다면 이 메일을 무시하세요.</p>
        </div>
        """,
    )


def send_reset_email(to: str, token: str):
    url = f"{APP_BASE_URL}/?reset_token={token}"
    send_email(
        to,
        "[ShuttleCut] 비밀번호 재설정",
        f"""
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#1f2937;color:#f9fafb;border-radius:12px;">
          <h2 style="margin-top:0;">🏸 ShuttleCut 비밀번호 재설정</h2>
          <p>비밀번호 재설정 요청이 접수되었습니다. 아래 버튼을 눌러 새 비밀번호를 설정해 주세요.</p>
          <a href="{url}"
             style="display:inline-block;margin:16px 0;padding:12px 28px;
                    background:#2563eb;color:#fff;border-radius:8px;
                    text-decoration:none;font-weight:600;">
            비밀번호 재설정하기
          </a>
          <p style="color:#9ca3af;font-size:13px;">링크는 1시간 후 만료됩니다.<br>본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
        </div>
        """,
    )
