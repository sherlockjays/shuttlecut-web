// PreToolUse 훅: Claude가 git commit을 실행하기 직전에 CI와 같은 검사를 돌리고,
// 실패하면 exit 2로 커밋을 막는다. 검사 목록은 .github/workflows/ci.yml과 맞춘다.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BLOCK_EXIT_CODE = 2;
const FAILURE_TAIL_LINES = 60;
// 훅이 settings.json의 timeout(300초)을 넘기면 하네스는 막지 않고 커밋을 통과시킨다.
// 그 전에 스스로 실패로 끝내야 한다.
const GATE_TIME_LIMIT_MS = 240_000;

const startedAt = Date.now();
const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const frontendDir = join(projectDir, "frontend");

// 훅은 명령보다 먼저 돌아서, 같은 명령 안에서 스테이징되는 파일은 아직 볼 수 없다
if (stagesInSameCommand(getCommitCommand())) {
  block(
    "스테이징과 커밋을 한 명령에 섞으면 무엇이 커밋되는지 미리 볼 수 없다.\n" +
      "`git add`를 먼저 따로 실행한 뒤 `git commit`만 다시 실행한다. `git commit -a`도 쓰지 않는다.",
  );
}

const stagedFiles = getStagedFiles();
const hasFrontendChange = stagedFiles.some((file) => file.startsWith("frontend/"));
const hasBackendChange = stagedFiles.some((file) => file.startsWith("backend/"));

// 의존성이나 python이 없어 검사를 못 돌리는 경우도 실패로 막는다. 조용히 건너뛰지 않는다
if (hasFrontendChange) {
  // 빨리 끝나는 검사부터 돌려 실패를 일찍 알린다
  for (const script of ["format:check", "test", "lint", "build"]) {
    runOrBlock(`npm run ${script}`, frontendDir);
  }
}

if (hasBackendChange) {
  // 로컬 venv까지 컴파일하면 수 분이 걸린다. CI에는 venv가 없다
  runOrBlock('python -m compileall -q -x "venv" backend', projectDir);
}

function getCommitCommand() {
  try {
    return JSON.parse(readFileSync(0, "utf8")).tool_input?.command ?? "";
  } catch {
    return "";
  }
}

function stagesInSameCommand(command) {
  const hasGitAdd = /\bgit\s+add\b/.test(command);
  const hasCommitAll = /\bgit\s+commit\b[^|;&]*\s(-[a-zA-Z]*a[a-zA-Z]*|--all)(\s|$)/.test(command);
  return hasGitAdd || hasCommitAll;
}

function getStagedFiles() {
  // quotePath를 끄지 않으면 한글 경로가 "frontend/\355..."처럼 따옴표로 감싸져 나온다
  const result = spawnSync(
    "git",
    ["-c", "core.quotePath=false", "diff", "--cached", "--name-only"],
    { cwd: projectDir, encoding: "utf8" },
  );
  return (result.stdout ?? "").split("\n").filter(Boolean);
}

function runOrBlock(command, cwd) {
  const remainingMs = GATE_TIME_LIMIT_MS - (Date.now() - startedAt);
  // npm은 Windows에서 .cmd라 셸을 거쳐야 실행된다
  const result = spawnSync(command, { cwd, shell: true, encoding: "utf8", timeout: remainingMs });
  if (result.status === 0) return;

  if (result.error?.code === "ETIMEDOUT" || remainingMs <= 0) {
    block(`\`${command}\`이 제한 시간(${GATE_TIME_LIMIT_MS / 1000}초) 안에 끝나지 않았다.`);
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd();
  const outputTail = output.split("\n").slice(-FAILURE_TAIL_LINES).join("\n");
  block(`\`${command}\` (exit ${result.status})\n\n${outputTail}\n\n고친 뒤 다시 커밋한다.`);
}

function block(reason) {
  process.stderr.write(`커밋 게이트 실패: ${reason}\n`);
  process.exit(BLOCK_EXIT_CODE);
}
