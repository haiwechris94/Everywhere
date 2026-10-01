/**
 * Everywhere API Server
 * Enhanced with Socket.IO for real-time collaboration
 * 
 * Performance Optimizations (v2.1.0):
 * - Gzip compression for responses
 * - Request timeout handling (30s default)
 * - Rate limiting (100 req/min per IP)
 * - Query protection (prevent unbounded queries)
 * - Security headers
 * - Centralized error handling
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');

// Import optimization middleware
const {
  compressionMiddleware,
  timeoutMiddleware,
  rateLimitMiddleware,
  queryProtectionMiddleware,
  errorHandler,
  requestLogger,
  securityHeaders
} = require('./middleware/optimization');

// Import routes
const authRoutes = require('./routes/auth');
const villageRoutes = require('./routes/villages');
const peopleGroupRoutes = require('./routes/peopleGroups');
const organizationRoutes = require('./routes/organizations');
const notificationRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');
const exportRoutes = require('./routes/export');
const searchRoutes = require('./routes/search');
const voronoiRoutes = require('./routes/voronoi');
const boundariesRoutes = require('./routes/boundaries');
const administrativeRoutes = require('./routes/administrative');
const activityRoutes = require('./routes/activities');
const statsRoutes = require('./routes/stats');
const importRoutes = require('./routes/import');
const dashboardRoutes = require('./routes/dashboard');
const peoplesRoutes = require('./routes/peoples');
const churchPopulationRatioRoutes = require('./routes/churchPopulationRatio');
const joshuaProjectRoutes = require('./routes/joshuaProject');
const osmRoutes = require('./routes/osm');
const countriesRoutes = require('./routes/countries');
const qualitativeAnalysisRoutes = require('./routes/qualitativeAnalysis');
const adminPolygonsRoutes = require('./routes/adminPolygons');
const activityFeedRoutes = require('./routes/activityFeed');
const adminRoutes = require('./routes/admin');
const jpSyncApiRoutes = require('./routes/jpSyncApi');
const imbPeopleGroupsRoutes = require('./routes/imbPeopleGroups');
const masterPeopleRoutes = require('./routes/masterPeople');
const finishingTheTaskRoutes = require('./routes/finishingTheTask');
// DMM pillars: persons of peace, discovery groups, DBS sessions, iGROW coaching, reporting
const personsOfPeaceRoutes = require('./routes/personsOfPeace');
const discoveryGroupsRoutes = require('./routes/discoveryGroups');
const dbsSessionsRoutes = require('./routes/dbsSessions');
const coachingSessionsRoutes = require('./routes/coachingSessions');
const reportingRoutes = require('./routes/reporting');
const dmmReviewRoutes = require('./routes/dmmReview');
const projectRoutes = require('./routes/projects');
const initiativesRoutes = require('./routes/initiatives');
const { setupWeeklyCron: setupJPWeeklyCron } = require('./routes/joshuaProjectSync');

// Import database seeding script
const { seedDatabase } = require('./scripts/seedDatabase');

// Import models for Socket.IO events
const User = require('./models/User');
const Notification = require('./models/Notification');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Allowed origins for CORS (frontend can run on different ports)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:8082',
  process.env.FRONTEND_URL
].filter(Boolean);

// Socket.IO setup with CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Make io accessible to routes
app.set('io', io);

// ============================================
// MIDDLEWARE STACK (Order matters!)
// ============================================

// 1. Security headers - Add security-related HTTP headers
app.use(securityHeaders());

// 2. CORS - Allow cross-origin requests from frontend
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// 3. Compression - Gzip responses to reduce bandwidth (60-80% reduction)
// Applied early to compress all responses
app.use(compressionMiddleware({ threshold: 1024, level: 6 }));

// 4. Request timeout - Prevent long-running requests (30 seconds)
app.use(timeoutMiddleware(30000));

// 5. Rate limiting - Protect against abuse (100 requests per minute per IP)
// More lenient for development, stricter in production
app.use(rateLimitMiddleware({
  windowMs: 60000,  // 1 minute window
  max: process.env.NODE_ENV === 'production' ? 100 : 500,  // 100 in prod, 500 in dev
  message: 'Too many requests from this IP, please try again later'
}));

// 6. Body parsing - Parse JSON and URL-encoded bodies with size limits
app.use(bodyParser.json({ limit: '10mb' }));  // 10MB max for JSON (needed for GeoJSON imports)
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// 7. Query protection - Prevent unbounded queries that could return entire database
app.use(queryProtectionMiddleware({
  protectedRoutes: ['/api/people-groups', '/api/villages'],
  maxLimit: 500,  // Maximum records per request
  requireFilter: false  // Set to true to require at least one filter
}));

// 8. Request logging - Log requests in development
if (process.env.NODE_ENV === 'development') {
  app.use(requestLogger({ logBody: false, logQuery: true }));
}

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB connected successfully');
    
    // Auto-seed database with sample data if needed
    try {
      console.log('🌱 Checking if database seeding is needed...');
      const seedResult = await seedDatabase();
      if (seedResult.imported && seedResult.imported.length > 0) {
        console.log(`🌱 Database seeded with ${seedResult.imported.length} sample people groups`);
      }
    } catch (seedError) {
      console.error('⚠️  Database seeding error (non-fatal):', seedError.message);
    }
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ============================================
// Socket.IO Authentication Middleware
// ============================================
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    
    if (!token) {
      // Allow anonymous connections for public map viewing
      socket.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return next(new Error('User not found'));
    }

    socket.user = user;
    next();
  } catch (error) {
    // Allow connection but mark as unauthenticated
    socket.user = null;
    next();
  }
});

// ============================================
// Socket.IO Event Handlers
// ============================================
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id} (User: ${socket.user?.name || 'Anonymous'})`);

  // Join user-specific room for notifications
  if (socket.user) {
    socket.join(`user:${socket.user._id}`);
    
    // Join organization room if user belongs to one
    if (socket.user.organization) {
      socket.join(`org:${socket.user.organization}`);
    }
  }

  // Join map room for real-time updates
  socket.join('map');

  // Handle joining specific region rooms
  socket.on('join-region', (region) => {
    socket.join(`region:${region}`);
    console.log(`📍 Socket ${socket.id} joined region: ${region}`);
  });

  // Handle leaving region rooms
  socket.on('leave-region', (region) => {
    socket.leave(`region:${region}`);
  });

  // Handle location updates for proximity notifications
  socket.on('update-location', async (data) => {
    if (!socket.user) return;

    try {
      const { coordinates } = data;
      
      // Update user's location
      await User.findByIdAndUpdate(socket.user._id, {
        lastKnownLocation: {
          type: 'Point',
          coordinates,
        },
      });

      // Broadcast to nearby users (optional)
      socket.to('map').emit('user-location-updated', {
        userId: socket.user._id,
        coordinates,
      });
    } catch (error) {
      console.error('Error updating location:', error);
    }
  });

  // Handle map viewport changes (for clustering optimization)
  socket.on('viewport-change', (data) => {
    const { bounds, zoom } = data;
    // Could be used for server-side clustering or data optimization
    socket.viewport = { bounds, zoom };
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
  });
});

// ============================================
// Helper function to emit real-time events
// ============================================
const emitMapEvent = (eventType, data, options = {}) => {
  const { room = 'map', excludeSocket = null } = options;
  
  if (excludeSocket) {
    excludeSocket.to(room).emit(eventType, data);
  } else {
    io.to(room).emit(eventType, data);
  }
};

// Make emit function available to routes
app.set('emitMapEvent', emitMapEvent);

// ============================================
// API Routes
// ============================================

// Root route - API info
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Everywhere API',
    version: '2.2.0',
    status: 'running',
    features: [
      'Real-time collaboration via WebSocket',
      'Role-based access control',
      'Photo uploads',
      'GeoJSON/KML/Excel exports',
      'Analytics and heatmaps',
      'Proximity notifications',
      'Voronoi diagrams for village/church influence zones',
      'Coverage gap analysis for church planting',
      'Administrative boundary filtering (Regions, Departments, Subdivisions, Villages)',
    ],
    endpoints: {
      auth: '/api/auth',
      villages: '/api/villages',
      villagesVoronoi: '/api/villages/voronoi',
      peopleGroups: '/api/people-groups',
      organizations: '/api/organizations',
      notifications: '/api/notifications',
      analytics: '/api/analytics',
      export: '/api/export',
      search: '/api/search',
      voronoi: {
        base: '/api/voronoi',
        endpoints: {
          list: 'GET /api/voronoi - List all Voronoi diagrams',
          get: 'GET /api/voronoi/:id - Get specific diagram',
          generate: 'POST /api/voronoi/generate - Generate from custom points',
          statistics: 'GET /api/voronoi/:id/statistics - Coverage statistics',
          gaps: 'GET /api/voronoi/:id/gaps - Identify coverage gaps',
          filter: 'GET /api/voronoi/:id/filter - Filter by admin boundary',
          delete: 'DELETE /api/voronoi/:id - Delete generated diagram',
        }
      },
      boundaries: '/api/boundaries',
      administrative: '/api/administrative',
    },
    websocket: {
      url: `ws://localhost:${PORT}`,
      events: {
        incoming: ['village-added', 'village-updated', 'people-group-added', 'people-group-updated', 'proximity-notification', 'voronoi-generated', 'voronoi-deleted'],
        outgoing: ['join-region', 'leave-region', 'update-location', 'viewport-change'],
      },
    },
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    socketConnections: io.engine.clientsCount,
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/villages', villageRoutes);
app.use('/api/people-groups', peopleGroupRoutes);
app.use('/api/peopleGroups', peopleGroupRoutes); // Legacy route support
app.use('/api/organizations', organizationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/voronoi', voronoiRoutes);
app.use('/api/boundaries', boundariesRoutes);
app.use('/api/administrative', administrativeRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/import', importRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/people-groups', peoplesRoutes);  // renamed from /api/peoples
app.use('/api/peoples', peoplesRoutes);  // keep as alias for backward compatibility
app.use('/api/church-population-ratio', churchPopulationRatioRoutes);
app.use('/api/joshua-project', joshuaProjectRoutes);
app.use('/api/jp', joshuaProjectRoutes); // Short alias for Joshua Project routes
app.use('/api/imb', imbPeopleGroupsRoutes);
app.use('/api/master-people', masterPeopleRoutes);
app.use('/api/ftt', finishingTheTaskRoutes);
app.use('/api/osm', osmRoutes);
app.use('/api/countries', countriesRoutes);
app.use('/api/qualitative-analysis', qualitativeAnalysisRoutes);
app.use('/api/admin-polygons', adminPolygonsRoutes);
app.use('/api/activity-feed', activityFeedRoutes);
app.use('/api/activity', activityFeedRoutes); // alias for frontend compatibility
app.use('/api/admin', adminRoutes);
app.use('/api/jp-sync', jpSyncApiRoutes);
// DMM pillars
app.use('/api/persons-of-peace', personsOfPeaceRoutes);
app.use('/api/discovery-groups', discoveryGroupsRoutes);
app.use('/api/dbs-sessions', dbsSessionsRoutes);
app.use('/api/coaching-sessions', coachingSessionsRoutes);
app.use('/api/reporting', reportingRoutes);
app.use('/api/dmm-review', dmmReviewRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/initiatives', initiativesRoutes);

// Configure le CRON hebdomadaire JP (chaque lundi 3h)
try { setupJPWeeklyCron(); } catch (e) { console.warn('⚠️  JP CRON setup failed:', e.message); }

// ============================================
// Error Handling
// ============================================

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The route ${req.method} ${req.originalUrl} does not exist`,
    availableEndpoints: [
      '/api/auth',
      '/api/villages',
      '/api/people-groups',
      '/api/organizations',
      '/api/notifications',
      '/api/analytics',
      '/api/export',
      '/api/search',
    ],
  });
});

// Global error handler
// Global error handler - Use centralized error handler from optimization middleware
// Handles: ValidationError, CastError, DuplicateKey, JWT errors, SyntaxError, etc.
app.use(errorHandler);

// ============================================
// Start Server
// ============================================
server.listen(PORT, () => {
  console.log('═══════════════════════════════════════════');
  console.log('🚀 Everywhere API Server');
  console.log('═══════════════════════════════════════════');
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 HTTP: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`📁 Uploads: ${path.join(__dirname, 'uploads')}`);
  console.log('═══════════════════════════════════════════');
});

// Export for testing
module.exports = { app, server, io };