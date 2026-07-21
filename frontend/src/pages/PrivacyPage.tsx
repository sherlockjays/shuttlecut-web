export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-300 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">개인정보처리방침</h1>
        <p className="text-gray-500 text-sm mb-8">시행일: 2026년 3월 14일</p>

        <p className="text-sm leading-relaxed mb-8">
          ShuttleCut(이하 "서비스") 운영자는 개인정보보호법 등 관련 법률에 따라
          이용자의 개인정보를 보호하고, 이와 관련한 고충을 신속하게 처리하기
          위해 다음과 같이 개인정보처리방침을 수립·공개합니다.
        </p>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제1조 (수집하는 개인정보 항목)
          </h2>
          <div className="text-sm leading-relaxed space-y-4">
            <div>
              <p className="font-medium text-gray-200 mb-1">
                이메일 회원가입 시
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-400">
                <li>이메일 주소 (필수)</li>
                <li>비밀번호 (암호화 저장, 원문 보관 안 함)</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-200 mb-1">Google 로그인 시</p>
              <ul className="list-disc list-inside space-y-1 text-gray-400">
                <li>이메일 주소, Google 계정 고유 ID (필수)</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-200 mb-1">
                서비스 이용 시 자동 수집
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-400">
                <li>업로드한 영상 파일 (서비스 제공 목적으로만 사용)</li>
                <li>서비스 이용 기록 (내보내기 이력)</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-200 mb-1">
                YouTube 연동 시 (선택)
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-400">
                <li>YouTube OAuth 인증 토큰 (암호화 저장)</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제2조 (개인정보 수집 목적)
          </h2>
          <ul className="text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>회원 식별 및 서비스 로그인</li>
            <li>이메일 인증 및 비밀번호 재설정</li>
            <li>요금제 관리 및 이용 한도 적용</li>
            <li>YouTube 업로드 기능 제공 (YouTube 연동 선택 시)</li>
            <li>서비스 개선 및 운영</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제3조 (개인정보 보유 및 이용 기간)
          </h2>
          <div className="text-sm leading-relaxed space-y-3">
            <p>
              개인정보는 수집 목적이 달성된 후 지체 없이 삭제합니다. 단, 다음의
              경우에는 해당 기간 동안 보존합니다.
            </p>
            <div className="bg-gray-800 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">회원 탈퇴 시 계정 정보</span>
                <span className="text-gray-300">즉시 삭제</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">업로드 영상 파일</span>
                <span className="text-gray-300">
                  프로젝트 삭제 시 즉시 삭제
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">내보내기 파일</span>
                <span className="text-gray-300">
                  내보내기 삭제 시 즉시 삭제
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">
                  전자상거래 결제 기록 (향후)
                </span>
                <span className="text-gray-300">5년 (전자상거래법)</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제4조 (개인정보의 제3자 제공)
          </h2>
          <p className="text-sm leading-relaxed">
            운영자는 이용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다.
            단, 이용자의 동의가 있거나 법령에 의한 경우에는 예외로 합니다.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제5조 (개인정보 처리 위탁)
          </h2>
          <div className="text-sm leading-relaxed space-y-3">
            <p>
              운영자는 서비스 제공을 위해 다음과 같이 개인정보 처리를
              위탁합니다.
            </p>
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left p-3 text-gray-400">수탁업체</th>
                    <th className="text-left p-3 text-gray-400">위탁 업무</th>
                    <th className="text-left p-3 text-gray-400">보유 기간</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  <tr>
                    <td className="p-3 text-gray-300">Google Cloud Platform</td>
                    <td className="p-3 text-gray-300">영상 파일 저장 (GCS)</td>
                    <td className="p-3 text-gray-300">이용 기간</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-gray-300">Google LLC</td>
                    <td className="p-3 text-gray-300">
                      Google 로그인, YouTube 업로드
                    </td>
                    <td className="p-3 text-gray-300">이용 기간</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제6조 (개인정보의 안전성 확보 조치)
          </h2>
          <ul className="text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>
              비밀번호는 bcrypt 알고리즘으로 암호화하여 저장합니다 (원문 복구
              불가).
            </li>
            <li>YouTube 인증 토큰은 AES 기반 암호화(Fernet)로 저장합니다.</li>
            <li>모든 통신은 HTTPS(TLS)를 통해 암호화됩니다.</li>
            <li>영상 파일은 접근 제어된 Google Cloud Storage에 저장됩니다.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제7조 (이용자의 권리)
          </h2>
          <p className="text-sm leading-relaxed mb-2">
            이용자는 언제든지 다음의 권리를 행사할 수 있습니다.
          </p>
          <ul className="text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>개인정보 열람 요청</li>
            <li>개인정보 정정·삭제 요청</li>
            <li>개인정보 처리 정지 요청</li>
            <li>회원 탈퇴 (계정 및 모든 데이터 삭제)</li>
          </ul>
          <p className="text-sm text-gray-400 mt-3">
            권리 행사는 아래 개인정보 보호책임자 이메일로 요청해주세요.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제8조 (쿠키 및 유사 기술)
          </h2>
          <p className="text-sm leading-relaxed">
            서비스는 로그인 상태 유지를 위해 브라우저 로컬 스토리지에 JWT 인증
            토큰을 저장합니다. 이는 쿠키와 유사한 방식으로 작동하며, 브라우저의
            데이터 삭제 기능으로 제거할 수 있습니다.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제9조 (개인정보 보호책임자)
          </h2>
          <div className="bg-gray-800 rounded-lg p-4 text-sm space-y-1">
            <p className="text-gray-300">
              이메일:{" "}
              <a
                href="mailto:wjdwoghk16@gmail.com"
                className="text-blue-400 hover:underline"
              >
                wjdwoghk16@gmail.com
              </a>
            </p>
            <p className="text-gray-500 text-xs mt-2">
              개인정보 관련 문의는 위 이메일로 접수해주세요. 영업일 기준 3일
              이내 답변합니다.
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제10조 (권익침해 구제 방법)
          </h2>
          <p className="text-sm leading-relaxed text-gray-400">
            개인정보 침해로 인한 구제를 받기 위해 개인정보분쟁조정위원회,
            한국인터넷진흥원 개인정보침해신고센터 등에 분쟁해결이나 상담을
            신청할 수 있습니다.
          </p>
          <ul className="text-sm text-gray-400 mt-2 space-y-1 list-disc list-inside">
            <li>개인정보분쟁조정위원회: 1833-6972 (www.kopico.go.kr)</li>
            <li>개인정보침해신고센터: 118 (privacy.kisa.or.kr)</li>
            <li>대검찰청 사이버수사과: 1301 (www.spo.go.kr)</li>
            <li>경찰청 사이버안전국: 182 (cyberbureau.police.go.kr)</li>
          </ul>
        </section>

        <div className="border-t border-gray-700 pt-6 text-xs text-gray-500">
          <p>서비스명: ShuttleCut</p>
          <p>도메인: https://shuttlecut.kr</p>
          <p>시행일: 2026년 3월 14일</p>
        </div>
      </div>
    </div>
  );
}
