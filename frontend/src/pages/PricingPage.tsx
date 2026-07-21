const plans = [
  {
    name: "Free",
    price: "무료",
    exports: "월 2회",
    badge: null as string | null,
    border: "border-gray-600",
    highlight: false,
    features: [
      "기본 편집 기능",
      "점수판 오버레이",
      "영상 다운로드",
      "우측 상단 ShuttleCut 워터마크",
    ],
  },
  {
    name: "Basic",
    price: "₩4,900",
    period: "/월",
    exports: "월 5회",
    badge: null as string | null,
    border: "border-gray-500",
    highlight: false,
    features: [
      "Free 기능 포함",
      "YouTube 업로드",
      "우측 상단 ShuttleCut 워터마크",
    ],
  },
  {
    name: "Standard",
    price: "₩8,900",
    period: "/월",
    exports: "월 10회",
    badge: "추천",
    border: "border-blue-500",
    highlight: true,
    features: ["Basic 기능 포함", "워터마크 없음", "YouTube 업로드"],
  },
  {
    name: "Premium",
    price: "₩19,900",
    period: "/월",
    exports: "월 30회",
    badge: null as string | null,
    border: "border-purple-500",
    highlight: false,
    features: [
      "Standard 기능 포함",
      "워터마크 없음",
      "YouTube 업로드",
      "우선 처리",
    ],
  },
  {
    name: "무제한",
    price: "₩29,900",
    period: "/월",
    exports: "무제한",
    badge: null as string | null,
    border: "border-yellow-500",
    highlight: false,
    features: [
      "Premium 기능 포함",
      "워터마크 없음",
      "YouTube 업로드",
      "우선 처리",
    ],
  },
];

export default function PricingPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <h2 className="text-2xl font-bold mb-2">요금제/플랜</h2>
      <p className="text-gray-400 mb-10">필요에 맞는 플랜을 선택하세요.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`bg-gray-800 rounded-xl p-5 border-2 ${plan.border} ${plan.highlight ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-900" : ""} flex flex-col`}
          >
            {plan.badge ? (
              <span className="inline-block bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full mb-3 font-medium self-start">
                {plan.badge}
              </span>
            ) : (
              <div className="mb-6" />
            )}
            <h3 className="text-lg font-bold mb-1">{plan.name}</h3>
            <div className="mb-3">
              <span className="text-2xl font-bold">{plan.price}</span>
              {plan.period && (
                <span className="text-gray-400 text-sm">{plan.period}</span>
              )}
            </div>
            <p className="text-sm text-gray-400 mb-4">
              내보내기:{" "}
              <span className="text-white font-medium">{plan.exports}</span>
            </p>
            <ul className="space-y-2 mb-6 flex-1">
              {plan.features.map((f) => (
                <li
                  key={f}
                  className="text-sm text-gray-300 flex items-start gap-2"
                >
                  <span className="text-green-400 mt-0.5">✓</span> {f}
                </li>
              ))}
            </ul>
            <button
              disabled
              className="w-full bg-gray-700 text-gray-400 cursor-not-allowed py-2 rounded-lg text-sm font-medium"
            >
              준비 중
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-gray-800 rounded-xl p-5 border border-gray-600 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white mb-1">영상당 결제</h3>
          <p className="text-sm text-gray-400">구독 없이 필요할 때만</p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-white">₩1,100</span>
          <span className="text-gray-400 text-sm">/영상</span>
        </div>
      </div>

      <p className="text-gray-500 text-xs mt-8 text-center">
        결제 기능은 곧 오픈될 예정입니다. 문의:{" "}
        <span className="text-gray-400">wjdwoghk16@gmail.com</span>
      </p>
    </main>
  );
}
