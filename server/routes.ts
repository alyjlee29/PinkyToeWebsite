import type { Express } from "express";
import { createServer, type Server } from "http";
import { cachedStorage } from "./index";
import { imagesRouter } from "./routes/images";
import { adminRouter } from "./routes/admin";
import { RefreshService } from "./services/refresh-service";
import { PublicationScheduler } from "./services/publication-scheduler";

export async function registerRoutes(app: Express): Promise<Server> {
  // Register the routers
  app.use('/api/images', imagesRouter);
  app.use('/api/admin', adminRouter);

  // Publication cache management endpoints
  app.post("/api/cache/emergency-refresh", async (req, res) => {
    try {
      console.log('Emergency refresh requested via API');
      await RefreshService.emergencyRefresh();
      res.json({ 
        message: "Emergency refresh completed successfully",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Emergency refresh failed:", error);
      res.status(500).json({ 
        message: "Emergency refresh failed", 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get("/api/cache/status", async (req, res) => {
    try {
      const isBusinessHours = PublicationScheduler.isBusinessHours();
      const criticalInterval = PublicationScheduler.getRefreshInterval('critical');
      const importantInterval = PublicationScheduler.getRefreshInterval('important');
      const stableInterval = PublicationScheduler.getRefreshInterval('stable');
      
      res.json({
        isBusinessHours,
        refreshIntervals: {
          critical: {
            minutes: Math.round(criticalInterval / (60 * 1000)),
            milliseconds: criticalInterval
          },
          important: {
            minutes: Math.round(importantInterval / (60 * 1000)),
            milliseconds: importantInterval
          },
          stable: {
            minutes: Math.round(stableInterval / (60 * 1000)),
            milliseconds: stableInterval
          }
        },
        cacheExpiry: {
          critical: {
            minutes: Math.round(PublicationScheduler.getCacheExpiry('critical') / (60 * 1000)),
            milliseconds: PublicationScheduler.getCacheExpiry('critical')
          },
          important: {
            minutes: Math.round(PublicationScheduler.getCacheExpiry('important') / (60 * 1000)),
            milliseconds: PublicationScheduler.getCacheExpiry('important')
          },
          stable: {
            minutes: Math.round(PublicationScheduler.getCacheExpiry('stable') / (60 * 1000)),
            milliseconds: PublicationScheduler.getCacheExpiry('stable')
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error getting cache status:", error);
      res.status(500).json({ message: "Failed to get cache status" });
    }
  });
  // API routes for articles
  app.get("/api/articles", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 6;
      const search = req.query.search as string || "";
      
      const result = await cachedStorage.getArticles(page, limit, search);
      res.json(result);
    } catch (error) {
      console.error("Error fetching articles:", error);
      res.status(500).json({ message: "Failed to fetch articles" });
    }
  });

  app.get("/api/articles/featured", async (_req, res) => {
    try {
      const featuredArticles = await cachedStorage.getFeaturedArticles();
      res.json(featuredArticles);
    } catch (error) {
      console.error("Error fetching featured articles:", error);
      res.status(500).json({ message: "Failed to fetch featured articles" });
    }
  });

  app.get("/api/articles/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 4;
      const recentArticles = await cachedStorage.getRecentArticles(limit);
      res.json(recentArticles);
    } catch (error) {
      console.error("Error fetching recent articles:", error);
      res.status(500).json({ message: "Failed to fetch recent articles" });
    }
  });

  app.get("/api/articles/:id", async (req, res) => {
    try {
      const article = await cachedStorage.getArticleById(req.params.id);
      
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      
      res.json(article);
    } catch (error) {
      console.error(`Error fetching article ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to fetch article" });
    }
  });

  // API routes for team members
  app.get("/api/team", async (_req, res) => {
    try {
      const teamMembers = await cachedStorage.getTeamMembers();
      res.json(teamMembers);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.get("/api/team/:id", async (req, res) => {
    try {
      const teamMember = await cachedStorage.getTeamMemberById(req.params.id);
      
      if (!teamMember) {
        return res.status(404).json({ message: "Team member not found" });
      }
      
      res.json(teamMember);
    } catch (error) {
      console.error(`Error fetching team member ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to fetch team member" });
    }
  });

  app.get("/api/team/:id/articles", async (req, res) => {
    try {
      const articles = await cachedStorage.getArticlesByAuthorId(req.params.id);
      res.json(articles);
    } catch (error) {
      console.error(`Error fetching articles for team member ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to fetch team member articles" });
    }
  });

  // API routes for quotes
  app.get("/api/quotes", async (_req, res) => {
    try {
      const quotes = await cachedStorage.getQuotes();
      res.json(quotes);
    } catch (error) {
      console.error("Error fetching quotes:", error);
      res.status(500).json({ message: "Failed to fetch quotes" });
    }
  });

  app.get("/api/quotes/daily", async (_req, res) => {
    try {
      const quoteOfDay = await cachedStorage.getQuoteOfDay();
      res.json(quoteOfDay);
    } catch (error) {
      console.error("Error fetching quote of the day:", error);
      res.status(500).json({ message: "Failed to fetch quote of the day" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
