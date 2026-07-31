export type GoogleLatLngLiteral = {
  lat: number;
  lng: number;
};

export type GoogleLatLngPoint = {
  lat: () => number;
  lng: () => number;
};

export type GoogleMapsEventListener = {
  remove: () => void;
};

export type GoogleMapMouseEvent = {
  latLng?: GoogleLatLngPoint | null;
};

export type GoogleMarkerLabel = {
  text: string;
  color?: string;
  fontWeight?: string;
  fontSize?: string;
};

export type GoogleSymbolIcon = {
  path: number | string;
  scale?: number;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWeight?: number;
};

export type GoogleLatLngBounds = {
  contains: (latLng: GoogleLatLngLiteral) => boolean;
};

export type GoogleMapInstance = {
  addListener: (
    eventName: string,
    handler: (event: GoogleMapMouseEvent) => void,
  ) => GoogleMapsEventListener;
  panTo: (latLng: GoogleLatLngLiteral) => void;
  setCenter: (latLng: GoogleLatLngLiteral) => void;
  getBounds: () => GoogleLatLngBounds | undefined;
  getZoom: () => number | undefined;
};

export type GooglePolylineInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
  setPath: (path: GoogleLatLngLiteral[]) => void;
  setOptions: (options: Record<string, unknown>) => void;
};

export type GoogleMarkerInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
  setPosition: (position: GoogleLatLngLiteral) => void;
  setVisible: (visible: boolean) => void;
  setLabel: (label: GoogleMarkerLabel | null) => void;
  setOptions: (options: Record<string, unknown>) => void;
};

export type GoogleCircleInstance = {
  setCenter: (center: GoogleLatLngLiteral) => void;
  setRadius: (radius: number) => void;
};

export type GoogleMapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  Polyline: new (options: Record<string, unknown>) => GooglePolylineInstance;
  Marker: new (options: {
    position: GoogleLatLngLiteral;
    map?: GoogleMapInstance | null;
    label?: GoogleMarkerLabel;
    icon?: GoogleSymbolIcon;
    zIndex?: number;
    clickable?: boolean;
    visible?: boolean;
    optimized?: boolean;
  }) => GoogleMarkerInstance;
  Circle: new (options: Record<string, unknown>) => GoogleCircleInstance;
  SymbolPath: {
    CIRCLE: number | string;
  };
};

export type GoogleMapsGlobal = {
  maps: GoogleMapsApi;
};

declare global {
  interface Window {
    google?: GoogleMapsGlobal;
    __initGmap?: () => void;
    __gmapReady?: boolean;
    __gmapLoading?: boolean;
  }
}

export function getGoogleMaps(): GoogleMapsApi | null {
  if (typeof window === "undefined") return null;
  return window.google?.maps ?? null;
}