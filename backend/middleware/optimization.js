/**
 * Express Middleware Optimizations
 * 
 * This module provides performance and security middleware for the API:
 * - Compression (gzip/deflate)
 * - Request timeout handling
 * - Rate limiting
 * - Query protection (prevent unbounded queries)
 * - Centralized error handling
 * 
 * @author Church Planting Map Team
 * @version 1.0.0
 */

/**
 * Compression middleware using Node.js built-in zlib
 * Compresses responses to reduce bandwidth usage
 * 
 * Performance impact:
 * - Reduces response size by 60-80% for JSON/text
 * - Adds ~5-10ms CPU overhead per request
 * - Recommended for responses > 1KB
 * 
 * @param {Object} options - Compression options
 * @param {number} options.threshold - Minimum size to compress (default: 1024 bytes)
 * @param {number} options.level - Compression level 1-9 (default: 6)
 * @returns {Function} Express middleware
 */
function compressionMiddleware(options = {}) {
  const zlib = require('zlib');
  const { threshold = 1024, level = 6 } = options;
  
  return (req, res, next) => {
    // Skip compression for certain conditions
    const acceptEncoding = req.headers['accept-encoding'] || '';
    
    // Check if client accepts gzip
    if (!acceptEncoding.includes('gzip')) {
      return next();
    }
    
    // Store original methods
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    
    let chunks = [];
    let isCompressing = false;
    
    // Override write
    res.write = function(chunk, encoding, callback) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      }
      if (typeof encoding === 'function') {
        callback = encoding;
      }
      if (callback) callback();
      return true;
    };
    
    // Override end
    res.end = function(chunk, encoding, callback) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      }
      
      const body = Buffer.concat(chunks);
      
      // Only compress if above threshold and content-type is compressible
      const contentType = res.getHeader('content-type') || '';
      const isCompressible = /json|text|javascript|xml/.test(contentType);
      
      if (body.length >= threshold && isCompressible && !res.headersSent) {
        zlib.gzip(body, { level }, (err, compressed) => {
          if (err) {
            // Fall back to uncompressed
            originalEnd(body, encoding, callback);
            return;
          }
          
          res.setHeader('Content-Encoding', 'gzip');
          res.setHeader('Content-Length', compressed.length);
          res.removeHeader('Content-Length'); // Let it be calculated
          originalEnd(compressed, callback);
        });
      } else {
        originalEnd(body, encoding, callback);
      }
    };
    
    next();
  };
}

/**
 * Request timeout middleware
 * Prevents long-running requests from blocking the server
 * 
 * @param {number} timeout - Timeout in milliseconds (default: 30000)
 * @returns {Function} Express middleware
 */
function timeoutMiddleware(timeout = 30000) {
  return (req, res, next) => {
    // Set timeout
    req.setTimeout(timeout, () => {
      if (!res.headersSent) {
        res.status(408).json({
          error: 'Request Timeout',
          message: `Request exceeded ${timeout / 1000} second timeout`,
          code: 'REQUEST_TIMEOUT'
        });
      }
    });
    
    // Also set response timeout
    res.setTimeout(timeout);
    
    next();
  };
}

/**
 * Simple in-memory rate limiter
 * Protects API from abuse and DoS attacks
 * 
 * Note: For production with multiple instances, use Redis-based rate limiting
 * 
 * @param {Object} options - Rate limit options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @param {number} options.max - Maximum requests per window (default: 100)
 * @param {string} options.message - Error message when limit exceeded
 * @returns {Function} Express middleware
 */
function rateLimitMiddleware(options = {}) {
  const {
    windowMs = 60000,
    max = 100,
    message = 'Too many requests, please try again later'
  } = options;
  
  // In-memory store for request counts
  const requestCounts = new Map();
  
  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of requestCounts.entries()) {
      if (now - data.startTime > windowMs) {
        requestCounts.delete(key);
      }
    }
  }, windowMs);
  
  return (req, res, next) => {
    // Use IP address as identifier (consider X-Forwarded-For for proxies)
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `${ip}`;
    
    const now = Date.now();
    let data = requestCounts.get(key);
    
    if (!data || now - data.startTime > windowMs) {
      // New window
      data = { count: 1, startTime: now };
      requestCounts.set(key, data);
    } else {
      // Increment count
      data.count++;
    }
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - data.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil((data.startTime + windowMs) / 1000));
    
    if (data.count > max) {
      return res.status(429).json({
        error: 'Rate Limit Exceeded',
        message,
        retryAfter: Math.ceil((data.startTime + windowMs - now) / 1000),
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }
    
    next();
  };
}

/**
 * Query protection middleware
 * Prevents queries without filters that could return entire database
 * 
 * Protects against:
 * - Unbounded queries (no filters)
 * - Excessive limit values
 * - Missing pagination
 * 
 * @param {Object} options - Protection options
 * @param {Array<string>} options.protectedRoutes - Routes to protect (default: common list endpoints)
 * @param {number} options.maxLimit - Maximum allowed limit (default: 500)
 * @param {boolean} options.requireFilter - Require at least one filter (default: false)
 * @returns {Function} Express middleware
 */
function queryProtectionMiddleware(options = {}) {
  const {
    protectedRoutes = ['/api/people-groups', '/api/villages', '/api/churches'],
    maxLimit = 1000,
    requireFilter = false
  } = options;
  
  // Filter parameters that indicate a bounded query
  const filterParams = [
    'status', 'country', 'countryCode', 'region', 'admin2', 'admin3',
    'organization', 'search', 'village', 'bounds', 'source', 'approved'
  ];
  
  return (req, res, next) => {
    // Only check GET requests to protected routes
    if (req.method !== 'GET') {
      return next();
    }
    
    // Check if route is protected
    const isProtected = protectedRoutes.some(route => req.path.startsWith(route));
    if (!isProtected) {
      return next();
    }
    
    // Check limit
    const limit = parseInt(req.query.limit, 10);
    if (limit && limit > maxLimit) {
      return res.status(400).json({
        error: 'Invalid Query',
        message: `Limit cannot exceed ${maxLimit}. Use pagination for large datasets.`,
        code: 'LIMIT_EXCEEDED',
        maxAllowed: maxLimit
      });
    }
    
    // Check for at least one filter (if required)
    if (requireFilter) {
      const hasFilter = filterParams.some(param => {
        const value = req.query[param];
        return value !== undefined && value !== null && value !== '';
      });
      
      if (!hasFilter) {
        return res.status(400).json({
          error: 'Invalid Query',
          message: 'At least one filter parameter is required to prevent unbounded queries',
          code: 'FILTER_REQUIRED',
          availableFilters: filterParams
        });
      }
    }
    
    next();
  };
}

/**
 * Centralized error handler middleware
 * Provides consistent error responses across the API
 * 
 * @param {Error} err - Error object
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Next middleware
 */
function errorHandler(err, req, res, next) {
  // Log error for debugging
  console.error('═'.repeat(60));
  console.error(`❌ Error at ${new Date().toISOString()}`);
  console.error(`   Path: ${req.method} ${req.path}`);
  console.error(`   Error: ${err.message}`);
  if (process.env.NODE_ENV === 'development') {
    console.error(`   Stack: ${err.stack}`);
  }
  console.error('═'.repeat(60));
  
  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }
  
  // Handle specific error types
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: Object.keys(err.errors || {}).map(key => ({
        field: key,
        message: err.errors[key].message
      })),
      code: 'VALIDATION_ERROR'
    });
  }
  
  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid ID',
      message: `Invalid ${err.path}: ${err.value}`,
      code: 'INVALID_ID'
    });
  }
  
  // MongoDB duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      error: 'Duplicate Entry',
      message: `A record with this ${field} already exists`,
      code: 'DUPLICATE_ENTRY'
    });
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid Token',
      message: 'The provided authentication token is invalid',
      code: 'INVALID_TOKEN'
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token Expired',
      message: 'The authentication token has expired',
      code: 'TOKEN_EXPIRED'
    });
  }
  
  // Syntax error (malformed JSON)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Invalid JSON',
      message: 'The request body contains invalid JSON',
      code: 'INVALID_JSON'
    });
  }
  
  // Payload too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Payload Too Large',
      message: 'The request payload exceeds the maximum allowed size',
      code: 'PAYLOAD_TOO_LARGE'
    });
  }
  
  // Default server error
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Server Error' : 'Request Error',
    message: process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * Request logging middleware
 * Logs request details for debugging and monitoring
 * 
 * @param {Object} options - Logging options
 * @param {boolean} options.logBody - Log request body (default: false)
 * @param {boolean} options.logQuery - Log query parameters (default: true)
 * @returns {Function} Express middleware
 */
function requestLogger(options = {}) {
  const { logBody = false, logQuery = true } = options;
  
  return (req, res, next) => {
    const start = Date.now();
    
    // Log request
    console.log(`→ ${req.method} ${req.path}`);
    if (logQuery && Object.keys(req.query).length > 0) {
      console.log(`  Query: ${JSON.stringify(req.query)}`);
    }
    if (logBody && req.body && Object.keys(req.body).length > 0) {
      console.log(`  Body: ${JSON.stringify(req.body).substring(0, 200)}...`);
    }
    
    // Log response on finish
    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const statusIcon = status >= 500 ? '❌' : status >= 400 ? '⚠️' : '✅';
      console.log(`${statusIcon} ${req.method} ${req.path} - ${status} (${duration}ms)`);
    });
    
    next();
  };
}

/**
 * Security headers middleware
 * Adds security-related HTTP headers
 * 
 * @returns {Function} Express middleware
 */
function securityHeaders() {
  return (req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Enable XSS filter
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Remove X-Powered-By header
    res.removeHeader('X-Powered-By');
    
    next();
  };
}

module.exports = {
  compressionMiddleware,
  timeoutMiddleware,
  rateLimitMiddleware,
  queryProtectionMiddleware,
  errorHandler,
  requestLogger,
  securityHeaders
};
