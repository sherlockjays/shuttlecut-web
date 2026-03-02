"""랠리 데이터 및 점수 상태 관리"""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Rally:
    start_frame: int
    end_frame: int      # 플레이어가 마킹한 실제 끝점 (점수 기록 기준)
    p1_score: int       # 득점 전 점수 (영상 오버레이용)
    p2_score: int
    winner: int = 0     # 득점한 플레이어 (1 or 2, 0 = 미기록)


class RallyManager:
    def __init__(self):
        self.rallies: List[Rally] = []

        # 점수
        self.player1_score: int = 0
        self.player2_score: int = 0

        # 점수판 정보
        self.player1_name: str = "1팀"
        self.player2_name: str = "2팀"
        self.tournament_name: str = "대회명"
        self.match_date: str = ""        # YYYY-MM-DD
        self.level: str = ""             # 급수 (예: A조, 혼합복식)
        self.match_name: str = ""        # 경기명 (예: 32강, 결승)

        # 마킹 상태
        self._marking: bool = False
        self._start_frame: Optional[int] = None

        # 되돌리기 스택
        self._undo_stack: list = []

    # ---------- 점수 ----------

    def push_undo(self):
        """현재 점수 + 랠리 개수를 undo 스택에 저장"""
        self._undo_stack.append((self.player1_score, self.player2_score, len(self.rallies)))

    def undo_last(self) -> bool:
        """마지막 점수 액션 되돌리기. 성공하면 True 반환."""
        if not self._undo_stack:
            return False
        p1, p2, rally_count = self._undo_stack.pop()
        # 랠리가 추가됐으면 제거
        while len(self.rallies) > rally_count:
            self.rallies.pop()
        self.player1_score = p1
        self.player2_score = p2
        return True

    def add_score(self, player: int):
        if player == 1:
            self.player1_score += 1
        else:
            self.player2_score += 1

    def reset_score(self):
        self.player1_score = 0
        self.player2_score = 0
        self._undo_stack.clear()

    # ---------- 랠리 마킹 ----------

    @property
    def is_marking(self) -> bool:
        return self._marking

    def start_marking(self, frame: int):
        self._marking = True
        self._start_frame = frame

    def end_marking(self, frame: int) -> Optional[Rally]:
        """마킹 종료. 유효하면 Rally 반환, 아니면 None."""
        self._marking = False
        if self._start_frame is None or frame <= self._start_frame:
            return None
        rally = Rally(self._start_frame, frame, self.player1_score, self.player2_score)
        self.rallies.append(rally)
        self._start_frame = None
        return rally

    def cancel_marking(self):
        self._marking = False
        self._start_frame = None

    def delete_rally(self, index: int):
        if 0 <= index < len(self.rallies):
            self.rallies.pop(index)

    # ---------- 직렬화 ----------

    def to_dict(self) -> dict:
        return {
            "tournament_name": self.tournament_name,
            "match_date": self.match_date,
            "level": self.level,
            "match_name": self.match_name,
            "player1_name": self.player1_name,
            "player2_name": self.player2_name,
            "player1_score": self.player1_score,
            "player2_score": self.player2_score,
            "rallies": [
                [r.start_frame, r.end_frame, r.p1_score, r.p2_score, r.winner]
                for r in self.rallies
            ],
        }

    def from_dict(self, data: dict):
        self.tournament_name = data.get("tournament_name", "대회명")
        self.match_date = data.get("match_date", "")
        self.level = data.get("level", "")
        self.match_name = data.get("match_name", "")
        self.player1_name = data.get("player1_name", "1팀")
        self.player2_name = data.get("player2_name", "2팀")
        self.player1_score = data.get("player1_score", 0)
        self.player2_score = data.get("player2_score", 0)
        self.rallies = [
            Rally(r[0], r[1], r[2], r[3], r[4] if len(r) > 4 else 0)
            for r in data.get("rallies", [])
        ]
