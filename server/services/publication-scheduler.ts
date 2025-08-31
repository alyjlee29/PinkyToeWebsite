/**
 * Publication-aware scheduling service
 * Handles cache refresh timing based on publication workflow and business hours
 */

export interface PublicationScheduleConfig {
  timezone: string;
  businessHours: {
    start: number; // 24-hour format (e.g., 9 for 9 AM)
    end: number;   // 24-hour format (e.g., 17 for 5 PM)
  };
  businessDays: number[]; // 0-6, where 0 = Sunday (e.g., [1,2,3,4,5] for Mon-Fri)
}

export interface ContentTierConfig {
  name: string;
  businessHoursInterval: number; // milliseconds
  offHoursInterval: number;      // milliseconds
  cacheExpiry: number;           // milliseconds
}

export class PublicationScheduler {
  private static config: PublicationScheduleConfig = {
    timezone: 'America/New_York', // EST/EDT for typical US publication
    businessHours: {
      start: 9,  // 9 AM
      end: 17    // 5 PM
    },
    businessDays: [1, 2, 3, 4, 5] // Monday-Friday
  };

  private static contentTiers: Record<string, ContentTierConfig> = {
    // Tier 1: Critical content (homepage, breaking news)
    critical: {
      name: 'Critical Content',
      businessHoursInterval: 30 * 60 * 1000,  // 30 minutes during business hours
      offHoursInterval: 60 * 60 * 1000,       // 1 hour during off-hours
      cacheExpiry: 90 * 60 * 1000             // 1.5 hours cache expiry (longer than both intervals)
    },
    
    // Tier 2: Important content (articles, featured content)
    important: {
      name: 'Important Content', 
      businessHoursInterval: 60 * 60 * 1000,  // 1 hour during business hours
      offHoursInterval: 120 * 60 * 1000,      // 2 hours during off-hours
      cacheExpiry: 180 * 60 * 1000            // 3 hours cache expiry (longer than off-hours interval)
    },
    
    // Tier 3: Stable content (team, quotes)
    stable: {
      name: 'Stable Content',
      businessHoursInterval: 180 * 60 * 1000, // 3 hours during business hours  
      offHoursInterval: 360 * 60 * 1000,      // 6 hours during off-hours
      cacheExpiry: 480 * 60 * 1000            // 8 hours cache expiry (longer than off-hours interval)
    }
  };

  /**
   * Check if current time is during business hours
   */
  static isBusinessHours(date: Date = new Date()): boolean {
    try {
      // Convert to configured timezone
      const timeInZone = new Intl.DateTimeFormat('en-US', {
        timeZone: this.config.timezone,
        hour: 'numeric',
        weekday: 'short',
        hour12: false
      }).formatToParts(date);

      const hour = parseInt(timeInZone.find(part => part.type === 'hour')?.value || '0');
      const dayName = timeInZone.find(part => part.type === 'weekday')?.value;
      
      // Map day names to numbers (JavaScript convention: 0=Sunday)
      const dayMap: Record<string, number> = {
        'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
      };
      const dayOfWeek = dayMap[dayName || 'Sun'] || 0;

      // Check if it's a business day
      const isBusinessDay = this.config.businessDays.includes(dayOfWeek);
      
      // Check if it's within business hours
      const isWithinHours = hour >= this.config.businessHours.start && 
                           hour < this.config.businessHours.end;

      return isBusinessDay && isWithinHours;
    } catch (error) {
      console.error('Error checking business hours:', error);
      return false; // Default to off-hours if error
    }
  }

  /**
   * Get appropriate refresh interval for content tier
   */
  static getRefreshInterval(tier: keyof typeof PublicationScheduler.contentTiers): number {
    const tierConfig = this.contentTiers[tier];
    if (!tierConfig) {
      console.warn(`Unknown content tier: ${tier}, using 'stable' tier`);
      return this.getRefreshInterval('stable');
    }

    return this.isBusinessHours() ? 
      tierConfig.businessHoursInterval : 
      tierConfig.offHoursInterval;
  }

  /**
   * Get cache expiry time for content tier
   */
  static getCacheExpiry(tier: keyof typeof PublicationScheduler.contentTiers): number {
    const tierConfig = this.contentTiers[tier];
    if (!tierConfig) {
      console.warn(`Unknown content tier: ${tier}, using 'stable' tier`);
      return this.getCacheExpiry('stable');
    }

    return tierConfig.cacheExpiry;
  }

  /**
   * Get time until next business hours start (for scheduling off-hours refreshes)
   */
  static getTimeUntilBusinessHours(): number {
    const now = new Date();
    const today = new Date(now);
    
    // Set to business hours start time today
    today.setHours(this.config.businessHours.start, 0, 0, 0);
    
    if (now < today && this.config.businessDays.includes(now.getDay())) {
      // Business hours haven't started today and it's a business day
      return today.getTime() - now.getTime();
    }
    
    // Find next business day
    let nextBusinessDay = new Date(now);
    nextBusinessDay.setDate(nextBusinessDay.getDate() + 1);
    nextBusinessDay.setHours(this.config.businessHours.start, 0, 0, 0);
    
    // Keep incrementing until we find a business day
    while (!this.config.businessDays.includes(nextBusinessDay.getDay())) {
      nextBusinessDay.setDate(nextBusinessDay.getDate() + 1);
    }
    
    return nextBusinessDay.getTime() - now.getTime();
  }

  /**
   * Get time until business hours end (for scheduling end-of-day refreshes)
   */
  static getTimeUntilBusinessHoursEnd(): number {
    const now = new Date();
    const today = new Date(now);
    
    // Set to business hours end time today
    today.setHours(this.config.businessHours.end, 0, 0, 0);
    
    if (now < today && this.config.businessDays.includes(now.getDay())) {
      // Business hours end hasn't passed today and it's a business day
      return today.getTime() - now.getTime();
    }
    
    return 0; // Business hours have ended or it's not a business day
  }

  /**
   * Log current scheduling context for debugging
   */
  static logSchedulingContext(): void {
    const now = new Date();
    const isBusinessTime = this.isBusinessHours();
    
    console.log('=== Publication Scheduler Context ===');
    console.log(`Current time: ${now.toISOString()}`);
    console.log(`Timezone: ${this.config.timezone}`);
    console.log(`Is business hours: ${isBusinessTime}`);
    console.log(`Business hours: ${this.config.businessHours.start}:00 - ${this.config.businessHours.end}:00`);
    console.log(`Business days: ${this.config.businessDays.join(', ')}`);
    
    console.log('Content tier intervals:');
    Object.entries(this.contentTiers).forEach(([tier, config]) => {
      const interval = isBusinessTime ? config.businessHoursInterval : config.offHoursInterval;
      console.log(`  ${tier}: ${Math.round(interval / (60 * 1000))} minutes (cache: ${Math.round(config.cacheExpiry / (60 * 1000))} minutes)`);
    });
    console.log('=====================================');
  }

  /**
   * Update configuration (for testing or customization)
   */
  static updateConfig(newConfig: Partial<PublicationScheduleConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Publication scheduler config updated:', this.config);
  }
}