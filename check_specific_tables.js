#!/usr/bin/env node

import * as dotenv from "dotenv";
import Airtable from "airtable";

// Load environment variables
dotenv.config();

const apiKey = process.env.AIRTABLE_API_KEY || '';
const baseId = process.env.AIRTABLE_BASE_ID || '';

if (!apiKey || !baseId) {
  console.error('Missing Airtable credentials. Please set AIRTABLE_API_KEY and AIRTABLE_BASE_ID in your .env file.');
  process.exit(1);
}

console.log("🔍 Checking Specific Tables...\n");

try {
  Airtable.configure({ apiKey });
  const base = Airtable.base(baseId);
  
  // Check the specific tables the server is looking for
  const serverTables = ['Teams', 'History', 'CarouselQuote'];
  
  for (const tableName of serverTables) {
    try {
      const query = base(tableName).select({ maxRecords: 5 });
      const records = await query.all();
      console.log(`✅ Table "${tableName}" exists with ${records.length} record(s)`);
      
      if (records.length > 0) {
        const firstRecord = records[0];
        console.log(`   Fields: ${Object.keys(firstRecord.fields).join(', ')}`);
        
        // Show sample data
        if (tableName === 'Teams') {
          console.log(`   Sample: ${firstRecord.get('Name')} - ${firstRecord.get('Role')}`);
        } else if (tableName === 'History') {
          console.log(`   Sample: ${firstRecord.get('Title') || firstRecord.get('Name')}`);
        } else if (tableName === 'CarouselQuote') {
          console.log(`   Sample: ${firstRecord.get('Quote') || firstRecord.get('Text')}`);
        }
      }
    } catch (error) {
      console.log(`❌ Table "${tableName}" not found: ${error.message}`);
    }
  }
  
  console.log("\n💡 If some tables are missing, you can:");
  console.log("1. Create the missing tables in Airtable");
  console.log("2. Or modify the server code to use existing table names");
  
} catch (error) {
  console.log("❌ Error connecting to Airtable:");
  console.log("  Error:", error.message);
} 