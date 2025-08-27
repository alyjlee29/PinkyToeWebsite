// Import config first to ensure environment variables are loaded
import "./config";

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { CachedStorage } from "./storage-cached";
import { RefreshService } from "./services/refresh-service";
import { findAvailablePort } from "./utils/port-manager";

// Create cached storage wrapper around the original storage
export const cachedStorage = new CachedStorage(storage);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add middleware to trigger refresh on page visits
app.use((req, res, next) => {
  // Skip API routes and static assets to avoid unnecessary refreshes
  const path = req.path;
  if (!path.startsWith('/api') && !path.includes('.')) {
    // This is a page visit, trigger a background refresh
    // The refresh is throttled internally to prevent overloading Airtable API
    RefreshService.triggerRefreshOnVisit();
  }
  next();
});

// Logging middleware (avoid logging entire response bodies)
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  // Do not capture or log response bodies to avoid sensitive data leakage

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Get port from environment variable or use default
  const defaultPort = parseInt(process.env.PORT || '5000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    // Find an available port
    const port = await findAvailablePort(defaultPort, 10, host);

    server.listen({
      port,
      host,
    }, () => {
      log(`Server is running on http://${host}:${port}`);

      if (app.get('env') === 'development') {
        log(`Client: http://localhost:${port}`);
        log(`API: http://localhost:${port}/api`);
      }

      // Start background refresh service once server is running
      RefreshService.startRefreshSchedules();

      // Setup graceful shutdown
      const shutdown = () => {
        log('Shutting down refresh service...');
        RefreshService.stopRefreshSchedules();
        server.close(() => {
          log('Server closed');
          process.exit(0);
        });
      };

      // Listen for termination signals
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });

    // Handle server errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        log(`Port ${port} is already in use`);
        process.exit(1);
      } else {
        log(`Server error: ${error.message}`);
        throw error;
      }
    });
  } catch (error) {
    log(`Failed to start server: ${error}`);
    process.exit(1);
  }
})();
