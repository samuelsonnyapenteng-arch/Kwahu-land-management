import { useMemo, useState } from 'react';
import { History, MapPin, Search } from 'lucide-react';
import {
  PARCEL_STATUS_STYLE,
  type LandParcel,
  type ParcelTrackingEvent,
} from '../types';

interface TrackingModuleProps {
  parcels: LandParcel[];
  history: ParcelTrackingEvent[];
  onInspectOnMap: (parcel: LandParcel) => void;
}

export function TrackingModule({
  parcels,
  history,
  onInspectOnMap,
}: TrackingModuleProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedParcelFilter, setSelectedParcelFilter] = useState<string>('All');

  const parcelMap = useMemo(() => new Map(parcels.map((p) => [p.id, p])), [parcels]);

  const statusTotals = useMemo(() => {
    const counts = { Available: 0, Pending: 0, Allocated: 0, Disputed: 0 };
    const acres = { Available: 0, Pending: 0, Allocated: 0, Disputed: 0 };
    for (const p of parcels) {
      counts[p.status] += 1;
      acres[p.status] += p.areaAcres;
    }
    return { counts, acres };
  }, [parcels]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return history.filter((ev) => {
      if (selectedParcelFilter !== 'All' && ev.parcelId !== selectedParcelFilter) return false;
      if (!q) return true;
      return (
        ev.parcelCode.toLowerCase().includes(q) ||
        ev.eventType.toLowerCase().includes(q) ||
        ev.summary.toLowerCase().includes(q) ||
        ev.actorName.toLowerCase().includes(q)
      );
    });
  }, [history, searchQuery, selectedParcelFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Land Status Monitor & Allocation History
        </h2>
        <p className="text-sm text-slate-600 mt-0.5">
          Track parcel availability, verification transitions, and chronological allocation milestones across Abetifi.
        </p>
      </div>

      {/* Status Distribution Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(['Available', 'Pending', 'Allocated', 'Disputed'] as const).map((status) => {
          const st = PARCEL_STATUS_STYLE[status];
          return (
            <div
              key={status}
              className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between"
            >
              <div>
                <p className="text-xs font-medium text-slate-500">{status} Parcels</p>
                <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                  {statusTotals.counts[status]}
                </p>
                <p className="font-mono tabular-nums text-xs text-slate-500 mt-1">
                  {statusTotals.acres[status].toFixed(2)} acres total
                </p>
              </div>
              <span
                className={`px-2.5 py-1 text-xs font-medium border rounded-md ${st.bg} ${st.border} ${st.text}`}
              >
                {status}
              </span>
            </div>
          );
        })}
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Search timeline by parcel code, actor, or summary..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-emerald-700"
          />
        </div>

        <select
          value={selectedParcelFilter}
          onChange={(e) => setSelectedParcelFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
        >
          <option value="All">All Parcels ({parcels.length})</option>
          {parcels.map((p) => (
            <option key={p.id} value={p.id}>
              {p.parcelCode} — {p.title}
            </option>
          ))}
        </select>
      </div>

      {/* Chronological Lifecycle Log */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-700" />
          <h3 className="text-sm font-semibold text-slate-900">
            Parcel Tracking Timeline ({filteredEvents.length} events)
          </h3>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No tracking events match your current filter.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredEvents.map((ev) => {
              const linkedParcel = parcelMap.get(ev.parcelId);
              return (
                <div
                  key={ev.id}
                  className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-slate-900">
                        {ev.parcelCode}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-semibold text-emerald-800">{ev.eventType}</span>
                      {ev.previousStatus && ev.newStatus && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-600">
                            {ev.previousStatus} → {ev.newStatus}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-slate-700">{ev.summary}</p>
                    <p className="text-xs text-slate-500">
                      Recorded by {ev.actorName} ·{' '}
                      <span className="font-mono tabular-nums">
                        {ev.timestamp ? ev.timestamp.toDate().toLocaleString() : 'Just now'}
                      </span>
                    </p>
                  </div>

                  {linkedParcel && (
                    <button
                      type="button"
                      onClick={() => onInspectOnMap(linkedParcel)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      View Parcel
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
