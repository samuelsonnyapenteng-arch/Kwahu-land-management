import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Crosshair,
  Layers,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  ABETIFI_CENTER,
  calculatePolygonAreaSqm,
  findOverlappingParcel,
  sqmToAcres,
} from '../lib/gis';
import { PARCEL_STATUS_STYLE, type LandParcel, type LatLngPoint } from '../types';

type BaseLayerMode = 'street' | 'satellite' | 'topo';

interface LeafletParcelMapProps {
  parcels: LandParcel[];
  selectedParcelId: string | null;
  onSelectParcel: (parcel: LandParcel) => void;
  drawingMode?: boolean;
  drawnVertices?: LatLngPoint[];
  onAddVertex?: (point: LatLngPoint) => void;
  onUndoVertex?: () => void;
  onClearVertices?: () => void;
  excludeOverlapParcelId?: string;
  heightClassName?: string;
}

export function LeafletParcelMap({
  parcels,
  selectedParcelId,
  onSelectParcel,
  drawingMode = false,
  drawnVertices = [],
  onAddVertex,
  onUndoVertex,
  onClearVertices,
  excludeOverlapParcelId,
  heightClassName = 'h-[560px]',
}: LeafletParcelMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const parcelsLayerRef = useRef<L.LayerGroup | null>(null);
  const drawingLayerRef = useRef<L.LayerGroup | null>(null);
  const [baseLayer, setBaseLayer] = useState<BaseLayerMode>('street');

  const drawingOverlap = useMemo(() => {
    if (!drawingMode || drawnVertices.length < 3) return null;
    return findOverlappingParcel(drawnVertices, parcels, excludeOverlapParcelId);
  }, [drawingMode, drawnVertices, parcels, excludeOverlapParcelId]);

  const draftSqm = useMemo(
    () => (drawnVertices.length >= 3 ? calculatePolygonAreaSqm(drawnVertices) : 0),
    [drawnVertices]
  );

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [ABETIFI_CENTER.lat, ABETIFI_CENTER.lng],
      zoom: 15,
      zoomControl: true,
    });

    const parcelsLayer = L.layerGroup().addTo(map);
    const drawingLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    parcelsLayerRef.current = parcelsLayer;
    drawingLayerRef.current = drawingLayer;

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      parcelsLayerRef.current = null;
      drawingLayerRef.current = null;
    };
  }, []);

  // Switch tile basemap cleanly
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    const tileConfigs: Record<BaseLayerMode, { url: string; attribution: string; maxZoom: number }> = {
      street: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      },
      satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Imagery &copy; Esri',
        maxZoom: 19,
      },
      topo: {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenTopoMap contributors',
        maxZoom: 17,
      },
    };

    const cfg = tileConfigs[baseLayer];
    tileLayerRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
    }).addTo(map);
  }, [baseLayer]);

  // Handle drawing click listener
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const container = map.getContainer();
    container.style.cursor = drawingMode ? 'crosshair' : '';

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (!drawingMode || !onAddVertex) return;
      onAddVertex({
        lat: Math.round(e.latlng.lat * 1000000) / 1000000,
        lng: Math.round(e.latlng.lng * 1000000) / 1000000,
      });
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
      container.style.cursor = '';
    };
  }, [drawingMode, onAddVertex]);

  // Render parcel polygons
  useEffect(() => {
    const map = mapRef.current;
    const layer = parcelsLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    parcels.forEach((parcel) => {
      if (!parcel.coordinates || parcel.coordinates.length < 3) return;
      const style = PARCEL_STATUS_STYLE[parcel.status];
      const isSelected = parcel.id === selectedParcelId;

      const latLngs: L.LatLngExpression[] = parcel.coordinates.map((pt) => [pt.lat, pt.lng]);

      const polygon = L.polygon(latLngs, {
        color: isSelected ? '#0F172A' : style.stroke,
        weight: isSelected ? 3 : 1.75,
        fillColor: style.fill,
        fillOpacity: isSelected ? 0.48 : 0.28,
        dashArray: parcel.status === 'Disputed' ? '5 4' : undefined,
      });

      polygon.bindTooltip(
        `${parcel.parcelCode} · ${parcel.status} · ${parcel.areaAcres.toFixed(2)} ac`,
        {
          sticky: true,
          className: 'parcel-tooltip',
          direction: 'top',
        }
      );

      polygon.on('click', (e) => {
        if (drawingMode) return;
        L.DomEvent.stopPropagation(e);
        onSelectParcel(parcel);
      });

      polygon.addTo(layer);
    });
  }, [parcels, selectedParcelId, onSelectParcel, drawingMode]);

  // Pan smoothly to selected parcel when selected from list
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedParcelId || drawingMode) return;
    const parcel = parcels.find((p) => p.id === selectedParcelId);
    if (!parcel || parcel.coordinates.length < 3) return;
    const bounds = L.latLngBounds(parcel.coordinates.map((pt) => [pt.lat, pt.lng]));
    map.fitBounds(bounds, { padding: [70, 70], maxZoom: 17 });
  }, [selectedParcelId, parcels, drawingMode]);

  // Render interactive drawing preview polygon
  useEffect(() => {
    const layer = drawingLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!drawingMode || drawnVertices.length === 0) return;

    const latLngs: L.LatLngExpression[] = drawnVertices.map((pt) => [pt.lat, pt.lng]);

    if (drawnVertices.length >= 3) {
      L.polygon(latLngs, {
        color: drawingOverlap ? '#DC2626' : '#047857',
        weight: 2.5,
        dashArray: '6 4',
        fillColor: drawingOverlap ? '#EF4444' : '#10B981',
        fillOpacity: 0.3,
      }).addTo(layer);
    } else if (drawnVertices.length === 2) {
      L.polyline(latLngs, {
        color: '#047857',
        weight: 2.5,
        dashArray: '6 4',
      }).addTo(layer);
    }

    drawnVertices.forEach((pt, idx) => {
      L.circleMarker([pt.lat, pt.lng], {
        radius: 5.5,
        color: '#FFFFFF',
        weight: 2,
        fillColor: drawingOverlap ? '#DC2626' : '#047857',
        fillOpacity: 1,
      })
        .bindTooltip(`V${idx + 1}`, { direction: 'top', className: 'parcel-tooltip' })
        .addTo(layer);
    });
  }, [drawingMode, drawnVertices, drawingOverlap]);

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    if (parcels.length > 0) {
      const allPts = parcels.flatMap((p) => p.coordinates.map((pt) => [pt.lat, pt.lng] as [number, number]));
      if (allPts.length > 0) {
        map.fitBounds(L.latLngBounds(allPts), { padding: [48, 48], maxZoom: 16 });
        return;
      }
    }
    map.setView([ABETIFI_CENTER.lat, ABETIFI_CENTER.lng], 15);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
      {/* Map Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Layers className="w-4 h-4 text-slate-500 shrink-0" />
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
            {(['street', 'satellite', 'topo'] as BaseLayerMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setBaseLayer(mode)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  baseLayer === mode
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode === 'street' ? 'Street' : mode === 'satellite' ? 'Satellite' : 'Terrain'}
              </button>
            ))}
          </div>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span className="hidden sm:inline font-mono tabular-nums text-slate-500">
            Abetifi 6.6745°N, 0.7458°W
          </span>
        </div>

        <div className="flex items-center gap-2">
          {drawingMode && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono tabular-nums text-slate-700">
                {drawnVertices.length} pts
                {draftSqm > 0 ? ` · ${sqmToAcres(draftSqm).toFixed(3)} ac` : ''}
              </span>
              {onUndoVertex && (
                <button
                  type="button"
                  onClick={onUndoVertex}
                  disabled={drawnVertices.length === 0}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-md transition-colors whitespace-nowrap"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Undo
                </button>
              )}
              {onClearVertices && (
                <button
                  type="button"
                  onClick={onClearVertices}
                  disabled={drawnVertices.length === 0}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-40 rounded-md transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleRecenter}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Fit Cadastre
          </button>
        </div>
      </div>

      {/* Drawing Helper Banner */}
      {drawingMode && (
        <div
          className={`px-4 py-2 text-xs border-b flex items-center justify-between gap-3 ${
            drawingOverlap
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 shrink-0" />
            {drawingOverlap ? (
              <span>
                Spatial overlap detected with <strong>{drawingOverlap.parcelCode}</strong> (
                {drawingOverlap.title}). Adjust boundary points.
              </span>
            ) : (
              <span>
                Click directly on the map to place parcel boundary vertices (minimum 3 points).
              </span>
            )}
          </div>
          {draftSqm > 0 && (
            <span className="font-mono tabular-nums font-medium whitespace-nowrap">
              {draftSqm.toLocaleString()} sqm ({sqmToAcres(draftSqm).toFixed(3)} ac)
            </span>
          )}
        </div>
      )}

      {/* Map Viewport */}
      <div className={`relative w-full ${heightClassName}`}>
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>

      {/* Explicit Status Legend (Never hue-only) */}
      <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-5">
          {(['Available', 'Pending', 'Allocated', 'Disputed'] as const).map((status) => {
            const st = PARCEL_STATUS_STYLE[status];
            return (
              <div key={status} className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-xs border"
                  style={{ backgroundColor: st.fill, borderColor: st.stroke }}
                  aria-hidden="true"
                />
                <span className="font-medium text-slate-700">{status}</span>
              </div>
            );
          })}
        </div>
        <span className="font-mono tabular-nums text-slate-500">
          {parcels.length} digitized {parcels.length === 1 ? 'parcel' : 'parcels'}
        </span>
      </div>
    </div>
  );
}
