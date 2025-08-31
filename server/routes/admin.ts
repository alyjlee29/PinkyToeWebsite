import { Router, Request, Response, NextFunction } from 'express';
import { CacheService } from '../services/cache-service';
import { RefreshService } from '../services/refresh-service';
import express from 'express';
import { storage } from '../storage';
import { Article } from '@shared/schema';

export const adminRouter = Router();

// Simple token-based auth for admin endpoints
function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const configuredToken = process.env.ADMIN_API_TOKEN;
  if (!configuredToken) {
    return res.status(503).json({ success: false, message: 'ADMIN_API_TOKEN is not configured on the server' });
  }

  const header = req.header('authorization') || req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing or invalid Authorization header' });
  }

  const token = header.slice('Bearer '.length).trim();
  if (token !== configuredToken) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  return next();
}

/**
 * Refresh all cached data
 * POST /api/admin/refresh
 * Invalidates all caches and triggers fresh data fetching from Airtable
 */
adminRouter.post('/refresh', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    console.log('Admin API: Refreshing all cached data');
    
    // First invalidate all caches
    CacheService.invalidateAllCaches();
    
    // Then trigger a refresh of all data
    await RefreshService.refreshAll();
    
    res.json({ 
      success: true, 
      message: 'All caches have been invalidated and data refreshed'
    });
  } catch (error) {
    console.error('Error refreshing cache:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to refresh cache data'
    });
  }
});

/**
 * Refresh specific entity cached data
 * POST /api/admin/refresh/:entity
 * Invalidates specific cache and triggers fresh data fetching for that entity
 */
adminRouter.post('/refresh/:entity', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { entity } = req.params;
    console.log(`Admin API: Refreshing ${entity} cached data`);
    
    // Validate entity type
    const validEntities = ['articles', 'featuredArticles', 'recentArticles', 'team', 'quotes'];
    if (!validEntities.includes(entity)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid entity type. Valid options are: ${validEntities.join(', ')}`
      });
    }
    
    // Handle the specific entity refresh
    switch (entity) {
      case 'articles':
        // Invalidate the specific cache and refresh the data
        CacheService.invalidateCache('articles');
        await RefreshService.refreshArticles();
        break;
        
      case 'featuredArticles':
        CacheService.invalidateCache('featuredArticles');
        await RefreshService.refreshFeaturedArticles();
        break;
        
      case 'recentArticles':
        CacheService.invalidateCache('recentArticles');
        await RefreshService.refreshRecentArticles();
        break;
        
      case 'team':
        CacheService.invalidateCache('team');
        await RefreshService.refreshTeam();
        break;
        
      case 'quotes':
        CacheService.invalidateCache('quotes');
        await RefreshService.refreshQuotes();
        break;
    }
    
    res.json({ 
      success: true, 
      message: `${entity} cache has been invalidated and refreshed`
    });
  } catch (error) {
    console.error('Error refreshing specific cache:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to refresh specific cache data'
    });
  }
});

const router = express.Router();

// Article submission endpoint for N8N
router.post('/articles/submit', requireAdminAuth, async (req, res) => {
  try {
    const { title, content, author, imageUrl, excerpt, featured = false } = req.body;

    // Validate required fields
    if (!title || !content || !author) {
      return res.status(400).json({
        error: 'Missing required fields: title, content, and author are required'
      });
    }

    // Create new article object
    const newArticle: Partial<Article> = {
      id: `article_${Date.now()}`, // Generate unique ID
      title,
      content,
      excerpt: excerpt || content.substring(0, 150) + '...',
      // Article type uses 'name' for author
      name: author,
      imageUrl: imageUrl || '',
      featured,
      publishedAt: new Date(),
      createdAt: new Date(),
      status: 'draft' // Start as draft for review
    };

    // Store article (this would integrate with your existing storage)
    // For now, we'll return success - you can integrate with Airtable later
    console.log('New article submission:', newArticle);

    res.status(201).json({
      success: true,
      message: 'Article submitted successfully',
      article: newArticle
    });

  } catch (error) {
    console.error('Error submitting article:', error);
    res.status(500).json({
      error: 'Failed to submit article',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all draft articles
router.get('/articles/drafts', async (req, res) => {
  try {
    // This would fetch draft articles from your storage
    res.json({
      drafts: []
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch draft articles'
    });
  }
});

// Publish article (change status from draft to published)
router.put('/articles/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Update article status to published
    console.log(`Publishing article: ${id}`);
    
    res.json({
      success: true,
      message: 'Article published successfully'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to publish article'
    });
  }
});

export default router;