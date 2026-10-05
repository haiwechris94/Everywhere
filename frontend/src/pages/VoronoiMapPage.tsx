/**
 * VoronoiMapPage Component
 * 
 * Main page component that integrates the VoronoiMapContainer with
 * administrative layer controls, proper layout, and error handling.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { MapPin, Layers, BarChart3, AlertTriangle, RefreshCw, Download, Settings } from 'lucide-react';
import { useLanguage } from '../i18n';
import { VoronoiMapContainer } from '../components/Voronoi';
import { VoronoiCell, CoverageGap } from '../types/voronoi.types';
import { featureFlags } from '../config/api.config';
import { checkApiHealth } from '../services/voronoiApi';

// =============================================================================
// Types
// =============================================================================

interface ApiHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'checking';
  lastChecked: Date | null;
}

// =============================================================================
// Component
// =============================================================================

const VoronoiMapPage: React.FC = () => {
  const { isFrench } = useLanguage();
  // State
  const [selectedCell, setSelectedCell] = useState<VoronoiCell | null>(null);
  const [selectedGap, setSelectedGap] = useState<CoverageGap | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiHealth, setApiHealth] = useState<ApiHealthStatus>({
    status: 'checking',
    lastChecked: null,
  });

  // Check API health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const health = await checkApiHealth();
        setApiHealth({
          status: health.status,
          lastChecked: new Date(),
        });
      } catch {
        setApiHealth({
          status: 'unhealthy',
          lastChecked: new Date(),
        });
      }
    };

    checkHealth();
    // Check health every 5 minutes
    const interval = setInterval(checkHealth, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Handlers
  const handleCellSelect = useCallback((cell: VoronoiCell | null) => {
    setSelectedCell(cell);
    if (cell) {
      console.log('[VoronoiMapPage] Cell selected:', cell.properties);
    }
  }, []);

  const handleGapSelect = useCallback((gap: CoverageGap) => {
    setSelectedGap(gap);
    console.log('[VoronoiMapPage] Gap selected:', gap);
  }, []);

  const handleRefreshHealth = useCallback(async () => {
    setApiHealth((prev) => ({ ...prev, status: 'checking' }));
    try {
      const health = await checkApiHealth();
      setApiHealth({
        status: health.status,
        lastChecked: new Date(),
      });
    } catch {
      setApiHealth({
        status: 'unhealthy',
        lastChecked: new Date(),
      });
    }
  }, []);

  // Render health status badge
  const renderHealthBadge = () => {
    const statusColors = {
      healthy: 'bg-green-100 text-green-800',
      degraded: 'bg-yellow-100 text-yellow-800',
      unhealthy: 'bg-red-100 text-red-800',
      checking: 'bg-gray-100 text-gray-800',
    };

    const statusLabels = {
      healthy: 'API Connectée',
      degraded: 'API Dégradée',
      unhealthy: 'API Déconnectée',
      checking: 'Vérification...',
    };

    return (
      <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[apiHealth.status]}`}>
        <span className={`w-2 h-2 rounded-full mr-2 ${
          apiHealth.status === 'healthy' ? 'bg-green-500' :
          apiHealth.status === 'degraded' ? 'bg-yellow-500' :
          apiHealth.status === 'unhealthy' ? 'bg-red-500' :
          'bg-gray-500 animate-pulse'
        }`} />
        {statusLabels[apiHealth.status]}
        <button
          onClick={handleRefreshHealth}
          className="ml-2 p-1 hover:bg-white/50 rounded-full transition-colors"
          title={isFrench ? 'Rafraîchir le statut' : 'Refresh status'}
        >
          <RefreshCw className={`w-3 h-3 ${apiHealth.status === 'checking' ? 'animate-spin' : ''}`} />
        </button>
      </div>
    );
  };

  // Check if Voronoi feature is enabled
  if (!featureFlags.voronoi) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center p-8">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Fonctionnalité désactivée
          </h2>
          <p className="text-gray-600">
            La visualisation Voronoi est actuellement désactivée.
            Contactez l'administrateur pour l'activer.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <MapPin className="w-6 h-6 text-primary-600" />
              <h1 className="text-xl font-semibold text-gray-900">
                Carte Voronoi
              </h1>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-500">
              <Layers className="w-4 h-4" />
              <span>{isFrench ? "Zones d'influence des églises" : 'Church influence zones'}</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {renderHealthBadge()}
            
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title={isFrench ? 'Paramètres' : 'Settings'}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Stats Bar */}
        {selectedCell && (
          <div className="mt-4 flex items-center space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              <span className="text-gray-600">
                Cellule: <strong>{(selectedCell.properties as any).name || selectedCell.properties.cellId}</strong>
              </span>
            </div>
            {selectedCell.properties.area && (
              <div className="text-gray-600">
                Surface: <strong>{selectedCell.properties.area.toFixed(2)} km²</strong>
              </div>
            )}
            {selectedCell.properties.population && (
              <div className="text-gray-600">
                Population: <strong>{selectedCell.properties.population.toLocaleString()}</strong>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 relative">
        <VoronoiMapContainer
          showControls={true}
          showStatistics={featureFlags.statistics}
          showGapsLayer={featureFlags.coverageGaps}
          onCellSelect={handleCellSelect}
          onGapSelect={handleGapSelect as (gap: CoverageGap | null) => void}
          className="w-full h-full"
        />

        {/* API Disconnected Warning */}
        {apiHealth.status === 'unhealthy' && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center space-x-3 shadow-lg">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm font-medium text-red-800">
                  Connexion à l'API perdue
                </p>
                <p className="text-xs text-red-600">
                  Les données affichées peuvent être obsolètes
                </p>
              </div>
              <button
                onClick={handleRefreshHealth}
                className="ml-4 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-sm rounded-md transition-colors"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}

        {/* Selected Gap Info */}
        {selectedGap && (
          <div className="absolute bottom-4 left-4 z-50 bg-white rounded-lg shadow-lg p-4 max-w-sm">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium text-gray-900">{isFrench ? 'Zone non couverte' : 'Uncovered area'}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {isFrench ? 'Sévérité :' : 'Severity:'} <span className={`font-medium ${
                    selectedGap.severity === 'critical' ? 'text-red-600' :
                    selectedGap.severity === 'high' ? 'text-orange-600' :
                    selectedGap.severity === 'medium' ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>{selectedGap.severity}</span>
                </p>
                {selectedGap.area && (
                  <p className="text-sm text-gray-500">
                    Surface: {selectedGap.area.toFixed(2)} km²
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedGap(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Settings Panel (Slide-over) */}
      {showSettings && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowSettings(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">{isFrench ? 'Paramètres' : 'Settings'}</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">{isFrench ? 'Couches' : 'Layers'}</h3>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        defaultChecked={featureFlags.voronoi}
                        disabled
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="ml-2 text-sm text-gray-600">{isFrench ? 'Diagramme Voronoi' : 'Voronoi diagram'}</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        defaultChecked={featureFlags.coverageGaps}
                        disabled
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="ml-2 text-sm text-gray-600">{isFrench ? 'Zones non couvertes' : 'Uncovered areas'}</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        defaultChecked={featureFlags.statistics}
                        disabled
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="ml-2 text-sm text-gray-600">{isFrench ? 'Panneau statistiques' : 'Statistics panel'}</span>
                    </label>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">{isFrench ? 'Informations API' : 'API information'}</h3>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm">
                    <p className="text-gray-600">
                      URL: <code className="text-xs bg-gray-200 px-1 rounded">
                        {import.meta.env.VITE_API_URL || 'http://localhost:5000'}
                      </code>
                    </p>
                    <p className="text-gray-600 mt-1">
                      Statut: {apiHealth.status}
                    </p>
                    {apiHealth.lastChecked && (
                      <p className="text-gray-500 text-xs mt-1">
                        Dernière vérification: {apiHealth.lastChecked.toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Export</h3>
                  <button className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
                    <Download className="w-4 h-4" />
                    <span>{isFrench ? 'Exporter les données' : 'Export data'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoronoiMapPage;
