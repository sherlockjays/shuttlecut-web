export default function GuidePage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <h2 className="text-2xl font-bold mb-8">사용 가이드</h2>

      <div className="space-y-10">
        <section>
          <h3 className="text-lg font-semibold text-yellow-400 mb-4">편집 툴 사용법</h3>
          <ol className="space-y-3">
            {[
              "대시보드에서 새 프로젝트를 만듭니다.",
              "영상 파일을 업로드합니다. (MP4, MOV 등)",
              "랠리 구간을 추가하고 시작/끝 타임스탬프를 지정합니다.",
              "각 랠리에 점수를 입력하면 점수판이 자동으로 오버레이됩니다.",
              "오른쪽 패널에서 점수판 테마와 크기를 선택할 수 있습니다.",
              "내보내기 버튼을 눌러 영상을 생성합니다.",
              "완료 후 다운로드하거나 YouTube에 업로드합니다.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-300">
                <span className="text-yellow-400 font-bold shrink-0">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-red-400 mb-4">YouTube 연결 방법</h3>
          <ol className="space-y-3">
            {[
              '상단 네비게이션에서 "MY"를 클릭합니다.',
              '설정 탭에서 "YouTube 연결" 버튼을 클릭합니다.',
              "Google 계정으로 로그인하고 권한을 허용합니다.",
              "연결 완료 후 내보내기 현황에서 YouTube 업로드가 가능합니다.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-300">
                <span className="text-red-400 font-bold shrink-0">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-gray-800 rounded-xl p-5">
          <h3 className="text-base font-semibold mb-3">팁</h3>
          <ul className="space-y-2 text-gray-400 text-sm">
            <li>• 점수판 미리보기 캔버스로 실시간으로 위치를 확인할 수 있습니다.</li>
            <li>• 랠리 목록에서 드래그로 순서를 변경할 수 있습니다.</li>
            <li>• 내보내기는 백그라운드에서 처리되므로 페이지를 닫아도 됩니다.</li>
            <li>• 점수판의 대회명, 급수 등은 에디터 상단 프로젝트 정보에서 설정합니다.</li>
          </ul>
        </section>
      </div>
    </main>
  )
}
