import type { LandAllocation, LandParcel, LatLngPoint } from '../types';

export const ABETIFI_CENTER: LatLngPoint = {
  lat: 6.6745,
  lng: -0.7458,
};

const EARTH_RADIUS_M = 6378137;

/**
 * Spherical excess geodesic polygon area in square meters.
 */
export function calculatePolygonAreaSqm(coords: LatLngPoint[]): number {
  if (coords.length < 3) return 0;
  let total = 0;
  const len = coords.length;
  for (let i = 0; i < len; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % len];
    const lon1 = (p1.lng * Math.PI) / 180;
    const lat1 = (p1.lat * Math.PI) / 180;
    const lon2 = (p2.lng * Math.PI) / 180;
    const lat2 = (p2.lat * Math.PI) / 180;
    total += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  const area = Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
  return Math.round(area * 10) / 10;
}

export function sqmToAcres(sqm: number): number {
  return Math.round((sqm / 4046.8564224) * 1000) / 1000;
}

export function calculateCentroid(coords: LatLngPoint[]): LatLngPoint {
  if (coords.length === 0) return ABETIFI_CENTER;
  const sum = coords.reduce(
    (acc, pt) => ({ lat: acc.lat + pt.lat, lng: acc.lng + pt.lng }),
    { lat: 0, lng: 0 }
  );
  return {
    lat: Math.round((sum.lat / coords.length) * 1000000) / 1000000,
    lng: Math.round((sum.lng / coords.length) * 1000000) / 1000000,
  };
}

function getBoundingBox(coords: LatLngPoint[]) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const pt of coords) {
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;
    if (pt.lng < minLng) minLng = pt.lng;
    if (pt.lng > maxLng) maxLng = pt.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

function pointInPolygon(point: LatLngPoint, polygon: LatLngPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function orientation(a: LatLngPoint, b: LatLngPoint, c: LatLngPoint): number {
  const val = (b.lat - a.lat) * (c.lng - b.lng) - (b.lng - a.lng) * (c.lat - b.lat);
  if (Math.abs(val) < 1e-11) return 0;
  return val > 0 ? 1 : 2;
}

function segmentsIntersect(
  p1: LatLngPoint,
  q1: LatLngPoint,
  p2: LatLngPoint,
  q2: LatLngPoint
): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

/**
 * Checks whether two parcel boundary polygons spatially overlap to prevent
 * conflicting registrations or double allocations.
 */
export function polygonsOverlap(polyA: LatLngPoint[], polyB: LatLngPoint[]): boolean {
  if (polyA.length < 3 || polyB.length < 3) return false;
  const boxA = getBoundingBox(polyA);
  const boxB = getBoundingBox(polyB);
  if (
    boxA.maxLat < boxB.minLat ||
    boxA.minLat > boxB.maxLat ||
    boxA.maxLng < boxB.minLng ||
    boxA.minLng > boxB.maxLng
  ) {
    return false;
  }

  for (const pt of polyA) {
    if (pointInPolygon(pt, polyB)) return true;
  }
  for (const pt of polyB) {
    if (pointInPolygon(pt, polyA)) return true;
  }

  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % polyA.length];
    for (let j = 0; j < polyB.length; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % polyB.length];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }

  return false;
}

export function findOverlappingParcel(
  candidate: LatLngPoint[],
  existingParcels: LandParcel[],
  excludeParcelId?: string
): LandParcel | null {
  for (const parcel of existingParcels) {
    if (excludeParcelId && parcel.id === excludeParcelId) continue;
    if (polygonsOverlap(candidate, parcel.coordinates)) {
      return parcel;
    }
  }
  return null;
}

export function parseCoordinateText(raw: string): LatLngPoint[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Attempt GeoJSON Polygon / Feature parsing first
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      let ring: unknown = null;
      if (parsed?.type === 'Feature' && parsed.geometry?.type === 'Polygon') {
        ring = parsed.geometry.coordinates?.[0];
      } else if (parsed?.type === 'Polygon') {
        ring = parsed.coordinates?.[0];
      } else if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
        ring = parsed;
      }
      if (Array.isArray(ring)) {
        const pts: LatLngPoint[] = [];
        for (const item of ring) {
          if (Array.isArray(item) && item.length >= 2) {
            const a = Number(item[0]);
            const b = Number(item[1]);
            // GeoJSON uses [lng, lat] where lat ~6.67 and lng ~-0.74
            if (Number.isFinite(a) && Number.isFinite(b)) {
              const isGeoJsonOrder = Math.abs(a) < 2 && b > 4;
              pts.push({
                lat: isGeoJsonOrder ? b : a,
                lng: isGeoJsonOrder ? a : b,
              });
            }
          }
        }
        // Drop closing duplicate vertex if present
        if (
          pts.length > 3 &&
          Math.abs(pts[0].lat - pts[pts.length - 1].lat) < 1e-7 &&
          Math.abs(pts[0].lng - pts[pts.length - 1].lng) < 1e-7
        ) {
          pts.pop();
        }
        return pts;
      }
    } catch {
      // Fall through to line-by-line parser
    }
  }

  // Parse "lat, lng" pairs line by line
  const lines = trimmed.split(/\r?\n|;/);
  const points: LatLngPoint[] = [];
  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;
    const parts = clean.split(/[,\s]+/).map(Number);
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      points.push({ lat: parts[0], lng: parts[1] });
    }
  }
  return points;
}

export function formatCoordinatesText(coords: LatLngPoint[]): string {
  return coords.map((pt) => `${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)}`).join('\n');
}

export function exportParcelsToGeoJSON(parcels: LandParcel[]): string {
  const features = parcels.map((parcel) => {
    const ring = parcel.coordinates.map((pt) => [pt.lng, pt.lat]);
    if (ring.length > 0) {
      ring.push(ring[0]);
    }
    return {
      type: 'Feature',
      properties: {
        parcelCode: parcel.parcelCode,
        title: parcel.title,
        zone: parcel.zone,
        landUse: parcel.landUse,
        areaSqm: parcel.areaSqm,
        areaAcres: parcel.areaAcres,
        status: parcel.status,
        surveyPlanRef: parcel.surveyPlanRef || '',
        customaryFeeGhs: parcel.customaryFeeGhs,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
    };
  });

  return JSON.stringify(
    {
      type: 'FeatureCollection',
      name: 'Kwahu_Abetifi_Palace_Cadastre',
      features,
    },
    null,
    2
  );
}

export function exportAllocationsToCSV(
  allocations: LandAllocation[],
  parcels: LandParcel[]
): string {
  const parcelMap = new Map(parcels.map((p) => [p.id, p]));
  const header = [
    'Allocation Code',
    'Parcel Code',
    'Zone',
    'Land Use',
    'Area (Acres)',
    'Applicant Name',
    'Approved By',
    'Approval Date',
    'Customary Fee (GHS)',
    'Payment Status',
    'Allocation Status',
  ];

  const escape = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = allocations.map((alloc) => {
    const parcel = parcelMap.get(alloc.parcelId);
    const approvalDate = alloc.approvalDate
      ? alloc.approvalDate.toDate().toISOString().split('T')[0]
      : '';
    return [
      alloc.allocationCode,
      alloc.parcelCode,
      parcel?.zone || '',
      parcel?.landUse || '',
      parcel?.areaAcres?.toFixed(3) || '',
      alloc.applicantName,
      alloc.approvedByName,
      approvalDate,
      alloc.customaryFeeGhs.toFixed(2),
      alloc.paymentStatus,
      alloc.status,
    ]
      .map(escape)
      .join(',');
  });

  return [header.join(','), ...rows].join('\n');
}
