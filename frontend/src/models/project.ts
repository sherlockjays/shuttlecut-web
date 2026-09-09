import type { ThemeId } from "@/models/theme";

export type Project = { id: number; title: string; updated_at: string };

// None은 마킹만 하고 득점 처리는 안 한 랠리. 값은 백엔드 와이어 포맷과 같아야 한다.
export const RallyWinner = {
  None: 0,
  Team1: 1,
  Team2: 2,
} as const;

export type RallyWinner = (typeof RallyWinner)[keyof typeof RallyWinner];

/** 득점한 팀. 득점이 없는 랠리는 여기 해당하지 않는다. */
export type ScoringTeam = Exclude<RallyWinner, typeof RallyWinner.None>;

export type Rally = {
  start: number;
  end: number;
  p1Score: number;
  p2Score: number;
  winner: RallyWinner;
};

// 백엔드 API/DB에 저장되는 와이어 포맷: [start, end, p1, p2, winner]
export type RallyWire = [number, number, number, number, number];

export function rallyFromWire([
  start,
  end,
  p1Score,
  p2Score,
  winner,
]: RallyWire): Rally {
  return {
    start,
    end,
    p1Score,
    p2Score,
    winner: (winner ?? RallyWinner.None) as RallyWinner,
  };
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

export type ProjectDetail = ProjectData & { video_id: string | null };
