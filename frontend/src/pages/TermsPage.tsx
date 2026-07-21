export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-300 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">이용약관</h1>
        <p className="text-gray-500 text-sm mb-8">시행일: 2026년 3월 14일</p>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제1조 (목적)
          </h2>
          <p className="text-sm leading-relaxed">
            이 약관은 ShuttleCut(이하 "서비스")을 운영하는 운영자(이하
            "운영자")가 제공하는 배드민턴 경기 영상 편집 서비스의 이용과
            관련하여 운영자와 이용자 간의 권리·의무 및 책임사항을 규정함을
            목적으로 합니다.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제2조 (서비스 정의)
          </h2>
          <p className="text-sm leading-relaxed mb-2">
            "서비스"란 이용자가 업로드한 배드민턴 경기 영상에서 랠리 구간을
            추출하고, 점수판 오버레이를 적용하여 편집 영상을 생성·다운로드하거나
            YouTube에 업로드할 수 있는 웹 기반 영상 편집 서비스를 말합니다.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제3조 (회원 가입 및 계정)
          </h2>
          <ul className="text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>
              이용자는 이메일 또는 Google 계정으로 회원 가입할 수 있습니다.
            </li>
            <li>
              이메일 가입 시 인증 메일 확인이 완료되어야 서비스를 이용할 수
              있습니다.
            </li>
            <li>
              이용자는 계정 정보를 타인과 공유해서는 안 되며, 계정의 부정 이용에
              대한 책임은 이용자에게 있습니다.
            </li>
            <li>허위 정보로 가입한 경우 서비스 이용이 제한될 수 있습니다.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제4조 (서비스 이용 및 요금제)
          </h2>
          <ul className="text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>
              서비스는 무료 플랜과 유료 플랜으로 구분됩니다. 플랜별 이용 한도는
              요금제 안내 페이지에서 확인할 수 있습니다.
            </li>
            <li>
              무료 플랜은 월 2회 내보내기가 가능합니다. 이용 횟수는 매월 1일에
              초기화됩니다.
            </li>
            <li>유료 플랜의 결제 및 환불 정책은 별도 공지를 따릅니다.</li>
            <li>
              운영자는 서비스 안정적 운영을 위해 사전 공지 후 요금제를 변경할 수
              있습니다.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제5조 (업로드 콘텐츠 및 저작권)
          </h2>
          <ul className="text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>
              이용자는 자신이 저작권을 보유하거나 이용 권한이 있는 영상만
              업로드해야 합니다.
            </li>
            <li>
              타인의 저작권을 침해하는 콘텐츠 업로드로 발생하는 법적 책임은
              이용자에게 있습니다.
            </li>
            <li>
              운영자는 이용자가 업로드한 영상에 대한 소유권을 주장하지 않으며,
              서비스 제공 목적 외에 활용하지 않습니다.
            </li>
            <li>
              업로드된 영상 파일은 이용자가 프로젝트를 삭제하면 즉시 삭제됩니다.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제6조 (서비스 이용 제한)
          </h2>
          <p className="text-sm leading-relaxed mb-2">
            다음에 해당하는 행위를 한 이용자는 서비스 이용이 제한될 수 있습니다.
          </p>
          <ul className="text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>서비스의 정상적인 운영을 방해하는 행위</li>
            <li>타인의 개인정보를 무단으로 수집하거나 이용하는 행위</li>
            <li>요금제 한도 우회를 목적으로 다수의 계정을 생성하는 행위</li>
            <li>
              불법 콘텐츠 또는 타인의 저작권을 침해하는 콘텐츠를 업로드하는 행위
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제7조 (서비스 변경 및 중단)
          </h2>
          <ul className="text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>
              운영자는 서비스 개선을 위해 기능을 변경·추가·삭제할 수 있으며,
              중요한 변경사항은 사전에 공지합니다.
            </li>
            <li>
              천재지변, 시스템 장애, 네트워크 이슈 등 불가피한 사유로 서비스가
              일시 중단될 수 있습니다.
            </li>
            <li>
              운영자는 고의 또는 중과실이 없는 한 서비스 중단으로 인한 손해에
              대해 책임을 지지 않습니다.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제8조 (면책 조항)
          </h2>
          <ul className="text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>
              서비스는 "있는 그대로" 제공되며, 특정 목적에 대한 적합성을
              보증하지 않습니다.
            </li>
            <li>
              이용자의 귀책 사유로 발생한 손해에 대해 운영자는 책임을 지지
              않습니다.
            </li>
            <li>
              YouTube 업로드 기능은 Google의 서비스 정책 변경에 따라 영향을 받을
              수 있습니다.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제9조 (약관 변경)
          </h2>
          <p className="text-sm leading-relaxed">
            운영자는 약관을 변경할 경우 시행 7일 전에 서비스 내 공지합니다.
            변경된 약관에 동의하지 않으면 서비스 이용을 중단하고 탈퇴할 수
            있습니다.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            제10조 (준거법 및 관할)
          </h2>
          <p className="text-sm leading-relaxed">
            이 약관은 대한민국 법률에 따라 해석되며, 분쟁 발생 시 운영자의
            주소지를 관할하는 법원을 전속 관할 법원으로 합니다.
          </p>
        </section>

        <div className="border-t border-gray-700 pt-6 text-xs text-gray-500">
          <p>서비스명: ShuttleCut</p>
          <p>도메인: https://shuttlecut.kr</p>
          <p>문의: wjdwoghk16@gmail.com</p>
        </div>
      </div>
    </div>
  );
}
