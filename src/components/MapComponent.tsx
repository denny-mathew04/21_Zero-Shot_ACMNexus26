"use client";

import { useMemo } from 'react';
import ReactMapGL from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import DeckGL from '@deck.gl/react';
import { HexagonLayer } from '@deck.gl/aggregation-layers';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

const INITIAL_VIEW_STATE = {
  longitude: 76.2711,
  latitude: 9.9312,
  zoom: 13,
  pitch: 45,
  bearing: 0
};

// Mock data generation for Kochi
const DATA_URL = Array.from({ length: 600 }).map(() => ({
  COORDINATES: [
    76.2711 + (Math.random() - 0.5) * 0.15,
    9.9312 + (Math.random() - 0.5) * 0.15
  ],
  WEIGHT: Math.random() * 80 + 20 // Simulate AQI values mostly Good to Moderate
}));

export default function MapComponent({ timeOffset = 0 }: { timeOffset?: number }) {
  // Memoize data to simulate subtle changes when timeline moves
  const dynamicData = useMemo(() => {
    return DATA_URL.map(d => ({
      ...d,
      WEIGHT: Math.max(0, d.WEIGHT + timeOffset * 2 * (Math.random() - 0.5))
    }));
  }, [timeOffset]);

  const layers = [
    new HexagonLayer({
      id: 'heatmap',
      colorRange: [
        [16, 185, 129], // Health Green
        [52, 211, 153], 
        [167, 243, 208],
        [253, 224, 71], // Light Yellow
        [245, 158, 11], // Deep Yellow/Orange
        [249, 115, 22]  // Alert Orange
      ],
      coverage: 0.85,
      data: dynamicData,
      elevationRange: [0, 250],
      elevationScale: 4,
      extruded: true,
      getPosition: (d: any) => d.COORDINATES,
      getElevationValue: (points: any) => points.reduce((sum: number, p: any) => sum + p.WEIGHT, 0) / points.length,
      getColorValue: (points: any) => points.reduce((sum: number, p: any) => sum + p.WEIGHT, 0) / points.length,
      radius: 200,
      opacity: 0.8, 
      pickable: true,
      transitions: {
        getElevationValue: 800,
        getColorValue: 800,
      }
    })
  ];

  return (
    <div className="w-full h-full relative bg-off-white">
      <DeckGL
        layers={layers}
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        getTooltip={({ object }: any) => object && `Localized AQI: ${Math.round(object.colorValue)}`}
      >
        <ReactMapGL
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/light-v11"
        />
        {/* Virtual Sensor Marker Mock Overlay could go here, but Mapbox GL manages its own HTML markers best, or DeckGL Scatterplot */}
      </DeckGL>
    </div>
  );
}
