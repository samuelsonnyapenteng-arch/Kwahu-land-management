import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  query,
  where,
  type Timestamp,
} from 'firebase/firestore';
import {
  Compass,
  FileSpreadsheet,
  History,
  Layers,
  LogOut,
  Map as MapIcon,
  Menu,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { AdminReportsModule } from './components/AdminReportsModule';
import { ApplicationsModule } from './components/ApplicationsModule';
import { AuthPortal } from './components/AuthPortal';
import { LeafletParcelMap } from './components/LeafletParcelMap';
import { ParcelInspectorPanel } from './components/ParcelInspectorPanel';
import { RegistryModule } from './components/RegistryModule';
import { TrackingModule } from './components/TrackingModule';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from './lib/firebase';
import { seedInitialCadastreIfEmpty, syncUserOnSignIn } from './lib/firestoreService';
import {
  ABETIFI_ZONES,
  ROLE_LABELS,
  type AllocationPayment,
  type AppModule,
  type AuditLog,
  type LandAllocation,
  type LandApplication,
  type LandParcel,
  type ParcelDocument,
  type ParcelStatus,
  type ParcelTrackingEvent,
  type UserProfile,
  type UserRole,
} from './types';

function toMillis(ts?: Timestamp): number {
  if (!ts) return 0;
  try {
    return ts.toMillis();
  } catch {
    return 0;
  }
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [roleOverride, setRoleOverride] = useState<UserRole | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeModule, setActiveModule] = useState<AppModule>('map');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [crestImgFailed, setCrestImgFailed] = useState(false);

  // Live Firestore collections
  const [parcels, setParcels] = useState<LandParcel[]>([]);
  const [documents, setDocuments] = useState<ParcelDocument[]>([]);
  const [applications, setApplications] = useState<LandApplication[]>([]);
  const [allocations, setAllocations] = useState<LandAllocation[]>([]);
  const [payments, setPayments] = useState<AllocationPayment[]>([]);
  const [parcelHistory, setParcelHistory] = useState<ParcelTrackingEvent[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Map workspace selection & filters
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [mapStatusFilter, setMapStatusFilter] = useState<'All' | ParcelStatus>('All');
  const [mapZoneFilter, setMapZoneFilter] = useState<string>('All');
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [applyParcelId, setApplyParcelId] = useState<string | null>(null);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthError(null);
      if (!user) {
        setUserProfile(null);
        setRoleOverride(null);
        setAuthReady(true);
        return;
      }

      try {
        const profile = await syncUserOnSignIn(user);
        setUserProfile(profile);
        await seedInitialCadastreIfEmpty(profile);
      } catch (err) {
        setAuthError(
          err instanceof Error ? err.message : 'Unable to initialize user session.'
        );
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  // Firestore real-time subscriptions (strictly aligned with security rules)
  useEffect(() => {
    if (!authReady || !firebaseUser || !userProfile) {
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    const isBootstrappedAdmin =
      firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL &&
      firebaseUser.emailVerified;

    const unsubscribers: Array<() => void> = [];

    // 1. Parcels (Public Cadastre)
    unsubscribers.push(
      onSnapshot(
        query(collection(db, 'parcels'), where('isPublicCadastre', '==', true)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<LandParcel, 'id'>) }))
            .sort((a, b) => a.parcelCode.localeCompare(b.parcelCode));
          setParcels(list);
          setSelectedParcelId((curr) => (curr && list.some((p) => p.id === curr) ? curr : list[0]?.id || null));
          setDataLoading(false);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'parcels')
      )
    );

    // 2. Documents
    unsubscribers.push(
      onSnapshot(
        query(collection(db, 'documents'), where('isPublicCadastre', '==', true)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<ParcelDocument, 'id'>) }))
            .sort((a, b) => toMillis(b.uploadedAt) - toMillis(a.uploadedAt));
          setDocuments(list);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'documents')
      )
    );

    // 3. Parcel Tracking History
    unsubscribers.push(
      onSnapshot(
        query(collection(db, 'parcelHistory'), where('isPublicCadastre', '==', true)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<ParcelTrackingEvent, 'id'>) }))
            .sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
          setParcelHistory(list);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'parcelHistory')
      )
    );

    // 4. Applications
    const appsRef = isBootstrappedAdmin
      ? collection(db, 'applications')
      : query(collection(db, 'applications'), where('applicantUid', '==', firebaseUser.uid));
    unsubscribers.push(
      onSnapshot(
        appsRef,
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<LandApplication, 'id'>) }))
            .sort((a, b) => toMillis(b.submittedAt) - toMillis(a.submittedAt));
          setApplications(list);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'applications')
      )
    );

    // 5. Allocations
    const allocsRef = isBootstrappedAdmin
      ? collection(db, 'allocations')
      : query(collection(db, 'allocations'), where('applicantUid', '==', firebaseUser.uid));
    unsubscribers.push(
      onSnapshot(
        allocsRef,
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<LandAllocation, 'id'>) }))
            .sort((a, b) => toMillis(b.approvalDate) - toMillis(a.approvalDate));
          setAllocations(list);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'allocations')
      )
    );

    // 6. Payments
    const paysRef = isBootstrappedAdmin
      ? collection(db, 'payments')
      : query(collection(db, 'payments'), where('applicantUid', '==', firebaseUser.uid));
    unsubscribers.push(
      onSnapshot(
        paysRef,
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<AllocationPayment, 'id'>) }))
            .sort((a, b) => toMillis(b.recordedAt) - toMillis(a.recordedAt));
          setPayments(list);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'payments')
      )
    );

    // 7. Admin-only lists (users & auditLogs)
    if (isBootstrappedAdmin) {
      unsubscribers.push(
        onSnapshot(
          collection(db, 'users'),
          (snap) => {
            const list = snap.docs.map((d) => d.data() as UserProfile);
            setUsersList(list);
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'users')
        )
      );

      unsubscribers.push(
        onSnapshot(
          collection(db, 'auditLogs'),
          (snap) => {
            const list = snap.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLog, 'id'>) }))
              .sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
            setAuditLogs(list);
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'auditLogs')
        )
      );
    }

    return () => {
      unsubscribers.forEach((fn) => fn());
    };
  }, [authReady, firebaseUser, userProfile]);

  const effectiveRole: UserRole =
    userProfile?.role === 'super_admin' && roleOverride
      ? roleOverride
      : userProfile?.role || 'applicant';

  const filteredMapParcels = useMemo(() => {
    const q = mapSearchQuery.trim().toLowerCase();
    return parcels.filter((p) => {
      if (mapStatusFilter !== 'All' && p.status !== mapStatusFilter) return false;
      if (mapZoneFilter !== 'All' && p.zone !== mapZoneFilter) return false;
      if (!q) return true;
      return (
        p.parcelCode.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.zone.toLowerCase().includes(q)
      );
    });
  }, [parcels, mapStatusFilter, mapZoneFilter, mapSearchQuery]);

  const selectedParcel = useMemo(
    () => parcels.find((p) => p.id === selectedParcelId) || null,
    [parcels, selectedParcelId]
  );

  const mapStats = useMemo(() => {
    const available = parcels.filter((p) => p.status === 'Available').length;
    const allocated = parcels.filter((p) => p.status === 'Allocated').length;
    const pendingApps = applications.filter(
      (a) => a.status === 'Submitted' || a.status === 'Under Verification'
    ).length;
    const totalAcres = parcels.reduce((sum, p) => sum + p.areaAcres, 0);
    return {
      total: parcels.length,
      available,
      allocated,
      pendingApps,
      totalAcres,
    };
  }, [parcels, applications]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm font-medium text-slate-600">
          Initializing Kwahu Abetifi Palace GIS Portal...
        </div>
      </div>
    );
  }

  if (!firebaseUser || !userProfile) {
    return <AuthPortal />;
  }

  const navItems: Array<{ id: AppModule; label: string; icon: typeof MapIcon }> = [
    { id: 'map', label: 'GIS Parcel Map', icon: MapIcon },
    { id: 'registry', label: 'Parcels & Registry', icon: Layers },
    { id: 'applications', label: 'Applications', icon: FileSpreadsheet },
    { id: 'tracking', label: 'Land Tracking', icon: History },
    { id: 'admin', label: 'Admin & Reports', icon: ShieldCheck },
  ];

  const activeNavTitle = navItems.find((n) => n.id === activeModule)?.label || 'GIS Parcel Map';

  const handleInspectOnMap = (parcel: LandParcel) => {
    setSelectedParcelId(parcel.id);
    setActiveModule('map');
    setMobileNavOpen(false);
  };

  const handleApplyForParcel = (parcel: LandParcel) => {
    setApplyParcelId(parcel.id);
    setActiveModule('applications');
    setMobileNavOpen(false);
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const SidebarContent = (
    <div className="h-full flex flex-col justify-between bg-[#0F291E] text-slate-100">
      <div>
        <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden border border-white/15 bg-emerald-900 flex items-center justify-center shrink-0">
            {!crestImgFailed ? (
              <img
                src="/src/assets/images/palace_crest_emblem_1795623147136.jpg"
                alt="Abetifi Palace Seal"
                referrerPolicy="no-referrer"
                onError={() => setCrestImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <Compass className="w-5 h-5 text-emerald-300" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold tracking-tight text-white truncate">
              Abetifi Palace
            </p>
            <p className="text-[11px] text-emerald-200/80 truncate">Customary Land GIS</p>
          </div>
        </div>

        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveModule(item.id);
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-white/10 space-y-3">
        <div className="text-xs space-y-0.5">
          <p className="font-semibold text-white truncate">{userProfile.displayName}</p>
          <p className="text-emerald-200/90 truncate">{ROLE_LABELS[effectiveRole]}</p>
          {roleOverride && (
            <p className="text-[11px] text-amber-300">Role preview active</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 bg-white/10 hover:bg-white/15 rounded-lg transition-colors whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen print:hidden">
        {SidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-[1000] lg:hidden flex">
          <div className="w-64 h-full">{SidebarContent}</div>
          <div
            className="flex-1 bg-slate-950/50"
            onClick={() => setMobileNavOpen(false)}
          />
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb left, single primary action right */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-6 sticky top-0 z-[500] print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
              aria-label="Toggle navigation"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-medium text-slate-500 whitespace-nowrap hidden sm:inline">
                Kwahu Abetifi Palace
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <span className="font-semibold text-slate-900 truncate">{activeNavTitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <span className="hidden md:inline text-xs text-slate-500 whitespace-nowrap">
              {ROLE_LABELS[effectiveRole]}
            </span>
            <button
              type="button"
              onClick={() => {
                if (activeModule === 'map') {
                  setActiveModule('applications');
                } else {
                  setActiveModule('map');
                }
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {activeModule === 'map' ? 'Submit Land Request' : 'Open GIS Map'}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto space-y-6">
          {authError && (
            <div className="p-3.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl">
              {authError}
            </div>
          )}

          {activeModule === 'map' && (
            <div className="space-y-6">
              {/* 4-column Summary Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500">Digitized Parcels</p>
                  <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                    {dataLoading ? '—' : mapStats.total}
                  </p>
                  <p className="font-mono tabular-nums text-xs text-slate-500 mt-0.5">
                    {mapStats.totalAcres.toFixed(2)} acres mapped
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500">Available Plots</p>
                  <p className="font-mono tabular-nums text-2xl font-bold text-emerald-700 mt-1">
                    {dataLoading ? '—' : mapStats.available}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Eligible for application</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500">Allocated Plots</p>
                  <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                    {dataLoading ? '—' : mapStats.allocated}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Granted by Palace</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500">Active Applications</p>
                  <p className="font-mono tabular-nums text-2xl font-bold text-amber-700 mt-1">
                    {dataLoading ? '—' : mapStats.pendingApps}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">In verification queue</p>
                </div>
              </div>

              {/* Map Filter Toolbar */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      placeholder="Find parcel code or locality..."
                      value={mapSearchQuery}
                      onChange={(e) => setMapSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-emerald-700"
                    />
                  </div>
                  <select
                    value={mapZoneFilter}
                    onChange={(e) => setMapZoneFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="All">All Abetifi Zones</option>
                    {ABETIFI_ZONES.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                  {(['All', 'Available', 'Pending', 'Allocated', 'Disputed'] as const).map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setMapStatusFilter(st)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          mapStatusFilter === st
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

              {/* Dominant Focal Anchor: GIS Map + Inspector */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                <div className="xl:col-span-8">
                  <LeafletParcelMap
                    parcels={filteredMapParcels}
                    selectedParcelId={selectedParcelId}
                    onSelectParcel={(p) => setSelectedParcelId(p.id)}
                    heightClassName="h-[560px]"
                  />
                </div>
                <div className="xl:col-span-4">
                  <ParcelInspectorPanel
                    parcel={selectedParcel}
                    documents={documents}
                    history={parcelHistory}
                    effectiveRole={effectiveRole}
                    actor={userProfile}
                    onApplyForParcel={handleApplyForParcel}
                  />
                </div>
              </div>
            </div>
          )}

          {activeModule === 'registry' && (
            <RegistryModule
              parcels={parcels}
              documents={documents}
              effectiveRole={effectiveRole}
              actor={userProfile}
              onInspectOnMap={handleInspectOnMap}
            />
          )}

          {activeModule === 'applications' && (
            <ApplicationsModule
              parcels={parcels}
              applications={applications}
              allocations={allocations}
              payments={payments}
              effectiveRole={effectiveRole}
              actor={userProfile}
              actorEmail={firebaseUser.email || ''}
              preselectedParcelId={applyParcelId}
              onClearPreselectedParcel={() => setApplyParcelId(null)}
            />
          )}

          {activeModule === 'tracking' && (
            <TrackingModule
              parcels={parcels}
              history={parcelHistory}
              onInspectOnMap={handleInspectOnMap}
            />
          )}

          {activeModule === 'admin' && (
            <AdminReportsModule
              parcels={parcels}
              applications={applications}
              allocations={allocations}
              payments={payments}
              usersList={usersList}
              auditLogs={auditLogs}
              currentUser={userProfile}
              roleOverride={roleOverride}
              onChangeRoleOverride={setRoleOverride}
            />
          )}
        </main>

        <footer className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <span>Kwahu Abetifi Palace · Customary Land Tracking & Allocation GIS</span>
          <span>
            Supports Palace land administration; statutory registration remains with the Ghana Lands Commission.
          </span>
        </footer>
      </div>
    </div>
  );
}
