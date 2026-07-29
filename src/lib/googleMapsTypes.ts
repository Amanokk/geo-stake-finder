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

export type GoogleMapInstance = {
  addListener: (
    eventName: string,
    handler: (event: GoogleMapMouseEvent) => void,
  ) => GoogleMapsEventListener;
  panTo: (latLng: GoogleLatLngLiteral) => void;
};

export type GooglePolylineInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
};

export type GoogleMarkerInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
  setPosition: (position: GoogleLatLngLiteral) => void;
};

export type GoogleCircleInstance = {
  setCenter: (center: GoogleLatLngLiteral) => void;
  setRadius: (radius: number) => void;
};

export type GoogleMapsApi = {
  Map: new (
    element: HTMLElement,
    options: {
      center: GoogleLatLngLiteral;
      zoom: number;
      mapTypeId: string;
      disableDefaultUI: boolean;
      zoomControl: boolean;
      tilt: number;
    },
  ) => GoogleMapInstance;
  Polyline: new (options: {
    path: GoogleLatLngLiteral[];
    strokeColor: string;
    strokeOpacity: number;
    strokeWeight: number;
    map: GoogleMapInstance;
  }) => GooglePolylineInstance;
  Marker: new (options: {
    position: GoogleLatLngLiteral;
    map: GoogleMapInstance;
    label?: GoogleMarkerLabel;
    icon?: GoogleSymbolIcon;
    zIndex?: number;
    clickable?: boolean;
  }) => GoogleMarkerInstance;
  Circle: new (options: {
    center: GoogleLatLngLiteral;
    radius: number;
    map: GoogleMapInstance;
    fillColor: string;
    fillOpacity: number;
    strokeColor: string;
    strokeOpacity: number;
    strokeWeight: number;
  }) => GoogleCircleInstance;
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