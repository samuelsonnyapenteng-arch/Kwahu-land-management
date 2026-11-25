import { useState } from 'react';
import {
  CheckCircle2,
  FilePlus2,
  FileText,
  History,
  MapPin,
  ShieldAlert,
} from 'lucide-react';
import { attachParcelDocument, updateParcelStatusOrNotes } from '../lib/firestoreService';
import {
  PARCEL_STATUS_STYLE,
  type DocumentType,
  type LandParcel,
  type ParcelDocument,
  type ParcelStatus,
  type ParcelTrackingEvent,
  type UserProfile,
  type UserRole,
} from '../types';

interface ParcelInspectorPanelProps {
  parcel: LandParcel | null;
  documents: ParcelDocument[];
  history: ParcelTrackingEvent[];
  effectiveRole: UserRole;
  actor: UserProfile;
  onApplyForParcel: (parcel: LandParcel) => void;
}

export function ParcelInspectorPanel({
  parcel,
  documents,
  history,
  effectiveRole,
  actor,
  onApplyForParcel,
}: ParcelInspectorPanelProps) {
  const [showDocForm, setShowDocForm] = useState(false);
  const [docType, setDocType] = useState<DocumentType>('Survey Plan');
  const [docRefNo, setDocRefNo] = useState('');
  const [docFileName, setDocFileName] = useState('');
  const [docSummary, setDocSummary] = useState('');
  const [savingDoc, setSavingDoc] = useState(false);

  const [showStatusEditor, setShowStatusEditor] = useState(false);
  const [nextStatus, setNextStatus] = useState<ParcelStatus>('Available');
  const [statusNotes, setStatusNotes] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  if (!parcel) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-center min-h-[360px]">
        <MapPin className="w-8 h-8 text-slate-400 mb-3" />
        <h3 className="text-base font-semibold text-slate-900">Select a Land Parcel</h3>
        <p className="text-sm text-slate-600 mt-1 max-w-xs">
          Click any color-coded polygon on the Abetifi GIS map to inspect coordinates,
          survey documents, and allocation eligibility.
        </p>
      </div>
    );
  }

  const parcelDocs = documents.filter((d) => d.parcelId === parcel.id);
  const parcelEvents = history.filter((h) => h.parcelId === parcel.id).slice(0, 5);
  const statusStyle = PARCEL_STATUS_STYLE[parcel.status];

  const canModifyParcel = ['super_admin', 'palace_admin', 'surveyor'].includes(effectiveRole);
  const canChangeStatus =
    effectiveRole === 'super_admin' ||
    (['palace_admin'].includes(effectiveRole) && parcel.status !== 'Allocated');
  const canApply = parcel.status === 'Available' || parcel.status === 'Pending';

  const handleAttachDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docRefNo.trim() || !docFileName.trim()) return;
    setSavingDoc(true);
    setFeedback(null);
    try {
      await attachParcelDocument(
        parcel,
        {
          documentType: docType,
          referenceNo: docRefNo,
          fileName: docFileName,
          summary: docSummary,
        },
        actor
      );
      setDocRefNo('');
      setDocFileName('');
      setDocSummary('');
      setShowDocForm(false);
      setFeedback({ type: 'ok', msg: 'Document linked to parcel record.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Unable to attach document.',
      });
    } finally {
      setSavingDoc(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingStatus(true);
    setFeedback(null);
    try {
      await updateParcelStatusOrNotes(
        parcel,
        nextStatus,
        statusNotes || parcel.notes || '',
        actor
      );
      setShowStatusEditor(false);
      setFeedback({ type: 'ok', msg: `Status updated to ${nextStatus}.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Status update failed.',
      });
    } finally {
      setSavingStatus(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-medium text-slate-500">
              {parcel.parcelCode} · {parcel.landUse}
            </p>
            <h3 className="text-lg font-semibold text-slate-900 mt-0.5 leading-snug">
              {parcel.title}
            </h3>
          </div>
          <span
            className={`px-2.5 py-1 text-xs font-semibold border rounded-md whitespace-nowrap ${statusStyle.bg} ${statusStyle.border} ${statusStyle.text}`}
          >
            {parcel.status}
          </span>
        </div>
        <p className="text-xs text-slate-600">
          {parcel.zone} · Survey Ref {parcel.surveyPlanRef || 'Pending'}
        </p>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 bg-slate-50/70">
        <div className="p-3.5">
          <p className="text-[11px] font-medium text-slate-500">Area (Acres)</p>
          <p className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5">
            {parcel.areaAcres.toFixed(3)} ac
          </p>
        </div>
        <div className="p-3.5">
          <p className="text-[11px] font-medium text-slate-500">Area (Sq.m)</p>
          <p className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5">
            {parcel.areaSqm.toLocaleString()}
          </p>
        </div>
        <div className="p-3.5">
          <p className="text-[11px] font-medium text-slate-500">Customary Fee</p>
          <p className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5">
            GHS {parcel.customaryFeeGhs.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-5 overflow-y-auto max-h-[540px]">
        {feedback && (
          <div
            className={`p-3 text-xs rounded-lg border flex items-center gap-2 ${
              feedback.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.msg}</span>
          </div>
        )}

        {/* Primary Action */}
        <div className="flex flex-wrap items-center gap-2.5">
          {canApply ? (
            <button
              type="button"
              onClick={() => onApplyForParcel(parcel)}
              className="flex-1 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
            >
              Apply for This Parcel
            </button>
          ) : (
            <div className="flex-1 px-3 py-2 text-xs text-slate-600 bg-slate-100 rounded-lg">
              {parcel.status === 'Allocated'
                ? 'Parcel allocated — closed to new applications.'
                : 'Parcel disputed — frozen pending Palace arbitration.'}
            </div>
          )}

          {canChangeStatus && (
            <button
              type="button"
              onClick={() => {
                setNextStatus(parcel.status);
                setStatusNotes(parcel.notes || '');
                setShowStatusEditor((v) => !v);
              }}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            >
              Update Status
            </button>
          )}
        </div>

        {/* Inline Status Editor */}
        {showStatusEditor && canChangeStatus && (
          <form
            onSubmit={handleUpdateStatus}
            className="p-4 border border-slate-200 rounded-lg bg-slate-50 space-y-3"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Parcel Status
              </label>
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as ParcelStatus)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
              >
                <option value="Available">Available</option>
                <option value="Pending">Pending</option>
                <option value="Disputed">Disputed</option>
                {effectiveRole === 'super_admin' && (
                  <option value="Allocated">Allocated</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Administrative Notes
              </label>
              <textarea
                rows={2}
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowStatusEditor(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingStatus}
                className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md"
              >
                {savingStatus ? 'Saving...' : 'Save Status'}
              </button>
            </div>
          </form>
        )}

        {/* Notes & Coordinates */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-900">Boundary & Survey Summary</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            {parcel.notes || 'No survey notes recorded for this parcel.'}
          </p>
          <div className="text-xs font-mono tabular-nums text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
            <div>
              Centroid: {parcel.centroidLat.toFixed(6)}° N, {parcel.centroidLng.toFixed(6)}° E
            </div>
            <div className="text-[11px] text-slate-500">
              {parcel.coordinates.length} boundary vertices stored
            </div>
          </div>
        </div>

        {/* Documents */}
        <div className="space-y-2.5 pt-2 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              Land Documents ({parcelDocs.length})
            </h4>
            {canModifyParcel && (
              <button
                type="button"
                onClick={() => setShowDocForm((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                Attach
              </button>
            )}
          </div>

          {showDocForm && canModifyParcel && (
            <form
              onSubmit={handleAttachDocument}
              className="p-3.5 border border-slate-200 rounded-lg bg-slate-50 space-y-2.5"
            >
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocumentType)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
              >
                <option value="Survey Plan">Survey Plan</option>
                <option value="Site Plan">Site Plan</option>
                <option value="Palace Allocation Note">Palace Allocation Note</option>
                <option value="Boundary Verification">Boundary Verification</option>
                <option value="Other">Other</option>
              </select>
              <input
                type="text"
                required
                placeholder="Reference No. (e.g., KWH-SP-2026-041)"
                value={docRefNo}
                onChange={(e) => setDocRefNo(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
              />
              <input
                type="text"
                required
                placeholder="File name (e.g., ABT-AD-001_Plan.pdf)"
                value={docFileName}
                onChange={(e) => setDocFileName(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
              />
              <input
                type="text"
                placeholder="Document notes (optional)"
                value={docSummary}
                onChange={(e) => setDocSummary(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDocForm(false)}
                  className="px-2.5 py-1 text-xs text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDoc}
                  className="px-3 py-1 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
                >
                  {savingDoc ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          )}

          {parcelDocs.length === 0 ? (
            <p className="text-xs text-slate-500">No documents attached yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {parcelDocs.map((d) => (
                <li key={d.id} className="p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">{d.documentType}</span>
                    <span className="font-mono text-[11px] text-slate-500">{d.referenceNo}</span>
                  </div>
                  <p className="text-slate-600 mt-0.5 truncate">{d.fileName}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tracking History Preview */}
        <div className="space-y-2.5 pt-2 border-t border-slate-200">
          <h4 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-slate-500" />
            Recent Parcel History
          </h4>
          {parcelEvents.length === 0 ? (
            <p className="text-xs text-slate-500">No tracking events recorded.</p>
          ) : (
            <ul className="space-y-2">
              {parcelEvents.map((ev) => (
                <li key={ev.id} className="text-xs border-b border-slate-100 pb-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">{ev.eventType}</span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500">
                      {ev.timestamp ? ev.timestamp.toDate().toLocaleDateString() : 'Just now'}
                    </span>
                  </div>
                  <p className="text-slate-600 mt-0.5">{ev.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
