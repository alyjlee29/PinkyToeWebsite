import { storage } from "../storage";
import { CacheService } from "./cache-service";
import { PublicationScheduler } from "./publication-scheduler";
import { ImageService } from "./image-service";
import { Article, Team } from "@shared/schema";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Create uploads directory if it doesn't exist
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Track timers for cleanup
let refreshTimers: NodeJS.Timeout[] = [];

/**
 * Publication-aware refresh service
 * Handles background data refresh with business hours awareness and content priority tiers
 */
export class RefreshService {
  // Track when the last refresh was triggered to prevent too many refreshes in a short period
  private static lastRefreshTime: Record<string, number> = {
    articles: 0,
    featuredArticles: 0,
    recentArticles: 0,
    team: 0,
    quotes: 0,
    all: 0
  };

  // Minimum time between refreshes (in milliseconds) to prevent overloading Airtable API
  private static readonly MIN_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes (reduced for better publication responsiveness)
  
  /**
   * Start all refresh schedules with publication-aware timing
   */
  static startRefreshSchedules(): void {
    console.log('Starting publication-aware data refresh schedules...');
    
    // Log current scheduling context
    PublicationScheduler.logSchedulingContext();
    
    // Initial refresh of all data
    this.refreshAll();
    
    // Start dynamic scheduling that adapts to business hours
    this.startDynamicScheduling();
    
    console.log('Publication-aware refresh schedules started successfully');
  }

  /**
   * Start dynamic scheduling that adapts to business hours
   */
  private static startDynamicScheduling(): void {
    // Schedule refreshes based on current business hours status
    this.scheduleNextRefreshCycle();
    
    // Set up a timer to transition between business/off-hours scheduling
    // Check every 15 minutes if we need to adjust intervals
    const scheduleMonitor = setInterval(() => {
      this.checkAndUpdateScheduling();
    }, 15 * 60 * 1000); // 15 minutes
    
    refreshTimers.push(scheduleMonitor);
  }

  /**
   * Schedule the next refresh cycle based on current time
   */
  private static scheduleNextRefreshCycle(): void {
    // Clear existing timers first
    this.clearContentRefreshTimers();
    
    // Get current intervals based on business hours
    const recentArticlesInterval = PublicationScheduler.getRefreshInterval('critical'); // Recent articles are critical
    const featuredArticlesInterval = PublicationScheduler.getRefreshInterval('important'); // Featured articles are important  
    const articlesInterval = PublicationScheduler.getRefreshInterval('important'); // All articles are important
    const teamInterval = PublicationScheduler.getRefreshInterval('stable'); // Team is stable
    const quotesInterval = PublicationScheduler.getRefreshInterval('stable'); // Quotes are stable
    
    console.log(`Scheduling refreshes - Business hours: ${PublicationScheduler.isBusinessHours()}`);
    console.log(`  Recent articles: ${Math.round(recentArticlesInterval / (60 * 1000))} minutes`);
    console.log(`  Featured articles: ${Math.round(featuredArticlesInterval / (60 * 1000))} minutes`);
    console.log(`  Articles: ${Math.round(articlesInterval / (60 * 1000))} minutes`);
    console.log(`  Team: ${Math.round(teamInterval / (60 * 1000))} minutes`);
    console.log(`  Quotes: ${Math.round(quotesInterval / (60 * 1000))} minutes`);
    
    // Schedule periodic refreshes with current intervals
    const recentArticlesTimer = setInterval(() => this.refreshRecentArticles(), recentArticlesInterval);
    const featuredArticlesTimer = setInterval(() => this.refreshFeaturedArticles(), featuredArticlesInterval);
    const articlesTimer = setInterval(() => this.refreshArticles(), articlesInterval);
    const teamTimer = setInterval(() => this.refreshTeam(), teamInterval);
    const quotesTimer = setInterval(() => this.refreshQuotes(), quotesInterval);
    
    // Store timers for cleanup (separate from monitor timer)
    this.contentRefreshTimers = [recentArticlesTimer, featuredArticlesTimer, articlesTimer, teamTimer, quotesTimer];
  }

  /**
   * Clear content refresh timers (but not the monitor timer)
   */
  private static contentRefreshTimers: NodeJS.Timeout[] = [];
  
  private static clearContentRefreshTimers(): void {
    this.contentRefreshTimers.forEach(timer => clearInterval(timer));
    this.contentRefreshTimers = [];
  }

  /**
   * Check if we need to update scheduling (e.g., transition from business to off-hours)
   */
  private static checkAndUpdateScheduling(): void {
    // Always reschedule to ensure we're using current business hours status
    console.log('Checking and updating refresh scheduling...');
    this.scheduleNextRefreshCycle();
  }
  
  /**
   * Trigger refresh on page visit
   * This is called when a user visits the website
   * It's throttled to prevent too many refreshes in a short period
   */
  static triggerRefreshOnVisit(): void {
    const now = Date.now();
    
    // Check if enough time has passed since the last refresh
    if (now - this.lastRefreshTime.all < this.MIN_REFRESH_INTERVAL) {
      // Too soon since last refresh, skip
      return;
    }
    
    // Update refresh timestamp
    this.lastRefreshTime.all = now;
    
    // Trigger refresh in background
    this.refreshOnDemand().catch(error => {
      console.error('Error in background refresh:', error);
    });
  }
  
  /**
   * Refresh data on demand in background
   * This does not block the response
   * Only refreshes the most critical data (recent articles) to minimize API calls
   */
  static async refreshOnDemand(): Promise<void> {
    console.log('Starting on-demand background refresh (limited)...');
    
    // Just refresh recent articles (most important for user experience)
    // Skip other refreshes to reduce API load
    await this.refreshRecentArticles();
    
    console.log('On-demand background refresh completed');
  }
  
  /**
   * Stop all refresh schedules
   */
  static stopRefreshSchedules(): void {
    console.log('Stopping publication-aware refresh schedules...');
    refreshTimers.forEach(timer => clearInterval(timer));
    refreshTimers = [];
    this.clearContentRefreshTimers();
    console.log('Publication-aware refresh schedules stopped');
  }

  /**
   * Emergency refresh for breaking news or urgent updates
   * Immediately refreshes critical content regardless of throttling
   */
  static async emergencyRefresh(): Promise<void> {
    console.log('🚨 EMERGENCY REFRESH TRIGGERED - Bypassing normal throttling');
    
    try {
      // Reset throttling timestamps for critical content
      const now = Date.now();
      this.lastRefreshTime.recentArticles = 0;
      this.lastRefreshTime.featuredArticles = 0;
      
      // Refresh critical content immediately
      await Promise.all([
        this.refreshRecentArticles(),
        this.refreshFeaturedArticles()
      ]);
      
      console.log('🚨 Emergency refresh completed successfully');
    } catch (error) {
      console.error('🚨 Emergency refresh failed:', error);
      throw error;
    }
  }

  /**
   * Warm up all caches on server start
   * Ensures fresh data is available immediately
   */
  static async warmupCache(): Promise<void> {
    console.log('🔥 Cache warmup started...');
    
    try {
      // Refresh all content in priority order
      await this.refreshRecentArticles(); // Critical first
      await this.refreshFeaturedArticles(); // Important second
      await this.refreshArticles(); // Important third
      
      // Stable content can load in background
      Promise.all([
        this.refreshTeam(),
        this.refreshQuotes()
      ]).catch(error => {
        console.error('Background warmup error (non-critical):', error);
      });
      
      console.log('🔥 Cache warmup completed (critical content ready)');
    } catch (error) {
      console.error('🔥 Cache warmup failed:', error);
      // Don't throw - server should still start even if warmup fails
    }
  }
  
  /**
   * Pre-cache an image URL to ensure it's available even if Airtable URL expires
   */
  static async preCacheImage(url: string): Promise<void> {
    if (!url || typeof url !== 'string') return;
    
    // Skip URLs that aren't http/https
    if (!url.startsWith('http')) return;
    
    try {
      // Generate a filename based on URL
      const fileHash = crypto.createHash('md5').update(url).digest('hex');
      
      // Look for cached version first - if it exists, don't re-download
      const cachedFiles = fs.readdirSync(UPLOADS_DIR).filter(f => f.startsWith(fileHash));
      if (cachedFiles.length > 0) {
        // We already have this image cached
        return;
      }
      
      // Fetch the image
      console.log(`Pre-caching image: ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`Failed to fetch image: ${url} (Status: ${response.status})`);
        return;
      }
      
      // Get content type and determine extension
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      
      // Skip if not an image
      if (!contentType.startsWith('image/')) {
        console.error(`URL doesn't point to an image: ${url} (Content-Type: ${contentType})`);
        return;
      }
      
      const ext = contentType.includes('png') ? '.png' : 
                contentType.includes('gif') ? '.gif' : 
                contentType.includes('webp') ? '.webp' : '.jpg';
      
      // Save the image
      const buffer = await response.buffer();
      const filepath = path.join(UPLOADS_DIR, `${fileHash}${ext}`);
      fs.writeFileSync(filepath, buffer);
      
      console.log(`Successfully pre-cached image: ${url}`);
    } catch (error) {
      console.error(`Error pre-caching image ${url}:`, error);
      // Don't throw - we want to continue even if some images fail
    }
  }
  
  /**
   * Pre-cache all image URLs from articles
   * Optimized to minimize Imgur API requests and respect rate limits
   */
  static async preCacheArticleImages(articles: Article[]): Promise<void> {
    if (!articles || !articles.length) return;
    
    const imgurUrls = new Set<string>();
    const otherUrls = new Set<string>();
    
    // First pass: collect all URLs and deduplicate them
    for (const article of articles) {
      // Prioritize the primary imageUrl
      if (article.imageUrl) {
        if (article.imageUrl.includes('imgur.com')) {
          imgurUrls.add(article.imageUrl);
        } else {
          otherUrls.add(article.imageUrl);
        }
      }
      
      // Only use imagePath as fallback if imageUrl doesn't exist
      if (!article.imageUrl && article.imagePath && article.imagePath !== null) {
        if (article.imagePath.includes('imgur.com')) {
          imgurUrls.add(article.imagePath);
        } else {
          otherUrls.add(article.imagePath);
        }
      }
      
      // Skip the Airtable attachment structure since we're now using MainImageLink
    }
    
    console.log(`Found ${imgurUrls.size} unique Imgur URLs and ${otherUrls.size} other image URLs`);
    
    // Process non-Imgur URLs first (typically less rate-limited)
    const otherPromises: Promise<void>[] = [];
    Array.from(otherUrls).forEach(url => {
      otherPromises.push(this.preCacheImage(url));
    });
    
    // Process non-Imgur URLs with higher concurrency
    const otherBatchSize = 5;
    for (let i = 0; i < otherPromises.length; i += otherBatchSize) {
      const batch = otherPromises.slice(i, i + otherBatchSize);
      await Promise.all(batch);
    }
    
    // Process Imgur URLs with much lower concurrency to respect rate limits
    const imgurPromises: Promise<void>[] = [];
    Array.from(imgurUrls).forEach(url => {
      imgurPromises.push(this.preCacheImage(url));
    });
    
    // Very small batch size for Imgur to avoid rate limiting
    const imgurBatchSize = 2;
    for (let i = 0; i < imgurPromises.length; i += imgurBatchSize) {
      const batch = imgurPromises.slice(i, i + imgurBatchSize);
      await Promise.all(batch);
      
      // Add a 3 second delay between batches to avoid overwhelming Imgur
      if (i + imgurBatchSize < imgurPromises.length) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    console.log(`Pre-cached ${otherUrls.size + imgurUrls.size} unique images from articles`);
  }
  
  /**
   * Pre-cache all image URLs from team members
   * Optimized to minimize Imgur API requests and respect rate limits
   */
  static async preCacheTeamImages(teamMembers: Team[]): Promise<void> {
    if (!teamMembers || !teamMembers.length) return;
    
    const imgurUrls = new Set<string>();
    const otherUrls = new Set<string>();
    
    // First pass: collect all URLs and deduplicate them
    for (const member of teamMembers) {
      // Prioritize the primary imageUrl
      if (member.imageUrl) {
        if (member.imageUrl.includes('imgur.com')) {
          imgurUrls.add(member.imageUrl);
        } else {
          otherUrls.add(member.imageUrl);
        }
      }
      
      // Only use imagePath as fallback if imageUrl doesn't exist
      if (!member.imageUrl && member.imagePath && member.imagePath !== null) {
        if (member.imagePath.includes('imgur.com')) {
          imgurUrls.add(member.imagePath);
        } else {
          otherUrls.add(member.imagePath);
        }
      }
      
      // Skip the Airtable attachment structure since we're now using MainImageLink
    }
    
    console.log(`Found ${imgurUrls.size} unique Imgur URLs and ${otherUrls.size} other image URLs for team members`);
    
    // Process non-Imgur URLs first (typically less rate-limited)
    const otherPromises: Promise<void>[] = [];
    Array.from(otherUrls).forEach(url => {
      otherPromises.push(this.preCacheImage(url));
    });
    
    // Process non-Imgur URLs with higher concurrency
    const otherBatchSize = 5;
    for (let i = 0; i < otherPromises.length; i += otherBatchSize) {
      const batch = otherPromises.slice(i, i + otherBatchSize);
      await Promise.all(batch);
    }
    
    // Process Imgur URLs with much lower concurrency to respect rate limits
    const imgurPromises: Promise<void>[] = [];
    Array.from(imgurUrls).forEach(url => {
      imgurPromises.push(this.preCacheImage(url));
    });
    
    // Very small batch size for Imgur to avoid rate limiting
    const imgurBatchSize = 2;
    for (let i = 0; i < imgurPromises.length; i += imgurBatchSize) {
      const batch = imgurPromises.slice(i, i + imgurBatchSize);
      await Promise.all(batch);
      
      // Add a 3 second delay between batches to avoid overwhelming Imgur
      if (i + imgurBatchSize < imgurPromises.length) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    console.log(`Pre-cached ${otherUrls.size + imgurUrls.size} unique images from team members`);
  }

  /**
   * Refresh all data at once
   */
  static async refreshAll(): Promise<void> {
    console.log('Performing full data refresh...');
    
    // Reset all timestamps to ensure refreshes run
    const now = Date.now();
    this.lastRefreshTime = {
      articles: 0,
      featuredArticles: 0,
      recentArticles: 0,
      team: 0,
      quotes: 0,
      all: now
    };
    
    // Use the same approach as on-demand refresh but with forced refresh
    await this.refreshRecentArticles();
    await this.refreshFeaturedArticles();
    await this.refreshArticles();
    await this.refreshTeam();
    await this.refreshQuotes();
    
    console.log('Full data refresh completed');
  }
  
  /**
   * Refresh articles
   */
  static async refreshArticles(): Promise<void> {
    try {
      // Check if it's too soon to refresh again
      const now = Date.now();
      if (now - this.lastRefreshTime.articles < this.MIN_REFRESH_INTERVAL) {
        console.log('Skipping articles refresh (too soon since last refresh)');
        return;
      }
      
      console.log('Refreshing articles data...');
      this.lastRefreshTime.articles = now;
      
      const result = await storage.getArticles(1, 100); // Get a large batch
      CacheService.cacheArticles(result);
      
      // Pre-cache images from articles to handle Airtable's expiring URLs
      await this.preCacheArticleImages(result.articles);
      
      console.log(`Articles refresh completed (${result.articles.length} articles)`);
    } catch (error) {
      console.error('Error refreshing articles:', error);
    }
  }
  
  /**
   * Refresh featured articles
   */
  static async refreshFeaturedArticles(): Promise<void> {
    try {
      // Check if it's too soon to refresh again
      const now = Date.now();
      if (now - this.lastRefreshTime.featuredArticles < this.MIN_REFRESH_INTERVAL) {
        console.log('Skipping featured articles refresh (too soon since last refresh)');
        return;
      }
      
      console.log('Refreshing featured articles data...');
      this.lastRefreshTime.featuredArticles = now;
      
      const articles = await storage.getFeaturedArticles();
      CacheService.cacheFeaturedArticles(articles);
      
      // Pre-cache images from featured articles to handle Airtable's expiring URLs
      await this.preCacheArticleImages(articles);
      
      console.log(`Featured articles refresh completed (${articles.length} articles)`);
    } catch (error) {
      console.error('Error refreshing featured articles:', error);
    }
  }
  
  /**
   * Refresh recent articles
   */
  static async refreshRecentArticles(): Promise<void> {
    try {
      // Check if it's too soon to refresh again
      const now = Date.now();
      if (now - this.lastRefreshTime.recentArticles < this.MIN_REFRESH_INTERVAL) {
        console.log('Skipping recent articles refresh (too soon since last refresh)');
        return;
      }
      
      console.log('Refreshing recent articles data...');
      this.lastRefreshTime.recentArticles = now;
      
      const articles = await storage.getRecentArticles(8); // Get more than default for cache
      CacheService.cacheRecentArticles(articles);
      
      // Pre-cache images from recent articles to handle Airtable's expiring URLs
      await this.preCacheArticleImages(articles);
      
      console.log(`Recent articles refresh completed (${articles.length} articles)`);
    } catch (error) {
      console.error('Error refreshing recent articles:', error);
    }
  }
  
  /**
   * Refresh team members
   */
  static async refreshTeam(): Promise<void> {
    try {
      // Check if it's too soon to refresh again
      const now = Date.now();
      if (now - this.lastRefreshTime.team < this.MIN_REFRESH_INTERVAL) {
        console.log('Skipping team members refresh (too soon since last refresh)');
        return;
      }
      
      console.log('Refreshing team members data...');
      this.lastRefreshTime.team = now;
      
      const team = await storage.getTeamMembers();
      CacheService.cacheTeamMembers(team);
      
      // Pre-cache images from team members to handle Airtable's expiring URLs
      await this.preCacheTeamImages(team);
      
      console.log(`Team members refresh completed (${team.length} members)`);
    } catch (error) {
      console.error('Error refreshing team members:', error);
    }
  }
  
  /**
   * Refresh quotes
   */
  static async refreshQuotes(): Promise<void> {
    try {
      // Check if it's too soon to refresh again
      const now = Date.now();
      if (now - this.lastRefreshTime.quotes < this.MIN_REFRESH_INTERVAL) {
        console.log('Skipping quotes refresh (too soon since last refresh)');
        return;
      }
      
      console.log('Refreshing quotes data...');
      this.lastRefreshTime.quotes = now;
      
      const quotes = await storage.getQuotes();
      CacheService.cacheQuotes(quotes);
      console.log(`Quotes refresh completed (${quotes.length} quotes)`);
    } catch (error) {
      console.error('Error refreshing quotes:', error);
    }
  }
}