/**
 * MapAttribution Component
 * 
 * Displays legal attribution for data sources used in the map,
 * including Joshua Project attribution as required by their terms of use.
 * 
 * Position: Bottom of map view
 * Style: Small, unobtrusive but visible
 */

import React from 'react';
import PropTypes from 'prop-types';

/**
 * Attribution link component
 */
const AttributionLink = ({ href, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-blue-600 hover:text-blue-800 hover:underline transition-colors dark:text-blue-300"
  >
    {children}
  </a>
);

AttributionLink.propTypes = {
  href: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

/**
 * Main MapAttribution component
 * Displays attribution for all data sources used in the map
 */
const MapAttribution = ({ 
  showJoshuaProject = true,
  showOpenStreetMap = true,
  className = '',
  position = 'bottom-right'
}) => {
  // Position classes
  const positionClasses = {
    'bottom-right': 'bottom-2 right-2',
    'bottom-left': 'bottom-2 left-2',
    'bottom-center': 'bottom-2 left-1/2 transform -translate-x-1/2',
  };

  return (
    <div
      className={`
        absolute ${positionClasses[position] || positionClasses['bottom-right']}
        z-[1000]
        bg-white/90 backdrop-blur-sm
        px-3 py-1.5
        rounded-md
        shadow-sm
        text-xs text-gray-600
        max-w-md
        ${className}
      `}
      style={{ pointerEvents: 'auto' }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* Joshua Project Attribution */}
        {showJoshuaProject && (
          <span className="flex items-center gap-1">
            <span>People Groups Data:</span>
            <AttributionLink href="https://joshuaproject.net">
              Joshua Project
            </AttributionLink>
            <span className="text-gray-500 dark:text-slate-400">|</span>
          </span>
        )}
        
        {/* OpenStreetMap Attribution (required for most tile providers) */}
        {showOpenStreetMap && (
          <span className="flex items-center gap-1">
            <span>Map:</span>
            <AttributionLink href="https://www.openstreetmap.org/copyright">
              © OpenStreetMap
            </AttributionLink>
          </span>
        )}
      </div>
    </div>
  );
};

MapAttribution.propTypes = {
  /** Show Joshua Project attribution */
  showJoshuaProject: PropTypes.bool,
  /** Show OpenStreetMap attribution */
  showOpenStreetMap: PropTypes.bool,
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Position on the map */
  position: PropTypes.oneOf(['bottom-right', 'bottom-left', 'bottom-center']),
};

/**
 * Compact version for smaller screens or minimal UI
 */
export const MapAttributionCompact = ({ className = '' }) => (
  <div
    className={`
      absolute bottom-1 right-1
      z-[1000]
      bg-white/80
      px-2 py-0.5
      rounded
      text-xs text-gray-500
      ${className}
    `}
  >
    <AttributionLink href="https://joshuaproject.net">JP</AttributionLink>
    {' · '}
    <AttributionLink href="https://www.openstreetmap.org/copyright">OSM</AttributionLink>
  </div>
);

MapAttributionCompact.propTypes = {
  className: PropTypes.string,
};

/**
 * Full attribution with detailed information
 * Use this in an about page or detailed view
 */
export const MapAttributionFull = ({ className = '' }) => (
  <div className={`bg-gray-50 rounded-lg p-4 text-sm ${className}`}>
    <h4 className="font-semibold text-gray-800 mb-2 dark:text-slate-100">Data Sources & Attribution</h4>
    
    <div className="space-y-3">
      {/* Joshua Project */}
      <div className="border-l-2 border-blue-500 pl-3">
        <h5 className="font-medium text-gray-700 dark:text-slate-300">People Groups Data</h5>
        <p className="text-gray-600 text-xs mt-1 dark:text-slate-300">
          Unreached people groups data is provided by{' '}
          <AttributionLink href="https://joshuaproject.net">
            Joshua Project
          </AttributionLink>
          , a research initiative seeking to highlight the ethnic people groups 
          of the world with the fewest followers of Christ.
        </p>
        <p className="text-gray-500 text-xs mt-1">
          © Joshua Project. Used with permission.
        </p>
      </div>
      
      {/* OpenStreetMap */}
      <div className="border-l-2 border-green-500 pl-3">
        <h5 className="font-medium text-gray-700 dark:text-slate-300">Map Tiles</h5>
        <p className="text-gray-600 text-xs mt-1 dark:text-slate-300">
          Map data ©{' '}
          <AttributionLink href="https://www.openstreetmap.org/copyright">
            OpenStreetMap
          </AttributionLink>
          {' '}contributors.
        </p>
      </div>
    </div>
  </div>
);

MapAttributionFull.propTypes = {
  className: PropTypes.string,
};

export default MapAttribution;
