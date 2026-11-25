import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { updateUserRole } from '../lib/firestoreService';
import { exportAllocationsToCSV, exportParcelsToGeoJSON } from '../lib/gis';
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type AllocationPayment,
  type AuditLog,
  type LandAllocation,
  type LandApplication,
  type LandParcel,
  type UserProfile,
  type UserRole,
} from '../types';

interface AdminReportsModuleProps {
  parcels: LandParcel[];
  applications: LandApplication[];
  allocations: LandAllocation[];
  payments: AllocationPayment[];
  usersList: UserProfile[];
  auditLogs: AuditLog[];
  currentUser: UserProfile;
  roleOverride: UserRole | null;
  onChangeRoleOverride: (role: UserRole | null) => void;
}

export function AdminReportsModule({
  parcels,
  applications,
  allocations,
  payments,
  usersList,
  auditLogs,
  currentUser,
  roleOverride,
  onChangeRoleOverride,
}: AdminReportsModuleProps) {
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const isTrueSuperAdmin = currentUser.role === 'super_admin';

  const stats = useMemo(() => {
    const totalAcres = parcels.reduce((acc, p) => acc + p.areaAcres, 0);
    const availableAcres = parcels
      .filter((p) => p.status === 'Available')
      .reduce((acc, p) => acc + p.areaAcres, 0);
    const allocatedCount = parcels.filter((p) => p.status === 'Allocated').length;
    const pendingApps = applications.filter(
      (a) => a.status === 'Submitted' || a.status === 'Under Verification'
    ).length;
    const totalPaidGhs = payments
      .filter((p) => p.paymentStatus === 'Paid' || p.paymentStatus === 'Partial')
      .reduce((acc, p) => acc + p.amountGhs, 0);

    return {
      totalParcels: parcels.length,
      totalAcres,
      availableAcres,
      allocatedCount,
      pendingApps,
      totalPaidGhs,
    };
  }, [parcels, applications, payments]);

  const triggerDownload = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const csv = exportAllocationsToCSV(allocations, parcels);
    triggerDownload(
      `Kwahu_Abetifi_Allocations_${new Date().toISOString().split('T')[0]}.csv`,
      csv,
      'text/csv;charset=utf-8;'
    );
  };

  const handleExportGeoJSON = () => {
    const geojson = exportParcelsToGeoJSON(parcels);
    triggerDownload(
      `Kwahu_Abetifi_Cadastre_${new Date().toISOString().split('T')[0]}.geojson`,
      geojson,
      'application/geo+json;charset=utf-8;'
    );
  };

  const handleRoleChange = async (target: UserProfile, nextRole: UserRole) => {
    setUpdatingUid(target.uid);
    setFeedback(null);
    try {
      await updateUserRole(
        target,
        nextRole,
        target.department || 'Palace Lands Secretariat',
        currentUser
      );
      setFeedback({
        type: 'ok',
        text: `Updated ${target.displayName} role to ${ROLE_LABELS[nextRole]}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to update role.',
      });
    } finally {
      setUpdatingUid(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Administration, Reports & Audit Trail
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Land statistics, spatial/registry exports, role-based access governance, and activity audit logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Allocations CSV
          </button>
          <button
            type="button"
            onClick={handleExportGeoJSON}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Cadastre GeoJSON
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Report
          </button>
        </div>
      </div>

      {/* Executive KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Registered Parcels</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
            {stats.totalParcels}
          </p>
          <p className="font-mono tabular-nums text-xs text-slate-500 mt-0.5">
            {stats.totalAcres.toFixed(2)} ac total
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Available Land</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-emerald-700 mt-1">
            {stats.availableAcres.toFixed(2)} ac
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Open for application</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Allocated Parcels</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
            {stats.allocatedCount}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Active Palace grants</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Pending Review</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-amber-700 mt-1">
            {stats.pendingApps}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Active applications</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 col-span-2 lg:col-span-1">
          <p className="text-xs font-medium text-slate-500">Fees Recorded</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
            GHS {stats.totalPaidGhs.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Customary receipts</p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 text-xs rounded-xl border flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Super Admin Role-View Evaluation Switcher */}
      {isTrueSuperAdmin && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 print:hidden">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-semibold text-slate-900">
                Role Workflow Preview (Super Administrator Tool)
              </h3>
            </div>
            {roleOverride && (
              <button
                type="button"
                onClick={() => onChangeRoleOverride(null)}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >
                Reset to Super Administrator
              </button>
            )}
          </div>
          <p className="text-xs text-slate-600">
            Switch your active UI role lens to test and evaluate permissions across all five Palace administration roles.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((roleKey) => {
              const active = (roleOverride || currentUser.role) === roleKey;
              return (
                <button
                  key={roleKey}
                  type="button"
                  onClick={() =>
                    onChangeRoleOverride(roleKey === currentUser.role ? null : roleKey)
                  }
                  className={`p-3 text-left border rounded-lg transition-colors ${
                    active
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-950'
                      : 'bg-slate-50 border-slate-200 hover:bg-white text-slate-800'
                  }`}
                >
                  <p className="text-xs font-semibold">{ROLE_LABELS[roleKey]}</p>
                  <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">
                    {ROLE_DESCRIPTIONS[roleKey]}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* User & Role Management */}
      {isTrueSuperAdmin && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              System Users & Role Assignments ({usersList.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">User Name</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Assigned Role</th>
                  <th className="py-3 px-4 text-right">Update Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {usersList.map((u) => (
                  <tr key={u.uid}>
                    <td className="py-3 px-4 font-medium text-slate-900">{u.displayName}</td>
                    <td className="py-3 px-4 text-slate-600">{u.department || 'General'}</td>
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {ROLE_LABELS[u.role]}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <select
                        disabled={updatingUid === u.uid}
                        value={u.role}
                        onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                        className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-md"
                      >
                        {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Logs */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Administrative Audit Logs ({auditLogs.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No administrative audit entries visible for your role.
                  </td>
                </tr>
              ) : (
                auditLogs.slice(0, 30).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {log.timestamp ? log.timestamp.toDate().toLocaleString() : 'Just now'}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                      {log.userName} · {ROLE_LABELS[log.userRole as UserRole] || log.userRole}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-emerald-800 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{log.details}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Statutory Scope Notice */}
      <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 leading-relaxed">
        <strong className="text-slate-900">Customary Land Governance Scope:</strong> This GIS
        platform supports digital mapping, application tracking, and allocation record-keeping for
        the Kwahu Abetifi Palace. Allocation authority remains strictly with designated Palace
        Approving Officers, and records should be complemented by statutory cadastral certification
        and registration through the Ghana Lands Commission.
      </div>
    </div>
  );
}
