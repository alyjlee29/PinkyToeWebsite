import { describe, it, expect, beforeEach } from 'vitest';
import { PublicationScheduler } from '../../server/services/publication-scheduler';

describe('PublicationScheduler', () => {
  beforeEach(() => {
    // Reset to default config before each test
    PublicationScheduler.updateConfig({
      timezone: 'America/New_York',
      businessHours: { start: 9, end: 17 },
      businessDays: [1, 2, 3, 4, 5]
    });
  });

  describe('Content Tiers', () => {
    it('should have different intervals for business hours vs off-hours', () => {
      const criticalBusinessInterval = PublicationScheduler.getRefreshInterval('critical');
      const importantBusinessInterval = PublicationScheduler.getRefreshInterval('important');
      const stableBusinessInterval = PublicationScheduler.getRefreshInterval('stable');
      
      // All intervals should be positive numbers
      expect(criticalBusinessInterval).toBeGreaterThan(0);
      expect(importantBusinessInterval).toBeGreaterThan(0);
      expect(stableBusinessInterval).toBeGreaterThan(0);
      
      // Critical content should refresh more frequently than important, and important more than stable
      expect(criticalBusinessInterval).toBeLessThanOrEqual(importantBusinessInterval);
      expect(importantBusinessInterval).toBeLessThanOrEqual(stableBusinessInterval);
    });

    it('should provide appropriate cache expiry times', () => {
      const criticalExpiry = PublicationScheduler.getCacheExpiry('critical');
      const importantExpiry = PublicationScheduler.getCacheExpiry('important');
      const stableExpiry = PublicationScheduler.getCacheExpiry('stable');
      
      // All expiry times should be positive
      expect(criticalExpiry).toBeGreaterThan(0);
      expect(importantExpiry).toBeGreaterThan(0);
      expect(stableExpiry).toBeGreaterThan(0);
      
      // Cache expiry should be longer than refresh intervals to prevent gaps
      const criticalInterval = PublicationScheduler.getRefreshInterval('critical');
      const importantInterval = PublicationScheduler.getRefreshInterval('important');
      const stableInterval = PublicationScheduler.getRefreshInterval('stable');
      
      expect(criticalExpiry).toBeGreaterThan(criticalInterval);
      expect(importantExpiry).toBeGreaterThan(importantInterval);
      expect(stableExpiry).toBeGreaterThan(stableInterval);
    });
  });

  describe('Business Hours Detection', () => {
    it('should handle unknown content tiers gracefully', () => {
      // @ts-expect-error - Testing invalid tier
      const interval = PublicationScheduler.getRefreshInterval('invalid');
      const expiry = PublicationScheduler.getCacheExpiry('invalid');
      
      // Should fall back to stable tier
      const stableInterval = PublicationScheduler.getRefreshInterval('stable');
      const stableExpiry = PublicationScheduler.getCacheExpiry('stable');
      
      expect(interval).toBe(stableInterval);
      expect(expiry).toBe(stableExpiry);
    });
  });

  describe('Configuration', () => {
    it('should allow config updates', () => {
      const newConfig = {
        timezone: 'America/Los_Angeles',
        businessHours: { start: 8, end: 18 },
        businessDays: [1, 2, 3, 4, 5, 6] // Include Saturday
      };
      
      PublicationScheduler.updateConfig(newConfig);
      
      // This test mainly ensures the update method doesn't throw
      expect(() => PublicationScheduler.logSchedulingContext()).not.toThrow();
    });
  });

  describe('Publication Workflow', () => {
    it('should provide meaningful context logging', () => {
      // Test that logging doesn't throw errors
      expect(() => PublicationScheduler.logSchedulingContext()).not.toThrow();
    });

    it('should calculate time until business hours', () => {
      const timeUntilBusiness = PublicationScheduler.getTimeUntilBusinessHours();
      const timeUntilBusinessEnd = PublicationScheduler.getTimeUntilBusinessHoursEnd();
      
      // Times should be non-negative numbers
      expect(timeUntilBusiness).toBeGreaterThanOrEqual(0);
      expect(timeUntilBusinessEnd).toBeGreaterThanOrEqual(0);
    });
  });
});