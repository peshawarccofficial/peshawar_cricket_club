import type { ReactNode } from "react";
export function StatCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return <div className="stat-card"><span className="stat-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}
