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

console.log("🔍 Checking Airtable Tables...\n");

try {
  Airtable.configure({ apiKey });
  const base = Airtable.base(baseId);
  
  console.log("📋 Checking for tables in your Airtable base:");
  
  // Try to access the base and see what tables exist
  // Since Airtable API doesn't have a direct way to list tables, we'll try common names
  const possibleTableNames = [
    // Team-related
    'Teams', 'Team', 'Team Members', 'TeamMembers', 'Members', 'Staff',
    // Article-related  
    'History', 'Articles', 'Posts', 'Content', 'Blog', 'Stories',
    // Quote-related
    'CarouselQuote', 'Quotes', 'Quote', 'Inspiration',
    // Generic
    'Main', 'Data', 'Content', 'Records', 'Items'
  ];
  
  let foundTables = [];
  
  for (const tableName of possibleTableNames) {
    try {
      const query = base(tableName).select({ maxRecords: 1 });
      const records = await query.all();
      console.log(`✅ Table "${tableName}" exists with ${records.length} record(s)`);
      
      if (records.length > 0) {
        const firstRecord = records[0];
        const fields = Object.keys(firstRecord.fields);
        console.log(`   Fields: ${fields.join(', ')}`);
        
        foundTables.push({
          name: tableName,
          recordCount: records.length,
          fields: fields
        });
      }
    } catch (error) {
      // Table doesn't exist, skip
    }
  }
  
  if (foundTables.length === 0) {
    console.log("\n❌ No tables found with common names.");
    console.log("Please check your Airtable base and ensure tables exist.");
    console.log("You can also manually specify table names in the code.");
  } else {
    console.log("\n🎯 Found tables:");
    foundTables.forEach(table => {
      console.log(`- ${table.name} (${table.recordCount} records)`);
    });
    
    console.log("\n💡 To fix the 404 errors, update the table names in server/storage.ts:");
    console.log("Look for lines that reference 'Teams', 'History', 'CarouselQuote'");
    console.log("And change them to match your actual table names.");
  }
  
} catch (error) {
  console.log("❌ Error connecting to Airtable:");
  console.log("  Error:", error.message);
} 