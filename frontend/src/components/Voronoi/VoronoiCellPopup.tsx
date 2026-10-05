/**
 * VoronoiCellPopup Component
 * 
 * Displays detailed information about a selected Voronoi cell including
 * cell ID, area, center coordinates, administrative location, and
 * nearest church information.
 */

import React, { useCallback } from 'react';
import { useLanguage } from '../../i18n';
import { VoronoiCellPopupProps, GapSeverity } from '@/types/voronoi.types';
import {
  formatArea,
  formatDistance,
  formatCoordinates,
  getSeverityLabel,
} from '@/utils/voronoiUtils';

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    padding: '16px',
    width: '300px',
    maxWidth: '90vw',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '12px',
    paddingBottom: '12px',
    borderBottom: '1px solid #e5e7eb',
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: '16px',
    fontWeight: '600' as const,
    color: '#1f2937',
    margin: 0,
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '12px',
    color: '#6b7280',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '0',
    lineHeight: 1,
    marginLeft: '8px',
  },
  section: {
    marginBottom: '12px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: '500' as const,
    color: '#6b7280',
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: '1px solid #f3f4f6',
  },
  infoLabel: {
    fontSize: '13px',
    color: '#6b7280',
  },
  infoValue: {
    fontSize: '13px',
    fontWeight: '500' as const,
    color: '#1f2937',
    textAlign: 'right' as const,
  },
  severityBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500' as const,
  },
  churchCard: {
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    padding: '12px',
    marginTop: '8px',
  },
  churchName: {
    fontSize: '14px',
    fontWeight: '500' as const,
    color: '#1f2937',
    marginBottom: '4px',
  },
  churchDistance: {
    fontSize: '12px',
    color: '#6b7280',
  },
  navigateButton: {
    marginTop: '8px',
    padding: '6px 12px',
    borderRadius: '4px',
    border: '1px solid #3b82f6',
    backgroundColor: 'transparent',
    color: '#3b82f6',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  recommendationBox: {
    backgroundColor: '#fef3c7',
    border: '1px solid #f59e0b',
    borderRadius: '6px',
    padding: '12px',
    marginTop: '12px',
  },
  recommendationTitle: {
    fontSize: '12px',
    fontWeight: '600' as const,
    color: '#92400e',
    marginBottom: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  recommendationText: {
    fontSize: '12px',
    color: '#78350f',
    lineHeight: 1.4,
    margin: 0,
  },
  adminLocation: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  adminItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: '#374151',
  },
  adminIcon: {
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    fontSize: '10px',
  },
};

// ============================================================================
// Severity Colors
// ============================================================================

const severityStyles: Record<GapSeverity, { bg: string; text: string }> = {
  low: { bg: '#dcfce7', text: '#166534' },
  medium: { bg: '#fef9c3', text: '#854d0e' },
  high: { bg: '#fed7aa', text: '#9a3412' },
  critical: { bg: '#fecaca', text: '#991b1b' },
};

// ============================================================================
// Component
// ============================================================================

export const VoronoiCellPopup: React.FC<VoronoiCellPopupProps> = ({
  cell,
  onClose,
  onNavigateToChurch,
  showRecommendation = true,
}) => {
  const { isFrench } = useLanguage();
  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleNavigateToChurch = useCallback(() => {
    if (cell?.properties.nearestChurchId) {
      onNavigateToChurch?.(cell.properties.nearestChurchId);
    }
  }, [cell, onNavigateToChurch]);

  // ============================================================================
  // Render
  // ============================================================================

  if (!cell) {
    return null;
  }

  const { properties } = cell;
  const severity = properties.gapSeverity;
  const isGap = properties.isGap;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.titleContainer}>
          <h4 style={styles.title}>{properties.pointName || (isFrench ? 'Cellule Voronoi' : 'Voronoi cell')}</h4>
          <p style={styles.subtitle}>ID: {properties.cellId}</p>
        </div>
        {onClose && (
          <button style={styles.closeButton} onClick={onClose} aria-label={isFrench ? 'Fermer' : 'Close'}>
            ×
          </button>
        )}
      </div>

      {/* Cell Information */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>{isFrench ? 'Informations' : 'Information'}</div>
        
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>{isFrench ? 'Surface' : 'Area'}</span>
          <span style={styles.infoValue}>{formatArea(properties.area)}</span>
        </div>
        
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>{isFrench ? 'Centre' : 'Center'}</span>
          <span style={styles.infoValue}>{formatCoordinates(properties.center)}</span>
        </div>

        {properties.perimeter && (
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>{isFrench ? 'Périmètre' : 'Perimeter'}</span>
            <span style={styles.infoValue}>{formatDistance(properties.perimeter)}</span>
          </div>
        )}

        {properties.neighborCount !== undefined && (
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>{isFrench ? 'Voisins' : 'Neighbors'}</span>
            <span style={styles.infoValue}>{properties.neighborCount}</span>
          </div>
        )}

        {/* Severity Badge */}
        {severity && (
          <div style={{ ...styles.infoRow, borderBottom: 'none', paddingTop: '8px' }}>
            <span style={styles.infoLabel}>{isFrench ? 'Statut' : 'Status'}</span>
            <span
              style={{
                ...styles.severityBadge,
                backgroundColor: severityStyles[severity].bg,
                color: severityStyles[severity].text,
              }}
            >
              {getSeverityLabel(severity)}
            </span>
          </div>
        )}
      </div>

      {/* Administrative Location */}
      {(properties.adminLevel1 || properties.adminLevel2 || properties.adminLevel3) && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>{isFrench ? 'Localisation administrative' : 'Administrative location'}</div>
          <div style={styles.adminLocation}>
            {properties.adminLevel1 && (
              <div style={styles.adminItem}>
                <span style={styles.adminIcon}>R</span>
                <span>{properties.adminLevel1}</span>
              </div>
            )}
            {properties.adminLevel2 && (
              <div style={styles.adminItem}>
                <span style={styles.adminIcon}>D</span>
                <span>{properties.adminLevel2}</span>
              </div>
            )}
            {properties.adminLevel3 && (
              <div style={styles.adminItem}>
                <span style={styles.adminIcon}>S</span>
                <span>{properties.adminLevel3}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nearest Church */}
      {properties.nearestChurchId && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>{isFrench ? 'Église la plus proche' : 'Nearest church'}</div>
          <div style={styles.churchCard}>
            <div style={styles.churchName}>
              {properties.nearestChurchName || (isFrench ? 'Église' : 'Church')}
            </div>
            {properties.nearestChurchDistance !== undefined && (
              <div style={styles.churchDistance}>
                Distance: {formatDistance(properties.nearestChurchDistance)}
              </div>
            )}
            {onNavigateToChurch && (
              <button
                style={styles.navigateButton}
                onClick={handleNavigateToChurch}
              >
                {isFrench ? 'Voir sur la carte' : 'View on map'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Population Info */}
      {(properties.population !== undefined || properties.populationDensity !== undefined) && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Population</div>
          {properties.population !== undefined && (
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>{isFrench ? 'Population estimée' : 'Estimated population'}</span>
              <span style={styles.infoValue}>
                {properties.population.toLocaleString()}
              </span>
            </div>
          )}
          {properties.populationDensity !== undefined && (
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>{isFrench ? 'Densité' : 'Density'}</span>
              <span style={styles.infoValue}>
                {properties.populationDensity.toFixed(1)} hab/km²
              </span>
            </div>
          )}
        </div>
      )}

      {/* Recommendation for Gaps */}
      {showRecommendation && isGap && severity && ['high', 'critical'].includes(severity) && (
        <div style={styles.recommendationBox}>
          <div style={styles.recommendationTitle}>
            <span>💡</span>
            {isFrench ? 'Recommandation' : 'Recommendation'}
          </div>
          <p style={styles.recommendationText}>
            {isFrench
              ? <>Cette zone présente une lacune de couverture {getSeverityLabel(severity).toLowerCase()}.</>
              : <>This area has a {getSeverityLabel(severity).toLowerCase()} coverage gap.</>}
            {severity === 'critical' && (
              isFrench
                ? <> Il est fortement recommandé d'envisager l'implantation d'une nouvelle église dans cette région.</>
                : <> It is strongly recommended to consider planting a new church in this region.</>
            )}
            {severity === 'high' && (
              isFrench
                ? <> Une évaluation approfondie de cette zone pourrait révéler des opportunités d'implantation.</>
                : <> A thorough assessment of this area could reveal church planting opportunities.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
};

export default VoronoiCellPopup;
