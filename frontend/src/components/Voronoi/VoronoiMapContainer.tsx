/**
 * VoronoiMapContainer Component
 * 
 * Main container component that integrates all Voronoi visualization
 * components including the map, layers, controls, and statistics panel.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import {
  VoronoiMapContainerProps,
  VoronoiCell,
  CoverageGap,
  VoronoiGenerateParams,
} from '@/types/voronoi.types';
import { defaultMapConfig } from '@/config/mapLayers.config';
import { useVoronoi, useVoronoiSelection, useGapSettings } from '@/hooks/useVoronoi';
import { extractGaps } from '@/utils/voronoiUtils';

import VoronoiLayer from './VoronoiLayer';
import VoronoiControls from './VoronoiControls';
import VoronoiStatisticsPanel from './VoronoiStatisticsPanel';
import VoronoiCellPopup from './VoronoiCellPopup';
import CoverageGapsLayer from './CoverageGapsLayer';

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    position: 'relative' as const,
    width: '100%',
    height: '100%',
    minHeight: '500px',
  },
  mapContainer: {
    width: '100%',
    height: '100%',
  },
  controlsPanel: {
    position: 'absolute' as const,
    top: '10px',
    left: '10px',
    zIndex: 1000,
  },
  statisticsPanel: {
    position: 'absolute' as const,
    top: '10px',
    right: '10px',
    zIndex: 1000,
  },
  popupContainer: {
    position: 'absolute' as const,
    bottom: '30px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
  },
  errorBanner: {
    position: 'absolute' as const,
    top: '10px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1001,
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
  },
  errorText: {
    color: '#991b1b',
    fontSize: '14px',
  },
  errorCloseButton: {
    background: 'none',
    border: 'none',
    color: '#991b1b',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '0',
  },
  loadingOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1002,
  },
  loadingSpinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e5e7eb',
    borderTopColor: '#3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  generateModal: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    width: '400px',
    maxWidth: '90vw',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '600' as const,
    color: '#1f2937',
    marginBottom: '16px',
  },
  formGroup: {
    marginBottom: '16px',
  },
  formLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500' as const,
    color: '#374151',
    marginBottom: '6px',
  },
  formInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
  },
  formSelect: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    backgroundColor: 'white',
  },
  modalButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px',
  },
  modalButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500' as const,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    color: '#374151',
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    border: 'none',
    color: 'white',
  },
};

// ============================================================================
// Component
// ============================================================================

export const VoronoiMapContainer: React.FC<VoronoiMapContainerProps> = ({
  initialDiagramId,
  showControls = true,
  showStatistics = true,
  showGapsLayer = true,
  onCellSelect,
  onGapSelect,
  className,
  style,
}) => {
  // ============================================================================
  // Hooks
  // ============================================================================

  const {
    diagrams,
    currentDiagram,
    voronoiData,
    statistics,
    gaps,
    isLoading,
    isGenerating,
    error,
    selectDiagram,
    generateDiagram,
    clearError,
    filters,
    setFilters,
  } = useVoronoi(initialDiagramId);

  const {
    selectedCellId,
    selectCell,
    clearSelection,
  } = useVoronoiSelection();

  const {
    showGaps,
    minGapArea,
    setShowGaps,
    setMinGapArea,
  } = useGapSettings();

  // ============================================================================
  // Local State
  // ============================================================================

  const [selectedCell, setSelectedCell] = useState<VoronoiCell | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateForm, setGenerateForm] = useState<VoronoiGenerateParams>({
    name: '',
    sourceType: 'churches',
  });
  const [adminFilters, setAdminFilters] = useState({
    level1: null as string | null,
    level2: null as string | null,
    level3: null as string | null,
  });

  // ============================================================================
  // Computed Values
  // ============================================================================

  const filteredGaps = useMemo(() => {
    if (!voronoiData) return [];
    return extractGaps(voronoiData, minGapArea);
  }, [voronoiData, minGapArea]);

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleCellClick = useCallback((cell: VoronoiCell) => {
    setSelectedCell(cell);
    selectCell(cell.properties.cellId);
    onCellSelect?.(cell);
  }, [selectCell, onCellSelect]);

  const handleCellHover = useCallback((cell: VoronoiCell | null) => {
    // Optional: Add hover state handling
  }, []);

  const handleGapClick = useCallback((gap: CoverageGap) => {
    onGapSelect?.(gap);
  }, [onGapSelect]);

  const handleClosePopup = useCallback(() => {
    setSelectedCell(null);
    clearSelection();
    onCellSelect?.(null);
  }, [clearSelection, onCellSelect]);

  const handleDiagramSelect = useCallback((diagramId: string) => {
    selectDiagram(diagramId);
    handleClosePopup();
  }, [selectDiagram, handleClosePopup]);

  const handleAdminFilterChange = useCallback((
    level: 'level1' | 'level2' | 'level3',
    value: string | null
  ) => {
    setAdminFilters((prev) => ({ ...prev, [level]: value }));
    setFilters({
      [`admin${level.charAt(0).toUpperCase() + level.slice(1)}`]: value,
    });
  }, [setFilters]);

  const handleGenerateNew = useCallback(() => {
    setShowGenerateModal(true);
  }, []);

  const handleCloseGenerateModal = useCallback(() => {
    setShowGenerateModal(false);
    setGenerateForm({ name: '', sourceType: 'churches' });
  }, []);

  const handleGenerateSubmit = useCallback(async () => {
    if (!generateForm.name.trim()) return;

    try {
      await generateDiagram(generateForm);
      handleCloseGenerateModal();
    } catch (err) {
      // Error is handled by the hook
    }
  }, [generateForm, generateDiagram, handleCloseGenerateModal]);

  const handleExportStatistics = useCallback((format: 'json' | 'csv') => {
    if (!statistics) return;

    const data = format === 'json'
      ? JSON.stringify(statistics, null, 2)
      : convertStatisticsToCSV(statistics);

    const blob = new Blob([data], {
      type: format === 'json' ? 'application/json' : 'text/csv',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `voronoi-statistics.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [statistics]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div
      style={{ ...styles.container, ...style }}
      className={className}
    >
      {/* Map */}
      <MapContainer
        center={defaultMapConfig.center}
        zoom={defaultMapConfig.zoom}
        minZoom={defaultMapConfig.minZoom}
        maxZoom={defaultMapConfig.maxZoom}
        style={styles.mapContainer}
        zoomControl={false}
      >
        {/* Base Tile Layer */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        {/* Zoom Control */}
        <ZoomControl position="bottomright" />

        {/* Voronoi Layer */}
        <VoronoiLayer
          data={voronoiData}
          visible={true}
          selectedCellId={selectedCellId}
          onCellClick={handleCellClick}
          onCellHover={handleCellHover}
          colorScale="area"
        />

        {/* Coverage Gaps Layer */}
        {showGapsLayer && showGaps && (
          <CoverageGapsLayer
            gaps={filteredGaps}
            visible={showGaps}
            minSeverity="medium"
            showMarkers={true}
            animateCritical={true}
            onGapClick={handleGapClick}
          />
        )}
      </MapContainer>

      {/* Controls Panel */}
      {showControls && (
        <div style={styles.controlsPanel}>
          <VoronoiControls
            diagrams={diagrams}
            selectedDiagramId={currentDiagram?.id || null}
            onDiagramSelect={handleDiagramSelect}
            showGaps={showGaps}
            onShowGapsChange={setShowGaps}
            minGapArea={minGapArea}
            onMinGapAreaChange={setMinGapArea}
            adminFilters={adminFilters}
            onAdminFilterChange={handleAdminFilterChange}
            onGenerateNew={handleGenerateNew}
            isLoading={isLoading}
          />
        </div>
      )}

      {/* Statistics Panel */}
      {showStatistics && (
        <div style={styles.statisticsPanel}>
          <VoronoiStatisticsPanel
            statistics={statistics}
            isLoading={isLoading}
            onExport={handleExportStatistics}
            showCharts={true}
          />
        </div>
      )}

      {/* Cell Popup */}
      {selectedCell && (
        <div style={styles.popupContainer}>
          <VoronoiCellPopup
            cell={selectedCell}
            onClose={handleClosePopup}
            showRecommendation={true}
          />
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div style={styles.errorBanner}>
          <span style={styles.errorText}>{error}</span>
          <button
            style={styles.errorCloseButton}
            onClick={clearError}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
      )}

      {/* Loading Overlay */}
      {(isLoading || isGenerating) && (
        <div style={styles.loadingOverlay}>
          <div style={styles.loadingSpinner} />
        </div>
      )}

      {/* Generate Modal */}
      {showGenerateModal && (
        <div style={styles.generateModal} onClick={handleCloseGenerateModal}>
          <div
            style={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={styles.modalTitle}>Générer un nouveau diagramme</h3>

            <div style={styles.formGroup}>
              <label htmlFor="voronoi-map-container-nom-du-diagramme" style={styles.formLabel}>Nom du diagramme</label>
              <input
                id="voronoi-map-container-nom-du-diagramme"
                type="text"
                style={styles.formInput}
                value={generateForm.name}
                onChange={(e) => setGenerateForm((prev) => ({
                  ...prev,
                  name: e.target.value,
                }))}
                placeholder="Ex: Voronoi Églises 2024"
              />
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="voronoi-map-container-source-des-points" style={styles.formLabel}>Source des points</label>
              <select
                id="voronoi-map-container-source-des-points"
                style={styles.formSelect}
                value={generateForm.sourceType}
                onChange={(e) => setGenerateForm((prev) => ({
                  ...prev,
                  sourceType: e.target.value as 'churches' | 'villages' | 'custom',
                }))}
              >
                <option value="churches">Églises</option>
                <option value="villages">Villages</option>
                <option value="custom">Points personnalisés</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="voronoi-map-container-description-optionnel" style={styles.formLabel}>Description (optionnel)</label>
              <input
                id="voronoi-map-container-description-optionnel"
                type="text"
                style={styles.formInput}
                value={generateForm.description || ''}
                onChange={(e) => setGenerateForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))}
                placeholder="Description du diagramme"
              />
            </div>

            <div style={styles.modalButtons}>
              <button
                style={{ ...styles.modalButton, ...styles.cancelButton }}
                onClick={handleCloseGenerateModal}
              >
                Annuler
              </button>
              <button
                style={{ ...styles.modalButton, ...styles.submitButton }}
                onClick={handleGenerateSubmit}
                disabled={!generateForm.name.trim() || isGenerating}
              >
                {isGenerating ? 'Génération...' : 'Générer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Helper Functions
// ============================================================================

function convertStatisticsToCSV(statistics: any): string {
  const rows = [
    ['Metric', 'Value'],
    ['Total Cells', statistics.totalCells],
    ['Total Area (km²)', statistics.totalArea.toFixed(2)],
    ['Average Area (km²)', statistics.averageArea.toFixed(2)],
    ['Median Area (km²)', statistics.medianArea.toFixed(2)],
    ['Min Area (km²)', statistics.minArea.toFixed(2)],
    ['Max Area (km²)', statistics.maxArea.toFixed(2)],
    ['Standard Deviation', statistics.standardDeviation.toFixed(2)],
    ['Coverage Percentage', statistics.coveragePercentage.toFixed(1)],
    ['Total Gaps', statistics.gapCount.total],
    ['Low Severity Gaps', statistics.gapCount.low],
    ['Medium Severity Gaps', statistics.gapCount.medium],
    ['High Severity Gaps', statistics.gapCount.high],
    ['Critical Severity Gaps', statistics.gapCount.critical],
  ];

  return rows.map((row) => row.join(',')).join('\n');
}

// ============================================================================
// Default Export
// ============================================================================

export default VoronoiMapContainer;
