# Publication-Aware Caching System

This document describes the enhanced caching system designed specifically for publication workflows.

## Overview

The caching system has been upgraded to be **publication-aware**, meaning it adapts its refresh patterns based on:

- **Business hours** (9 AM - 5 PM EST, Monday-Friday by default)
- **Content priority tiers** (Critical, Important, Stable)
- **Publication workflow needs**

## Content Priority Tiers

### Tier 1: Critical Content 
- **Content**: Recent articles, homepage content, breaking news
- **Business Hours**: Refreshes every 30 minutes
- **Off-Hours**: Refreshes every 60 minutes  
- **Cache Expiry**: 1.5 hours

### Tier 2: Important Content
- **Content**: All articles, featured articles
- **Business Hours**: Refreshes every 60 minutes
- **Off-Hours**: Refreshes every 2 hours
- **Cache Expiry**: 3 hours

### Tier 3: Stable Content  
- **Content**: Team members, quotes
- **Business Hours**: Refreshes every 3 hours
- **Off-Hours**: Refreshes every 6 hours
- **Cache Expiry**: 8 hours

## Key Improvements

### 1. **Eliminates Cache Gaps**
- Previous system: Cache could expire before refresh, causing API calls during user requests
- New system: Cache expiry is always longer than refresh intervals

### 2. **Publication-Optimized Scheduling**
- More frequent updates during active publishing hours (business hours)
- Conserves API calls during low-activity periods (nights/weekends)
- Prioritizes homepage content for best user experience

### 3. **Emergency Refresh Capability**
- Breaking news or urgent updates can trigger immediate refresh
- Bypasses normal throttling for critical content
- API endpoint: `POST /api/cache/emergency-refresh`

### 4. **Cache Warmup**
- Server starts with warm caches for immediate availability
- Critical content loads first, stable content in background
- Reduces cold start delays

## API Endpoints

### Emergency Refresh
```http
POST /api/cache/emergency-refresh
```
Immediately refreshes critical content (recent articles, featured articles) bypassing throttling.

### Cache Status
```http
GET /api/cache/status  
```
Returns current scheduling information:
- Business hours status
- Current refresh intervals for each tier
- Cache expiry times
- Timestamp

## Configuration

The system can be configured via `PublicationScheduler.updateConfig()`:

```typescript
PublicationScheduler.updateConfig({
  timezone: 'America/New_York', // Publication timezone
  businessHours: {
    start: 9,  // 9 AM
    end: 17    // 5 PM  
  },
  businessDays: [1, 2, 3, 4, 5] // Monday-Friday
});
```

## Benefits for Publications

1. **Faster homepage loads**: Critical content refreshes frequently during business hours
2. **Reduced API costs**: Less frequent refreshes during off-hours
3. **Breaking news ready**: Emergency refresh for urgent updates
4. **Reliable caching**: No more cache expiry gaps causing slow responses
5. **Publication workflow aware**: Timing aligns with when content is most likely published

## Monitoring

The system logs scheduling context on startup and provides status endpoints for monitoring cache health and refresh patterns.

## Backwards Compatibility

The new system is fully backwards compatible. Existing cache files and API responses remain unchanged - only the refresh timing logic has been enhanced.