type Props = {
  profileStrength?: number;
  newMatchesToday?: number;
  recruitersViewed?: number;
};

export function ProfileStatsCard({
  profileStrength = 0,
  newMatchesToday = 0,
  recruitersViewed = 0,
}: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-sm font-semibold text-gray-900">Your profile</p>

      <div className="mt-4 space-y-3">
        <Stat label="Profile strength" value={`${profileStrength}%`} />
        <Stat label="New matches today" value={newMatchesToday} />
        <Stat label="Recruiters viewed" value={recruitersViewed} />
      </div>

      <a
        href="/profile"
        className="mt-5 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800"
      >
        Edit details →
      </a>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
