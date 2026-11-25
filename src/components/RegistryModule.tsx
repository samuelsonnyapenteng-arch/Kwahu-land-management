import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  MapPin,
  Plus,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { registerParcel } from '../lib/firestoreService';
import {
  ABETIFI_CENTER,
  calculatePolygonAreaSqm,
  findOverlappingParcel,
  formatCoordinatesText,
  parseCoordinateText,
  sqmToAcres,
} from '../lib/gis';
import {
  ABETIFI_ZONES,
  PARCEL_STATUS_STYLE,
  type LandParcel,
  type LandUseType,
  type LatLngPoint,
  type ParcelDocument,
  type ParcelStatus,
  type UserProfile,
  type UserRole,
} from '../types';
import { LeafletParcelMap } from './LeafletParcelMap';

interface RegistryModuleProps {
  parcels: LandParcel[];
  documents: ParcelDocument[];
  effectiveRole: UserRole;
  actor: UserProfile;
  onInspectOnMap: (parcel: LandParcel) => void;
}

export function RegistryModule({
  parcels,
  documents,
  effectiveRole,
  actor,
  onInspectOnMap,
}: RegistryModuleProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | ParcelStatus>('All');
  const [showRegisterPanel, setShowRegisterPanel] = useState(false);

  // Form state
  const [parcelCode, setParcelCode] = useState('');
  const [title, setTitle] = useState('');
  const [zone, setZone] = useState<string>(ABETIFI_ZONES[0]);
  const [landUse, setLandUse] = useState<LandUseType>('Residential');
  const [status, setStatus] = useState<ParcelStatus>('Available');
  const [surveyPlanRef, setSurveyPlanRef] = useState('');
  const [docFileName, setDocFileName] = useState('');
  const [customaryFeeGhs, setCustomaryFeeGhs] = useState('18000');
  const [notes, setNotes] = useState('');
  const [drawnVertices, setDrawnVertices] = useState<LatLngPoint[]>([]);
  const [coordInput, setCoordInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const canRegister = ['super_admin', 'palace_admin', 'surveyor'].includes(effectiveRole);

  const filteredParcels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return parcels.filter((p) => {
      if (statusFilter !== 'All' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.parcelCode.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.zone.toLowerCase().includes(q) ||
        (p.surveyPlanRef || '').toLowerCase().includes(q)
      );
    });
  }, [parcels, searchQuery, statusFilter]);

  const activeCoords = useMemo(() => {
    if (drawnVertices.length >= 3) return drawnVertices;
    return parseCoordinateText(coordInput);
  }, [drawnVertices, coordInput]);

  const previewAreaSqm = useMemo(() => calculatePolygonAreaSqm(activeCoords), [activeCoords]);
  const overlapParcel = useMemo(
    () => (activeCoords.length >= 3 ? findOverlappingParcel(activeCoords, parcels) : null),
    [activeCoords, parcels]
  );

  const handleAddVertex = (pt: LatLngPoint) => {
    setDrawnVertices((prev) => {
      const next = [...prev, pt];
      setCoordInput(formatCoordinatesText(next));
      return next;
    });
  };

  const handleUndoVertex = () => {
    setDrawnVertices((prev) => {
      const next = prev.slice(0, -1);
      setCoordInput(formatCoordinatesText(next));
      return next;
    });
  };

  const handleClearVertices = () => {
    setDrawnVertices([]);
    setCoordInput('');
  };

  const handleCoordTextChange = (val: string) => {
    setCoordInput(val);
    const parsed = parseCoordinateText(val);
    setDrawnVertices(parsed);
  };

  const handleInsertSamplePlot = () => {
    // Generate a clean non-overlapping sample offset near Abetifi northern ridge
    const offset = (parcels.length % 6) * 0.0009;
    const baseLat = ABETIFI_CENTER.lat + 0.0052;
    const baseLng = ABETIFI_CENTER.lng - 0.003 + offset;
    const sample: LatLngPoint[] = [
      { lat: Number((baseLat + 0.0005).toFixed(6)), lng: Number(baseLng.toFixed(6)) },
      { lat: Number((baseLat + 0.0005).toFixed(6)), lng: Number((baseLng + 0.0006).toFixed(6)) },
      { lat: Number(baseLat.toFixed(6)), lng: Number((baseLng + 0.0006).toFixed(6)) },
      { lat: Number(baseLat.toFixed(6)), lng: Number(baseLng.toFixed(6)) },
    ];
    setDrawnVertices(sample);
    setCoordInput(formatCoordinatesText(sample));
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg(null);
    if (activeCoords.length < 3) {
      setFormMsg({
        type: 'err',
        text: 'Please digitize at least 3 boundary vertices on the map or enter valid coordinates.',
      });
      return;
    }
    if (overlapParcel) {
      setFormMsg({
        type: 'err',
        text: `Overlap blocked: Boundary intersects ${overlapParcel.parcelCode} (${overlapParcel.title}).`,
      });
      return;
    }

    setSubmitting(true);
    try {
      await registerParcel(
        {
          parcelCode,
          title,
          zone,
          landUse,
          coordinates: activeCoords,
          status,
          surveyPlanRef,
          customaryFeeGhs: Number(customaryFeeGhs) || 0,
          notes,
          documentFileName: docFileName,
        },
        parcels,
        actor
      );
      setParcelCode('');
      setTitle('');
      setSurveyPlanRef('');
      setDocFileName('');
      setNotes('');
      setDrawnVertices([]);
      setCoordInput('');
      setFormMsg({ type: 'ok', text: 'Parcel registered and digitized in the Abetifi cadastre.' });
    } catch (err) {
      setFormMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to register parcel.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Land Registration & Cadastral Inventory
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Centralized register of digitized customary land parcels, sizes, coordinates, and survey documents.
          </p>
        </div>

        {canRegister && (
          <button
            type="button"
            onClick={() => {
              setShowRegisterPanel((v) => !v);
              setFormMsg(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {showRegisterPanel ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showRegisterPanel ? 'Close Registration' : 'Register New Parcel'}
          </button>
        )}
      </div>

      {/* Registration Workspace */}
      {showRegisterPanel && canRegister && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-7">
            <LeafletParcelMap
              parcels={parcels}
              selectedParcelId={null}
              onSelectParcel={onInspectOnMap}
              drawingMode={true}
              drawnVertices={drawnVertices}
              onAddVertex={handleAddVertex}
              onUndoVertex={handleUndoVertex}
              onClearVertices={handleClearVertices}
              heightClassName="h-[460px]"
            />
          </div>

          <form
            onSubmit={handleRegisterSubmit}
            className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                New Parcel Registration
              </h3>
              <button
                type="button"
                onClick={handleInsertSamplePlot}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >
                Sample Coordinates
              </button>
            </div>

            {formMsg && (
              <div
                className={`p-3 text-xs rounded-lg border flex items-center gap-2 ${
                  formMsg.type === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {formMsg.type === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                )}
                <span>{formMsg.text}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Parcel ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ABT-NK-019"
                  value={parcelCode}
                  onChange={(e) => setParcelCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Zone / Locality *
                </label>
                <select
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  {ABETIFI_ZONES.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Parcel Title / Description *
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Nkwatia Ridge Residential Plot 19"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Land Use
                </label>
                <select
                  value={landUse}
                  onChange={(e) => setLandUse(e.target.value as LandUseType)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="Residential">Residential</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Agricultural">Agricultural</option>
                  <option value="Civic">Civic</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Initial Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ParcelStatus)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="Available">Available</option>
                  <option value="Pending">Pending</option>
                  <option value="Disputed">Disputed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fee (GHS)
                </label>
                <input
                  type="number"
                  min={0}
                  value={customaryFeeGhs}
                  onChange={(e) => setCustomaryFeeGhs(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Survey Plan Ref
                </label>
                <input
                  type="text"
                  placeholder="KWH-SP-2026-022"
                  value={surveyPlanRef}
                  onChange={(e) => setSurveyPlanRef(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Plan Document Name
                </label>
                <input
                  type="text"
                  placeholder="ABT-NK-019_Plan.pdf"
                  value={docFileName}
                  onChange={(e) => setDocFileName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700">
                  Boundary Coordinates (Click map or paste Lat, Lng / GeoJSON)
                </label>
                {previewAreaSqm > 0 && (
                  <span className="font-mono tabular-nums text-[11px] font-semibold text-emerald-700">
                    {sqmToAcres(previewAreaSqm).toFixed(3)} ac · {previewAreaSqm.toLocaleString()} sqm
                  </span>
                )}
              </div>
              <textarea
                rows={4}
                placeholder="Click vertices on the map or paste lines like:&#10;6.6780, -0.7450&#10;6.6780, -0.7444&#10;6.6774, -0.7444"
                value={coordInput}
                onChange={(e) => handleCoordTextChange(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Survey & Beacon Notes
              </label>
              <textarea
                rows={2}
                placeholder="Beacon markings, adjoining stool boundaries, access road details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !!overlapParcel}
              className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg transition-colors"
            >
              {submitting ? 'Registering Parcel...' : 'Register Parcel in Cadastre'}
            </button>
          </form>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Search by Parcel ID, title, zone, or survey plan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-emerald-700"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(['All', 'Available', 'Pending', 'Allocated', 'Disputed'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Parcel Registry Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Parcel ID</th>
                <th className="py-3 px-4">Title & Zone</th>
                <th className="py-3 px-4">Land Use</th>
                <th className="py-3 px-4 text-right">Acres</th>
                <th className="py-3 px-4 text-right">Sq. Meters</th>
                <th className="py-3 px-4 text-right">Fee (GHS)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredParcels.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-500">
                    No parcels match the current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredParcels.map((parcel) => {
                  const st = PARCEL_STATUS_STYLE[parcel.status];
                  return (
                    <tr key={parcel.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {parcel.parcelCode}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{parcel.title}</div>
                        <div className="text-xs text-slate-500">
                          {parcel.zone} · {parcel.surveyPlanRef || 'No plan ref'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">{parcel.landUse}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-900">
                        {parcel.areaAcres.toFixed(3)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                        {parcel.areaSqm.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-900">
                        {parcel.customaryFeeGhs.toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium border rounded ${st.bg} ${st.border} ${st.text}`}
                        >
                          {parcel.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onInspectOnMap(parcel)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-md transition-colors whitespace-nowrap"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          Locate on Map
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Survey Documents Index */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-slate-900">
          <FileText className="w-4 h-4 text-emerald-700" />
          <h3 className="text-sm font-semibold">Registered Land Documents ({documents.length})</h3>
        </div>
        {documents.length === 0 ? (
          <p className="text-xs text-slate-500">No land documents archived yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {documents.slice(0, 9).map((docItem) => (
              <div
                key={docItem.id}
                className="border border-slate-200 rounded-lg p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-slate-900">
                    {docItem.parcelCode}
                  </span>
                  <span className="text-slate-500">{docItem.documentType}</span>
                </div>
                <p className="font-medium text-slate-800 truncate">{docItem.fileName}</p>
                <p className="text-slate-500">
                  Ref: {docItem.referenceNo} · {docItem.verifiedBy || 'Secretariat'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
