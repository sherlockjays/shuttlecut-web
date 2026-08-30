import type { ThemeId } from "@/models/theme";

export type Project = { id: number; title: string; updated_at: string };

// winner: 1/2는 해당 팀 득점, 0은 득점자 미지정(마킹만 하고 득점 처리는 안 한 랠리)
export type Rally = {
  start: number;
  end: number;
  p1Score: number;
  p2Score: number;
  winner: 0 | 1 | 2;
};

// 백엔드 API/DB에 저장되는 와이어 포맷: [start, end, p1, p2, winner]
export type RallyWire = [number, number, number, number, number];

export function rallyFromWire([start, end, p1Score, p2Score, winner]: RallyWire): Rally {
  return { start, end, p1Score, p2Score, winner: (winner ?? 0) as 0 | 1 | 2 };
}

export function rallyToWire(r: Rally): RallyWire {
  return [r.start, r.end, r.p1Score, r.p2Score, r.winner];
}

export type ProjectData = {
  title: string;
  video_path: string;
  fps: number;
  total_frames: number;
  match_date: string;
  tournament_name: string;
  level: string;
  match_name: string;
  player1_name: string;
  player2_name: string;
  player1_score: number;
  player2_score: number;
  rallies: Rally[];
  scoreboard_scale: number;
  scoreboard_theme: ThemeId;
};
