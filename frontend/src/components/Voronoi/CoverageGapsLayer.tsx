/**
 * CoverageGapsLayer Component
 * 
 * Highlights large Voronoi cells as coverage gaps with red overlay,
 * pulsing animation for high severity gaps, and gap markers with severity icons.
 */

import React, { useCallback, useMemo } from 'react';
import { GeoJSON, CircleMarker, Popup, useMap, Marker } from 'react-leaflet';
import L from 'leaflet';
import { useLanguage } from '../../i18n';
import {
  CoverageGapsLayerProps,
  CoverageGap,
  GapSeverity,
} from '@/types/voronoi.types';
import {
  getColorBySeverity,
  getSeverityLabel,
  formatArea,
  formatDistance,
} from '@/utils/voronoiUtils';

// ============================================================================
// Styles
// ============================================================================

const styles = {
  popupContainer: {
    padding: '8px',
    minWidth: '180px',
  },
  popupTitle: {
    fontSize: '14px',
    fontWeight: '600' as const,
    color: '#1f2937',
    marginBottom: '8px',
  },
  popupRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    marginBottom: '4px',
  },
  popupLabel: {
    color: '#6b7280',
  },
  popupValue: {
    fontWeight: '500' as const,
    color: '#374151',
  },
  severityBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: '500' as const,
    marginTop: '8px',
  },
};

// ============================================================================
// Severity Configuration
// ============================================================================

const severityConfig: Record<GapSeverity, {
  color: string;
  fillOpacity: number;
  weight: number;
  markerRadius: number;
  animate: boolean;
}> = {
  low: {
    color: '#22c55e',
    fillOpacity: 0.2,
    weight: 1,
    markerRadius: 6,
    animate: false,
  },
  medium: {
    color: '#eab308',
    fillOpacity: 0.3,
    weight: 2,
    markerRadius: 8,
    animate: false,
  },
  high: {
    color: '#f97316',
    fillOpacity: 0.4,
    weight: 2,
    markerRadius: 10,
    animate: true,
  },
  critical: {
    color: '#ef4444',
    fillOpacity: 0.5,
    weight: 3,
    markerRadius: 12,
    animate: true,
  },
};

const severityOrder: GapSeverity[] = ['low', 'medium', 'high', 'critical'];

// ============================================================================
// Component
// ============================================================================

export const CoverageGapsLayer: React.FC<CoverageGapsLayerProps> = ({
  gaps,
  visible = true,
  minSeverity = 'medium',
  showMarkers = true,
  showOverlay = true,
  animateCritical = true,
  onGapClick,
}) => {
  const { isFrench } = useLanguage();
  const map = useMap();

  // ============================================================================
  // Filter Gaps by Severity
  // ============================================================================

  const filteredGaps = useMemo(() => {
    const minIndex = severityOrder.indexOf(minSeverity);
    return gaps.filter((gap) => {
      const gapIndex = severityOrder.indexOf(gap.severity);
      return gapIndex >= minIndex;
    });
  }, [gaps, minSeverity]);

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleGapClick = useCallback((gap: CoverageGap) => {
    onGapClick?.(gap);
  }, [onGapClick]);

  const handleMarkerClick = useCallback((gap: CoverageGap) => {
    // Center map on gap
    map.setView([gap.center[1], gap.center[0]], map.getZoom());
    handleGapClick(gap);
  }, [map, handleGapClick]);

  // ============================================================================
  // Render Popup Content
  // ============================================================================

  const renderPopupContent = useCallback((gap: CoverageGap) => {
    const config = severityConfig[gap.severity];
    
    return (
      <div style={styles.popupContainer}>
        <div style={styles.popupTitle}>{isFrench ? 'Zone de couverture' : 'Coverage area'}</div>
        
        <div style={styles.popupRow}>
          <span style={styles.popupLabel}>{isFrench ? 'Surface :' : 'Area:'}</span>
          <span style={styles.popupValue}>{formatArea(gap.area)}</span>
        </div>
        
        {gap.nearestChurch && (
          <>
            <div style={styles.popupRow}>
              <span style={styles.popupLabel}>{isFrench ? 'Église proche :' : 'Nearby church:'}</span>
              <span style={styles.popupValue}>{gap.nearestChurch.name}</span>
            </div>
            <div style={styles.popupRow}>
              <span style={styles.popupLabel}>{isFrench ? 'Distance :' : 'Distance:'}</span>
              <span style={styles.popupValue}>
                {formatDistance(gap.nearestChurch.distance)}
              </span>
            </div>
          </>
        )}
        
        {gap.adminLocation.level1 && (
          <div style={styles.popupRow}>
            <span style={styles.popupLabel}>{isFrench ? 'Région :' : 'Region:'}</span>
            <span style={styles.popupValue}>{gap.adminLocation.level1}</span>
          </div>
        )}
        
        <div
          style={{
            ...styles.severityBadge,
            backgroundColor: `${config.color}20`,
            color: config.color,
          }}
        >
          {getSeverityLabel(gap.severity)}
        </div>
        
        {gap.recommendation && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280' }}>
            {gap.recommendation}
          </div>
        )}
      </div>
    );
  }, []);

  // ============================================================================
  // Render
  // ============================================================================

  if (!visible || filteredGaps.length === 0) {
    return null;
  }

  return (
    <>
      {/* Gap Markers */}
      {showMarkers && filteredGaps.map((gap) => {
        const config = severityConfig[gap.severity];
        const shouldAnimate = animateCritical && config.animate;
        
        return (
          <CircleMarker
            key={`gap-marker-${gap.cellId}`}
            center={[gap.center[1], gap.center[0]]}
            radius={config.markerRadius}
            pathOptions={{
              color: config.color,
              fillColor: config.color,
              fillOpacity: 0.8,
              weight: 2,
              className: shouldAnimate ? 'gap-marker-pulse' : '',
            }}
            eventHandlers={{
              click: () => handleMarkerClick(gap),
            }}
          >
            <Popup>
              {renderPopupContent(gap)}
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Severity Legend Markers (icons) */}
      {showMarkers && filteredGaps
        .filter((gap) => gap.severity === 'critical' || gap.severity === 'high')
        .map((gap) => {
          const icon = gap.severity === 'critical' ? '⚠️' : '⚡';
          
          return (
            <Marker
              key={`gap-icon-${gap.cellId}`}
              position={[gap.center[1], gap.center[0]]}
              icon={L.divIcon({
                className: 'gap-severity-icon',
                html: `<div style="
                  font-size: 16px;
                  text-align: center;
                  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
                ">${icon}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 24],
              })}
            />
          );
        })}
    </>
  );
};

// ============================================================================
// CSS Styles (to be added to your stylesheet)
// ============================================================================

/*
Add these styles to your CSS file:

.gap-marker-pulse {
  animation: gapPulse 2s ease-in-out infinite;
}

@keyframes gapPulse {
  0%, 100% {
    opacity: 0.8;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(1.2);
  }
}

.gap-severity-icon {
  background: transparent;
  border: none;
}

.gap-overlay-critical {
  animation: overlayPulse 3s ease-in-out infinite;
}

@keyframes overlayPulse {
  0%, 100% {
    fill-opacity: 0.5;
  }
  50% {
    fill-opacity: 0.3;
  }
}
*/

// ============================================================================
// Default Export
// ============================================================================

export default CoverageGapsLayer;
