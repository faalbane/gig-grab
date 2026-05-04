import { Header } from "@/components/marketing/Header";
import { HiringCopilot } from "@/components/dashboard/HiringCopilot";

export const dynamic = "force-static";

const SAMPLE_JOBS = [
  {
    title: "Site Carpenters (x4)",
    location: "Manchester · 12-week fit-out · £220/day",
    workers: "4 needed",
    matches: "Top 98%",
    status: "Active",
  },
  {
    title: "Senior Product Designer",
    location: "Remote (UK) · Permanent · £75k",
    workers: "1 role",
    matches: "Top 96%",
    status: "Interviewing",
  },
  {
    title: "Registered Nurse (Bank)",
    location: "Leeds · Rotating shifts · £36k",
    workers: "6 needed",
    matches: "Top 92%",
    status: "Interviewing",
  },
];

export default function EmployerDashboardPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Your jobs
        </h1>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Total matches" value="121" delta="+18" />
          <Stat label="Awaiting interview" value="14" />
          <Stat label="Avg match score" value="91%" delta="+3%" />
          <Stat label="AI screenings this week" value="9" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              {["All 5", "Active 2", "Interviewing 2", "Paused 1", "Filled 1"].map(
                (label, i) => (
                  <button
                    key={label}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      i === 0
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-medium text-gray-600">
                  <tr>
                    <th className="px-5 py-3 text-left">Job</th>
                    <th className="px-5 py-3 text-left">Location · Pay</th>
                    <th className="px-5 py-3 text-left">Workers</th>
                    <th className="px-5 py-3 text-left">Matches</th>
                    <th className="px-5 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {SAMPLE_JOBS.map((j) => (
                    <tr key={j.title} className="hover:bg-gray-50">
                      <td className="px-5 py-4 font-medium text-gray-900">
                        {j.title}
                      </td>
                      <td className="px-5 py-4 text-gray-700">{j.location}</td>
                      <td className="px-5 py-4 text-gray-700">{j.workers}</td>
                      <td className="px-5 py-4 text-emerald-700">{j.matches}</td>
                      <td className="px-5 py-4">
                        <StatusBadge status={j.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <HiringCopilot
              placeholder="Find finishers available tomorrow…"
              suggestions={[
                "Only show CSCS Gold",
                "Within 30 mins",
                "Available this week",
                "Schedule top 3",
              ]}
            />
          </div>
        </div>
      </main>
    </>
  );
}

function Stat({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">
        {value}
        {delta && (
          <span className="ml-1 text-xs font-medium text-emerald-700">
            {delta}
          </span>
        )}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "Active"
      ? "bg-emerald-50 text-emerald-700"
      : status === "Interviewing"
        ? "bg-blue-50 text-blue-700"
        : "bg-gray-100 text-gray-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>
      {status}
    </span>
  );
}
