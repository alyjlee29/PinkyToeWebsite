import { Router, Request, Response } from 'express';
import { ImageService } from '../services/image-service';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as net from 'net';
import * as dns from 'dns/promises';

export const imagesRouter = Router();

/**
 * Placeholder image endpoint 
 * Serves a SVG placeholder when no image is available
 */
imagesRouter.get('/placeholder', (req: Request, res: Response) => {
  // Create a nicer SVG placeholder
  const svg = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="300" fill="#fdf2f8" />
    <rect width="400" height="60" y="120" fill="#ec4899" fill-opacity="0.8" />
    <text x="50%" y="155" font-family="Arial" font-size="18" text-anchor="middle" fill="#ffffff">
      Image Not Available
    </text>
    <path d="M200 85 L230 115 L200 145 L170 115 Z" fill="#ec4899" fill-opacity="0.5" />
  </svg>`;
  
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
  res.send(svg);
});

// Create uploads directory if it doesn't exist
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log(`Created uploads directory at ${UPLOADS_DIR}`);
  }
  
  // Check if directory is writable
  fs.accessSync(UPLOADS_DIR, fs.constants.W_OK);
} catch (error: any) {
  console.error(`Error with uploads directory: ${error?.message || 'Unknown error'}`);
  // We'll continue and handle errors in the routes
}

/**
 * Simple image proxy route that uses cache-then-network approach
 * Responds with cached version first, then fetches updated image in background
 */
imagesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const decodedId = decodeURIComponent(id);
    
    // Generate a consistent filename from the ID
    const fileHash = crypto.createHash('md5').update(decodedId).digest('hex');
    
    // Look for cached version first
    const cachedFiles = fs.readdirSync(UPLOADS_DIR).filter(f => f.startsWith(fileHash));
    if (cachedFiles.length > 0) {
      // Use the cached file
      const cachedFile = cachedFiles[0];
      const ext = path.extname(cachedFile);
      const contentType = ext === '.png' ? 'image/png' : 
                          ext === '.gif' ? 'image/gif' : 
                          ext === '.webp' ? 'image/webp' : 'image/jpeg';
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      
      // Stream the file
      const cachedPath = path.join(UPLOADS_DIR, cachedFile);
      fs.createReadStream(cachedPath).pipe(res);
      
      // After sending cached response, fetch fresh version in background if old
      const stats = fs.statSync(cachedPath);
      const fileAge = Date.now() - stats.mtimeMs;
      
      // If file is more than a day old, refresh in background
      if (fileAge > 24 * 60 * 60 * 1000) {
        refreshImageInBackground(decodedId, fileHash);
      }
      
      return;
    }
    
    // Handle Airtable record IDs (starting with 'rec')
    if (decodedId.startsWith('rec')) {
      try {
        // First check if we have this image cached already
        const cachedFiles = fs.readdirSync(UPLOADS_DIR).filter(f => f.startsWith(fileHash));
        if (cachedFiles.length > 0) {
          // Use the cached file
          const cachedFile = cachedFiles[0];
          const ext = path.extname(cachedFile);
          const contentType = ext === '.png' ? 'image/png' : 
                              ext === '.gif' ? 'image/gif' : 
                              ext === '.webp' ? 'image/webp' : 
                              ext === '.svg' ? 'image/svg+xml' : 'image/jpeg';
          
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
          
          // Stream the file
          const cachedPath = path.join(UPLOADS_DIR, cachedFile);
          fs.createReadStream(cachedPath).pipe(res);
          return;
        }

        console.log(`Processing Airtable record ID: ${decodedId}`);
        
        // For Airtable record IDs, we fallback to a placeholder since we don't have direct access
        // to fetch the image from Airtable's API. In production, you would implement this by
        // using the Airtable API to fetch the actual image.
        
        // If this is a MainImage field Airtable record ID
        const svg = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#fdf2f8" />
          <rect width="400" height="60" y="120" fill="#ec4899" fill-opacity="0.8" />
          <text x="50%" y="155" font-family="Arial" font-size="16" text-anchor="middle" fill="#ffffff">
            Image ID: ${decodedId.substring(0, 8)}...
          </text>
          <path d="M200 85 L230 115 L200 145 L170 115 Z" fill="#ec4899" fill-opacity="0.5" />
        </svg>`;
        
        try {
          // Save the SVG as a fallback
          const filepath = path.join(UPLOADS_DIR, `${fileHash}.svg`);
          fs.writeFileSync(filepath, svg);
        } catch (writeError: any) {
          console.error('Failed to save SVG placeholder:', writeError);
          // Continue even if write fails
        }
        
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(svg);
      } catch (svgError: any) {
        console.error('Error handling Airtable record ID:', svgError);
        return res.redirect('/api/images/placeholder');
      }
    }
    
    // Special handling for Imgur URLs
    if (decodedId.includes('imgur.com')) {
      // Check if it's a direct i.imgur.com link or an album link
      if (!decodedId.includes('i.imgur.com') && decodedId.includes('/a/')) {
        console.log('Processing Imgur album link:', decodedId);
        // For album links, redirect to placeholder since we can't grab the image directly
        return res.redirect('/api/images/placeholder');
      }

      // For direct Imgur links, try to use cached version more aggressively due to rate limiting
      console.log('Processing Imgur URL:', decodedId);
    }

    // If it's a URL (http/https)
    if (decodedId.startsWith('http')) {
      return await handleUrlImage(decodedId, fileHash, res);
    } else {
      // For any other type of ID, try to use it as a URL
      // but wrap in try/catch to handle invalid URLs
      try {
        return await handleUrlImage(decodedId, fileHash, res);
      } catch (urlError: any) {
        console.error('Error with URL:', urlError);
        
        // Return placeholder if URL is invalid
        return res.redirect('/api/images/placeholder');
      }
    }
    
  } catch (error: any) {
    console.error('Error serving image:', error);
    return res.redirect('/api/images/placeholder');
  }
});

/**
 * Handle fetching and caching an image from a URL
 */
async function handleUrlImage(url: string, fileHash: string, res: Response) {
  try {
    // Handle invalid URLs
    if (!url || url.startsWith('rec')) {
      console.error(`Invalid URL format: ${url}`);
      return res.redirect('/api/images/placeholder');
    }
    
    // If the URL doesn't start with http/https, add it
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;

    // Basic SSRF protections
    if (isDisallowedTarget(fullUrl)) {
      console.error(`Blocked disallowed image target: ${fullUrl}`);
      return res.redirect('/api/images/placeholder');
    }

    // DNS resolution to block private/localhost resolutions
    try {
      const target = new URL(fullUrl);
      const { address } = await dns.lookup(target.hostname);
      if (isPrivateAddress(address)) {
        console.error(`Blocked private address resolution for ${fullUrl} -> ${address}`);
        return res.redirect('/api/images/placeholder');
      }
    } catch (_dnsErr) {
      // If DNS lookup fails, continue and let fetch handle errors
    }
    
    // First check for rate-limited placeholder
    // This helps us avoid repeatedly hitting rate-limited services (especially Imgur)
    const rateLimitedFiles = fs.readdirSync(UPLOADS_DIR).filter(f => f === `${fileHash}_ratelimited.svg`);
    if (rateLimitedFiles.length > 0) {
      // If we have a rate-limited placeholder, check its age
      const rateLimitedPath = path.join(UPLOADS_DIR, rateLimitedFiles[0]);
      const stats = fs.statSync(rateLimitedPath);
      const fileAge = Date.now() - stats.mtimeMs;
      
      // Use the rate-limited placeholder for 1 hour to avoid overwhelming Imgur
      if (fileAge < 60 * 60 * 1000) { // 1 hour
        console.log(`Using rate-limited placeholder for ${fullUrl} (age: ${Math.round(fileAge/1000)}s)`);
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=1800'); // Cache for 30 minutes
        return fs.createReadStream(rateLimitedPath).pipe(res);
      } else {
        // If the placeholder is old, delete it so we can try fetching again
        try {
          fs.unlinkSync(rateLimitedPath);
          console.log(`Removed stale rate-limited placeholder for ${fullUrl}`);
        } catch (unlinkError) {
          console.error('Error removing stale placeholder:', unlinkError);
        }
      }
    }
    
    try {
      // Special handling for Imgur URLs to respect rate limits
      let shouldThrottle = false;
      if (fullUrl.includes('imgur.com')) {
        // Check if we've hit Imgur in the last 5 seconds
        const imgurLastFetchFile = path.join(UPLOADS_DIR, 'imgur_last_fetch.txt');
        try {
          if (fs.existsSync(imgurLastFetchFile)) {
            const lastFetchTime = parseInt(fs.readFileSync(imgurLastFetchFile, 'utf8'));
            const timeSinceLastFetch = Date.now() - lastFetchTime;
            
            // If we hit Imgur within the last 5 seconds, introduce a delay
            if (timeSinceLastFetch < 5000) {
              shouldThrottle = true;
              const delayMs = 5000 - timeSinceLastFetch;
              console.log(`Throttling Imgur request for ${fullUrl} by ${delayMs}ms`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
          }
          
          // Update last fetch time
          fs.writeFileSync(imgurLastFetchFile, Date.now().toString());
        } catch (throttleError) {
          console.error('Error with Imgur throttling:', throttleError);
          // Continue anyway
        }
      }
      
      // Fetch the image
      console.log(`Fetching image: ${fullUrl}`);
      const response = await fetch(fullUrl);
      
      // Handle rate limiting (429) specially
      if (response.status === 429) {
        console.error(`Rate limited when fetching image: ${fullUrl}`);
        
        // If this is an Imgur URL, create a special placeholder for it
        if (fullUrl.includes('imgur.com')) {
          // Extract the image ID from the URL
          let imgurId = 'unknown';
          if (fullUrl.includes('i.imgur.com/')) {
            imgurId = fullUrl.split('i.imgur.com/')[1].split('.')[0];
          }
          
          const svg = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
            <rect width="400" height="300" fill="#fdf2f8" />
            <rect width="400" height="90" y="105" fill="#ec4899" fill-opacity="0.8" />
            <text x="50%" y="135" font-family="Arial" font-size="16" text-anchor="middle" fill="#ffffff">
              Imgur Image: ${imgurId}
            </text>
            <text x="50%" y="160" font-family="Arial" font-size="14" text-anchor="middle" fill="#ffffff">
              (Rate Limited - Try Again Later)
            </text>
            <text x="50%" y="185" font-family="Arial" font-size="12" text-anchor="middle" fill="#ffffff">
              Imgur limits to 520 requests/hour
            </text>
            <path d="M200 55 L230 85 L200 115 L170 85 Z" fill="#ec4899" fill-opacity="0.5" />
          </svg>`;
          
          // Save this SVG for future requests
          try {
            const filepath = path.join(UPLOADS_DIR, `${fileHash}_ratelimited.svg`);
            fs.writeFileSync(filepath, svg);
          } catch (writeError: any) {
            console.error('Failed to save SVG placeholder:', writeError);
          }
          
          res.setHeader('Content-Type', 'image/svg+xml');
          res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
          return res.send(svg);
        }
        
        // For non-Imgur rate limited requests, redirect to placeholder
        return res.redirect('/api/images/placeholder');
      }
      
      // Handle other failed responses
      if (!response.ok) {
        console.error(`Failed to fetch image: ${fullUrl} (Status: ${response.status})`);
        return res.redirect('/api/images/placeholder');
      }
      
      // Get content type and determine extension
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      
      // Check if it's actually an image
      if (!contentType.startsWith('image/')) {
        console.error(`URL doesn't point to an image: ${fullUrl} (Content-Type: ${contentType})`);
        return res.redirect('/api/images/placeholder');
      }
      
      const ext = contentType.includes('png') ? '.png' : 
                  contentType.includes('gif') ? '.gif' : 
                  contentType.includes('webp') ? '.webp' : '.jpg';
      
      // Save the image
      const buffer = await response.buffer();
      
      try {
        const filepath = path.join(UPLOADS_DIR, `${fileHash}${ext}`);
        fs.writeFileSync(filepath, buffer);
      } catch (writeError: any) {
        console.error('Error writing image to disk:', writeError);
        // Continue anyway to serve the image from memory
      }
      
      // Serve the image
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      res.end(buffer);
    } catch (fetchError: any) {
      console.error(`Error fetching image from URL: ${fullUrl}`, fetchError);
      return res.redirect('/api/images/placeholder');
    }
  } catch (error: any) {
    console.error('Error handling URL image:', error);
    return res.redirect('/api/images/placeholder');
  }
}

function isDisallowedTarget(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    // Only allow http/https
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;

    // Disallow credentials in URL
    if (u.username || u.password) return true;

    const host = u.hostname.toLowerCase();
    // Block localhost and common internal domains
    if (
      host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' ||
      host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')
    ) {
      return true;
    }

    // Block direct IPs in private ranges
    if (net.isIP(host)) {
      return isPrivateAddress(host);
    }

    return false;
  } catch {
    return true;
  }
}

function isPrivateAddress(ip: string): boolean {
  // IPv6 loopback
  if (ip === '::1') return true;

  // IPv4 checks
  if (net.isIP(ip) === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
  }

  // IPv6 ULA fc00::/7 and link-local fe80::/10
  if (net.isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7
    if (lower.startsWith('fe80')) return true; // fe80::/10
  }

  return false;
}

/**
 * Refresh an image in the background without blocking the response
 */
async function refreshImageInBackground(id: string, fileHash: string) {
  // Don't attempt to refresh Airtable record IDs
  if (!id || id.startsWith('rec')) {
    return;
  }
  
  // Check if we've recently had rate limit issues with this image
  const rateLimitedFiles = fs.readdirSync(UPLOADS_DIR).filter(f => f === `${fileHash}_ratelimited.svg`);
  if (rateLimitedFiles.length > 0) {
    // If we have a rate-limited placeholder, check its age
    const rateLimitedPath = path.join(UPLOADS_DIR, rateLimitedFiles[0]);
    const stats = fs.statSync(rateLimitedPath);
    const fileAge = Date.now() - stats.mtimeMs;
    
    // Skip refresh if rate limited recently (within last 30 minutes)
    if (fileAge < 30 * 60 * 1000) {
      console.log(`Skipping refresh for rate-limited image: ${id}`);
      return;
    }
  }
  
  try {
    // If the URL doesn't start with http/https, add it
    const fullUrl = id.startsWith('http') ? id : `https://${id}`;
    
    // For Imgur URLs, apply additional throttling
    if (fullUrl.includes('imgur.com')) {
      // Check if we've hit Imgur in the last 5 seconds
      const imgurLastFetchFile = path.join(UPLOADS_DIR, 'imgur_last_fetch.txt');
      try {
        if (fs.existsSync(imgurLastFetchFile)) {
          const lastFetchTime = parseInt(fs.readFileSync(imgurLastFetchFile, 'utf8'));
          const timeSinceLastFetch = Date.now() - lastFetchTime;
          
          // If we hit Imgur within the last 10 seconds in background mode, skip this refresh
          if (timeSinceLastFetch < 10000) {
            console.log(`Skipping background refresh for Imgur URL to avoid rate limits: ${fullUrl}`);
            return;
          }
        }
        
        // Update last fetch time
        fs.writeFileSync(imgurLastFetchFile, Date.now().toString());
      } catch (throttleError) {
        console.error('Error with Imgur throttling:', throttleError);
        // Continue anyway but with additional delay
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    try {
      console.log(`Background refreshing image: ${fullUrl}`);
      const response = await fetch(fullUrl);
      
      // Handle rate limiting specially
      if (response.status === 429) {
        console.error(`Rate limited when background refreshing image: ${fullUrl}`);
        
        // Create rate limited placeholder if this is an Imgur URL
        if (fullUrl.includes('imgur.com')) {
          let imgurId = 'unknown';
          if (fullUrl.includes('i.imgur.com/')) {
            imgurId = fullUrl.split('i.imgur.com/')[1].split('.')[0];
          }
          
          const svg = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
            <rect width="400" height="300" fill="#fdf2f8" />
            <rect width="400" height="90" y="105" fill="#ec4899" fill-opacity="0.8" />
            <text x="50%" y="135" font-family="Arial" font-size="16" text-anchor="middle" fill="#ffffff">
              Imgur Image: ${imgurId}
            </text>
            <text x="50%" y="160" font-family="Arial" font-size="14" text-anchor="middle" fill="#ffffff">
              (Rate Limited - Try Again Later)
            </text>
            <text x="50%" y="185" font-family="Arial" font-size="12" text-anchor="middle" fill="#ffffff">
              Imgur limits to 520 requests/hour
            </text>
            <path d="M200 55 L230 85 L200 115 L170 85 Z" fill="#ec4899" fill-opacity="0.5" />
          </svg>`;
          
          try {
            const filepath = path.join(UPLOADS_DIR, `${fileHash}_ratelimited.svg`);
            fs.writeFileSync(filepath, svg);
            console.log(`Created rate-limited placeholder for: ${fullUrl}`);
          } catch (writeError: any) {
            console.error('Failed to save SVG placeholder:', writeError);
          }
        }
        
        return;
      }
      
      if (!response.ok) {
        console.error(`Failed to refresh image: ${fullUrl} (Status: ${response.status})`);
        return;
      }
      
      // Get content type and determine extension
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      
      // Skip if not an image
      if (!contentType.startsWith('image/')) {
        console.error(`URL doesn't point to an image: ${fullUrl} (Content-Type: ${contentType})`);
        return;
      }
      
      const ext = contentType.includes('png') ? '.png' : 
                 contentType.includes('gif') ? '.gif' : 
                 contentType.includes('webp') ? '.webp' : '.jpg';
      
      try {
        // Save the image
        const buffer = await response.buffer();
        const filepath = path.join(UPLOADS_DIR, `${fileHash}${ext}`);
        fs.writeFileSync(filepath, buffer);
        console.log(`Successfully refreshed image: ${fullUrl}`);
        
        // If this was previously rate limited, cleanup the rate limited placeholder
        const rateLimitedPath = path.join(UPLOADS_DIR, `${fileHash}_ratelimited.svg`);
        if (fs.existsSync(rateLimitedPath)) {
          fs.unlinkSync(rateLimitedPath);
          console.log(`Removed rate-limited placeholder after successful refresh: ${fullUrl}`);
        }
      } catch (writeError: any) {
        console.error('Error writing refreshed image to disk:', writeError);
      }
    } catch (fetchError: any) {
      console.error(`Error fetching image: ${fullUrl}`, fetchError);
    }
  } catch (error: any) {
    // Just log the error, don't interrupt the request flow
    console.error('Error refreshing image in background:', error);
  }
}