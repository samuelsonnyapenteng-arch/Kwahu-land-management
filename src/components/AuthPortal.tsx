import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Compass, FileCheck2, Layers, ShieldCheck } from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';

export function AuthPortal() {
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [crestImgFailed, setCrestImgFailed] = useState(false);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Sign-in could not be completed. Please allow popups and try again.';
      setAuthError(msg);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Kwahu Abetifi Palace
          </span>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#modules" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Modules
            </a>
            <a href="#governance" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Governance
            </a>
            <a href="#roles" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Access Roles
            </a>
          </nav>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={signingIn}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {signingIn ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-6 py-12 lg:py-16 space-y-16">
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <div className="flex items-center gap-3 text-xs font-medium text-slate-600">
              <div className="w-9 h-9 rounded-lg border border-slate-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
                {!crestImgFailed ? (
                  <img
                    src="/src/assets/images/palace_crest_emblem_1795623147136.jpg"
                    alt="Kwahu Abetifi Palace Land Secretariat Emblem"
                    referrerPolicy="no-referrer"
                    onError={() => setCrestImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Compass className="w-5 h-5 text-emerald-700" />
                )}
              </div>
              <span>Ahenfie Lands Secretariat · Abetifi, Kwahu East</span>
            </div>

            <h1
              className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-slate-900 leading-[1.12] max-w-2xl"
              style={{ textWrap: 'balance' }}
            >
              Customary Land Tracking & Allocation GIS
            </h1>

            <p className="text-base text-slate-600 leading-relaxed max-w-xl">
              A centralized spatial registry for Kwahu Abetifi Palace to digitize parcel
              boundaries, prevent double allocation, review land applications, and monitor
              customary land transfers across Abetifi sectors.
            </p>

            {authError && (
              <div
                role="alert"
                className="p-3.5 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg"
              >
                {authError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={signingIn}
                className="px-6 py-3 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                {signingIn ? 'Authenticating...' : 'Access Land Registry Portal'}
              </button>
              <span className="text-xs text-slate-500">
                Verified Google Sign-In · Role-Based Access Control
              </span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative h-72 lg:h-full min-h-[340px] rounded-xl overflow-hidden border border-slate-200 bg-slate-900">
              {!heroImgFailed ? (
                <img
                  src="/src/assets/images/abetifi_highlands_hero_1795623148409.jpg"
                  alt="Aerial view of the Kwahu Abetifi ridge and plateau"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-900 flex flex-col items-center justify-center p-8 text-center">
                  <Compass className="w-12 h-12 text-emerald-400 mb-3" />
                  <p className="text-sm font-medium text-slate-200">
                    Kwahu Abetifi Ridge · 6.6745° N, 0.7458° W
                  </p>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/25 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 text-white">
                <p className="font-mono text-xs text-emerald-300 tabular-nums">
                  6.6745° N, 0.7458° W · Kwahu East District
                </p>
                <p className="text-sm font-medium text-slate-100 mt-1">
                  Interactive Leaflet Parcel Mapping & Spatial Overlap Validation
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="modules"
          className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-slate-200 pt-10"
        >
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
            <div className="flex items-center gap-2.5 text-slate-900">
              <Layers className="w-4 h-4 text-emerald-700 shrink-0" />
              <h2 className="text-base font-semibold">Spatial Mapping & Overlap Guard</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Digitize parcel polygons directly on the Abetifi base map with automated geodesic
              area calculation and boundary overlap checks.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
            <div className="flex items-center gap-2.5 text-slate-900">
              <FileCheck2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <h2 className="text-base font-semibold">Double-Allocation Prevention</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Color-coded parcel statuses and atomic allocation transactions block conflicting
              claims on already allocated or disputed plots.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
            <div className="flex items-center gap-2.5 text-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <h2 className="text-base font-semibold">Palace Authority Governance</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Final allocation approvals remain strictly with designated Palace Approving
              Officers, backed by immutable history and audit logs.
            </p>
          </div>
        </section>

        <section
          id="roles"
          className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8 space-y-4"
        >
          <h2 className="text-lg font-semibold text-slate-900">
            Supported Traditional Land Administration Roles
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
            <div className="border border-slate-200 rounded-lg p-4">
              <p className="font-semibold text-slate-900">Super Administrator</p>
              <p className="text-xs text-slate-600 mt-1">
                Full system governance, user roles, and registry oversight.
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-4">
              <p className="font-semibold text-slate-900">Palace Land Admin</p>
              <p className="text-xs text-slate-600 mt-1">
                Verify claims, manage records, and record customary payments.
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-4">
              <p className="font-semibold text-slate-900">Surveyor / GIS Officer</p>
              <p className="text-xs text-slate-600 mt-1">
                Digitize boundaries, register parcels, and upload survey plans.
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-4">
              <p className="font-semibold text-slate-900">Approving Officer</p>
              <p className="text-xs text-slate-600 mt-1">
                Authorized Palace official who approves or rejects allocations.
              </p>
            </div>
            <div className="border border-slate-200 rounded-lg p-4">
              <p className="font-semibold text-slate-900">Applicant</p>
              <p className="text-xs text-slate-600 mt-1">
                Explore available parcels, submit requests, and track progress.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer id="governance" className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            Kwahu Abetifi Palace Customary Land Administration & Tracking Platform
          </span>
          <span>
            Note: Supports Palace administration and does not substitute statutory Ghana Lands Commission registration.
          </span>
        </div>
      </footer>
    </div>
  );
}
