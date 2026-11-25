import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Plus,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  approveApplicationAndAllocate,
  recordAllocationPayment,
  rejectApplication,
  startApplicationVerification,
  submitLandApplication,
} from '../lib/firestoreService';
import type {
  AllocationPayment,
  ApplicationStatus,
  LandAllocation,
  LandApplication,
  LandParcel,
  UserProfile,
  UserRole,
} from '../types';

interface ApplicationsModuleProps {
  parcels: LandParcel[];
  applications: LandApplication[];
  allocations: LandAllocation[];
  payments: AllocationPayment[];
  effectiveRole: UserRole;
  actor: UserProfile;
  actorEmail: string;
  preselectedParcelId: string | null;
  onClearPreselectedParcel: () => void;
}

const APP_STATUS_STYLE: Record<ApplicationStatus, string> = {
  Submitted: 'bg-slate-100 border-slate-300 text-slate-800',
  'Under Verification': 'bg-amber-50 border-amber-200 text-amber-800',
  Approved: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  Rejected: 'bg-red-50 border-red-200 text-red-800',
};

export function ApplicationsModule({
  parcels,
  applications,
  allocations,
  payments,
  effectiveRole,
  actor,
  actorEmail,
  preselectedParcelId,
  onClearPreselectedParcel,
}: ApplicationsModuleProps) {
  const [subTab, setSubTab] = useState<'applications' | 'allocations'>('applications');
  const [statusFilter, setStatusFilter] = useState<'All' | ApplicationStatus>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showApplyForm, setShowApplyForm] = useState(!!preselectedParcelId);

  // Application form state
  const eligibleParcels = useMemo(
    () => parcels.filter((p) => p.status === 'Available' || p.status === 'Pending'),
    [parcels]
  );
  const [selectedParcelId, setSelectedParcelId] = useState<string>(
    preselectedParcelId || eligibleParcels[0]?.id || ''
  );
  const [applicantName, setApplicantName] = useState(actor.displayName);
  const [applicantEmail, setApplicantEmail] = useState(actorEmail);
  const [applicantPhone, setApplicantPhone] = useState('');
  const [nationalIdRef, setNationalIdRef] = useState('');
  const [applicantAddress, setApplicantAddress] = useState('');
  const [purpose, setPurpose] = useState('');
  const [proposedDevelopment, setProposedDevelopment] = useState('');
  const [submittingApp, setSubmittingApp] = useState(false);

  // Review / Allocation action state
  const [reviewingApp, setReviewingApp] = useState<LandApplication | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [approvalFeeGhs, setApprovalFeeGhs] = useState('');
  const [processingReview, setProcessingReview] = useState(false);

  // Payment recording state
  const [payingAllocation, setPayingAllocation] = useState<LandAllocation | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<AllocationPayment['paymentStatus']>('Paid');
  const [receiptRef, setReceiptRef] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const parcelMap = useMemo(() => new Map(parcels.map((p) => [p.id, p])), [parcels]);

  const canVerify = ['super_admin', 'palace_admin'].includes(effectiveRole);
  const canApprove = ['super_admin', 'approving_officer'].includes(effectiveRole);
  const canRecordPayments = ['super_admin', 'palace_admin'].includes(effectiveRole);

  const effectiveParcelId = preselectedParcelId || selectedParcelId || eligibleParcels[0]?.id || '';

  const filteredApplications = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return applications.filter((a) => {
      if (statusFilter !== 'All' && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.applicationCode.toLowerCase().includes(q) ||
        a.parcelCode.toLowerCase().includes(q) ||
        a.applicantName.toLowerCase().includes(q) ||
        a.purpose.toLowerCase().includes(q)
      );
    });
  }, [applications, statusFilter, searchQuery]);

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    const targetParcel = parcelMap.get(effectiveParcelId);
    if (!targetParcel) {
      setBanner({ type: 'err', text: 'Select an eligible Available or Pending parcel.' });
      return;
    }

    setSubmittingApp(true);
    try {
      const code = await submitLandApplication(
        targetParcel,
        {
          applicantName,
          applicantEmail,
          applicantPhone,
          nationalIdRef,
          applicantAddress,
          purpose,
          proposedDevelopment,
        },
        actor
      );
      setPurpose('');
      setProposedDevelopment('');
      setApplicantPhone('');
      setNationalIdRef('');
      setApplicantAddress('');
      setShowApplyForm(false);
      onClearPreselectedParcel();
      setBanner({
        type: 'ok',
        text: `Application ${code} submitted for parcel ${targetParcel.parcelCode}.`,
      });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to submit application.',
      });
    } finally {
      setSubmittingApp(false);
    }
  };

  const handleStartVerification = async (app: LandApplication) => {
    const parcel = parcelMap.get(app.parcelId);
    if (!parcel) return;
    setProcessingReview(true);
    setBanner(null);
    try {
      await startApplicationVerification(
        app,
        parcel,
        'Claim and boundary verification initiated by Palace Secretariat.',
        actor
      );
      setBanner({
        type: 'ok',
        text: `${app.applicationCode} moved to Under Verification; parcel ${parcel.parcelCode} marked Pending.`,
      });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to start verification.',
      });
    } finally {
      setProcessingReview(false);
    }
  };

  const handleApproveAndAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingApp) return;
    const parcel = parcelMap.get(reviewingApp.parcelId);
    if (!parcel) return;

    setProcessingReview(true);
    setBanner(null);
    try {
      const allocCode = await approveApplicationAndAllocate(
        reviewingApp,
        parcel,
        Number(approvalFeeGhs) || parcel.customaryFeeGhs,
        reviewNotes,
        actor
      );
      setReviewingApp(null);
      setReviewNotes('');
      setBanner({
        type: 'ok',
        text: `Approved ${reviewingApp.applicationCode}. Allocation ${allocCode} recorded and ${parcel.parcelCode} marked Allocated.`,
      });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Approval failed.',
      });
    } finally {
      setProcessingReview(false);
    }
  };

  const handleReject = async (app: LandApplication) => {
    const parcel = parcelMap.get(app.parcelId);
    if (!parcel) return;
    setProcessingReview(true);
    setBanner(null);
    try {
      const otherPending = applications.some(
        (other) =>
          other.id !== app.id &&
          other.parcelId === parcel.id &&
          other.status === 'Under Verification'
      );
      await rejectApplication(
        app,
        parcel,
        reviewNotes || 'Declined after Palace Authority review.',
        !otherPending,
        actor
      );
      setReviewingApp(null);
      setReviewNotes('');
      setBanner({
        type: 'ok',
        text: `Application ${app.applicationCode} declined.`,
      });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Rejection failed.',
      });
    } finally {
      setProcessingReview(false);
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingAllocation) return;
    setSavingPayment(true);
    setBanner(null);
    try {
      await recordAllocationPayment(
        payingAllocation,
        Number(paymentAmount) || 0,
        paymentStatus,
        receiptRef,
        actor
      );
      setPayingAllocation(null);
      setPaymentAmount('');
      setReceiptRef('');
      setBanner({
        type: 'ok',
        text: `Payment recorded for ${payingAllocation.allocationCode}.`,
      });
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Could not record payment.',
      });
    } finally {
      setSavingPayment(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Land Applications & Customary Allocations
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Submit parcel requests, verify competing claims, and authorize allocations with double-allocation safeguards.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowApplyForm((v) => !v);
            if (showApplyForm) onClearPreselectedParcel();
          }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          {showApplyForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showApplyForm ? 'Close Form' : 'New Land Application'}
        </button>
      </div>

      {banner && (
        <div
          className={`p-3.5 text-xs rounded-xl border flex items-center gap-2.5 ${
            banner.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {banner.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      {/* Submit Application Form */}
      {(showApplyForm || !!preselectedParcelId) && (
        <form
          onSubmit={handleSubmitApplication}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-base font-semibold text-slate-900">
              Customary Land Application Form
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowApplyForm(false);
                onClearPreselectedParcel();
              }}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>

          {eligibleParcels.length === 0 ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              No Available or Pending parcels are currently open for application.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Target Parcel (Only unallocated parcels eligible) *
                  </label>
                  <select
                    required
                    value={effectiveParcelId}
                    onChange={(e) => {
                      onClearPreselectedParcel();
                      setSelectedParcelId(e.target.value);
                    }}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  >
                    {eligibleParcels.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.parcelCode} — {p.title} ({p.zone}, {p.areaAcres.toFixed(2)} ac · {p.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Applicant Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={applicantName}
                    onChange={(e) => setApplicantName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Contact Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="+233 24 000 0000"
                    value={applicantPhone}
                    onChange={(e) => setApplicantPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Contact Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={applicantEmail}
                    onChange={(e) => setApplicantEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Ghana Card / National ID Ref
                  </label>
                  <input
                    type="text"
                    placeholder="GHA-000000000-0"
                    value={nationalIdRef}
                    onChange={(e) => setNationalIdRef(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Residential Address
                  </label>
                  <input
                    type="text"
                    placeholder="Abetifi / Accra / Kumasi address"
                    value={applicantAddress}
                    onChange={(e) => setApplicantAddress(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Purpose of Land Request *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Family Residence, Commercial Pharmacy, Agro-Processing Facility"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Proposed Development Timeline & Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe intended building plan, timeline, and community alignment..."
                  value={proposedDevelopment}
                  onChange={(e) => setProposedDevelopment(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="submit"
                  disabled={submittingApp}
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg"
                >
                  {submittingApp ? 'Submitting...' : 'Submit Application to Palace'}
                </button>
              </div>
            </>
          )}
        </form>
      )}

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('applications')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              subTab === 'applications'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Applications Queue ({applications.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('allocations')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              subTab === 'allocations'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Approved Allocations & Payments ({allocations.length})
          </button>
        </div>

        {subTab === 'applications' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                placeholder="Search applications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
              />
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['All', 'Submitted', 'Under Verification', 'Approved', 'Rejected'] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      statusFilter === st
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Inline Approval Modal/Panel */}
      {reviewingApp && canApprove && (
        <form
          onSubmit={handleApproveAndAllocate}
          className="bg-white border border-emerald-300 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-semibold text-slate-900">
                Palace Authority Decision — {reviewingApp.applicationCode} ({reviewingApp.parcelCode})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setReviewingApp(null)}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-slate-600">
            Applicant: <strong className="text-slate-900">{reviewingApp.applicantName}</strong> ·
            Purpose: {reviewingApp.purpose}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Approved Customary Fee (GHS)
              </label>
              <input
                type="number"
                min={0}
                required
                value={approvalFeeGhs}
                onChange={(e) => setApprovalFeeGhs(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Palace Authority Minute / Notes
              </label>
              <input
                type="text"
                placeholder="Approved by Abetifi Palace Lands Committee sitting..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={processingReview}
              onClick={() => handleReject(reviewingApp)}
              className="px-4 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg"
            >
              Decline Application
            </button>
            <button
              type="submit"
              disabled={processingReview}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              {processingReview ? 'Processing...' : 'Approve & Allocate Parcel'}
            </button>
          </div>
        </form>
      )}

      {/* Applications Table */}
      {subTab === 'applications' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Application ID</th>
                  <th className="py-3 px-4">Parcel</th>
                  <th className="py-3 px-4">Applicant</th>
                  <th className="py-3 px-4">Purpose</th>
                  <th className="py-3 px-4">Submitted</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Governance Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredApplications.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                      No land applications found. Submit a new application for an available parcel to begin.
                    </td>
                  </tr>
                ) : (
                  filteredApplications.map((app) => {
                    const parcel = parcelMap.get(app.parcelId);
                    const isParcelBlocked =
                      parcel?.status === 'Allocated' || parcel?.status === 'Disputed';
                    return (
                      <tr key={app.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                          {app.applicationCode}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className="font-mono font-medium text-slate-900">
                            {app.parcelCode}
                          </div>
                          <div className="text-slate-500">
                            {app.parcelZone} · Parcel {parcel?.status || 'Unknown'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs font-medium text-slate-900">
                          {app.applicantName}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                          {app.purpose}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                          {app.submittedAt
                            ? app.submittedAt.toDate().toLocaleDateString()
                            : 'Just now'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 text-xs font-medium border rounded whitespace-nowrap ${
                              APP_STATUS_STYLE[app.status]
                            }`}
                          >
                            {app.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {canVerify && app.status === 'Submitted' && !isParcelBlocked && (
                              <button
                                type="button"
                                disabled={processingReview}
                                onClick={() => handleStartVerification(app)}
                                className="px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md"
                              >
                                Begin Verification
                              </button>
                            )}
                            {canApprove &&
                              (app.status === 'Submitted' ||
                                app.status === 'Under Verification') && (
                                <button
                                  type="button"
                                  disabled={isParcelBlocked}
                                  onClick={() => {
                                    setReviewingApp(app);
                                    setApprovalFeeGhs(String(parcel?.customaryFeeGhs ?? 0));
                                    setReviewNotes('');
                                  }}
                                  className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 rounded-md"
                                  title={
                                    isParcelBlocked
                                      ? 'Parcel is already Allocated or Disputed'
                                      : 'Review & Decide'
                                  }
                                >
                                  {isParcelBlocked ? 'Parcel Locked' : 'Review & Decide'}
                                </button>
                              )}
                            {app.status === 'Approved' || app.status === 'Rejected' ? (
                              <span className="text-xs text-slate-500">
                                {app.reviewedByName ? `By ${app.reviewedByName}` : 'Finalized'}
                              </span>
                            ) : !canVerify && !canApprove ? (
                              <span className="text-xs text-slate-500">Awaiting Palace Review</span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {payingAllocation && canRecordPayments && (
            <form
              onSubmit={handleSavePayment}
              className="bg-white border border-slate-300 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    Record Customary Payment — {payingAllocation.allocationCode} (
                    {payingAllocation.parcelCode})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPayingAllocation(null)}
                  className="text-xs text-slate-500"
                >
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Amount Paid (GHS) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Status
                  </label>
                  <select
                    value={paymentStatus}
                    onChange={(e) =>
                      setPaymentStatus(e.target.value as AllocationPayment['paymentStatus'])
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  >
                    <option value="Paid">Paid in Full</option>
                    <option value="Partial">Partial Installment</option>
                    <option value="Pending">Pending Clearance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Palace Receipt Ref *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="KWH-RCP-2026-081"
                    value={receiptRef}
                    onChange={(e) => setReceiptRef(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingPayment}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                >
                  {savingPayment ? 'Saving...' : 'Save Payment Receipt'}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Allocation Code</th>
                    <th className="py-3 px-4">Parcel ID</th>
                    <th className="py-3 px-4">Allottee</th>
                    <th className="py-3 px-4">Approved By</th>
                    <th className="py-3 px-4 text-right">Fee (GHS)</th>
                    <th className="py-3 px-4">Payment</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {allocations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                        No approved allocations recorded yet.
                      </td>
                    </tr>
                  ) : (
                    allocations.map((alloc) => (
                      <tr key={alloc.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">
                          {alloc.allocationCode}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-800">
                          {alloc.parcelCode}
                        </td>
                        <td className="py-3 px-4 text-xs font-medium text-slate-900">
                          {alloc.applicantName}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {alloc.approvedByName}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-900">
                          {alloc.customaryFeeGhs.toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 text-xs font-medium border rounded ${
                              alloc.paymentStatus === 'Paid'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : alloc.paymentStatus === 'Partial'
                                ? 'bg-amber-50 border-amber-200 text-amber-800'
                                : 'bg-slate-100 border-slate-300 text-slate-700'
                            }`}
                          >
                            {alloc.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canRecordPayments ? (
                            <button
                              type="button"
                              onClick={() => {
                                setPayingAllocation(alloc);
                                setPaymentAmount(String(alloc.customaryFeeGhs));
                                setReceiptRef(`KWH-RCP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded-md"
                            >
                              Record Payment
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500">
                              {payments.filter((p) => p.allocationId === alloc.id).length} receipts
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
