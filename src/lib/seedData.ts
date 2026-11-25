import type { LandUseType, LatLngPoint, ParcelStatus } from '../types';

export interface SeedParcelSpec {
  docId: string;
  parcelCode: string;
  title: string;
  zone: string;
  landUse: LandUseType;
  status: ParcelStatus;
  surveyPlanRef: string;
  customaryFeeGhs: number;
  notes: string;
  coordinates: LatLngPoint[];
}

// Grounded parcel polygons distributed across Kwahu Abetifi sectors (6.667N - 6.683N, 0.755W - 0.735W)
export const SEED_ABETIFI_PARCELS: SeedParcelSpec[] = [
  {
    docId: 'parcel-abt-ad-001',
    parcelCode: 'ABT-AD-001',
    title: 'Adonten Palace Precinct Lot A',
    zone: 'Adonten Quarter',
    landUse: 'Residential',
    status: 'Available',
    surveyPlanRef: 'KWH-SP-2025-104',
    customaryFeeGhs: 18500,
    notes: 'Surveyed corner pillars verified along Palace Inner Ring Road; beaconed on all four corners.',
    coordinates: [
      { lat: 6.6754, lng: -0.7478 },
      { lat: 6.6754, lng: -0.7472 },
      { lat: 6.6749, lng: -0.7472 },
      { lat: 6.6749, lng: -0.7478 },
    ],
  },
  {
    docId: 'parcel-abt-nk-002',
    parcelCode: 'ABT-NK-002',
    title: 'Nkwatia Road Ridge Commercial Block',
    zone: 'Nkwatia Road Ridge',
    landUse: 'Commercial',
    status: 'Allocated',
    surveyPlanRef: 'KWH-SP-2024-088',
    customaryFeeGhs: 34000,
    notes: 'Frontage along Abetifi-Nkwatia arterial corridor. Allocated for community pharmacy & retail complex.',
    coordinates: [
      { lat: 6.6768, lng: -0.7445 },
      { lat: 6.6769, lng: -0.7436 },
      { lat: 6.6762, lng: -0.7436 },
      { lat: 6.6761, lng: -0.7445 },
    ],
  },
  {
    docId: 'parcel-abt-ce-003',
    parcelCode: 'ABT-CE-003',
    title: 'Abetifi College Enclave Lot 14',
    zone: 'Abetifi College Enclave',
    landUse: 'Residential',
    status: 'Pending',
    surveyPlanRef: 'KWH-SP-2025-119',
    customaryFeeGhs: 21000,
    notes: 'Application currently under Palace boundary & family lineage clearance.',
    coordinates: [
      { lat: 6.6732, lng: -0.7432 },
      { lat: 6.6732, lng: -0.7426 },
      { lat: 6.6726, lng: -0.7426 },
      { lat: 6.6726, lng: -0.7432 },
    ],
  },
  {
    docId: 'parcel-abt-ot-004',
    parcelCode: 'ABT-OT-004',
    title: 'Abetifi Old Town Civic Reserve',
    zone: 'Abetifi Old Town',
    landUse: 'Civic',
    status: 'Available',
    surveyPlanRef: 'KWH-SP-2025-072',
    customaryFeeGhs: 12000,
    notes: 'Reserved for educational, clinic, or community heritage assembly facility.',
    coordinates: [
      { lat: 6.6741, lng: -0.7494 },
      { lat: 6.6741, lng: -0.7485 },
      { lat: 6.6734, lng: -0.7485 },
      { lat: 6.6734, lng: -0.7494 },
    ],
  },
  {
    docId: 'parcel-abt-hw-005',
    parcelCode: 'ABT-HW-005',
    title: 'Hweehwee Escarpment Terrace',
    zone: 'Hweehwee Valley',
    landUse: 'Agricultural',
    status: 'Available',
    surveyPlanRef: 'KWH-SP-2025-131',
    customaryFeeGhs: 14500,
    notes: 'Fertile upper valley terrace suited for agroforestry and tree crops.',
    coordinates: [
      { lat: 6.6788, lng: -0.7495 },
      { lat: 6.6790, lng: -0.7482 },
      { lat: 6.6781, lng: -0.7481 },
      { lat: 6.6779, lng: -0.7494 },
    ],
  },
  {
    docId: 'parcel-abt-nk-006',
    parcelCode: 'ABT-NK-006',
    title: 'Nkwatia Junction Service Plot',
    zone: 'Nkwatia Road Ridge',
    landUse: 'Commercial',
    status: 'Allocated',
    surveyPlanRef: 'KWH-SP-2024-061',
    customaryFeeGhs: 28000,
    notes: 'Allocated in 2025 Palace sitting; statutory site plan endorsed.',
    coordinates: [
      { lat: 6.6758, lng: -0.7420 },
      { lat: 6.6758, lng: -0.7412 },
      { lat: 6.6752, lng: -0.7412 },
      { lat: 6.6752, lng: -0.7420 },
    ],
  },
  {
    docId: 'parcel-abt-ad-007',
    parcelCode: 'ABT-AD-007',
    title: 'Ahenfie Boundary Reserve Lot',
    zone: 'Adonten Quarter',
    landUse: 'Residential',
    status: 'Disputed',
    surveyPlanRef: 'KWH-SP-2024-045',
    customaryFeeGhs: 19000,
    notes: 'Frozen pending Palace Arbitration Committee survey reconciliation with adjacent family stool boundary.',
    coordinates: [
      { lat: 6.6725, lng: -0.7468 },
      { lat: 6.6725, lng: -0.7462 },
      { lat: 6.6720, lng: -0.7462 },
      { lat: 6.6720, lng: -0.7468 },
    ],
  },
  {
    docId: 'parcel-abt-pr-008',
    parcelCode: 'ABT-PR-008',
    title: 'Presby Ridge North Plot 22',
    zone: 'Presby Ridge North',
    landUse: 'Residential',
    status: 'Available',
    surveyPlanRef: 'KWH-SP-2026-014',
    customaryFeeGhs: 22500,
    notes: 'Newly beaconed residential plot with graded access road and utility corridor.',
    coordinates: [
      { lat: 6.6776, lng: -0.7462 },
      { lat: 6.6776, lng: -0.7455 },
      { lat: 6.6770, lng: -0.7455 },
      { lat: 6.6770, lng: -0.7462 },
    ],
  },
];
