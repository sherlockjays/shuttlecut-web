// 프로젝트에 기록된 전체 프레임 수를 쓰되, 없으면 재생 중인 영상의 길이로 대신한다.
// 업로드 시 ffprobe가 프레임 수를 못 읽으면 0으로 저장되는데 타임라인은 그려야 한다.
export const resolveTotalFrames = (
  totalFrames: number,
  durationSec: number,
  fps: number,
) => (totalFrames > 0 ? totalFrames : Math.round(durationSec * fps));
