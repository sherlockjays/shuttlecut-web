import type { ProjectData } from "@/models/project";

type MatchInfo = Pick<ProjectData, "match_date" | "tournament_name" | "level" | "match_name">;

const MATCH_INFO_FIELDS = [
  { key: "match_date", label: "날짜", placeholder: "YYYY-MM-DD" },
  { key: "tournament_name", label: "대회명", placeholder: "대회명" },
  { key: "level", label: "급수", placeholder: "A조, 혼합복식" },
  { key: "match_name", label: "경기명", placeholder: "32강, 결승" },
] satisfies {
  key: keyof MatchInfo;
  label: string;
  placeholder: string;
}[];

type Props = {
  values: MatchInfo;
  onChange: (patch: Partial<MatchInfo>) => void;
};

export default function MatchInfoForm({ values, onChange }: Props) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">경기 정보</h3>
      <div className="space-y-2">
        {MATCH_INFO_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="text-xs text-gray-500">{label}</label>
            <input
              value={values[key]}
              placeholder={placeholder}
              onChange={(e) => onChange({ [key]: e.target.value })}
              className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 mt-0.5"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
