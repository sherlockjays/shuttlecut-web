import type { ThemeId } from "@/models/theme"

export type Project = { id: number; title: string; updated_at: string }

export type Rally = [number, number, number, number, number] // [start, end, p1, p2, winner]

export type ProjectData = {
  title: string
  video_path: string
  fps: number
  total_frames: number
  match_date: string
  tournament_name: string
  level: string
  match_name: string
  player1_name: string
  player2_name: string
  player1_score: number
  player2_score: number
  rallies: Rally[]
  scoreboard_scale: number
  scoreboard_theme: ThemeId
}
