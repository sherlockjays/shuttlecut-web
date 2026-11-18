// PreToolUse 훅: Claude가 git commit을 실행하기 직전에 CI와 같은 검사를 돌리고,
// 실패하면 exit 2로 커밋을 막는다. 검사 목록은 .github/workflows/ci.yml과 맞춘다.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BLOCK_EXIT_CODE = 2;
const FAILURE_TAIL_LINES = 60;

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const frontendDir = join(projectDir, "frontend");

const changedFiles = getFilesGoingIntoCommit(getCommitCommand());
const hasFrontendChange = changedFiles.some((file) => file.startsWith("frontend/"));
const hasBackendChange = changedFiles.some((file) => file.startsWith("backend/"));

// NAS와 워커 체크아웃에는 node_modules가 없다
if (hasFrontendChange && existsSync(join(frontendDir, "node_modules"))) {
  // 빨리 끝나는 검사부터 돌려 실패를 일찍 알린다
  for (const script of ["format:check", "test", "lint", "build"]) {
    runOrBlock(`npm run ${script}`, frontendDir);
  }
}

if (hasBackendChange && isPythonAvailable()) {
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

// 훅은 명령이 실행되기 전에 돈다. `git add x && git commit`이나 `git commit -a`처럼
// 같은 명령 안에서 스테이징되는 파일은 아직 인덱스에 없어서, 작업 트리 변경까지 본다.
function getFilesGoingIntoCommit(commitCommand) {
  const staged = getGitLines(["diff", "--cached", "--name-only"]);
  const modified = getGitLines(["diff", "--name-only"]);
  const addsFilesInSameCommand = /\bgit\s+add\b/.test(commitCommand);
  const untracked = addsFilesInSameCommand
    ? getGitLines(["ls-files", "--others", "--exclude-standard"])
    : [];
  return [...staged, ...modified, ...untracked];
}

function getGitLines(args) {
  const result = spawnSync("git", args, { cwd: projectDir, encoding: "utf8" });
  return (result.stdout ?? "").split("\n").filter(Boolean);
}

function isPythonAvailable() {
  return spawnSync("python --version", { shell: true }).status === 0;
}

function runOrBlock(command, cwd) {
  // npm은 Windows에서 .cmd라 셸을 거쳐야 실행된다
  const result = spawnSync(command, { cwd, shell: true, encoding: "utf8" });
  if (result.status === 0) return;

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd();
  const outputTail = output.split("\n").slice(-FAILURE_TAIL_LINES).join("\n");
  process.stderr.write(
    `커밋 게이트 실패: \`${command}\` (exit ${result.status})\n\n${outputTail}\n\n고친 뒤 다시 커밋한다.\n`,
  );
  process.exit(BLOCK_EXIT_CODE);
}
