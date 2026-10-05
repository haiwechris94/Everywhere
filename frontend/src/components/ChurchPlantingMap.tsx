/**
 * Exemple de composant Map utilisant les configurations
 * 
 * Ce composant démontre comment utiliser les configurations
 * pour afficher une carte interactive avec toutes les couches.
 */

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Import des configurations
import {
  allLayers,
  defaultMapConfig,
  layerGroups,
  getLayerById,
} from '@/config/mapLayers.config';
import { mapStyles, getDensityColor, getOpacityByZoom } from '@/config/mapStyles.config';
import { GeoJSONFeatureCollection } from '@/types';
import { loadGeoJSON, getBounds, getCenter } from '@/utils/geoJsonUtils';
import { useLanguage } from '../i18n';

/**
 * Composant pour ajuster la vue de la carte
 */
function MapController({ data }: { data: GeoJSONFeatureCollection | null }) {
  const map = useMap();

  useEffect(() => {
    if (data && data.features.length > 0) {
      const bounds = getBounds(data);
      map.fitBounds([
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ]);
    }
  }, [data, map]);

  return null;
}

/**
 * Composant principal de la carte
 */
export function ChurchPlantingMap() {
  const { isFrench } = useLanguage();
  const [layersData, setLayersData] = useState<Record<string, GeoJSONFeatureCollection>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<any>(null);

  // Charger les données au montage du composant
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const dataPromises = allLayers.map(async (layer) => {
          const data = await loadGeoJSON(layer.dataPath);
          return { id: layer.id, data };
        });

        const results = await Promise.all(dataPromises);
        const dataMap: Record<string, GeoJSONFeatureCollection> = {};
        results.forEach(({ id, data }) => {
          dataMap[id] = data;
        });

        setLayersData(dataMap);
        setLoading(false);
      } catch (err) {
        console.error('Erreur lors du chargement des données:', err);
        setError('Impossible de charger les données de la carte');
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Gestionnaire de clic sur une feature
  const onFeatureClick = (feature: any, layer: any) => {
    setSelectedFeature(feature);
    
    // Créer un popup
    const popupContent = createPopupContent(feature);
    layer.bindPopup(popupContent).openPopup();
  };

  // Créer le contenu du popup
  const createPopupContent = (feature: any): string => {
    const props = feature.properties;
    let content = '<div class="custom-popup">';
    
    // Titre
    const name = props.name || props.village_name || props.NAME_1 || props.NAME_2 || props.NAME_3 || 'Sans nom';
    content += `<h3>${name}</h3>`;
    
    // Propriétés importantes
    if (props.osm_id) content += `<p><strong>OSM ID:</strong> ${props.osm_id}</p>`;
    if (props.place) content += `<p><strong>Type:</strong> ${props.place}</p>`;
    if (props.area) content += `<p><strong>Aire:</strong> ${props.area.toFixed(2)} km²</p>`;
    if (props.COUNTRY) content += `<p><strong>Pays:</strong> ${props.COUNTRY}</p>`;
    if (props.TYPE_1) content += `<p><strong>Type:</strong> ${props.TYPE_1}</p>`;
    
    content += '</div>';
    return content;
  };

  // Style pour chaque feature
  const getFeatureStyle = (feature: any, layerId: string) => {
    const layer = getLayerById(layerId);
    if (!layer) return {};

    const baseStyle = layer.style;
    
    // Personnaliser le style en fonction des propriétés
    if (feature.properties.area) {
      const color = getDensityColor(feature.properties.area / 100);
      return {
        ...baseStyle,
        fillColor: color,
      };
    }

    return baseStyle;
  };

  // Gestionnaire pour chaque feature
  const onEachFeature = (feature: any, layer: any, layerId: string) => {
    // Ajouter un événement de clic
    layer.on({
      click: () => onFeatureClick(feature, layer),
      mouseover: (e: any) => {
        const layer = e.target;
        layer.setStyle({
          fillOpacity: 0.7,
          weight: 3,
        });
      },
      mouseout: (e: any) => {
        const layer = e.target;
        const layerConfig = getLayerById(layerId);
        if (layerConfig) {
          layer.setStyle({
            fillOpacity: layerConfig.style.fillOpacity,
            weight: layerConfig.style.strokeWidth,
          });
        }
      },
    });

    // Ajouter un tooltip
    const layerConfig = getLayerById(layerId);
    if (layerConfig) {
      const name = feature.properties[layerConfig.properties.nameField];
      if (name) {
        layer.bindTooltip(name, {
          permanent: false,
          direction: 'top',
          className: 'custom-tooltip',
        });
      }
    }
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <div>Chargement de la carte...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        color: 'red'
      }}>
        <div>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <MapContainer
        center={defaultMapConfig.center}
        zoom={defaultMapConfig.zoom}
        minZoom={defaultMapConfig.minZoom}
        maxZoom={defaultMapConfig.maxZoom}
        style={{ height: '100%', width: '100%' }}
      >
        {/* Fond de carte */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {/* Contrôle des couches */}
        <LayersControl position="topright">
          {layerGroups.map((group) => (
            <React.Fragment key={group.id}>
              {group.layers.map((layer) => {
                const data = layersData[layer.id];
                if (!data) return null;

                return (
                  <LayersControl.Overlay
                    key={layer.id}
                    name={layer.name}
                    checked={layer.visible}
                  >
                    <GeoJSON
                      data={data}
                      style={(feature) => getFeatureStyle(feature, layer.id)}
                      onEachFeature={(feature, leafletLayer) =>
                        onEachFeature(feature, leafletLayer, layer.id)
                      }
                      pointToLayer={(feature, latlng) => {
                        // Personnaliser les marqueurs pour les points - reduced size by 50%
                        return L.circleMarker(latlng, {
                          radius: layer.style.pointRadius || 3,
                          fillColor: layer.style.pointColor || '#ff6b6b',
                          color: layer.style.strokeColor || '#ffffff',
                          weight: layer.style.strokeWidth || 1,
                          opacity: layer.style.strokeOpacity || 1,
                          fillOpacity: 1,
                        });
                      }}
                    />
                  </LayersControl.Overlay>
                );
              })}
            </React.Fragment>
          ))}
        </LayersControl>

        {/* Contrôleur de carte */}
        <MapController data={layersData['admin-boundaries'] || null} />
      </MapContainer>

      {/* Panneau d'information */}
      {selectedFeature && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            background: 'white',
            padding: '15px',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            maxWidth: '300px',
            zIndex: 1000,
          }}
        >
          <h3 style={{ margin: '0 0 10px 0' }}>{isFrench ? 'Informations' : 'Information'}</h3>
          <button
            onClick={() => setSelectedFeature(null)}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
          <pre style={{ fontSize: '12px', overflow: 'auto', maxHeight: '400px' }}>
            {JSON.stringify(selectedFeature.properties, null, 2)}
          </pre>
        </div>
      )}

      {/* Légende */}
      <div
        style={{
          position: 'absolute',
          bottom: '30px',
          right: '10px',
          background: 'white',
          padding: '15px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          zIndex: 1000,
        }}
      >
        <h4 style={{ margin: '0 0 10px 0' }}>{isFrench ? 'Légende' : 'Legend'}</h4>
        {mapStyles.legendConfig.items.map((item, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
            <div
              style={{
                width: '20px',
                height: '20px',
                backgroundColor: item.color,
                marginRight: '10px',
                border: '1px solid #ccc',
                borderRadius: item.type === 'point' ? '50%' : '0',
              }}
            />
            <span style={{ fontSize: '14px' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ChurchPlantingMap;
