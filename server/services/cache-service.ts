import { Article, Team, CarouselQuote } from "@shared/schema";
import { PublicationScheduler } from "./publication-scheduler";
import fs from 'fs';
import path from 'path';

// Define cache directory paths
const CACHE_DIR = path.join(process.cwd(), 'cache');
const ARTICLES_CACHE_FILE = path.join(CACHE_DIR, 'articles.json');
const FEATURED_ARTICLES_CACHE_FILE = path.join(CACHE_DIR, 'featured-articles.json');
const RECENT_ARTICLES_CACHE_FILE = path.join(CACHE_DIR, 'recent-articles.json'); 
const TEAM_CACHE_FILE = path.join(CACHE_DIR, 'team.json');
const QUOTES_CACHE_FILE = path.join(CACHE_DIR, 'quotes.json');
const LOCK_DIR = path.join(CACHE_DIR, 'locks');

// Create cache directory if it doesn't exist
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`Created cache directory at ${CACHE_DIR}`);
}

// Create locks directory
if (!fs.existsSync(LOCK_DIR)) {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  console.log(`Created lock directory at ${LOCK_DIR}`);
}

/**
 * Get publication-aware cache expiry times
 * Using PublicationScheduler to align with refresh intervals
 */
const getCacheExpiry = (contentType: 'articles' | 'team' | 'quotes') => {
  switch (contentType) {
    case 'articles':
      // Articles are critical/important content 
      return PublicationScheduler.getCacheExpiry('important');
    case 'team':
      // Team is stable content
      return PublicationScheduler.getCacheExpiry('stable');
    case 'quotes':
      // Quotes are stable content  
      return PublicationScheduler.getCacheExpiry('stable');
    default:
      // Default to stable content tier
      return PublicationScheduler.getCacheExpiry('stable');
  }
};

// Lock timeout (in milliseconds)
const LOCK_TIMEOUT = 30 * 1000; // 30 seconds

// Cache metadata type
interface CacheData<T> {
  data: T;
  timestamp: number;
}

export class CacheService {
  /**
   * Get cached articles or return null if cache is invalid
   */
  static getCachedArticles(): { articles: Article[], total: number } | null {
    try {
      if (!fs.existsSync(ARTICLES_CACHE_FILE)) {
        return null;
      }

      const cacheContent = fs.readFileSync(ARTICLES_CACHE_FILE, 'utf-8');
      const cache = JSON.parse(cacheContent) as CacheData<{ articles: Article[], total: number }>;
      
      // Check if cache is expired using publication-aware expiry times
      if (Date.now() - cache.timestamp > getCacheExpiry('articles')) {
        console.log('Articles cache expired, returning null');
        return null;
      }
      
      // Validate cache integrity
      if (!cache.data || !cache.data.articles || !Array.isArray(cache.data.articles)) {
        console.error('Articles cache structure is invalid, returning null');
        return null;
      }
      
      // Check if total makes sense compared to array length
      if (typeof cache.data.total !== 'number' || cache.data.total < cache.data.articles.length) {
        console.error('Articles cache has inconsistent total count, returning null');
        return null;
      }
      
      // Ensure every article has required fields
      const invalidArticles = cache.data.articles.filter(article => 
        !article || !article.id || !article.title
      );
      
      if (invalidArticles.length > 0) {
        console.error(`Found ${invalidArticles.length} invalid articles in cache, returning null`);
        return null;
      }
      
      return cache.data;
    } catch (error) {
      console.error('Error reading articles cache:', error);
      return null;
    }
  }

  /**
   * Get cached featured articles or return null if cache is invalid
   */
  static getCachedFeaturedArticles(): Article[] | null {
    try {
      if (!fs.existsSync(FEATURED_ARTICLES_CACHE_FILE)) {
        return null;
      }

      const cacheContent = fs.readFileSync(FEATURED_ARTICLES_CACHE_FILE, 'utf-8');
      const cache = JSON.parse(cacheContent) as CacheData<Article[]>;
      
      // Check if cache is expired using publication-aware expiry times
      if (Date.now() - cache.timestamp > getCacheExpiry('articles')) {
        console.log('Featured articles cache expired, returning null');
        return null;
      }
      
      // Validate cache integrity
      if (!cache.data || !Array.isArray(cache.data)) {
        console.error('Featured articles cache structure is invalid, returning null');
        return null;
      }
      
      // Ensure every article has required fields
      const invalidArticles = cache.data.filter(article => 
        !article || !article.id || !article.title
      );
      
      if (invalidArticles.length > 0) {
        console.error(`Found ${invalidArticles.length} invalid featured articles in cache, returning null`);
        return null;
      }
      
      return cache.data;
    } catch (error) {
      console.error('Error reading featured articles cache:', error);
      return null;
    }
  }

  /**
   * Get cached recent articles or return null if cache is invalid
   */
  static getCachedRecentArticles(): Article[] | null {
    try {
      if (!fs.existsSync(RECENT_ARTICLES_CACHE_FILE)) {
        return null;
      }

      const cacheContent = fs.readFileSync(RECENT_ARTICLES_CACHE_FILE, 'utf-8');
      const cache = JSON.parse(cacheContent) as CacheData<Article[]>;
      
      // Check if cache is expired using publication-aware expiry times
      if (Date.now() - cache.timestamp > getCacheExpiry('articles')) {
        console.log('Recent articles cache expired, returning null');
        return null;
      }
      
      // Validate cache integrity
      if (!cache.data || !Array.isArray(cache.data)) {
        console.error('Recent articles cache structure is invalid, returning null');
        return null;
      }
      
      // Ensure every article has required fields
      const invalidArticles = cache.data.filter(article => 
        !article || !article.id || !article.title
      );
      
      if (invalidArticles.length > 0) {
        console.error(`Found ${invalidArticles.length} invalid recent articles in cache, returning null`);
        return null;
      }
      
      return cache.data;
    } catch (error) {
      console.error('Error reading recent articles cache:', error);
      return null;
    }
  }

  /**
   * Get cached team members or return null if cache is invalid
   */
  static getCachedTeamMembers(): Team[] | null {
    try {
      if (!fs.existsSync(TEAM_CACHE_FILE)) {
        return null;
      }

      const cacheContent = fs.readFileSync(TEAM_CACHE_FILE, 'utf-8');
      const cache = JSON.parse(cacheContent) as CacheData<Team[]>;
      
      // Check if cache is expired using publication-aware expiry times
      if (Date.now() - cache.timestamp > getCacheExpiry('team')) {
        console.log('Team members cache expired, returning null');
        return null;
      }
      
      // Validate cache integrity
      if (!cache.data || !Array.isArray(cache.data)) {
        console.error('Team members cache structure is invalid, returning null');
        return null;
      }
      
      // Ensure every team member has required fields
      const invalidTeamMembers = cache.data.filter(member => 
        !member || !member.id || !member.name
      );
      
      if (invalidTeamMembers.length > 0) {
        console.error(`Found ${invalidTeamMembers.length} invalid team members in cache, returning null`);
        return null;
      }
      
      return cache.data;
    } catch (error) {
      console.error('Error reading team cache:', error);
      return null;
    }
  }

  /**
   * Get cached quotes or return null if cache is invalid
   */
  static getCachedQuotes(): CarouselQuote[] | null {
    try {
      if (!fs.existsSync(QUOTES_CACHE_FILE)) {
        return null;
      }

      const cacheContent = fs.readFileSync(QUOTES_CACHE_FILE, 'utf-8');
      const cache = JSON.parse(cacheContent) as CacheData<CarouselQuote[]>;
      
      // Check if cache is expired using publication-aware expiry times
      if (Date.now() - cache.timestamp > getCacheExpiry('quotes')) {
        console.log('Quotes cache expired, returning null');
        return null;
      }
      
      // Validate cache integrity
      if (!cache.data || !Array.isArray(cache.data)) {
        console.error('Quotes cache structure is invalid, returning null');
        return null;
      }
      
      // Ensure every quote has required fields
      const invalidQuotes = cache.data.filter(quote => 
        !quote || !quote.id || !quote.quote || !quote.carousel
      );
      
      if (invalidQuotes.length > 0) {
        console.error(`Found ${invalidQuotes.length} invalid quotes in cache, returning null`);
        return null;
      }
      
      return cache.data;
    } catch (error) {
      console.error('Error reading quotes cache:', error);
      return null;
    }
  }

  /**
   * Create a lock file for synchronized access
   * @param cacheType The type of cache to lock
   * @returns True if lock was acquired, false otherwise
   */
  private static acquireLock(cacheType: string): boolean {
    try {
      const lockFile = path.join(LOCK_DIR, `${cacheType}.lock`);
      
      // Check if lock exists and is not stale
      if (fs.existsSync(lockFile)) {
        const lockStats = fs.statSync(lockFile);
        const lockAge = Date.now() - lockStats.mtimeMs;
        
        if (lockAge < LOCK_TIMEOUT) {
          // Lock is still valid, cannot acquire
          console.log(`Lock for ${cacheType} is held by another process (${Math.round(lockAge / 1000)}s old)`);
          return false;
        } else {
          // Lock is stale, we can break it
          console.log(`Breaking stale lock for ${cacheType} (${Math.round(lockAge / 1000)}s old)`);
        }
      }
      
      // Create lock file
      fs.writeFileSync(lockFile, Date.now().toString());
      return true;
    } catch (error) {
      console.error(`Error acquiring lock for ${cacheType}:`, error);
      return false;
    }
  }
  
  /**
   * Release a previously acquired lock
   * @param cacheType The type of cache to unlock
   */
  private static releaseLock(cacheType: string): void {
    try {
      const lockFile = path.join(LOCK_DIR, `${cacheType}.lock`);
      
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
        console.log(`Released lock for ${cacheType}`);
      }
    } catch (error) {
      console.error(`Error releasing lock for ${cacheType}:`, error);
    }
  }

  /**
   * Cache articles data with locking mechanism to prevent concurrent writes
   */
  static cacheArticles(data: { articles: Article[], total: number }): void {
    const cacheType = 'articles';
    
    // Try to acquire lock
    if (!this.acquireLock(cacheType)) {
      console.warn(`Cannot cache articles: lock acquisition failed`);
      return;
    }
    
    try {
      // Validate data first
      if (!data || !data.articles || !Array.isArray(data.articles) || typeof data.total !== 'number') {
        console.error('Invalid articles data structure, not caching');
        return;
      }
      
      const cacheData: CacheData<{ articles: Article[], total: number }> = {
        data,
        timestamp: Date.now()
      };
      
      // Use a temporary file first to avoid corruption during write
      const tempFile = `${ARTICLES_CACHE_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(cacheData, null, 2));
      
      // Then rename to actual cache file (atomic operation)
      fs.renameSync(tempFile, ARTICLES_CACHE_FILE);
      
      console.log('Articles cached successfully');
    } catch (error) {
      console.error('Error caching articles:', error);
    } finally {
      // Always release lock
      this.releaseLock(cacheType);
    }
  }

  /**
   * Cache featured articles data with locking mechanism
   */
  static cacheFeaturedArticles(data: Article[]): void {
    const cacheType = 'featuredArticles';
    
    // Try to acquire lock
    if (!this.acquireLock(cacheType)) {
      console.warn(`Cannot cache featured articles: lock acquisition failed`);
      return;
    }
    
    try {
      // Validate data first
      if (!data || !Array.isArray(data)) {
        console.error('Invalid featured articles data structure, not caching');
        return;
      }
      
      const cacheData: CacheData<Article[]> = {
        data,
        timestamp: Date.now()
      };
      
      // Use a temporary file first
      const tempFile = `${FEATURED_ARTICLES_CACHE_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(cacheData, null, 2));
      
      // Rename to actual cache file (atomic operation)
      fs.renameSync(tempFile, FEATURED_ARTICLES_CACHE_FILE);
      
      console.log('Featured articles cached successfully');
    } catch (error) {
      console.error('Error caching featured articles:', error);
    } finally {
      // Always release lock
      this.releaseLock(cacheType);
    }
  }

  /**
   * Cache recent articles data with locking mechanism
   */
  static cacheRecentArticles(data: Article[]): void {
    const cacheType = 'recentArticles';
    
    // Try to acquire lock
    if (!this.acquireLock(cacheType)) {
      console.warn(`Cannot cache recent articles: lock acquisition failed`);
      return;
    }
    
    try {
      // Validate data first
      if (!data || !Array.isArray(data)) {
        console.error('Invalid recent articles data structure, not caching');
        return;
      }
      
      const cacheData: CacheData<Article[]> = {
        data,
        timestamp: Date.now()
      };
      
      // Use a temporary file first
      const tempFile = `${RECENT_ARTICLES_CACHE_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(cacheData, null, 2));
      
      // Rename to actual cache file (atomic operation)
      fs.renameSync(tempFile, RECENT_ARTICLES_CACHE_FILE);
      
      console.log('Recent articles cached successfully');
    } catch (error) {
      console.error('Error caching recent articles:', error);
    } finally {
      // Always release lock
      this.releaseLock(cacheType);
    }
  }

  /**
   * Cache team members data with locking mechanism
   */
  static cacheTeamMembers(data: Team[]): void {
    const cacheType = 'team';
    
    // Try to acquire lock
    if (!this.acquireLock(cacheType)) {
      console.warn(`Cannot cache team members: lock acquisition failed`);
      return;
    }
    
    try {
      // Validate data first
      if (!data || !Array.isArray(data)) {
        console.error('Invalid team members data structure, not caching');
        return;
      }
      
      const cacheData: CacheData<Team[]> = {
        data,
        timestamp: Date.now()
      };
      
      // Use a temporary file first
      const tempFile = `${TEAM_CACHE_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(cacheData, null, 2));
      
      // Rename to actual cache file (atomic operation)
      fs.renameSync(tempFile, TEAM_CACHE_FILE);
      
      console.log('Team members cached successfully');
    } catch (error) {
      console.error('Error caching team members:', error);
    } finally {
      // Always release lock
      this.releaseLock(cacheType);
    }
  }

  /**
   * Cache quotes data with locking mechanism
   */
  static cacheQuotes(data: CarouselQuote[]): void {
    const cacheType = 'quotes';
    
    // Try to acquire lock
    if (!this.acquireLock(cacheType)) {
      console.warn(`Cannot cache quotes: lock acquisition failed`);
      return;
    }
    
    try {
      // Validate data first
      if (!data || !Array.isArray(data)) {
        console.error('Invalid quotes data structure, not caching');
        return;
      }
      
      const cacheData: CacheData<CarouselQuote[]> = {
        data,
        timestamp: Date.now()
      };
      
      // Use a temporary file first
      const tempFile = `${QUOTES_CACHE_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(cacheData, null, 2));
      
      // Rename to actual cache file (atomic operation)
      fs.renameSync(tempFile, QUOTES_CACHE_FILE);
      
      console.log('Quotes cached successfully');
    } catch (error) {
      console.error('Error caching quotes:', error);
    } finally {
      // Always release lock
      this.releaseLock(cacheType);
    }
  }

  /**
   * Invalidate a specific cache with locking
   * @param cacheType The type of cache to invalidate ('articles', 'featuredArticles', 'recentArticles', 'team', 'quotes')
   */
  static invalidateCache(cacheType: string): void {
    // Try to acquire lock
    if (!this.acquireLock(cacheType)) {
      console.warn(`Cannot invalidate ${cacheType} cache: lock acquisition failed`);
      return;
    }
    
    try {
      let cacheFile: string | null = null;
      
      switch (cacheType) {
        case 'articles':
          cacheFile = ARTICLES_CACHE_FILE;
          break;
        case 'featuredArticles':
          cacheFile = FEATURED_ARTICLES_CACHE_FILE;
          break;
        case 'recentArticles':
          cacheFile = RECENT_ARTICLES_CACHE_FILE;
          break;
        case 'team':
          cacheFile = TEAM_CACHE_FILE;
          break;
        case 'quotes':
          cacheFile = QUOTES_CACHE_FILE;
          break;
        default:
          console.warn(`Unknown cache type: ${cacheType}`);
          return;
      }
      
      if (cacheFile && fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
        console.log(`Cache invalidated: ${cacheType}`);
      } else {
        console.log(`Cache file not found for: ${cacheType}`);
      }
      
      // Also clean up any temp files that might have been left behind
      const tempFile = `${cacheFile}.tmp`;
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
        console.log(`Cleaned up temporary cache file: ${tempFile}`);
      }
    } catch (error) {
      console.error(`Error invalidating cache for ${cacheType}:`, error);
    } finally {
      // Always release lock
      this.releaseLock(cacheType);
    }
  }
  
  /**
   * Invalidate all caches, with proper error handling for each cache type
   */
  static invalidateAllCaches(): void {
    const cacheTypes = ['articles', 'featuredArticles', 'recentArticles', 'team', 'quotes'];
    
    // Invalidate each cache type individually
    for (const cacheType of cacheTypes) {
      try {
        // Acquire lock for this specific cache type
        if (this.acquireLock(cacheType)) {
          try {
            // Get the correct cache file path
            let cacheFile: string | null = null;
            switch (cacheType) {
              case 'articles': cacheFile = ARTICLES_CACHE_FILE; break;
              case 'featuredArticles': cacheFile = FEATURED_ARTICLES_CACHE_FILE; break;
              case 'recentArticles': cacheFile = RECENT_ARTICLES_CACHE_FILE; break;
              case 'team': cacheFile = TEAM_CACHE_FILE; break;
              case 'quotes': cacheFile = QUOTES_CACHE_FILE; break;
            }
            
            // Delete the cache file if it exists
            if (cacheFile && fs.existsSync(cacheFile)) {
              fs.unlinkSync(cacheFile);
              console.log(`Cache invalidated: ${cacheType}`);
            }
            
            // Clean up temp files too
            const tempFile = `${cacheFile}.tmp`;
            if (tempFile && fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile);
              console.log(`Cleaned up temporary cache file: ${tempFile}`);
            }
          } catch (error) {
            console.error(`Error invalidating ${cacheType} cache:`, error);
          } finally {
            // Always release the lock
            this.releaseLock(cacheType);
          }
        } else {
          console.warn(`Could not acquire lock for ${cacheType}, skipping invalidation`);
        }
      } catch (error) {
        console.error(`Error in invalidation process for ${cacheType}:`, error);
      }
    }
    
    console.log('All caches invalidation process completed');
  }
}