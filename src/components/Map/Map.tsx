import React, { useEffect, useRef, useState, useCallback } from "react";
import maplibregl, {
  LngLat,
  LngLatLike,
  Map as MaplibreMap,
  GeoJSONSource,
} from "maplibre-gl";
import { Protocol } from "pmtiles";
import type { Feature, Point, Geometry, Polygon } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import "@maptiler/sdk/dist/maptiler-sdk.css";

type MapProps = {
  layersVisibility: { [layerId: string]: boolean };
  filters: FilterState;
  isDarkTheme: boolean;
  onCommunityClick: (communityId: string, communityData: CommunityData) => void;
  onFilterChangeFromMap?: (patch: {
    entidad?: string;
    municipio?: string;
    localidad?: string;
    pueblo?: string;
  }) => void;
  onDataLoaded?: (data: ExtractedData) => void;
  highlightedCommunity?: string | null;
};

interface FilterState {
  entidad: string;
  municipio: string;
  comunidad: string;
  pueblo: string;
}

interface CommunityData {
  id: string;
  nombre: string;
  entidad: string;
  municipio: string;
  pueblo: string;
  poblacion: number;
  latitud: number;
  longitud: number;
  htmlUrl?: string;
}

interface RouteData {
  id: number;
  startPoint: LngLat;
  endPoint: LngLat;
  geometry: Geometry;
  distance: string;
  duration: string;
}

interface PopupPosition {
  x: number;
  y: number;
  visible: boolean;
}

interface ExtractedData {
  entidades: Set<string>;
  municipiosPorEntidad: Map<string, Set<string>>;
  comunidadesPorMunicipio: Map<string, Set<string>>;
  pueblos: Set<string>;
  features: any[];
}

const ENT_KEY = "NOM_ENT";
const MUN_KEY = "NOM_MUN";
const COM_KEY = "NOM_COM";
const PUE_KEY = "Pueblo";
const LOC_KEY = "NOM_LOC";
const ID_KEY = "ID";

const INPI_SOURCE_ID = "LocalidadesSedeINPI";
const INPI_LAYER_ID = "LocalidadesSedeINPI";
const INPI_SOURCE_LAYER = "Com_Ind_INPI23102025_tile";

const ASENTAMIENTOS_SOURCE_ID = "AsentamientosINPI";
const ASENTAMIENTOS_LAYER_ID = "AsentamientosINPI";
const ASENTAMIENTOS_SOURCE_LAYER = "Asentamientos_INPI_28102025_tile";

const NUCLEOS_SOURCE_ID = "NucleosAgrarios";
const NUCLEOS_LAYER_ID = "NucleosAgrarios";
const NUCLEOS_LAYER_OUTLINE_ID = "NucleosAgrarios-outline";
const NUCLEOS_SOURCE_LAYER = "perimetrales_nacional_simpl_tile";

const get3DIcon = (isOn: boolean) => {
  const color = isOn ? "#007cbf" : "#6c757d";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

const getLineIcon = (isOn: boolean) => {
  const color = isOn ? "#007cbf" : "#6c757d";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><circle cx="5" cy="12" r="2" fill="${color}"></circle><circle cx="19" cy="12" r="2" fill="${color}"></circle></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

const formatNumber = (num: number): string => num.toLocaleString("es-MX");

const Map: React.FC<MapProps> = ({
  layersVisibility,
  filters,
  isDarkTheme,
  onCommunityClick,
  // onFilterChangeFromMap,
  onDataLoaded,
  highlightedCommunity,
}) => {
  const mapRef = useRef<MaplibreMap | null>(null);
  const minimapRef = useRef<MaplibreMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const minimapContainerRef = useRef<HTMLDivElement | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const blinkAnimationId = useRef<number | null>(null);
  const asentamientosAnimationId = useRef<number | null>(null);
  const routeIdCounter = useRef(0);
  const extractedDataRef = useRef<ExtractedData | null>(null);

  const isStyleChangingRef = useRef(false);
  const isTransitioningRef = useRef(false);
  const isResizingRef = useRef(false);
  const highlightedCommunityRef = useRef<string | null>(null);
  const selectedCommunityNameRef = useRef<string | null>(null);

  const enterHandlerRef = useRef<((e: any) => void) | null>(null);
  const leaveHandlerRef = useRef<((e: any) => void) | null>(null);
  const clickHandlerRef = useRef<((e: any) => void) | null>(null);
  const mapClickOffRef = useRef<((e: any) => void) | null>(null);
  const isPinnedRef = useRef(false);
  const moveHandlerRef = useRef<((e: any) => void) | null>(null);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);

  const desired3DPitchRef = useRef<number>(65);
  const desired3DBearingRef = useRef<number>(0);

  const [displayBearing, setDisplayBearing] = useState(0);
  const displayBearingRef = useRef(0);
  const compassAnimId = useRef<number | null>(null);

  const [routePopupPositions, setRoutePopupPositions] = useState<{
    [routeId: number]: PopupPosition;
  }>({});
  const [linePopupPositions, setLinePopupPositions] = useState<{
    [lineId: number]: PopupPosition;
  }>({});

  const apiKey = "QAha5pFBxf4hGa8Jk5zv";
  const lightStyleUrl = "https://www.mapabase.atdt.gob.mx/style_3d.json";
  const darkStyleUrl = "https://www.mapabase.atdt.gob.mx/style_black_3d_places.json";
  const outdoor3DStyleUrl = `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${apiKey}`;
  const satelliteStyleUrl = `https://www.mapabase.atdt.gob.mx/style_satellite.json`;
  const minimapStyleUrl = `https://www.mapabase.atdt.gob.mx/style_white_3d_places.json`;

  const pmtilesUrl = process.env.REACT_APP_PMTILES_URL || '/data/perimetrales_nacional_simpl.pmtiles';

  const [isSatellite, setIsSatellite] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [isMeasuringLine, setIsMeasuringLine] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<LngLatLike[]>([]);
  const [currentLinePoints, setCurrentLinePoints] = useState<LngLatLike[]>([]);
  const [routesData, setRoutesData] = useState<RouteData[]>([]);
  const [linesData, setLinesData] = useState<RouteData[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const isMeasuringRef = useRef(isMeasuring);
  const isMeasuringLineRef = useRef(isMeasuringLine);
  isMeasuringRef.current = isMeasuring;
  isMeasuringLineRef.current = isMeasuringLine;

  const getCurrentStyleUrl = useCallback(() => {
    if (isSatellite) return satelliteStyleUrl;
    if (is3D) return outdoor3DStyleUrl;
    return isDarkTheme ? darkStyleUrl : lightStyleUrl;
  }, [
    isDarkTheme,
    isSatellite,
    is3D,
    satelliteStyleUrl,
    outdoor3DStyleUrl,
    darkStyleUrl,
    lightStyleUrl,
  ]);

  const lastViewRef = useRef<{
    center: LngLatLike;
    zoom: number;
    bearing: number;
    pitch: number;
  } | null>(null);
  const suppressNextFilterZoomRef = useRef(false);

  const rememberView = (map: MaplibreMap) => {
    lastViewRef.current = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    };
    const p = map.getPitch();
    if (p >= 5) {
      desired3DPitchRef.current = Math.max(30, Math.min(80, p));
      desired3DBearingRef.current = map.getBearing();
    }
  };

  const focusOnLngLat = useCallback(
    (lng: number, lat: number, opts?: { zoom?: number; duration?: number }) => {
      const map = mapRef.current;
      if (!map || isStyleChangingRef.current || isTransitioningRef.current)
        return;
      const zoom = Math.min(Math.max(opts?.zoom ?? 15.5, 6), 18);
      const duration = opts?.duration ?? 900;
      map.easeTo({ center: [lng, lat], zoom, duration, essential: true });
      setTimeout(() => rememberView(map), duration + 60);
    },
    []
  );

  function ensureHighlightLayer(map: maplibregl.Map) {
    if (!map.getLayer("highlight-community")) {
      // Agregar la capa después de las otras para que esté visible encima
      map.addLayer({
        id: "highlight-community",
        type: "circle",
        source: INPI_SOURCE_ID,
        "source-layer": INPI_SOURCE_LAYER,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            8,  // Aumentado para mejor visibilidad
            10,
            12, // Aumentado
            15,
            16, // Aumentado
          ],
          "circle-color": "#9b2247",
          "circle-stroke-color": "#e6d194",
          "circle-stroke-width": 4, // Aumentado para mejor visibilidad
          "circle-opacity": 0.9,
          "circle-stroke-opacity": 1,
        },
        filter: ["literal", false],
      });
      console.log("✅ Capa highlight-community creada");
    }
  }

  const getFeatureLngLat = (
    feature: any,
    fallback?: { lng: number; lat: number }
  ): [number, number] => {
    if (
      feature?.geometry?.type === "Point" &&
      Array.isArray(feature.geometry.coordinates)
    ) {
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      return [lng, lat];
    }
    const props = feature?.properties || {};
    const lngProp = Number(
      props.longitud ?? props.LONGITUD ?? props.lon ?? props.LON
    );
    const latProp = Number(
      props.latitud ?? props.LATITUD ?? props.lat ?? props.LAT
    );
    if (isFinite(lngProp) && isFinite(latProp)) return [lngProp, latProp];
    if (fallback) return [fallback.lng, fallback.lat];
    return [-100.22696, 23.45928];
  };

  const communityZoomForMode = (map: maplibregl.Map): number => {
    const pitch = map.getPitch();
    let z = 15.2;
    if (pitch >= 60) z = 12.8;
    else if (pitch >= 30) z = 13.6;
    if (z < 11.5) z = 11.5;
    if (z > 16) z = 16;
    return z;
  };

  function addVectorLayers(map: maplibregl.Map) {
    if (!map.getSource(INPI_SOURCE_ID)) {
      map.addSource(INPI_SOURCE_ID, {
        type: "vector",
        url: "pmtiles://data/Com_Ind_INPI23102025.pmtiles",
      });
    }
    const palette = [
      "#1b9e77",
      "#d95f02",
      "#7570b3",
      "#e7298a",
      "#66a61e",
      "#e6ab02",
      "#a6761d",
      "#666666",
    ];
    const pueblosMatch: (string | number)[] = [];
    for (let i = 1; i <= 72; i++)
      pueblosMatch.push(i.toString(), palette[i % palette.length]);
    const puebloExpression = [
      "match",
      ["get", "ID_Pueblo"],
      ...pueblosMatch,
      "#666666",
    ] as any;

    if (!map.getLayer(INPI_LAYER_ID)) {
      map.addLayer({
        id: INPI_LAYER_ID,
        type: "circle",
        source: INPI_SOURCE_ID,
        "source-layer": INPI_SOURCE_LAYER,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            2,
            10,
            3,
            15,
            5,
          ],
          "circle-color": puebloExpression,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            0.1,
            10,
            0.5,
            15,
            1,
          ],
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            0.6,
            10,
            0.8,
            15,
            1,
          ],
        },
      });
    }

    if (!map.getSource(ASENTAMIENTOS_SOURCE_ID)) {
      map.addSource(ASENTAMIENTOS_SOURCE_ID, {
        type: "vector",
        url: "pmtiles://data/Asentamientos_INPI_28102025.pmtiles",
      });
    }

    if (!map.getLayer(ASENTAMIENTOS_LAYER_ID)) {
      map.addLayer({
        id: ASENTAMIENTOS_LAYER_ID,
        type: "circle",
        source: ASENTAMIENTOS_SOURCE_ID,
        "source-layer": ASENTAMIENTOS_SOURCE_LAYER,
        paint: {
          "circle-radius": 8,
          "circle-color": "#f59e0b",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-opacity": 0.9,
        },
        layout: {
          visibility: "none",
        },
        filter: ["literal", false],
      });

      // Agregar capa de etiquetas con anticolisión
      map.addLayer({
        id: `${ASENTAMIENTOS_LAYER_ID}-labels`,
        type: "symbol",
        source: ASENTAMIENTOS_SOURCE_ID,
        "source-layer": ASENTAMIENTOS_SOURCE_LAYER,
        layout: {
          "text-field": [
            "format",
            ["get", "Nombre"],
            { "font-scale": 1 },
            "\n",
            {},
            "Pob: ",
            { "font-scale": 0.85 },
            ["coalesce", ["get", "Población total"], "S/D"],
            { "font-scale": 0.85 },
          ],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
          "text-offset": [0, 1.5],
          "text-anchor": "top",
          "text-max-width": 12,
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "symbol-sort-key": ["get", "Población total"],
          visibility: "none",
        },
        paint: {
          "text-color": "#1f2937",
          "text-halo-color": "#fbbf24",
          "text-halo-width": 2.5,
          "text-halo-blur": 0.5,
        },
        filter: ["literal", false],
      });
    }

    if (!map.getSource(NUCLEOS_SOURCE_ID)) {
      map.addSource(NUCLEOS_SOURCE_ID, {
        type: "vector",
        url: "https://media.githubusercontent.com/media/dgpcsegob/tab-com-ind/main/public/data/perimetrales_nacional_simpl.pmtiles",
      });
    }

    // AGREGAR CAPA DE RELLENO DE NÚCLEOS AGRARIOS
    if (!map.getLayer(NUCLEOS_LAYER_ID)) {
      const beforeLayer = map.getLayer(INPI_LAYER_ID)
        ? INPI_LAYER_ID
        : undefined;
      map.addLayer(
        {
          id: NUCLEOS_LAYER_ID,
          type: "fill",
          source: NUCLEOS_SOURCE_ID,
          "source-layer": NUCLEOS_SOURCE_LAYER,
          paint: {
            "fill-color": "#1e5b4f",
            "fill-opacity": 0.5,
          },
          layout: {
            // Inicializar con la visibilidad actual desde layersVisibility
            visibility: layersVisibility[NUCLEOS_LAYER_ID] ? "visible" : "none",
          },
        },
        beforeLayer
      );
    }

    if (!map.getLayer(NUCLEOS_LAYER_OUTLINE_ID)) {
      const beforeLayer = map.getLayer(INPI_LAYER_ID)
        ? INPI_LAYER_ID
        : undefined;
      map.addLayer(
        {
          id: NUCLEOS_LAYER_OUTLINE_ID,
          type: "line",
          source: NUCLEOS_SOURCE_ID,
          "source-layer": NUCLEOS_SOURCE_LAYER,
          paint: {
            "line-color": "#ffffff",
            "line-width": 0.2,
            "line-opacity": 0.9,
          },
          layout: {
            // Inicializar con la visibilidad actual desde layersVisibility
            visibility: layersVisibility[NUCLEOS_LAYER_OUTLINE_ID]
              ? "visible"
              : "none",
          },
        },
        beforeLayer
      );
    }
   }

  const stopCommunityAnimation = useCallback(() => {
    if (blinkAnimationId.current) {
      cancelAnimationFrame(blinkAnimationId.current);
      blinkAnimationId.current = null;
    }
  }, []);

  const startCommunityAnimation = useCallback(
    (map: maplibregl.Map) => {
      if (isStyleChangingRef.current || isTransitioningRef.current) return;
      const animatePulse = (timestamp: number) => {
        if (isStyleChangingRef.current || isTransitioningRef.current) {
          blinkAnimationId.current = null;
          return;
        }
        const t = (Math.sin(timestamp / 300) + 1) / 2;
        const baseRadius =
          map.getZoom() < 10 ? 2.5 : map.getZoom() < 15 ? 3 : 5;
        const maxRadius = baseRadius + 0.5;
        const radius = baseRadius + (maxRadius - baseRadius) * t;
        if (map.getLayer(INPI_LAYER_ID)) {
          const isHighlightActive = highlightedCommunityRef.current !== null;
          if (
            !filters.entidad &&
            !filters.municipio &&
            !filters.comunidad &&
            !filters.pueblo &&
            !isHighlightActive
          ) {
            try {
              map.setPaintProperty(INPI_LAYER_ID, "circle-radius", [
                "interpolate",
                ["linear"],
                ["zoom"],
                5,
                radius * 0.8,
                10,
                radius * 1.2,
                15,
                radius * 2,
              ]);
            } catch {}
          }
        }
        blinkAnimationId.current = requestAnimationFrame(animatePulse);
      };
      if (!blinkAnimationId.current) animatePulse(0);
    },
    [filters]
  );

  const restartCommunityAnimation = useCallback(
    (map: maplibregl.Map) => {
      stopCommunityAnimation();
      setTimeout(() => startCommunityAnimation(map), 100);
    },
    [stopCommunityAnimation, startCommunityAnimation]
  );

  const stopAsentamientosAnimation = useCallback(() => {
    if (asentamientosAnimationId.current) {
      cancelAnimationFrame(asentamientosAnimationId.current);
      asentamientosAnimationId.current = null;
    }
  }, []);

  const startAsentamientosAnimation = useCallback((map: maplibregl.Map) => {
    if (isStyleChangingRef.current || isTransitioningRef.current) return;

    const animatePulse = (timestamp: number) => {
      if (isStyleChangingRef.current || isTransitioningRef.current) {
        asentamientosAnimationId.current = null;
        return;
      }

      const t = (Math.sin(timestamp / 250) + 1) / 2;
      const baseRadius = 4;
      const maxRadius = 8;
      const radius = baseRadius + (maxRadius - baseRadius) * t;

      if (map.getLayer(ASENTAMIENTOS_LAYER_ID)) {
        try {
          map.setPaintProperty(ASENTAMIENTOS_LAYER_ID, "circle-radius", [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            radius * 0.8,
            15,
            radius * 1.5,
            18,
            radius * 2,
          ]);
        } catch {}
      }

      asentamientosAnimationId.current = requestAnimationFrame(animatePulse);
    };

    if (!asentamientosAnimationId.current) animatePulse(0);
  }, []);

const zoomToAsentamientos = useCallback(
  (communityId: string, communityLngLat: [number, number]) => {
    const map = mapRef.current;
    if (!map || isStyleChangingRef.current || isTransitioningRef.current) {
      return;
    }

    try {
      const numericId = parseInt(communityId, 10);

      const features = map.querySourceFeatures(ASENTAMIENTOS_SOURCE_ID, {
        sourceLayer: ASENTAMIENTOS_SOURCE_LAYER,
        filter: ["==", ["get", "ID_Archivo"], numericId],
      });

      if (features.length === 0) {
        // Fallback: zoom directo a la comunidad si no hay asentamientos
        map.easeTo({
          center: communityLngLat,
          zoom: 13,
          duration: 1200,
          essential: true,
        });
        setTimeout(() => rememberView(map), 1250);
        return;
      }

      const bounds = new maplibregl.LngLatBounds();
      let validPoints = 0;

      features.forEach((feature: any) => {
        if (feature.geometry && feature.geometry.type === "Point") {
          bounds.extend(feature.geometry.coordinates as [number, number]);
          validPoints++;
        }
      });

      if (validPoints === 0) {
        // Fallback si no hay puntos válidos
        map.easeTo({
          center: communityLngLat,
          zoom: 13,
          duration: 1200,
          essential: true,
        });
        setTimeout(() => rememberView(map), 1250);
        return;
      }

      // Calcular el zoom óptimo basado en la densidad de puntos
      const boundsArea = bounds.getNorthEast().distanceTo(bounds.getSouthWest());
      const pointDensity = validPoints / (boundsArea + 1); // +1 para evitar división por cero
      
      // Ajustar el padding y maxZoom dinámicamente según la cantidad de asentamientos
      let padding = { top: 80, bottom: 80, left: 80, right: 400 };
      let maxZoom = 15;
      
      if (validPoints <= 3) {
        // Pocos asentamientos: zoom más cercano
        maxZoom = 14;
        padding = { top: 100, bottom: 100, left: 100, right: 400 };
      } else if (validPoints <= 8) {
        // Cantidad media: zoom balanceado
        maxZoom = 13;
        padding = { top: 80, bottom: 80, left: 80, right: 380 };
      } else if (validPoints <= 15) {
        // Muchos asentamientos: zoom más alejado
        maxZoom = 12;
        padding = { top: 60, bottom: 60, left: 60, right: 360 };
      } else {
        // Muchísimos asentamientos: zoom muy alejado
        maxZoom = 11;
        padding = { top: 50, bottom: 50, left: 50, right: 350 };
      }

      // Ajustar adicionalmente basado en la densidad
      if (pointDensity > 0.1) { // Alta densidad de puntos
        maxZoom = Math.max(10, maxZoom - 1);
      }

      console.log(`🎯 Zoom a asentamientos: ${validPoints} puntos, maxZoom: ${maxZoom}`);

      // Verificar si los bounds son válidos (no son un punto)
      if (bounds.getNorth() === bounds.getSouth() && bounds.getEast() === bounds.getWest()) {
        // Si es un solo punto, crear un bounds alrededor del punto
        const point = bounds.getCenter();
        const expandedBounds = new maplibregl.LngLatBounds()
          .extend([point.lng - 0.01, point.lat - 0.01])
          .extend([point.lng + 0.01, point.lat + 0.01]);
        
        map.fitBounds(expandedBounds, {
          padding: padding,
          maxZoom: maxZoom,
          duration: 1200,
          essential: true,
        });
      } else {
        // Asegurar que los bounds tengan un área mínima
        const currentBoundsSize = bounds.getNorthEast().distanceTo(bounds.getSouthWest());
        const minBoundsSize = 0.001; // Tamaño mínimo en grados
        
        if (currentBoundsSize < minBoundsSize) {
          const center = bounds.getCenter();
          const expandBy = (minBoundsSize - currentBoundsSize) / 2;
          bounds.extend([center.lng - expandBy, center.lat - expandBy]);
          bounds.extend([center.lng + expandBy, center.lat + expandBy]);
        }

        map.fitBounds(bounds, {
          padding: padding,
          maxZoom: maxZoom,
          duration: 1200,
          essential: true,
        });
      }

      // Verificar después del zoom si todos los puntos son visibles
      setTimeout(() => {
        const visibleFeatures = map.queryRenderedFeatures({
          layers: [ASENTAMIENTOS_LAYER_ID]
        });
        
        console.log(`👀 Asentamientos visibles después del zoom: ${visibleFeatures.length}/${validPoints}`);
        
        // Si no todos son visibles, hacer un ajuste adicional
        if (visibleFeatures.length < validPoints * 0.8) {
          console.log("🔄 Ajustando zoom para mostrar más asentamientos...");
          map.easeTo({
            zoom: map.getZoom() - 0.5,
            duration: 600,
            essential: true,
          });
        }
        
        rememberView(map);
      }, 1300);

    } catch (e) {
      console.error("Error en zoom:", e);
      // Fallback en caso de error
      map.easeTo({
        center: communityLngLat,
        zoom: 12, // Zoom más alejado por defecto
        duration: 1200,
        essential: true,
      });
      setTimeout(() => rememberView(map), 1250);
    }
  },
  []
);

const showAsentamientos = useCallback(
  async (communityId: string | null, communityLngLat?: [number, number]) => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    try {
      if (!communityId) {
        stopAsentamientosAnimation();

        if (map.getLayer(ASENTAMIENTOS_LAYER_ID)) {
          map.setLayoutProperty(ASENTAMIENTOS_LAYER_ID, "visibility", "none");
          map.setFilter(ASENTAMIENTOS_LAYER_ID, ["literal", false]);
        }

        if (map.getLayer(`${ASENTAMIENTOS_LAYER_ID}-labels`)) {
          map.setLayoutProperty(
            `${ASENTAMIENTOS_LAYER_ID}-labels`,
            "visibility",
            "none"
          );
          map.setFilter(`${ASENTAMIENTOS_LAYER_ID}-labels`, [
            "literal",
            false,
          ]);
        }
        return;
      }

      if (!map.getSource(ASENTAMIENTOS_SOURCE_ID)) {
        console.warn("⚠️ Fuente de asentamientos no disponible");
        return;
      }

      // Esperar a que la fuente esté cargada
      await new Promise<void>((resolve) => {
        if (map.isSourceLoaded(ASENTAMIENTOS_SOURCE_ID)) {
          resolve();
        } else {
          const checkSource = () => {
            if (map.isSourceLoaded(ASENTAMIENTOS_SOURCE_ID)) {
              resolve();
            } else {
              setTimeout(checkSource, 100);
            }
          };
          checkSource();
        }
      });

      const numericId = parseInt(communityId, 10);
      const filter = ["==", ["get", "ID_Archivo"], numericId];

      if (map.getLayer(ASENTAMIENTOS_LAYER_ID)) {
        map.setLayoutProperty(
          ASENTAMIENTOS_LAYER_ID,
          "visibility",
          "visible"
        );
        map.setFilter(ASENTAMIENTOS_LAYER_ID, filter as any);
      }

      if (map.getLayer(`${ASENTAMIENTOS_LAYER_ID}-labels`)) {
        map.setLayoutProperty(
          `${ASENTAMIENTOS_LAYER_ID}-labels`,
          "visibility",
          "visible"
        );
        map.setFilter(`${ASENTAMIENTOS_LAYER_ID}-labels`, filter as any);
      }

      // Pequeña pausa para que el filtro se aplique completamente
      await new Promise(resolve => setTimeout(resolve, 100));

      startAsentamientosAnimation(map);

      if (communityLngLat) {
        setTimeout(() => {
          zoomToAsentamientos(communityId, communityLngLat);
        }, 200);
      }
    } catch (e) {
      console.error("Error mostrando asentamientos:", e);
    }
  },
  [
    startAsentamientosAnimation,
    stopAsentamientosAnimation,
    zoomToAsentamientos,
  ]
);

// Función para verificar cuántos asentamientos son visibles
const checkAsentamientosVisibility = useCallback((map: MaplibreMap, communityId: string): number => {
  try {
    const numericId = parseInt(communityId, 10);
    const allFeatures = map.querySourceFeatures(ASENTAMIENTOS_SOURCE_ID, {
      sourceLayer: ASENTAMIENTOS_SOURCE_LAYER,
      filter: ["==", ["get", "ID_Archivo"], numericId],
    });

    const visibleFeatures = map.queryRenderedFeatures({
      layers: [ASENTAMIENTOS_LAYER_ID]
    });

    return visibleFeatures.length;
  } catch (e) {
    console.error("Error verificando visibilidad:", e);
    return 0;
  }
}, []);

  const attachNucleosPopupEvents = useCallback(
    (map: MaplibreMap) => {
      const popupRef = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        offset: 10,
        className: "nucleos-popup",
      });

      const buildNucleosHTML = (props: any) => {
        const nomNuc = String(props.NOM_NUC || props.nom_nuc || "—");
        const municipio = String(props.MUNICIPIO || props.municipio || "—");
        const tipo = String(props.tipo || props.TIPO || "—");
        const programa = String(props.PROGRAMA || props.programa || "—");

        return `
      <div class="nucleos-popup-content ${isDarkTheme ? "dark" : "light"}">
        <div class="nucleos-popup-header">
        
          <div class="title-section">
            <div class="title">${nomNuc}</div>
          </div>
        </div>
        <div class="nucleos-popup-body">
          <div class="info-row">
            <span class="label">Municipio:</span>
            <span class="value">${municipio}</span>
          </div>
          <div class="info-row">
            <span class="label">Tipo:</span>
            <span class="value">${tipo}</span>
          </div>
          <div class="info-row">
            <span class="label">Programa:</span>
            <span class="value">${programa}</span>
          </div>
        </div>
      </div>
    `;
      };

      const onClick = (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
        if (!e.features || e.features.length === 0) return;

        const feature = e.features[0];
        const props = feature.properties || {};
        const html = buildNucleosHTML(props);

        popupRef.setLngLat(e.lngLat).setHTML(html).addTo(map);
      };

      const onMouseEnter = () => {
        map.getCanvas().style.cursor = "pointer";
      };

      const onMouseLeave = () => {
        map.getCanvas().style.cursor = "";
      };

      map.on("click", NUCLEOS_LAYER_ID, onClick);
      map.on("mouseenter", NUCLEOS_LAYER_ID, onMouseEnter);
      map.on("mouseleave", NUCLEOS_LAYER_ID, onMouseLeave);

      return () => {
        map.off("click", NUCLEOS_LAYER_ID, onClick);
        map.off("mouseenter", NUCLEOS_LAYER_ID, onMouseEnter);
        map.off("mouseleave", NUCLEOS_LAYER_ID, onMouseLeave);
        popupRef.remove();
      };
    },
    [isDarkTheme]
  );

  const reapplyHighlightOnStyle = useCallback(
    (map: maplibregl.Map) => {
      const name = selectedCommunityNameRef.current;
      if (!name) return;
      ensureHighlightLayer(map);
      try {
        map.setFilter("highlight-community", [
          "any",
          ["==", ["get", COM_KEY], name],
          ["==", ["get", LOC_KEY], name],
        ] as any);

        const data = extractedDataRef.current;
        if (data) {
          const feat = data.features.find((ft) => {
            const p = ft.properties || {};
            const n = String(p[COM_KEY] || p[LOC_KEY] || "").trim();
            return n === name;
          });

          if (feat && feat.properties) {
            const communityId = String(feat.properties[ID_KEY] || "").trim();
            if (communityId) {
              showAsentamientos(communityId);
            }
          }
        }
      } catch {}
    },
    [showAsentamientos]
  );

  const setCommunityHighlight = useCallback(
    (communityInfo: string | { nombre: string; entidad?: string; municipio?: string; id?: string } | null) => {
      const map = mapRef.current;
      if (!map || !map.getSource(INPI_SOURCE_ID)) return;

      console.log("🎯 setCommunityHighlight llamado con:", communityInfo);

      // Extraer nombre del objeto o usar string directamente
      const communityName = typeof communityInfo === 'string' ? communityInfo : communityInfo?.nombre ?? null;
      selectedCommunityNameRef.current = communityName;

      ensureHighlightLayer(map);

      if (!communityInfo) {
        highlightedCommunityRef.current = null;
        try {
          map.setFilter("highlight-community", ["literal", false]);
        } catch {}
        showAsentamientos(null);
        restartCommunityAnimation(map);
        return;
      }

      highlightedCommunityRef.current = communityName;
      
      // Si tenemos un objeto con más información, usar filtro específico
      let filter: any;
      if (typeof communityInfo === 'object' && communityInfo.entidad && communityInfo.municipio) {
        // Filtrar por nombre + entidad + municipio para mayor precisión
        filter = [
          "all",
          [
            "any",
            ["==", ["get", COM_KEY], communityName],
            ["==", ["get", LOC_KEY], communityName],
          ],
          ["==", ["get", ENT_KEY], communityInfo.entidad],
          ["==", ["get", MUN_KEY], communityInfo.municipio],
        ];
        console.log("🔍 Filtrando por nombre + entidad + municipio:", communityName, communityInfo.entidad, communityInfo.municipio);
      } else {
        // Fallback: filtrar solo por nombre
        filter = [
          "any",
          ["==", ["get", COM_KEY], communityName],
          ["==", ["get", LOC_KEY], communityName],
        ];
        console.log("🔍 Filtrando por nombre solamente:", communityName);
      }

      stopCommunityAnimation();
      try {
        map.setFilter("highlight-community", filter);
        console.log("✅ Filtro aplicado al layer highlight-community");
      } catch (e) {
        console.error("❌ Error aplicando filtro:", e);
      }
    },
    [stopCommunityAnimation, restartCommunityAnimation, showAsentamientos]
  );

  const focusOnCommunityByName = useCallback(
    (
      name: string,
      opts?: {
        zoom?: number;
        duration?: number;
        entidad?: string;
        municipio?: string;
      }
    ) => {
      const data = extractedDataRef.current;
      if (!data) {
        console.warn("⚠️ No hay datos extraídos disponibles");
        return;
      }

      console.log("🔍 Buscando comunidad:", {
        nombre: name,
        entidad: opts?.entidad,
        municipio: opts?.municipio,
      });

      // ✅ Buscar con filtros completos
      const feat = data.features.find((ft) => {
        const p = ft.properties || {};
        const n = String(p[COM_KEY] || p[LOC_KEY] || "").trim();
        const featureEntidad = String(p[ENT_KEY] || "").trim();
        const featureMunicipio = String(p[MUN_KEY] || "").trim();

        const nombreMatch = n === name;
        const entidadMatch = opts?.entidad
          ? featureEntidad === opts.entidad
          : true;
        const municipioMatch = opts?.municipio
          ? featureMunicipio === opts.municipio
          : true;

        return nombreMatch && entidadMatch && municipioMatch;
      });

      const map = mapRef.current;
      if (!map) {
        console.warn("⚠️ Mapa no disponible");
        return;
      }

      if (feat && feat.geometry?.type === "Point") {
        const [lng, lat] = feat.geometry.coordinates as [number, number];

        console.log("✅ Comunidad encontrada en coordenadas:", { lng, lat });
        console.log("📍 Detalles:", {
          entidad: feat.properties?.[ENT_KEY],
          municipio: feat.properties?.[MUN_KEY],
          comunidad: feat.properties?.[COM_KEY] || feat.properties?.[LOC_KEY],
        });

        setCommunityHighlight(name);

        const communityId = String(feat.properties?.[ID_KEY] || "").trim();

        const z = communityZoomForMode(map);
        focusOnLngLat(lng, lat, {
          zoom: opts?.zoom ?? z,
          duration: opts?.duration ?? 900,
        });

        if (communityId) {
          showAsentamientos(communityId, [lng, lat]);
        }
      } else {
        console.error("❌ No se encontró la comunidad:", name);
        if (opts?.entidad) console.error("   Entidad buscada:", opts.entidad);
        if (opts?.municipio)
          console.error("   Municipio buscado:", opts.municipio);
      }
    },
    [focusOnLngLat, setCommunityHighlight, showAsentamientos]
  );

  const updateLayerVisibility = useCallback(
    (map: maplibregl.Map, retryCount: number = 0) => {
      const MAX_RETRIES = 30; // Máximo 30 reintentos (3 segundos)

      if (retryCount >= MAX_RETRIES) {
        console.error(
          "❌ Timeout: No se pudo actualizar visibilidad después de",
          MAX_RETRIES,
          "intentos"
        );
        console.log("🔄 Forzando actualización de visibilidad sin esperar...");

        // Forzar actualización aunque el estilo no esté "cargado"
        Object.entries(layersVisibility).forEach(([id, visible]) => {
          const vis = visible ? "visible" : "none";
          try {
            if (map.getLayer(id)) {
              map.setLayoutProperty(id, "visibility", vis);
              console.log(`✅ ${id}: forzado a ${vis}`);
            }
          } catch (error) {
            console.error(`❌ Error forzando visibilidad de ${id}:`, error);
          }
        });
        return;
      }

      if (!map.isStyleLoaded()) {
        if (retryCount === 0) {
          console.warn(
            "⚠️ Esperando a que el estilo esté cargado para actualizar visibilidad"
          );
        }
        setTimeout(() => updateLayerVisibility(map, retryCount + 1), 100);
        return;
      }

      console.log(
        `👁️ Actualizando visibilidad de todas las capas (intento ${
          retryCount + 1
        })...`
      );

      Object.entries(layersVisibility).forEach(([id, visible]) => {
        const vis = visible ? "visible" : "none";
        try {
          if (map.getLayer(id)) {
            const currentVis = map.getLayoutProperty(id, "visibility");
            if (currentVis !== vis) {
              map.setLayoutProperty(id, "visibility", vis);
              console.log(`✅ ${id}: ${currentVis} → ${vis}`);
            } else {
              console.log(`ℹ️ ${id}: ya está en ${vis}`);
            }
          } else {
            console.warn(`⚠️ Capa ${id} no encontrada en el mapa`);
          }
        } catch (error) {
          console.error(
            `❌ Error actualizando visibilidad de capa ${id}:`,
            error
          );
        }
      });

      console.log("✅ Actualización de visibilidad completada");
    },
    [layersVisibility]
  );

  const updateLayerVisibilityUsingIdle = useCallback(
    (map: maplibregl.Map) => {
      console.log("⏳ Esperando evento idle para actualizar visibilidad...");

      // Usar evento idle en lugar de isStyleLoaded
      const onIdle = () => {
        map.off("idle", onIdle);
        console.log("✅ Mapa en estado idle, actualizando visibilidad...");

        Object.entries(layersVisibility).forEach(([id, visible]) => {
          const vis = visible ? "visible" : "none";
          try {
            if (map.getLayer(id)) {
              map.setLayoutProperty(id, "visibility", vis);
              console.log(`✅ ${id}: ${vis}`);
            } else {
              console.warn(`⚠️ Capa ${id} no encontrada`);
            }
          } catch (error) {
            console.error(`❌ Error actualizando ${id}:`, error);
          }
        });

        console.log("✅ Visibilidad actualizada exitosamente");
      };

      // Timeout de seguridad: si no llega idle en 5 segundos, forzar actualización
      const timeoutId = setTimeout(() => {
        map.off("idle", onIdle);
        console.warn("⚠️ Timeout esperando idle, forzando actualización...");

        Object.entries(layersVisibility).forEach(([id, visible]) => {
          const vis = visible ? "visible" : "none";
          try {
            if (map.getLayer(id)) {
              map.setLayoutProperty(id, "visibility", vis);
              console.log(`✅ ${id}: forzado a ${vis}`);
            }
          } catch (error) {
            console.error(`❌ Error en ${id}:`, error);
          }
        });
      }, 5000);

      map.once("idle", () => {
        clearTimeout(timeoutId);
        onIdle();
      });
    },
    [layersVisibility]
  );

  const drawSingleRouteOnMap = useCallback(
    (map: MaplibreMap, route: RouteData) => {
      const { id, startPoint, endPoint, geometry } = route;
      if (map.getSource(`route-source-${id}`)) return;
      map.addSource(`route-source-${id}`, {
        type: "geojson",
        data: { type: "Feature", geometry, properties: {} },
      });
      map.addLayer({
        id: `route-layer-${id}`,
        type: "line",
        source: `route-source-${id}`,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#007cbf",
          "line-width": 5,
          "line-opacity": 0.8,
        },
      });
      map.addSource(`start-point-${id}`, {
        type: "geojson",
        data: { type: "Point", coordinates: [startPoint.lng, startPoint.lat] },
      });
      map.addLayer({
        id: `start-point-${id}`,
        type: "circle",
        source: `start-point-${id}`,
        paint: {
          "circle-radius": 6,
          "circle-color": "#007cbf",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addSource(`end-point-${id}`, {
        type: "geojson",
        data: { type: "Point", coordinates: [endPoint.lng, endPoint.lat] },
      });
      map.addLayer({
        id: `end-point-${id}`,
        type: "circle",
        source: `end-point-${id}`,
        paint: {
          "circle-radius": 6,
          "circle-color": "#007cbf",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    },
    []
  );

  const drawSingleLineOnMap = useCallback(
    (map: MaplibreMap, line: RouteData) => {
      const { id, startPoint, endPoint } = line;
      if (map.getSource(`line-source-${id}`)) return;
      const lineGeometry = {
        type: "LineString" as const,
        coordinates: [
          [startPoint.lng, startPoint.lat],
          [endPoint.lng, endPoint.lat],
        ],
      };
      map.addSource(`line-source-${id}`, {
        type: "geojson",
        data: { type: "Feature", geometry: lineGeometry, properties: {} },
      });
      map.addLayer({
        id: `line-layer-${id}`,
        type: "line",
        source: `line-source-${id}`,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ff6b35",
          "line-width": 4,
          "line-opacity": 0.8,
          "line-dasharray": [2, 2],
        },
      });
      map.addSource(`start-line-point-${id}`, {
        type: "geojson",
        data: { type: "Point", coordinates: [startPoint.lng, startPoint.lat] },
      });
      map.addLayer({
        id: `start-line-point-${id}`,
        type: "circle",
        source: `start-line-point-${id}`,
        paint: {
          "circle-radius": 6,
          "circle-color": "#ff6b35",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addSource(`end-line-point-${id}`, {
        type: "geojson",
        data: { type: "Point", coordinates: [endPoint.lng, endPoint.lat] },
      });
      map.addLayer({
        id: `end-line-point-${id}`,
        type: "circle",
        source: `end-line-point-${id}`,
        paint: {
          "circle-radius": 6,
          "circle-color": "#ff6b35",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    },
    []
  );

  const clearCurrentPoints = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = [
      "start-point-current",
      "start-point-current-pulse",
      "end-point-current",
      "end-point-current-pulse",
      "start-point-line-current",
      "start-point-line-current-pulse",
      "end-point-line-current",
      "end-point-line-current-pulse",
    ];
    const sources = [
      "start-point-current",
      "end-point-current",
      "start-point-line-current",
      "end-point-line-current",
    ];
    layers.forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    sources.forEach((id) => {
      if (map.getSource(id)) map.removeSource(id);
    });
  }, []);

  const clearAllRoutes = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    routesData.forEach((route) => {
      const { id } = route;
      if (map.getLayer(`route-layer-${id}`))
        map.removeLayer(`route-layer-${id}`);
      if (map.getSource(`route-source-${id}`))
        map.removeSource(`route-source-${id}`);
      if (map.getLayer(`start-point-${id}`))
        map.removeLayer(`start-point-${id}`);
      if (map.getSource(`start-point-${id}`))
        map.removeSource(`start-point-${id}`);
      if (map.getLayer(`end-point-${id}`)) map.removeLayer(`end-point-${id}`);
      if (map.getSource(`end-point-${id}`)) map.removeSource(`end-point-${id}`);
    });
    linesData.forEach((line) => {
      const { id } = line;
      if (map.getLayer(`line-layer-${id}`)) map.removeLayer(`line-layer-${id}`);
      if (map.getSource(`line-source-${id}`))
        map.removeSource(`line-source-${id}`);
      if (map.getLayer(`start-line-point-${id}`))
        map.removeLayer(`start-line-point-${id}`);
      if (map.getSource(`start-line-point-${id}`))
        map.removeSource(`start-line-point-${id}`);
      if (map.getLayer(`end-line-point-${id}`))
        map.removeLayer(`end-line-point-${id}`);
      if (map.getSource(`end-line-point-${id}`))
        map.removeSource(`end-line-point-${id}`);
    });
    setRoutesData([]);
    setLinesData([]);
    setRoutePopupPositions({});
    setLinePopupPositions({});
    clearCurrentPoints();
  }, [routesData, linesData, clearCurrentPoints]);

  const attachAllTooltipEvents = useCallback(
    (map: MaplibreMap) => {
      const layerId = INPI_LAYER_ID;
      const checkMeasurement = () =>
        isMeasuringRef.current || isMeasuringLineRef.current;

      if (enterHandlerRef.current)
        map.off("mouseenter", layerId, enterHandlerRef.current);
      if (leaveHandlerRef.current)
        map.off("mouseleave", layerId, leaveHandlerRef.current);
      if (moveHandlerRef.current)
        map.off("mousemove", layerId, moveHandlerRef.current);
      if (clickHandlerRef.current)
        map.off("click", layerId, clickHandlerRef.current);
      if (mapClickOffRef.current) map.off("click", mapClickOffRef.current);

      if (!hoverPopupRef.current) {
        hoverPopupRef.current = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: false,
          offset: 10,
          className: "hover-popup",
        });
      }

      const buildHTML = (props: any) => {
        const nombre = String(props[COM_KEY] ?? props[LOC_KEY] ?? "Comunidad");
        const ent = String(props[ENT_KEY] ?? "—");
        const mun = String(props[MUN_KEY] ?? "—");
        const pue = String(props[PUE_KEY] ?? props.PUEBLO ?? "—");

        const idFichaRaw = props[ID_KEY] || "";
        const idFicha = String(idFichaRaw).trim();
        const fichaUrl = idFicha
          ? `${process.env.PUBLIC_URL || ""}/fichas/${idFicha}.html`
          : undefined;

        const html = `
        <div class="community-popup ${isDarkTheme ? "dark" : "light"}">
          <div class="popup-header">
            <div class="location-icon">📍</div>
            <div class="title-section">
              <div class="title">${nombre}</div>
              <div class="subtitle">Entidad: ${ent}</div>
              <div class="subtitle">Municipio: ${mun}</div>
              <div class="subtitle">Pueblo: ${pue}</div>
            </div>
          </div>
          <div class="popup-footer">
            <button id="btn-ficha" class="ficha-btn ${
              fichaUrl ? "enabled" : "disabled"
            }" ${fichaUrl ? "" : 'disabled title="Sin ID válido para ficha"'}>
              <svg class="ficha-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10,9 9,9 8,9"/>
              </svg>
              <span>Ver Resumen</span>
            </button>
          </div>
        </div>
      `;
        return { html, nombre, ent, mun, pue, idFicha, fichaUrl };
      };

      const wireButton = (payload: {
        nombre: string;
        ent: string;
        mun: string;
        pue: string;
        idFicha: string;
        fichaUrl?: string;
        lngLat: maplibregl.LngLatLike;
        props: any;
        feature: any;
      }) => {
        const btn = hoverPopupRef
          .current!.getElement()
          .querySelector<HTMLButtonElement>("#btn-ficha");
        if (!btn) return;
        btn.onclick = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();

          const [lng, lat] = getFeatureLngLat(
            payload.feature,
            payload.lngLat as any
          );

          suppressNextFilterZoomRef.current = true;

          setTimeout(() => {
            suppressNextFilterZoomRef.current = false;
          }, 1300);

          setCommunityHighlight(payload.nombre);

          try {
            hoverPopupRef.current?.remove();
          } catch {}
          isPinnedRef.current = false;

          if (payload.idFicha) {
            showAsentamientos(payload.idFicha, [lng, lat]);
          }

          if (payload.fichaUrl) {
            const communityData: CommunityData = {
              id: payload.idFicha || payload.nombre,
              nombre: payload.nombre,
              entidad: payload.ent,
              municipio: payload.mun,
              pueblo: payload.pue,
              poblacion: Number(
                payload.props.POB || payload.props.poblacion || 0
              ),
              latitud: lat,
              longitud: lng,
              htmlUrl: payload.fichaUrl,
            };
            window.dispatchEvent(
              new CustomEvent("open-ficha", {
                detail: { id: communityData.id, url: communityData.htmlUrl },
              })
            );
            onCommunityClick(communityData.id, communityData);
          }
        };
      };

      const onEnter = () => {
        if (!checkMeasurement()) map.getCanvas().style.cursor = "pointer";
      };

      const onLeave = () => {
        if (!checkMeasurement()) map.getCanvas().style.cursor = "";
        if (!isPinnedRef.current) {
          try {
            hoverPopupRef.current?.remove();
          } catch {}
        }
      };

      const onMove = (
        e: maplibregl.MapMouseEvent & { features?: Feature[] }
      ) => {
        if (checkMeasurement() || isPinnedRef.current) return;
        if (!e.features || e.features.length === 0) {
          try {
            hoverPopupRef.current?.remove();
          } catch {}
          return;
        }

        const feature = e.features[0] as any;
        const props: any = feature.properties || {};
        const { html, nombre, ent, mun, pue, idFicha, fichaUrl } =
          buildHTML(props);

        try {
          hoverPopupRef.current!.setLngLat(e.lngLat).setHTML(html).addTo(map);

          wireButton({
            nombre,
            ent,
            mun,
            pue,
            idFicha,
            fichaUrl,
            lngLat: e.lngLat,
            props,
            feature,
          });
        } catch {}
      };

      const onClick = (
        e: maplibregl.MapMouseEvent & { features?: Feature[] }
      ) => {
        if (checkMeasurement()) return;
        if (!e.features || e.features.length === 0) return;

        const feature = e.features[0] as any;
        const props: any = feature.properties || {};
        const { html, nombre, ent, mun, pue, idFicha, fichaUrl } =
          buildHTML(props);

        isPinnedRef.current = true;
        try {
          hoverPopupRef.current!.setLngLat(e.lngLat).setHTML(html).addTo(map);
          wireButton({
            nombre,
            ent,
            mun,
            pue,
            idFicha,
            fichaUrl,
            lngLat: e.lngLat,
            props,
            feature,
          });
        } catch {}

        try {
          setCommunityHighlight(nombre);
        } catch {}
      };

      const onMapClickOutside = (e: maplibregl.MapMouseEvent) => {
        if (!isPinnedRef.current) return;
        const hits = map.queryRenderedFeatures(e.point, { layers: [layerId] });
        if (hits.length > 0) return;
        try {
          hoverPopupRef.current?.remove();
        } catch {}
        isPinnedRef.current = false;
      };

      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape" && isPinnedRef.current) {
          try {
            hoverPopupRef.current?.remove();
          } catch {}
          isPinnedRef.current = false;
        }
      };
      window.addEventListener("keydown", onKey);

      enterHandlerRef.current = onEnter;
      leaveHandlerRef.current = onLeave;
      moveHandlerRef.current = onMove;
      clickHandlerRef.current = onClick;
      mapClickOffRef.current = onMapClickOutside;

      map.on("mouseenter", layerId, onEnter);
      map.on("mouseleave", layerId, onLeave);
      map.on("mousemove", layerId, onMove);
      map.on("click", layerId, onClick);
      map.on("click", onMapClickOutside);

      return () => {
        window.removeEventListener("keydown", onKey);
      };
    },
    [
      isDarkTheme,
      onCommunityClick,
      focusOnLngLat,
      setCommunityHighlight,
      showAsentamientos,
    ]
  );

  const applyStyleSmoothly = useCallback(
    async (
      map: maplibregl.Map,
      newStyleUrl: string,
      { keep3D }: { keep3D: boolean }
    ): Promise<void> => {
      if (isTransitioningRef.current) return Promise.resolve();
      isTransitioningRef.current = true;
      isStyleChangingRef.current = true;

      stopCommunityAnimation();
      const view = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      };
      const keep3dPitch = keep3D ? desired3DPitchRef.current : 0;
      const keepBearing = keep3D ? desired3DBearingRef.current : view.bearing;

      console.log("🔄 Cambiando estilo del mapa a:", newStyleUrl);
      map.setStyle(newStyleUrl, { diff: false });

      // Esperar a que el estilo esté completamente cargado
      await new Promise<void>((resolve) => {
        let attempts = 0;
        const maxAttempts = 50;

        const checkStyleLoaded = () => {
          attempts++;
          if (map.isStyleLoaded()) {
            console.log("✅ Estilo completamente cargado");
            resolve();
          } else if (attempts >= maxAttempts) {
            console.warn(
              "⚠️ Timeout esperando estilo, continuando de todos modos..."
            );
            resolve();
          } else {
            setTimeout(checkStyleLoaded, 100);
          }
        };
        checkStyleLoaded();
      });

      console.log("📦 Agregando capas vectoriales...");
      addVectorLayers(map);

      // Esperar a que las fuentes estén cargadas
      await new Promise<void>((resolve) => {
        let checkCount = 0;
        const maxChecks = 30;

        const checkSourcesLoaded = () => {
          checkCount++;
          const inpiLoaded = map.isSourceLoaded(INPI_SOURCE_ID);
          const nucleosLoaded = map.isSourceLoaded(NUCLEOS_SOURCE_ID);
          const asentamientosLoaded = map.isSourceLoaded(
            ASENTAMIENTOS_SOURCE_ID
          );

          console.log(
            `📊 Intento ${checkCount} - INPI: ${inpiLoaded}, Núcleos: ${nucleosLoaded}, Asentamientos: ${asentamientosLoaded}`
          );

          if (
            (inpiLoaded && nucleosLoaded && asentamientosLoaded) ||
            checkCount >= maxChecks
          ) {
            if (checkCount >= maxChecks) {
              console.warn("⚠️ Timeout esperando sources, continuando...");
            } else {
              console.log("✅ Todos los sources cargados");
            }
            resolve();
          } else {
            setTimeout(checkSourcesLoaded, 100);
          }
        };
        checkSourcesLoaded();
      });

      console.log("🎯 Asegurando capa de highlight...");
      ensureHighlightLayer(map);

      console.log("🔍 Reaplicando highlight en estilo...");
      reapplyHighlightOnStyle(map);

      // ✅ USAR LA NUEVA FUNCIÓN QUE USA EVENTO IDLE
      console.log("👁️ Actualizando visibilidad usando evento idle...");
      updateLayerVisibilityUsingIdle(map);

      console.log("🛣️ Redibujando rutas...");
      routesData.forEach((r) => drawSingleRouteOnMap(map, r));
      linesData.forEach((l) => drawSingleLineOnMap(map, l));

      console.log("🎪 Adjuntando eventos de tooltip...");
      attachAllTooltipEvents(map);

      map.jumpTo({
        center: view.center,
        zoom: view.zoom,
        bearing: keepBearing,
        pitch: keep3dPitch,
      });

      startCommunityAnimation(map);

      // ✅ Marcar como completado después de que idle se dispare
      setTimeout(() => {
        isTransitioningRef.current = false;
        isStyleChangingRef.current = false;
        console.log("✅ Cambio de estilo completado");
      }, 500);

      return Promise.resolve();
    },
    [
      reapplyHighlightOnStyle,
      updateLayerVisibilityUsingIdle,
      routesData,
      linesData,
      drawSingleRouteOnMap,
      drawSingleLineOnMap,
      attachAllTooltipEvents,
      startCommunityAnimation,
      stopCommunityAnimation,
    ]
  );

  const animateTerrainExaggeration = useCallback(
    (map: any, targetExaggeration: number, duration: number = 1500) => {
      const startTime = Date.now();
      const startExaggeration = 0.1;
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOutQuart = 1 - Math.pow(1 - progress, 3);
        const currentExaggeration =
          startExaggeration +
          (targetExaggeration - startExaggeration) * easeOutQuart;
        try {
          if (map.getTerrain()) {
            map.setTerrain({
              source: "terrain-rgb",
              exaggeration: currentExaggeration,
            });
          }
        } catch {}
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    },
    []
  );

  const applyOrRemove3DEffects = useCallback(
    (map: any, is3DActive: boolean, isSatelliteActive: boolean) => {
      if (is3DActive) {
        try {
          if (!map.getSource("terrain-rgb")) {
            map.addSource("terrain-rgb", {
              type: "raster-dem",
              url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${apiKey}`,
              tileSize: 256,
            });
          }
          const exaggeration = isSatelliteActive ? 1.3 : 1.5;
          const targetPitch = 65;
          map.setTerrain({ source: "terrain-rgb", exaggeration: 0.1 });
          setTimeout(
            () => animateTerrainExaggeration(map, exaggeration, 1200),
            300
          );
          if (!map.getLayer("sky")) {
            map.addLayer({
              id: "sky",
              type: "sky",
              paint: {
                "sky-type": "atmosphere",
                "sky-atmosphere-sun": [0.0, 0.0],
                "sky-atmosphere-sun-intensity": isSatelliteActive ? 4 : 6,
              },
            } as any);
          }
          if (map.getPitch() < 30) {
            map.easeTo({
              pitch: targetPitch,
              bearing: map.getBearing(),
              duration: 1200,
              easing: (t: number) => t * (2 - t),
            });
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        try {
          const currentPitch = map.getPitch();
          if (currentPitch > 5) {
            map
              .easeTo({
                pitch: 0,
                duration: 800,
                easing: (t: number) => t * (2 - t),
              })
              .once("moveend", () => {
                if (map.getLayer("sky")) map.removeLayer("sky");
                if (map.getTerrain()) map.setTerrain(null);
              });
          } else {
            if (map.getLayer("sky")) map.removeLayer("sky");
            if (map.getTerrain()) map.setTerrain(null);
          }
        } catch {}
      }
    },
    [animateTerrainExaggeration, apiKey]
  );

  const toggle3D = () => {
    const map = mapRef.current;
    if (!map || isStyleChangingRef.current || isTransitioningRef.current)
      return;

    const currentIsSatellite = isSatellite;
    const newIs3D = !is3D;

    if (map.getTerrain()) map.setTerrain(null);
    if (map.getLayer("sky")) map.removeLayer("sky");

    setIs3D(newIs3D);

    const newStyleUrl = currentIsSatellite
      ? satelliteStyleUrl
      : newIs3D
      ? outdoor3DStyleUrl
      : isDarkTheme
      ? darkStyleUrl
      : lightStyleUrl;

    applyStyleSmoothly(map, newStyleUrl, { keep3D: newIs3D }).then(() => {
      if (newIs3D) {
        applyOrRemove3DEffects(map, true, currentIsSatellite);
      }
    });
  };

  const toggleSatellite = () => {
    const map = mapRef.current;
    if (!map || isStyleChangingRef.current || isTransitioningRef.current)
      return;

    const was3D = is3D;
    const newIsSatellite = !isSatellite;

    if (map.getTerrain()) map.setTerrain(null);
    if (map.getLayer("sky")) map.removeLayer("sky");

    setIsSatellite(newIsSatellite);

    const newStyleUrl = was3D
      ? newIsSatellite
        ? satelliteStyleUrl
        : outdoor3DStyleUrl
      : newIsSatellite
      ? satelliteStyleUrl
      : isDarkTheme
      ? darkStyleUrl
      : lightStyleUrl;

    applyStyleSmoothly(map, newStyleUrl, { keep3D: was3D }).then(() => {
      if (was3D) {
        applyOrRemove3DEffects(map, true, newIsSatellite);
      }
    });
  };

  const extractLayerData = useCallback(
    (map: MaplibreMap) => {
      if (
        !map.getLayer(INPI_LAYER_ID) ||
        isStyleChangingRef.current ||
        isTransitioningRef.current
      ) {
        setTimeout(() => extractLayerData(map), 1500);
        return;
      }
      performSystematicDataExtraction(map);
    },
    [onDataLoaded]
  );

  const waitForTilesLoaded = (
    map: MaplibreMap,
    timeout: number = 3000
  ): Promise<void> => {
    return new Promise((resolve) => {
      let tilesLoadedCount = 0;
      const maxWait = Date.now() + timeout;

      const checkTiles = () => {
        if (Date.now() > maxWait || !map.isSourceLoaded(INPI_SOURCE_ID)) {
          resolve();
          return;
        }

        if (map.areTilesLoaded() && map.isSourceLoaded(INPI_SOURCE_ID)) {
          tilesLoadedCount++;
          if (tilesLoadedCount >= 2) {
            resolve();
            return;
          }
        }

        requestAnimationFrame(checkTiles);
      };

      checkTiles();
    });
  };

  const performSystematicDataExtraction = useCallback(
    async (map: MaplibreMap) => {
      if (isStyleChangingRef.current || isTransitioningRef.current) return;

      setIsLoadingData(true);

      const TARGET_COUNT = 16251;
      const allFeaturesSet = new window.Map();
      const MAX_ATTEMPTS = 6;

      const originalCenter = map.getCenter();
      const originalZoom = map.getZoom();
      const originalBearing = map.getBearing();
      const originalPitch = map.getPitch();

      const gridPoints = [
        [-116, 32],
        [-108, 32],
        [-100, 32],
        [-92, 32],
        [-88, 32],
        [-116, 28],
        [-108, 28],
        [-100, 28],
        [-92, 28],
        [-88, 28],
        [-116, 24],
        [-108, 24],
        [-100, 24],
        [-92, 24],
        [-88, 24],
        [-116, 20],
        [-108, 20],
        [-100, 20],
        [-92, 20],
        [-88, 20],
        [-116, 16],
        [-108, 16],
        [-100, 16],
        [-92, 16],
        [-88, 16],
      ];
      const zoomLevels = [4, 5, 6, 7];

      try {
        for (
          let attempt = 0;
          attempt < MAX_ATTEMPTS &&
          allFeaturesSet.size < TARGET_COUNT &&
          !isStyleChangingRef.current &&
          !isTransitioningRef.current;
          attempt++
        ) {
          for (const zoom of zoomLevels) {
            if (
              allFeaturesSet.size >= TARGET_COUNT ||
              isStyleChangingRef.current ||
              isTransitioningRef.current
            )
              break;
            for (const [lng, lat] of gridPoints) {
              if (
                allFeaturesSet.size >= TARGET_COUNT ||
                isStyleChangingRef.current ||
                isTransitioningRef.current
              )
                break;
              map.jumpTo({ center: [lng, lat], zoom });
              await new Promise((resolve) => setTimeout(resolve, 100));
              try {
                const features = map.querySourceFeatures(INPI_SOURCE_ID, {
                  sourceLayer: INPI_SOURCE_LAYER,
                });
                features.forEach((feature: any) => {
                  const props = feature.properties || {};
                  const id =
                    props[ID_KEY] ||
                    props.id ||
                    `${props.NOM_ENT}_${props.NOM_MUN}_${
                      props.NOM_COM || props.NOM_LOC
                    }`;
                  if (id && !allFeaturesSet.has(id))
                    allFeaturesSet.set(id, feature);
                });
              } catch {}
            }
          }
          if (allFeaturesSet.size >= TARGET_COUNT * 0.95) break;
        }
      } catch (error) {
        console.error("Error en extracción sistemática:", error);
      } finally {
        if (!isStyleChangingRef.current && !isTransitioningRef.current) {
          map.jumpTo({
            center: originalCenter,
            zoom: originalZoom,
            bearing: originalBearing,
            pitch: originalPitch,
          });
        }

        setIsLoadingData(false);
      }

      const finalFeatures = Array.from(allFeaturesSet.values());
      if (!isStyleChangingRef.current && !isTransitioningRef.current)
        processAndSendData(finalFeatures);
    },
    [onDataLoaded]
  );

  const processAndSendData = useCallback(
    (features: any[]) => {
      if (isStyleChangingRef.current || isTransitioningRef.current) return;
      const entidadesObj: { [key: string]: boolean } = {};
      const municipiosObj: { [key: string]: string[] } = {};
      const comunidadesObj: { [key: string]: string[] } = {};
      const pueblosObj: { [key: string]: boolean } = {};

      features.forEach((feature: any) => {
        const props = feature.properties || {};
        const entidad = String(props[ENT_KEY] || "").trim();
        const municipio = String(props[MUN_KEY] || "").trim();
        const comunidad = String(props[COM_KEY] || props[LOC_KEY] || "").trim();
        const pueblo = String(props[PUE_KEY] || "").trim();

        if (entidad) {
          entidadesObj[entidad] = true;
          if (municipio) {
            if (!municipiosObj[entidad]) municipiosObj[entidad] = [];
            if (!municipiosObj[entidad].includes(municipio))
              municipiosObj[entidad].push(municipio);
            const key = `${entidad}|${municipio}`;
            if (comunidad) {
              if (!comunidadesObj[key]) comunidadesObj[key] = [];
              if (!comunidadesObj[key].includes(comunidad))
                comunidadesObj[key].push(comunidad);
            }
          }
        }
        if (pueblo) pueblosObj[pueblo] = true;
      });

      const entidadesSet = new window.Set(Object.keys(entidadesObj));
      const municipiosDataMap = new window.Map();
      const comunidadesDataMap = new window.Map();
      const pueblosSet = new window.Set(Object.keys(pueblosObj));

      Object.keys(municipiosObj).forEach((ent) => {
        municipiosDataMap.set(ent, new window.Set(municipiosObj[ent]));
      });
      Object.keys(comunidadesObj).forEach((key) => {
        comunidadesDataMap.set(key, new window.Set(comunidadesObj[key]));
      });

      const data: ExtractedData = {
        entidades: entidadesSet,
        municipiosPorEntidad: municipiosDataMap,
        comunidadesPorMunicipio: comunidadesDataMap,
        pueblos: pueblosSet,
        features,
      };
      extractedDataRef.current = data;
      if (
        onDataLoaded &&
        !isStyleChangingRef.current &&
        !isTransitioningRef.current
      )
        onDataLoaded(data);
    },
    [onDataLoaded]
  );

  const applyMapFilters = useCallback(() => {
    const map = mapRef.current;
    if (
      !map ||
      !map.getLayer(INPI_LAYER_ID) ||
      isStyleChangingRef.current ||
      isTransitioningRef.current
    )
      return;

    let filterArray: any = null;
    const conditions: any[] = [];

    const allFiltersEmpty =
      !filters.entidad?.trim() &&
      !filters.municipio?.trim() &&
      !filters.comunidad?.trim() &&
      !filters.pueblo?.trim();

    if (allFiltersEmpty) {
      filterArray = null;
    } else {
      if (filters.entidad && filters.entidad.trim() !== "") {
        conditions.push(["==", ["get", ENT_KEY], filters.entidad]);
      }
      if (filters.municipio && filters.municipio.trim() !== "") {
        conditions.push(["==", ["get", MUN_KEY], filters.municipio]);
      }
      if (filters.comunidad && filters.comunidad.trim() !== "") {
        conditions.push([
          "any",
          ["==", ["get", COM_KEY], filters.comunidad],
          ["==", ["get", LOC_KEY], filters.comunidad],
        ]);
      }
      if (filters.pueblo && filters.pueblo.trim() !== "") {
        conditions.push(["==", ["get", PUE_KEY], filters.pueblo]);
      }
      if (conditions.length > 0)
        filterArray =
          conditions.length === 1 ? conditions[0] : ["all", ...conditions];
    }

    try {
      map.setFilter(INPI_LAYER_ID, filterArray);
      setTimeout(() => {
        if (!isStyleChangingRef.current && !isTransitioningRef.current)
          map.triggerRepaint();
      }, 100);
    } catch {
      try {
        map.setFilter(INPI_LAYER_ID, null);
        if (!isStyleChangingRef.current && !isTransitioningRef.current) {
          map.triggerRepaint();
        }
      } catch {}
    }
  }, [filters]);

  const applyFilterZoom = useCallback(() => {
    const map = mapRef.current;
    if (
      !map ||
      !extractedDataRef.current ||
      isStyleChangingRef.current ||
      isTransitioningRef.current
    )
      return;

    if (suppressNextFilterZoomRef.current) return;

    // ✅ Si hay comunidad seleccionada, usar entidad y municipio también
    if (filters.comunidad && filters.comunidad.trim() !== "") {
      console.log("🎯 Haciendo zoom a comunidad con filtros:", {
        comunidad: filters.comunidad,
        entidad: filters.entidad,
        municipio: filters.municipio,
      });

      focusOnCommunityByName(filters.comunidad.trim(), {
        zoom: communityZoomForMode(map),
        duration: 900,
        entidad: filters.entidad || undefined,
        municipio: filters.municipio || undefined,
      });
      return;
    }

    // Resto del código para municipio, entidad, etc.
    const features = extractedDataRef.current.features.filter((feature) => {
      const props = feature.properties || {};
      if (filters.entidad && props[ENT_KEY] !== filters.entidad) return false;
      if (filters.municipio && props[MUN_KEY] !== filters.municipio)
        return false;
      if (filters.pueblo && props[PUE_KEY] !== filters.pueblo) return false;
      return true;
    });

    if (features.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    features.forEach((feature) => {
      if (feature.geometry && feature.geometry.type === "Point") {
        bounds.extend(feature.geometry.coordinates as [number, number]);
      }
    });

    let padding = { top: 50, bottom: 50, left: 50, right: 350 };
    let maxZoom = 16;

    if (filters.municipio) {
      maxZoom = 12;
      padding = { top: 80, bottom: 80, left: 80, right: 380 };
    } else if (filters.entidad) {
      maxZoom = 9;
      padding = { top: 60, bottom: 60, left: 60, right: 360 };
    }

    map.fitBounds(bounds, {
      padding,
      maxZoom,
      duration: 1200,
      essential: true,
    });
    setTimeout(() => rememberView(map), 1250);
  }, [filters, focusOnCommunityByName]);

  useEffect(() => {
    if (!isStyleChangingRef.current && !isTransitioningRef.current) {
      applyMapFilters();
      applyFilterZoom();
    }
  }, [filters, applyMapFilters, applyFilterZoom]);

  const updatePopupPositions = useCallback(() => {
    const map = mapRef.current;
    if (!map || isStyleChangingRef.current || isTransitioningRef.current)
      return;

    const newRoutePositions: { [routeId: number]: PopupPosition } = {};
    routesData.forEach((route) => {
      const projected = map.project(route.endPoint);
      const bounds = map.getBounds();
      const isVisible = bounds.contains(route.endPoint);
      newRoutePositions[route.id] = {
        x: projected.x,
        y: projected.y,
        visible: isVisible,
      };
    });
    setRoutePopupPositions(newRoutePositions);

    const newLinePositions: { [lineId: number]: PopupPosition } = {};
    linesData.forEach((line) => {
      const projected = map.project(line.endPoint);
      const bounds = map.getBounds();
      const isVisible = bounds.contains(line.endPoint);
      newLinePositions[line.id] = {
        x: projected.x,
        y: projected.y,
        visible: isVisible,
      };
    });
    setLinePopupPositions(newLinePositions);
  }, [routesData, linesData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handleMapChange = () => {
      if (!isStyleChangingRef.current && !isTransitioningRef.current) {
        updatePopupPositions();
        rememberView(map);
      }
    };
    map.on("move", handleMapChange);
    map.on("zoom", handleMapChange);
    map.on("rotate", handleMapChange);
    map.on("pitch", handleMapChange);
    return () => {
      map.off("move", handleMapChange);
      map.off("zoom", handleMapChange);
      map.off("rotate", handleMapChange);
      map.off("pitch", handleMapChange);
    };
  }, [updatePopupPositions]);

  useEffect(() => {
    if (!isStyleChangingRef.current && !isTransitioningRef.current)
      updatePopupPositions();
  }, [updatePopupPositions]);

  useEffect(() => {
    const handleShowAsentamientos = (event: CustomEvent) => {
      const { communityId, lat, lng } = event.detail;
      console.log("🗺️ Map recibió evento show-asentamientos:", {
        communityId,
        lat,
        lng,
      });

      if (communityId && lat && lng) {
        showAsentamientos(communityId, [lng, lat]);
      }
    };

    window.addEventListener(
      "show-asentamientos",
      handleShowAsentamientos as EventListener
    );
    return () =>
      window.removeEventListener(
        "show-asentamientos",
        handleShowAsentamientos as EventListener
      );
  }, [showAsentamientos]);

  // const forceCompleteDataReload = useCallback(() => {
  //   const map = mapRef.current;
  //   if (!map || isStyleChangingRef.current || isTransitioningRef.current)
  //     return;
  //   extractedDataRef.current = null;
  //   setTimeout(() => {
  //     if (!isStyleChangingRef.current && !isTransitioningRef.current)
  //       extractLayerData(map);
  //   }, 800);
  // }, [extractLayerData]);

  const changeMapStylePreservingPosition = useCallback(
    (newStyleUrl: string) => {
      const map = mapRef.current;
      if (
        !map ||
        !map.isStyleLoaded() ||
        isStyleChangingRef.current ||
        isTransitioningRef.current
      )
        return;

      const was3D = is3D;
      if (map.getTerrain()) map.setTerrain(null);
      if (map.getLayer("sky")) map.removeLayer("sky");

      applyStyleSmoothly(map, newStyleUrl, { keep3D: was3D });
    },
    [applyStyleSmoothly, is3D]
  );

  const addRouteToMap = useCallback(
    async (points: LngLatLike[]) => {
      const map = mapRef.current;
      if (!map) return;
      const [startPoint, endPoint] = points.map((p) => LngLat.convert(p));
      const url = `https://router.project-osrm.org/route/v1/driving/${startPoint.lng},${startPoint.lat};${endPoint.lng},${endPoint.lat}?overview=full&geometries=geojson`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.code !== "Ok" || data.routes.length === 0)
          throw new Error("No se pudo encontrar una ruta.");
        const route = data.routes[0];
        const km = (route.distance / 1000).toFixed(2);
        const s = route.duration;
        const h = Math.floor(s / 3600);
        const m = Math.round((s % 3600) / 60);
        const duration = `${h ? `${h} h ` : ""}${m} min`;
        const newRoute: RouteData = {
          id: routeIdCounter.current++,
          startPoint,
          endPoint,
          geometry: route.geometry,
          distance: km,
          duration,
        };
        drawSingleRouteOnMap(map, newRoute);
        setRoutesData((prev) => [...prev, newRoute]);
      } catch (e) {
        alert("No se pudo calcular la ruta.");
      } finally {
        clearCurrentPoints();
        setCurrentPoints([]);
      }
    },
    [clearCurrentPoints, drawSingleRouteOnMap]
  );

  const addLineToMap = useCallback(
    (points: LngLatLike[]) => {
      const map = mapRef.current;
      if (!map) return;
      const [a, b] = points.map((p) => LngLat.convert(p));
      const R = 6371;
      const toRad = (x: number) => (x * Math.PI) / 180;
      const d =
        Math.acos(
          Math.sin(toRad(a.lat)) * Math.sin(toRad(b.lat)) +
            Math.cos(toRad(a.lat)) *
              Math.cos(toRad(b.lat)) *
              Math.cos(toRad(b.lng - a.lng))
        ) * R;
      const km = d.toFixed(2);
      const newLine: RouteData = {
        id: routeIdCounter.current++,
        startPoint: a,
        endPoint: b,
        geometry: {
          type: "LineString",
          coordinates: [
            [a.lng, a.lat],
            [b.lng, b.lat],
          ],
        },
        distance: km,
        duration: "Línea recta",
      };
      drawSingleLineOnMap(map, newLine);
      setLinesData((prev) => [...prev, newLine]);
      clearCurrentPoints();
      setCurrentLinePoints([]);
    },
    [clearCurrentPoints, drawSingleLineOnMap]
  );

  const toggleMeasurement = () => {
    const was = isMeasuring;
    setIsMeasuring(!was);
    setIsMeasuringLine(false);
    if (was) clearAllRoutes();
    setCurrentPoints([]);
    setCurrentLinePoints([]);
  };

  const toggleLineMeasurement = () => {
    const was = isMeasuringLine;
    setIsMeasuringLine(!was);
    setIsMeasuring(false);
    if (was) clearAllRoutes();
    setCurrentPoints([]);
    setCurrentLinePoints([]);
  };

  const resetNorth = () => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      bearing: 0,
      pitch: is3D ? map.getPitch() : 0,
      duration: 1000,
      easing: (t) => t * (2 - t),
    });
  };

  const prevIsDarkTheme = useRef(isDarkTheme);
  useEffect(() => {
    if (
      prevIsDarkTheme.current !== isDarkTheme &&
      !isSatellite &&
      !isStyleChangingRef.current &&
      !isTransitioningRef.current
    ) {
      const newStyleUrl = isDarkTheme ? darkStyleUrl : lightStyleUrl;
      changeMapStylePreservingPosition(newStyleUrl);
    }
    prevIsDarkTheme.current = isDarkTheme;
  }, [
    isDarkTheme,
    isSatellite,
    changeMapStylePreservingPosition,
    darkStyleUrl,
    lightStyleUrl,
  ]);

  const animateCompass = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      compassAnimId.current = requestAnimationFrame(animateCompass);
      return;
    }
    const target = map.getBearing();
    const current = displayBearingRef.current;
    const diff = ((target - current + 540) % 360) - 180;
    const next = current + diff * 0.15;
    displayBearingRef.current = next;
    setDisplayBearing(next);
    compassAnimId.current = requestAnimationFrame(animateCompass);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const minimap = minimapRef.current;
    if (!map) return;

    let resizeTimeout: NodeJS.Timeout;
    let lastWindowSize = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const handleResize = () => {
      if (isResizingRef.current) return;
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        isResizingRef.current = true;
        try {
          const newSize = {
            width: window.innerWidth,
            height: window.innerHeight,
          };
          const sizeChanged =
            Math.abs(newSize.width - lastWindowSize.width) > 200 ||
            Math.abs(newSize.height - lastWindowSize.height) > 200;
          map.resize();
          if (minimap) minimap.resize();
          if (sizeChanged) {
            lastWindowSize = newSize;
            setTimeout(() => {
              if (!isStyleChangingRef.current && !isTransitioningRef.current)
                map.triggerRepaint();
              isResizingRef.current = false;
            }, 400);
          } else {
            setTimeout(() => {
              if (!isStyleChangingRef.current && !isTransitioningRef.current)
                map.triggerRepaint();
              isResizingRef.current = false;
            }, 100);
          }
        } catch {
          isResizingRef.current = false;
        }
      }, 500);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    const mexicoBounds: [LngLatLike, LngLatLike] = [
      [-121, 14],
      [-84, 33.5],
    ];

    const map = new maplibregl.Map({
      container,
      style: getCurrentStyleUrl(),
      center: [-100.22696, 23.45928],
      zoom: 5,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      maxBounds: mexicoBounds,
      maxPitch: 85,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addControl(
        new maplibregl.AttributionControl({
          customAttribution: "Secretaría de Gobernación",
          compact: true,
        }),
        "bottom-right"
      );
      addVectorLayers(map);
      ensureHighlightLayer(map);
      if (map.getLayer(INPI_LAYER_ID)) {
        map.setLayoutProperty(INPI_LAYER_ID, "visibility", "visible");
      }

      setTimeout(() => {
        if (!isStyleChangingRef.current && !isTransitioningRef.current)
          extractLayerData(map);
      }, 1500);
      map.once("idle", () => {
        setTimeout(() => {
          if (
            !extractedDataRef.current &&
            !isStyleChangingRef.current &&
            !isTransitioningRef.current
          )
            extractLayerData(map);
        }, 1000);
      });

      const minimap = new maplibregl.Map({
        container: minimapContainerRef.current as HTMLDivElement,
        style: minimapStyleUrl,
        center: map.getCenter(),
        zoom: map.getZoom() - 3,
        interactive: false,
        attributionControl: false,
      });
      minimapRef.current = minimap;

      minimap.on("load", () => {
        minimap.addSource("viewport-bounds", {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [] },
            properties: {},
          },
        });
        minimap.addLayer({
          id: "viewport-bounds-fill",
          type: "fill",
          source: "viewport-bounds",
          paint: { "fill-color": "#007cbf", "fill-opacity": 0.2 },
        });
        minimap.addLayer({
          id: "viewport-bounds-outline",
          type: "line",
          source: "viewport-bounds",
          paint: { "line-color": "#007cbf", "line-width": 2 },
        });
      });

      const syncMaps = () => {
        if (
          !minimapRef.current ||
          isStyleChangingRef.current ||
          isTransitioningRef.current
        )
          return;
        const mainBounds = map.getBounds();
        const boundsPolygon: Feature<Polygon> = {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                mainBounds.getSouthWest().toArray(),
                mainBounds.getNorthWest().toArray(),
                mainBounds.getNorthEast().toArray(),
                mainBounds.getSouthEast().toArray(),
                mainBounds.getSouthWest().toArray(),
              ],
            ],
          },
          properties: {},
        };
        const source = minimapRef.current.getSource(
          "viewport-bounds"
        ) as GeoJSONSource;
        if (source) source.setData(boundsPolygon);
        const mainZoom = map.getZoom();
        const minimapZoom = Math.max(0, mainZoom - 3);
        minimapRef.current.setCenter(map.getCenter());
        minimapRef.current.setZoom(minimapZoom);
      };

      map.on("move", syncMaps);
      map.on("zoom", syncMaps);
      syncMaps();

      attachAllTooltipEvents(map);
      startCommunityAnimation(map);
      attachNucleosPopupEvents(map);

      if (!compassAnimId.current) {
        compassAnimId.current = requestAnimationFrame(animateCompass);
      }
    });

    return () => {
      if (animationFrameId.current)
        cancelAnimationFrame(animationFrameId.current);
      if (blinkAnimationId.current)
        cancelAnimationFrame(blinkAnimationId.current);
      if (asentamientosAnimationId.current)
        cancelAnimationFrame(asentamientosAnimationId.current);
      if (compassAnimId.current) cancelAnimationFrame(compassAnimId.current);
      compassAnimId.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (minimapRef.current) {
        minimapRef.current.remove();
        minimapRef.current = null;
      }
      maplibregl.removeProtocol("pmtiles");
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || isStyleChangingRef.current || isTransitioningRef.current)
      return;

    // ✅ Usar la versión con contador de reintentos
    if (map.isStyleLoaded()) {
      updateLayerVisibility(map, 0);
    } else {
      // Si el estilo no está cargado, usar el método con idle
      console.log("⏳ Estilo no cargado, usando método idle...");
      updateLayerVisibilityUsingIdle(map);
    }
  }, [layersVisibility, updateLayerVisibility, updateLayerVisibilityUsingIdle]);

  useEffect(() => {
    if (currentPoints.length === 2) addRouteToMap(currentPoints);
  }, [currentPoints, addRouteToMap]);

  useEffect(() => {
    if (currentLinePoints.length === 2) addLineToMap(currentLinePoints);
  }, [currentLinePoints, addLineToMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const addOrUpdateAnimatedPoint = (
      id: "start" | "end",
      lngLat: LngLat,
      isLine: boolean = false
    ) => {
      const prefix = isLine ? "line-" : "";
      const sourceId = `${id}-point-${prefix}current`;
      const pointFeature: Feature<Point> = {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lngLat.lng, lngLat.lat] },
        properties: {},
      };
      const color = isLine ? "#ff6b35" : "#009f81";
      if (map.getSource(sourceId))
        (map.getSource(sourceId) as GeoJSONSource).setData(pointFeature);
      else {
        map.addSource(sourceId, { type: "geojson", data: pointFeature });
        map.addLayer({
          id: `${sourceId}-pulse`,
          type: "circle",
          source: sourceId,
          paint: {
            "circle-radius": 10,
            "circle-color": color,
            "circle-opacity": 0.8,
          },
        });
        map.addLayer({
          id: sourceId,
          type: "circle",
          source: sourceId,
          paint: {
            "circle-radius": 6,
            "circle-color": color,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
      }
    };
    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      if (isMeasuring) {
        if (currentPoints.length >= 2) return;
        const p = e.lngLat;
        addOrUpdateAnimatedPoint(
          currentPoints.length === 0 ? "start" : "end",
          p,
          false
        );
        setCurrentPoints((prev) => [...prev, p]);
      } else if (isMeasuringLine) {
        if (currentLinePoints.length >= 2) return;
        const p = e.lngLat;
        addOrUpdateAnimatedPoint(
          currentLinePoints.length === 0 ? "start" : "end",
          p,
          true
        );
        setCurrentLinePoints((prev) => [...prev, p]);
      }
    };
    if (isMeasuring || isMeasuringLine) {
      map.getCanvas().style.cursor = "crosshair";
      map.on("click", handleMapClick);
    }
    return () => {
      map.getCanvas().style.cursor = "";
      map.off("click", handleMapClick);
    };
  }, [
    isMeasuring,
    isMeasuringLine,
    currentPoints,
    currentLinePoints,
    addRouteToMap,
    addLineToMap,
  ]);

  useEffect(() => {
    highlightedCommunityRef.current = highlightedCommunity ?? null;
    if (!isStyleChangingRef.current && !isTransitioningRef.current) {
      setCommunityHighlight(highlightedCommunity ?? null);
    }
  }, [highlightedCommunity, setCommunityHighlight]);

  useEffect(() => {
    const onFichaClose = () => {
      if (isStyleChangingRef.current || isTransitioningRef.current) {
        setTimeout(() => {
          setCommunityHighlight(null);
          showAsentamientos(null);
        }, 120);
      } else {
        setCommunityHighlight(null);
        showAsentamientos(null);
      }
      try {
        hoverPopupRef.current?.remove();
      } catch {}
      isPinnedRef.current = false;
    };
    window.addEventListener("close-ficha", onFichaClose);
    return () => window.removeEventListener("close-ficha", onFichaClose);
  }, [setCommunityHighlight, showAsentamientos]);

  const controlStackStyle: React.CSSProperties = {
    position: "absolute",
    top: 20,
    left: 20,
    zIndex: 20,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };
  const controlButtonStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: 9999,
    background: isDarkTheme ? "#1f2937" : "#fff",
    border: `1px solid ${isDarkTheme ? "#374151" : "#e5e7eb"}`,
    padding: 6,
    boxShadow: "0 6px 16px rgba(0,0,0,.08)",
    cursor: "pointer",
    color: isDarkTheme ? "#fff" : "#000",
  };
  const buttonIconStyle: React.CSSProperties = {
    width: 24,
    height: 24,
    display: "block",
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          opacity: isLoadingData ? 0 : 1,
          transition: "opacity 0.3s ease-in-out",
        }}
      />

      {isLoadingData && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: isDarkTheme ? "#111827" : "#ffffff",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              border: `4px solid ${isDarkTheme ? "#374151" : "#e5e7eb"}`,
              borderTopColor: "#9b2247",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <p
            style={{
              marginTop: 20,
              color: isDarkTheme ? "#e5e7eb" : "#1f2937",
              fontSize: 16,
              fontWeight: 500,
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            Cargando datos del mapa...
          </p>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 25,
          background: "rgba(255, 255, 255, 0.3)",
          backdropFilter: "blur(8px)",
          borderRadius: 12,
          padding: "2px 2px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          width: 200,
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          src={`${process.env.PUBLIC_URL}/logo_SEGOB.png`}
          alt="SEGOB"
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
      </div>

      <style>{`
        .community-popup { 
          font-family: 'Inter', system-ui, sans-serif; 
          max-width: 300px;
          position: relative;
        }
        .community-popup.dark .title { color: #e5e7eb; }
        .community-popup.light .title{ color: #111827; }
        .maplibregl-popup-close-button {
          position: absolute !important;
          top: 8px !important;
          right: 1px !important;
          width: 24px !important;
          height: 24px !important;
          font-size: 16px !important;
          line-height: 22px !important;
          background: #9b2247 !important;
          color: white !important;
          border-radius: 50% !important;
          border: none !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          z-index: 1000 !important;
          transition: all 0.2s ease !important;
        }
        .maplibregl-popup-close-button:hover { background: #611232 !important; transform: scale(1.1) !important; }
        .community-popup { padding-top: 10px !important; }
        .popup-header { padding-top: 20px !important; }



.nucleos-popup-content {
  font-family: 'Inter', system-ui, sans-serif;
  max-width: 280px;
  position: relative;
  overflow: hidden;
}

.nucleos-popup-content.light {
  background: #ffffff;
  color: #1f2937;
}

.nucleos-popup-header {
  padding: 16px 40px 12px 16px;
  border-bottom: 1px solid #e5e7eb;
  position: relative;
  z-index: 1;
}

.nucleos-popup-content .title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  line-height: 1.4;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.nucleos-popup-body {
  display: flex;
  flex-direction: column;
}

.info-row {
  align-items: left;
  font-size: 13px;
}

.info-row .label {
  font-weight: 700;
  min-width: 75px;
}

.nucleos-popup-content.light .info-row .label {
  color: #6b7280;
}

.info-row .value {
  text-align: left;
  flex: 0;
}

.maplibregl-popup-content .nucleos-popup-content {
  padding: 0 !important;
}

.maplibregl-popup.nucleos-popup .maplibregl-popup-content {
  border-radius: 6px !important;
  padding: 0 !important;
  overflow: hidden !important;
}

.maplibregl-popup.nucleos-popup .maplibregl-popup-close-button {
  position: absolute !important;
  top: 12px !important;
  right: 12px !important;
  width: 24px !important;
  height: 24px !important;
  font-size: 16px !important;
  line-height: 22px !important;
  background: #9b2247 !important;
  color: white !important;
  border-radius: 50% !important;
  border: none !important;
  cursor: pointer !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  z-index: 10000 !important;
  transition: all 0.2s ease !important;
  padding: 0 !important;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
}

.maplibregl-popup.nucleos-popup .maplibregl-popup-close-button:hover {
  background: #7a1a38 !important;
  transform: scale(1.1) !important;
}



      `}</style>

      <div className="custom-popup-container">
        {routesData.map((route) => {
          const position = routePopupPositions[route.id];
          if (!position || !position.visible) return null;
          return (
            <div
              key={route.id}
              style={{
                position: "absolute",
                left: `${position.x}px`,
                top: `${position.y}px`,
                background: "#111827",
                color: "#fff",
                padding: "6px 8px",
                borderRadius: 8,
                transform: "translate(10px, -50%)",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                fontSize: "12px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                zIndex: 15,
              }}
            >
              <strong>Distancia:</strong> {route.distance} km
              <br />
              <strong>Tiempo:</strong> {route.duration}
            </div>
          );
        })}
        {linesData.map((line) => {
          const position = linePopupPositions[line.id];
          if (!position || !position.visible) return null;
          return (
            <div
              key={`line-${line.id}`}
              style={{
                position: "absolute",
                left: `${position.x}px`,
                top: `${position.y}px`,
                background: "#ff6b35",
                color: "#fff",
                padding: "6px 8px",
                borderRadius: 8,
                transform: "translate(10px, -50%)",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                fontSize: "12px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                zIndex: 15,
              }}
            >
              <strong>Distancia:</strong> {line.distance} km
              <br />
              <strong>Tipo:</strong> {line.duration}
            </div>
          );
        })}
      </div>

      <div style={controlStackStyle}>
        <button
          onClick={toggleSatellite}
          title={isSatellite ? "Volver a mapa" : "Vista satélite"}
          aria-label="Cambiar vista"
          style={controlButtonStyle}
        >
          <img
            src={
              isSatellite
                ? `${process.env.PUBLIC_URL}/satelitec.png`
                : `${process.env.PUBLIC_URL}/satelitebw.png`
            }
            alt="Cambiar vista"
            style={buttonIconStyle}
          />
        </button>

        <button
          onClick={toggleMeasurement}
          title={isMeasuring ? "Terminar medición" : "Medir ruta"}
          aria-label="Medir ruta"
          style={controlButtonStyle}
        >
          <img
            src={
              isMeasuring
                ? `${process.env.PUBLIC_URL}/rutac.png`
                : `${process.env.PUBLIC_URL}/rutabw.png`
            }
            alt="Medir ruta"
            style={buttonIconStyle}
          />
        </button>

        <button
          onClick={toggleLineMeasurement}
          title={isMeasuringLine ? "Terminar línea recta" : "Medir línea recta"}
          aria-label="Medir línea recta"
          style={controlButtonStyle}
        >
          <img
            src={getLineIcon(isMeasuringLine)}
            alt="Medir línea"
            style={buttonIconStyle}
          />
        </button>

        <button
          className={`map-control-button ${is3D ? "active" : ""}`}
          onClick={toggle3D}
          title={is3D ? "Desactivar vista 3D" : "Activar vista 3D"}
          aria-label="Vista 3D"
          style={controlButtonStyle}
        >
          <img src={get3DIcon(is3D)} alt="Vista 3D" style={buttonIconStyle} />
        </button>

        <button
          onClick={resetNorth}
          title="Restaurar norte"
          aria-label="Restaurar norte"
          style={{ ...controlButtonStyle, padding: 0 }}
        >
          <svg
            viewBox="0 0 100 100"
            style={{ display: "block", width: "100%", height: "100%" }}
          >
            <circle
              cx="50"
              cy="50"
              r="46"
              fill={isDarkTheme ? "#1f2937" : "#fff"}
              stroke={isDarkTheme ? "#374151" : "#e5e7eb"}
              strokeWidth="4"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill={isDarkTheme ? "#111827" : "#f9fafb"}
              stroke={isDarkTheme ? "#4b5563" : "#d1d5db"}
              strokeWidth="1"
            />
            <text
              x="50"
              y="18"
              textAnchor="middle"
              fontSize="12"
              fontFamily="Inter, system-ui"
              fill={isDarkTheme ? "#9ca3af" : "#6b7280"}
            >
              N
            </text>
            <g
              style={{
                transformOrigin: "50px 50px",
                transform: `rotate(${-displayBearing}deg)`,
              }}
            >
              <polygon points="50,12 44,50 56,50" fill="#ef4444" />
              <polygon points="50,88 44,50 56,50" fill="#374151" />
              <circle cx="50" cy="50" r="4" fill="#111827" />
            </g>
          </svg>
        </button>
      </div>

      <div ref={minimapContainerRef} className="minimap-container" />
    </div>
  );
};

export default Map;
