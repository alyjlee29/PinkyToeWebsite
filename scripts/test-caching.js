#!/usr/bin/env node

/**
 * Test script to verify the publication-aware caching system works correctly
 * This simulates server startup and tests key functionality
 */

import { PublicationScheduler } from '../server/services/publication-scheduler.js';

console.log('🧪 Testing Publication-Aware Caching System\n');

// Test 1: Configuration
console.log('1. Testing Configuration...');
try {
  PublicationScheduler.updateConfig({
    timezone: 'America/New_York',
    businessHours: { start: 9, end: 17 },
    businessDays: [1, 2, 3, 4, 5]
  });
  console.log('✅ Configuration updated successfully\n');
} catch (error) {
  console.error('❌ Configuration test failed:', error);
}

// Test 2: Business hours detection  
console.log('2. Testing Business Hours Detection...');
try {
  const isBusinessHours = PublicationScheduler.isBusinessHours();
  console.log(`✅ Current time is ${isBusinessHours ? 'during' : 'outside'} business hours\n`);
} catch (error) {
  console.error('❌ Business hours detection failed:', error);
}

// Test 3: Content tier intervals
console.log('3. Testing Content Tier Intervals...');
try {
  const criticalInterval = PublicationScheduler.getRefreshInterval('critical');
  const importantInterval = PublicationScheduler.getRefreshInterval('important');
  const stableInterval = PublicationScheduler.getRefreshInterval('stable');
  
  console.log(`✅ Critical content: ${Math.round(criticalInterval / (60 * 1000))} minutes`);
  console.log(`✅ Important content: ${Math.round(importantInterval / (60 * 1000))} minutes`);
  console.log(`✅ Stable content: ${Math.round(stableInterval / (60 * 1000))} minutes\n`);
} catch (error) {
  console.error('❌ Content tier intervals test failed:', error);
}

// Test 4: Cache expiry alignment
console.log('4. Testing Cache Expiry Alignment...');
try {
  const tiers = ['critical', 'important', 'stable'];
  let allAligned = true;
  
  for (const tier of tiers) {
    const interval = PublicationScheduler.getRefreshInterval(tier);
    const expiry = PublicationScheduler.getCacheExpiry(tier);
    
    const intervalMinutes = Math.round(interval / (60 * 1000));
    const expiryMinutes = Math.round(expiry / (60 * 1000));
    
    if (expiry <= interval) {
      console.error(`❌ ${tier} tier: Cache expiry (${expiryMinutes}m) <= refresh interval (${intervalMinutes}m)`);
      allAligned = false;
    } else {
      console.log(`✅ ${tier} tier: Cache expiry (${expiryMinutes}m) > refresh interval (${intervalMinutes}m)`);
    }
  }
  
  if (allAligned) {
    console.log('✅ All cache expiry times are properly aligned\n');
  } else {
    console.log('❌ Some cache expiry times are misaligned\n');
  }
} catch (error) {
  console.error('❌ Cache expiry alignment test failed:', error);
}

// Test 5: Scheduling context
console.log('5. Testing Scheduling Context...');
try {
  PublicationScheduler.logSchedulingContext();
  console.log('✅ Scheduling context logged successfully\n');
} catch (error) {
  console.error('❌ Scheduling context test failed:', error);
}

console.log('🧪 Publication-Aware Caching System test completed!');