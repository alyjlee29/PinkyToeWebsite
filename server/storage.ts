import { Article, Team, CarouselQuote } from "@shared/schema";
import Airtable from "airtable";
import { ImageService } from "./services/image-service";
import { config } from "./config";

// Initialize Airtable
const airtableApiKey = config.airtable.apiKey;
const airtableBaseId = config.airtable.baseId;

export interface IStorage {
  // Article methods
  getArticles(page: number, limit: number, search?: string): Promise<{ articles: Article[], total: number }>;
  getFeaturedArticles(): Promise<Article[]>;
  getRecentArticles(limit: number): Promise<Article[]>;
  getArticleById(id: string): Promise<Article | undefined>;
  getArticlesByAuthorId(authorId: string): Promise<Article[]>;

  // Team methods
  getTeamMembers(): Promise<Team[]>;
  getTeamMemberById(id: string): Promise<Team | undefined>;

  // Quote methods
  getQuotes(): Promise<CarouselQuote[]>;
  getQuoteOfDay(): Promise<CarouselQuote>;
}

export class AirtableStorage implements IStorage {
  private base: Airtable.Base;
  private quotes: CarouselQuote[] = [];
  private quoteLastFetched: Date | null = null;
  private readonly teamTableCandidates = [
    'Teams',
    'Team',
    'Team Members',
    'Members',
    'Club Members',
    'Member Directory',
    'Roster',
    'Piscoc Members'
  ];

  constructor() {
    Airtable.configure({
      apiKey: airtableApiKey,
    });

    this.base = Airtable.base(airtableBaseId);
  }

  async getArticles(page: number, limit: number, search = ""): Promise<{ articles: Article[], total: number }> {
    try {
      // Create filter formula
      let filterByFormula = 'Finished = TRUE()';
      
      if (search) {
        // Search in both Name and Description fields
        const searchFilter = `OR(SEARCH("${search.replace(/"/g, '\\"')}", {Name}), SEARCH("${search.replace(/"/g, '\\"')}", {Description}))`;
        filterByFormula = `AND(${filterByFormula}, ${searchFilter})`;
      }

      // First get count of total records matching the search
      const countQuery = this.base('History').select({
        filterByFormula
        // Remove fields parameter as 'id' is automatic in Airtable
      });

      const totalRecords = await countQuery.all();
      const total = totalRecords.length;

      // Then fetch the specific page of data - we need to fetch ALL records and do pagination manually
      // because Airtable offset doesn't work with arbitrary offset values
      const query = this.base('History').select({
        sort: [
          { field: 'Scheduled', direction: 'desc' },
          { field: 'Date', direction: 'desc' }
        ],
        filterByFormula
      });

      // Get all records but manually paginate them
      const allRecords = await query.all();
      const start = (page - 1) * limit;
      const end = Math.min(start + limit, allRecords.length);

      // Make sure we don't go out of bounds
      const pageRecords = start < allRecords.length ? allRecords.slice(start, end) : [];
      const articles = pageRecords.map(this.mapAirtableRecordToArticle);

      return { articles, total };
    } catch (error) {
      console.error('Error fetching articles from Airtable:', error);
      return { articles: [], total: 0 };
    }
  }

  async getFeaturedArticles(): Promise<Article[]> {
    try {
      // Query for featured articles - checking if featured is true and Finished is true
      const query = this.base('History').select({
        filterByFormula: "AND(featured = TRUE(), Finished = TRUE())",
        sort: [
          { field: 'Scheduled', direction: 'desc' },
          { field: 'Date', direction: 'desc' }
        ],
        maxRecords: 5
      });

      const records = await query.all();
      return records.map(this.mapAirtableRecordToArticle);
    } catch (error) {
      console.error('Error fetching featured articles from Airtable:', error);
      return [];
    }
  }

  async getRecentArticles(limit: number): Promise<Article[]> {
    try {
      const query = this.base('History').select({
        filterByFormula: "Finished = TRUE()",
        sort: [
          { field: 'Scheduled', direction: 'desc' },
          { field: 'Date', direction: 'desc' }
        ],
        maxRecords: limit
      });

      const records = await query.all();
      return records.map(this.mapAirtableRecordToArticle);
    } catch (error) {
      console.error('Error fetching recent articles from Airtable:', error);
      return [];
    }
  }

  async getArticleById(id: string): Promise<Article | undefined> {
    try {
      const record = await this.base('History').find(id);
      return this.mapAirtableRecordToArticle(record);
    } catch (error) {
      console.error(`Error fetching article ${id} from Airtable:`, error);
      return undefined;
    }
  }

  async getArticlesByAuthorId(authorId: string): Promise<Article[]> {
    try {
      // Get team member to find their name
      const teamMember = await this.getTeamMemberById(authorId);
      if (!teamMember) return [];

      // Find all articles by this author
      const query = this.base('History').select({
        filterByFormula: `AND({Author} = '${teamMember.name.replace(/'/g, "\\'")}', Finished = TRUE())`,
        sort: [{ field: 'Date', direction: 'desc' }],
        maxRecords: 10
      });

      const records = await query.all();
      return records.map(this.mapAirtableRecordToArticle);
    } catch (error) {
      console.error(`Error fetching articles for author ${authorId} from Airtable:`, error);
      return [];
    }
  }

  // Sample team members to use when Airtable access fails
  private getSampleTeamMembers(): Team[] {
    return [
      {
        id: 'sample1',
        name: 'Sarah Johnson',
        role: 'Editor-in-Chief',
        bio: 'Comedy writer and feminist scholar with a passion for empowering women through humor.',
        imageUrl: '/api/images/placeholder',
        imageType: 'url',
        imagePath: null,
        authorSub: ['sample-article-1', 'sample-article-2'],
        photoSub: ['sample-photo-1']
      },
      {
        id: 'sample2',
        name: 'Emily Rodriguez',
        role: 'Lead Writer',
        bio: 'Comedian and essayist focusing on intersectional feminism and representation in media.',
        imageUrl: '/api/images/placeholder',
        imageType: 'url',
        imagePath: null,
        authorSub: ['sample-article-1', 'sample-article-2'],
        photoSub: ['sample-photo-1']
      },
      {
        id: 'sample3',
        name: 'Jessica Lee',
        role: 'Staff Writer',
        bio: 'Cultural critic and humor writer exploring gender politics through a satirical lens.',
        imageUrl: '/api/images/placeholder',
        imageType: 'url',
        imagePath: null,
        authorSub: ['sample-article-1', 'sample-article-2'],
        photoSub: ['sample-photo-1']
      }
    ];
  }

  async getTeamMembers(): Promise<Team[]> {
    const attemptedTables: string[] = [];

    for (const tableName of this.getTeamTableCandidates()) {
      try {
        attemptedTables.push(tableName);

        const query = this.base(tableName).select();
        const records = await query.all();

        if (!records || records.length === 0) {
          console.warn(`Airtable table "${tableName}" returned no team member records. Trying next candidate if available.`);
          continue;
        }

        const team = records
          .map(record => this.mapAirtableRecordToTeamMember(record))
          .sort((a, b) => a.name.localeCompare(b.name));

        console.log(`Fetched ${team.length} team members from Airtable table "${tableName}".`);
        return team;
      } catch (error: any) {
        if (this.isPermissionError(error)) {
          console.warn(`Authorization issue detected with Airtable table "${tableName}". Falling back to sample data.`);
          return this.getSampleTeamMembers();
        }

        if (this.isMissingTableError(error)) {
          console.warn(`Airtable table "${tableName}" not found. Trying next candidate if available.`);
          continue;
        }

        console.error(`Error fetching team members from Airtable table "${tableName}":`, error);
      }
    }

    if (attemptedTables.length > 0) {
      console.error(`Unable to fetch team members from Airtable. Tables attempted: ${attemptedTables.join(', ')}.`);
    }

    return [];
  }

  async getTeamMemberById(id: string): Promise<Team | undefined> {
    for (const tableName of this.getTeamTableCandidates()) {
      try {
        const record = await this.base(tableName).find(id);
        if (record) {
          return this.mapAirtableRecordToTeamMember(record);
        }
      } catch (error: any) {
        if (this.isPermissionError(error)) {
          console.warn(`Authorization issue detected with Airtable table "${tableName}" for ID ${id}. Falling back to sample data.`);
          const sampleTeamMembers = this.getSampleTeamMembers();
          return sampleTeamMembers.find(member => member.id === id) || sampleTeamMembers[0];
        }

        if (this.isMissingTableError(error) || this.isRecordNotFoundError(error)) {
          console.warn(`Team member with ID ${id} not found in Airtable table "${tableName}". Trying next candidate.`);
          continue;
        }

        console.error(`Error fetching team member ${id} from Airtable table "${tableName}":`, error);
      }
    }

    return undefined;
  }

  async getQuotes(): Promise<CarouselQuote[]> {
    // Cache quotes for 1 hour
    const ONE_HOUR = 60 * 60 * 1000;

    if (this.quotes.length > 0 && this.quoteLastFetched && (Date.now() - this.quoteLastFetched.getTime() < ONE_HOUR)) {
      return this.quotes;
    }

    try {
      const query = this.base('CarouselQuote').select();
      const records = await query.all();


      let quoteId = 1;
      const mainQuotes: CarouselQuote[] = [];
      const philoQuotes: CarouselQuote[] = [];

      // Process each record and create two separate quotes from it (main and philo)
      records.forEach((record) => {
        // Check if the record has a "main" field 
        if ('main' in record.fields) {
          const mainQuoteText = record.get('main');
          if (mainQuoteText && String(mainQuoteText).trim() !== '') {
            mainQuotes.push({
              id: quoteId++,
              carousel: 'main',
              quote: String(mainQuoteText)
            });
          } else {
            // Create main quotes with placeholder if not already present
            // This is to ensure we have entries for "main" carousel for the UI
            if (mainQuotes.length === 0) {
              // Add a record with carousel type "main" with an empty quote
              mainQuotes.push({
                id: quoteId++,
                carousel: 'main',
                quote: ''
              });
            }
          }
        }

        // Check if the record has a "philo" field
        if ('philo' in record.fields) {
          const philoQuoteText = record.get('philo');
          if (philoQuoteText && String(philoQuoteText).trim() !== '') {
            philoQuotes.push({
              id: quoteId++,
              carousel: 'philo',
              quote: String(philoQuoteText)
            });
          } else {
          }
        }
      });

      // Combine all quotes and update the instance variable
      this.quotes = [...mainQuotes, ...philoQuotes];


      this.quoteLastFetched = new Date();
      return this.quotes;
    } catch (error) {
      console.error('Error fetching quotes from Airtable:', error);
      return [];
    }
  }

  async getQuoteOfDay(): Promise<CarouselQuote> {
    const quotes = await this.getQuotes();

    // Filter for quotes of type "Philo" or "Philosophy" for the quote of the day
    const philosophyQuotes = quotes.filter(quote =>
      quote.carousel.toLowerCase() === 'philo' ||
      quote.carousel.toLowerCase() === 'philosophy'
    );

    if (philosophyQuotes.length === 0) {
      if (quotes.length === 0) {
        return {
          id: 0,
          carousel: 'default',
          quote: ''
        };
      }

      // If no philosophy quotes, use any available quote
      const today = new Date();
      const start = new Date(today.getFullYear(), 0, 0);
      const diff = today.getTime() - start.getTime();
      const oneDay = 1000 * 60 * 60 * 24;
      const dayOfYear = Math.floor(diff / oneDay);

      const quoteIndex = dayOfYear % quotes.length;
      return quotes[quoteIndex];
    }

    // Use the day of year to select a quote deterministically from philosophy quotes
    const today = new Date();
    const start = new Date(today.getFullYear(), 0, 0);
    const diff = today.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    const quoteIndex = dayOfYear % philosophyQuotes.length;
    return philosophyQuotes[quoteIndex];
  }

  private mapAirtableRecordToArticle(record: Airtable.Record<any>): Article {

    // Get date field - prioritize Scheduled, then fall back to previous fields
    const dateString = record.get('Scheduled') || record.get('publishedAt') || record.get('Published Date') || record.get('Date') || record.get('created');
    const publishDate = dateString ? new Date(dateString as string) : new Date();

    // Get created date or fallback to published date
    const createdString = record.get('createdAt') || record.get('Created Date') || record.get('created');
    const createdDate = createdString ? new Date(createdString as string) : new Date();


    // Use MainImageLink as the primary source for image URLs
    let imageUrl = '';

    // Prioritize MainImageLink field
    const mainImageLink = record.get('MainImageLink') as string;

    if (mainImageLink) {
      // Create a proxy URL using the MainImageLink URL
      imageUrl = ImageService.getProxyUrl(mainImageLink);
    }
    // Fallback to other URL fields if MainImageLink is not available
    else {
      const directUrl = record.get('imageUrl') as string ||
        record.get('Image URL') as string ||
        record.get('Image') as string ||
        record.get('image') as string ||
        record.get('Banner') as string ||
        record.get('banner') as string ||
        '';

      if (directUrl) {
        // Proxy the direct URL as well
        imageUrl = ImageService.getProxyUrl(directUrl);
      }
    }


    // Handle name field which can be an array or string
    const nameField = record.get('Name (from Author)') || record.get('name') || record.get('Name') || record.get('author') || record.get('Author');
    const authorName = Array.isArray(nameField) ? nameField.join(', ') : (nameField as string || '');

    // Handle name_photo field which can be an array or string  
    const namePhotoField = record.get('Name (from Photo)') || record.get('name_photo') || record.get('photoCredit') || record.get('Photo Credit');
    const namePhoto = Array.isArray(namePhotoField) ? namePhotoField.join(', ') : (namePhotoField as string || undefined);

    // Handle photo field which can be an array or string
    const photoField = record.get('photo') || record.get('Photo');
    const photo = Array.isArray(photoField) ? photoField.join(', ') : (photoField as string || '');

    // Determine status based on Finished boolean (published/draft)
    const isFinished = record.get('Finished') === true || record.get('finished') === true;

    // Handle description - if missing, use first two sentences of content
    let description = (record.get('description') as string || record.get('Description') as string || '').trim();
    const content = record.get('content') as string || record.get('Content') as string || record.get('Body') as string || '';
    const contentFormat = record.get('contentFormat') as any || record.get('Content Format') as any ||
      // If content comes from Body field, assume it's HTML
      (record.get('Body') ? 'html' : 'plaintext');

    // Helper to decode HTML entities
    const decodeHtmlEntities = (text: string): string => {
      const entities: Record<string, string> = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'",
        '&nbsp;': ' ',
        '&rsquo;': "'",
        '&lsquo;': "'",
        '&rdquo;': '"',
        '&ldquo;': '"',
        '&mdash;': '—',
        '&ndash;': '–'
      };
      return text.replace(/&[a-zA-Z0-9#]+;/g, (match) => entities[match] || match);
    };

    if (!description && content) {
      // Strip HTML tags if format is HTML
      let plainText = content;
      if (contentFormat === 'html') {
        // Remove style and meta tags and their content first
        plainText = plainText.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        plainText = plainText.replace(/<meta[^>]*>/gi, '');
        
        // Replace block-level closing tags with a space to prevent text merging
        plainText = plainText.replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, ' ');
        // Remove HTML tags
        plainText = plainText.replace(/<[^>]*>/g, '');
        // Decode HTML entities
        plainText = decodeHtmlEntities(plainText);
        // Replace multiple spaces/newlines with single space and trim
        plainText = plainText.replace(/\s+/g, ' ').trim();
      }

      // Match sentences ending in ., !, or ?
      // This regex captures sentences more robustly, including those with quotes
      const sentenceMatch = plainText.match(/.*?[.!?](?:\s|$)/g);
      
      if (sentenceMatch && sentenceMatch.length > 0) {
        // Take first two sentences
        description = sentenceMatch.slice(0, 2).join('').trim();
      } else {
        // Fallback if no sentence structure detected: take first 200 chars
        description = plainText.length > 200 ? plainText.substring(0, 200) + '...' : plainText;
      }
    }

    return {
      id: record.id,
      title: record.get('Name') as string || record.get('title') as string || record.get('Title') as string || '',
      description: description,
      excerpt: record.get('excerpt') as string || record.get('Excerpt') as string || undefined,
      content: content,
      contentFormat: contentFormat,
      imageUrl: imageUrl,
      imageType: 'url', // Always use URL type since we're proxying
      imagePath: null, // No need for local path when using proxy
      featured: record.get('featured') === true || record.get('Featured') === true,
      publishedAt: publishDate,
      name: authorName,
      photo: photo,
      name_photo: namePhoto,
      status: isFinished ? 'published' : 'draft',
      createdAt: createdDate,
      hashtags: record.get('hashtags') as string || record.get('Hashtags') as string || undefined
    };
  }

  private mapAirtableRecordToTeamMember(record: Airtable.Record<any>): Team {
    const imageUrl = this.extractTeamImageUrl(record);

    const name = this.extractStringField(record, [
      'Name',
      'name',
      'Full Name',
      'Full name',
      'Display Name',
      'Preferred Name',
      'Member Name'
    ]) || record.id;

    const role = this.extractStringField(record, [
      'Role',
      'role',
      'Position',
      'Title',
      'Positions',
      'Club Role',
      'Team Role'
    ]);

    const bio = this.extractStringField(record, [
      'Bio',
      'bio',
      'Biography',
      'About',
      'About Me',
      'Description'
    ]);

    const authorSub = this.normalizeLinkedRecordField(
      record.get('AuthorSub') || record.get('authorSub') || record.get('Author Sub')
    );

    const photoSub = this.normalizeLinkedRecordField(
      record.get('PhotoSub') || record.get('photoSub') || record.get('Photo Sub')
    );

    const memberPhotoFallbacks: Record<string, string> = {
      recZtkL9mFlnEVuka: '/member-photos/Adrianna%20Egan.jpg',
      recqzeh29YuQiTSz3: '/member-photos/Adrianna%20Uykan.jpg',
      recBzpFyNxvxVDPFv: '/member-photos/Aidan%20Fairchild-Sandoval.jpeg',
      recalhUBu9vDRaZM5: '/member-photos/Alex%20Peplinski.jpg',
      recn9SH70SlhqaKPt: '/member-photos/Allison%20Groves.jpg',
      recI5LBEnOBuZZUJ1: '/member-photos/Ava%20Carrel.jpg',
      recepv49p3G2oFgi5: '/member-photos/Doran%20Steinfeld.jpg',
      recHxXPZOKZWkR0u6: '/member-photos/Ellie%20Tiwari.jpg',
      recMqocpbtURIViuL: '/member-photos/Grace%20Whinnery.jpg',
      recIFn7416d22TIyp: '/member-photos/Lizzy%20Morearty.jpg',
      recdzQhTdgxNMTV4M: '/member-photos/Lucy%20Wang.jpg',
      recYigetjlh094xGR: '/member-photos/Maddie%20Lam.jpg',
      recuDmwmUJD3DYr8k: '/member-photos/Molly%20Doherty.jpg',
      rec2sLMvWLj7aRSCv: '/member-photos/Vie%20Sun.jpg',
      recKvtNrK0osLf1Bs: '/member-photos/Willa%20Norvell.jpg',
    };

    if (!imageUrl && memberPhotoFallbacks[record.id]) {
      imageUrl = memberPhotoFallbacks[record.id];
    }

    return {
      id: record.id,
      name,
      role,
      bio,
      imageUrl,
      imageType: 'url',
      imagePath: null,
      authorSub,
      photoSub
    };
  }

  private getTeamTableCandidates(): string[] {
    return Array.from(new Set(this.teamTableCandidates));
  }

  private isPermissionError(error: any): boolean {
    return error?.statusCode === 403;
  }

  private isMissingTableError(error: any): boolean {
    if (!error) return false;
    if (error.statusCode === 404) {
      const message = String(error.message || '').toLowerCase();
      return message.includes('could not find table') || message.includes('table') || message === '';
    }
    return false;
  }

  private isRecordNotFoundError(error: any): boolean {
    return error?.statusCode === 404 || error?.error === 'NOT_FOUND';
  }

  private extractStringField(record: Airtable.Record<any>, fieldNames: string[]): string {
    for (const fieldName of fieldNames) {
      const value = record.get(fieldName);
      if (value === undefined || value === null) {
        continue;
      }

      if (Array.isArray(value)) {
        const strings = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
        if (strings.length > 0) {
          return strings.join(', ');
        }
      } else if (typeof value === 'string') {
        if (value.trim().length > 0) {
          return value;
        }
      } else if (typeof value === 'number') {
        return value.toString();
      }
    }

    return '';
  }

  private normalizeLinkedRecordField(value: any): string[] | undefined {
    if (!value) {
      return undefined;
    }

    if (Array.isArray(value)) {
      const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      return items.length > 0 ? items : undefined;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      return [value];
    }

    return undefined;
  }

  private extractTeamImageUrl(record: Airtable.Record<any>): string {
    const imageFieldCandidates = [
      'MainImageLink',
      'Main Image Link',
      'MainImage',
      'Image',
      'image',
      'Image URL',
      'imageUrl',
      'Photo',
      'Headshot',
      'Profile Photo',
      'Profile Picture',
      'Picture',
      'Portrait',
      'Avatar'
    ];

    for (const fieldName of imageFieldCandidates) {
      const value = record.get(fieldName);
      const resolvedUrl = this.resolveImageField(value);
      if (resolvedUrl) {
        return ImageService.getProxyUrl(resolvedUrl);
      }
    }

    return '';
  }

  private resolveImageField(fieldValue: any): string | null {
    if (!fieldValue) {
      return null;
    }

    if (typeof fieldValue === 'string') {
      return fieldValue;
    }

    if (Array.isArray(fieldValue)) {
      for (const entry of fieldValue) {
        if (!entry) {
          continue;
        }

        if (typeof entry === 'string' && entry.trim().length > 0) {
          return entry;
        }

        if (typeof entry === 'object' && 'url' in entry && typeof entry.url === 'string' && entry.url.trim().length > 0) {
          return entry.url;
        }
      }
    }

    if (typeof fieldValue === 'object' && 'url' in fieldValue && typeof fieldValue.url === 'string' && fieldValue.url.trim().length > 0) {
      return fieldValue.url;
    }

    return null;
  }
}

// For development/testing when Airtable credentials are not available
export class MemStorage implements IStorage {
  private articles: Article[] = [];
  private teamMembers: Team[] = [];
  private quotes: CarouselQuote[] = [];

  constructor() {
    // Initialize with sample data for development
    this.initSampleData();
  }

  async getArticles(page: number, limit: number, search = ""): Promise<{ articles: Article[], total: number }> {
    let filteredArticles = this.articles;

    if (search) {
      const searchLower = search.toLowerCase();
      filteredArticles = filteredArticles.filter(article =>
        (article.title || '').toLowerCase().includes(searchLower) ||
        (article.description || '').toLowerCase().includes(searchLower)
      );
    }

    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedArticles = filteredArticles.slice(start, end);

    return {
      articles: paginatedArticles,
      total: filteredArticles.length
    };
  }

  async getFeaturedArticles(): Promise<Article[]> {
    return this.articles.filter(article => article.featured === true);
  }

  async getRecentArticles(limit: number): Promise<Article[]> {
    // Sort by published date (newest first)
    const sorted = [...this.articles].sort((a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    return sorted.slice(0, limit);
  }

  async getArticleById(id: string): Promise<Article | undefined> {
    return this.articles.find(article => article.id === id);
  }

  async getArticlesByAuthorId(authorId: string): Promise<Article[]> {
    const teamMember = await this.getTeamMemberById(authorId);
    if (!teamMember) return [];

    return this.articles.filter(article => article.name === teamMember.name);
  }

  async getTeamMembers(): Promise<Team[]> {
    return this.teamMembers;
  }

  async getTeamMemberById(id: string): Promise<Team | undefined> {
    return this.teamMembers.find(member => member.id === id);
  }

  async getQuotes(): Promise<CarouselQuote[]> {
    return this.quotes;
  }

  async getQuoteOfDay(): Promise<CarouselQuote> {
    if (this.quotes.length === 0) {
      return {
        id: 0,
        carousel: 'default',
        quote: 'In a world full of sharks, be a pinky toe - small but mighty enough to make someone curse when they least expect it.'
      };
    }

    // Use the day of year to select a quote deterministically
    const today = new Date();
    const start = new Date(today.getFullYear(), 0, 0);
    const diff = today.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    const quoteIndex = dayOfYear % this.quotes.length;
    return this.quotes[quoteIndex];
  }

  private initSampleData() {
    // Sample team members
    this.teamMembers = [
      {
        id: 'rec1',
        name: 'Sarah Johnson',
        role: 'Editor-in-Chief',
        bio: 'Comedy writer and feminist scholar with a passion for empowering women through humor.',
        imageUrl: ImageService.getProxyUrl('https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'),
        imageType: 'url',
        imagePath: null,
        authorSub: ['sample-article-1', 'sample-article-2'],
        photoSub: ['sample-photo-1']
      },
      {
        id: 'rec2',
        name: 'Emily Rodriguez',
        role: 'Lead Writer',
        bio: 'Comedian and essayist focusing on intersectional feminism and representation in media.',
        imageUrl: ImageService.getProxyUrl('https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'),
        imageType: 'url',
        imagePath: null,
        authorSub: ['sample-article-3', 'sample-article-4', 'sample-article-5'],
        photoSub: ['sample-photo-2', 'sample-photo-3']
      },
      {
        id: 'rec3',
        name: 'Jessica Lee',
        role: 'Staff Writer',
        bio: 'Cultural critic and humor writer exploring gender politics through a satirical lens.',
        imageUrl: ImageService.getProxyUrl('https://images.unsplash.com/photo-1581992652564-44c42f5ad3ad?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'),
        imageType: 'url',
        imagePath: null,
        authorSub: ['sample-article-6'],
        photoSub: ['sample-photo-4', 'sample-photo-5']
      }
    ];

    // Sample articles
    this.articles = [
      {
        id: 'article1',
        title: 'The Evolution of Feminist Comedy',
        description: 'How humor has been a powerful tool for feminist movements throughout history, breaking barriers and challenging stereotypes.',
        excerpt: 'A look at feminist comedy through the decades.',
        content: `Throughout history, women have used humor as a powerful tool to challenge patriarchal structures, break barriers, and advocate for equality. From the witty satires of Jane Austen to the groundbreaking stand-up of contemporary comedians, feminist humor has evolved significantly while maintaining its core purpose: to critique, challenge, and change the status quo.

The Early Pioneers

In the 19th century, writers like Jane Austen and Frances Burney used wit and irony to subtly critique society's expectations of women. While not overtly labeled as "feminist" in their time, their sharp observations of social hierarchies and marriage markets laid the groundwork for feminist humor that would follow.

The suffragette movement also employed humor effectively, using satirical cartoons and witty slogans to counter anti-suffrage arguments and humanize their cause. These early pioneers understood that laughter could be a disarming entry point for radical ideas.`,
        contentFormat: 'plaintext',
        imageUrl: ImageService.getProxyUrl('https://images.unsplash.com/photo-1533562669260-350775484a52?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'),
        imageType: 'url',
        imagePath: null,
        featured: true,
        publishedAt: new Date('2023-08-24'),
        name: 'Sarah Johnson',
        photo: ImageService.getProxyUrl('https://images.unsplash.com/photo-1533562669260-350775484a52?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'),
        name_photo: 'Photo by John Smith',
        status: 'published',
        createdAt: new Date('2023-08-20')
      },
      {
        id: 'article2',
        title: 'Finding Your Voice: Women in Comedy',
        description: 'Interviews with rising female comedians who are reshaping the landscape of humor and representation.',
        content: 'Full article content here...',
        contentFormat: 'plaintext',
        imageUrl: ImageService.getProxyUrl('https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'),
        imageType: 'url',
        imagePath: null,
        featured: true,
        publishedAt: new Date('2023-07-15'),
        name: 'Emily Rodriguez',
        photo: ImageService.getProxyUrl('https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'),
        name_photo: 'Photo by Jane Doe',
        status: 'published',
        createdAt: new Date('2023-07-10')
      },
      {
        id: 'article3',
        title: 'Breaking the Glass Ceiling in Comedy Writing',
        description: 'A look at the structural barriers women face in comedy writing rooms and the trailblazers breaking through.',
        content: 'Full article content here...',
        contentFormat: 'plaintext',
        imageUrl: ImageService.getProxyUrl('https://images.unsplash.com/photo-1496449903678-68ddcb189a24?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'),
        imageType: 'url',
        imagePath: null,
        featured: false,
        publishedAt: new Date('2023-09-05'),
        name: 'Jessica Lee',
        photo: ImageService.getProxyUrl('https://images.unsplash.com/photo-1496449903678-68ddcb189a24?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'),
        name_photo: 'Photo by Sam Taylor',
        status: 'published',
        createdAt: new Date('2023-09-01')
      }
    ];

    // Sample quotes
    this.quotes = [
      {
        id: 1,
        carousel: 'main',
        quote: 'Feminism: the radical notion that women are people too!'
      },
      {
        id: 2,
        carousel: 'main',
        quote: 'In a world full of sharks, be a pinky toe - small but mighty enough to make someone curse when they least expect it.'
      },
      {
        id: 3,
        carousel: 'main',
        quote: 'Life is too short for boring shoes and men who don\'t get feminist jokes.'
      },
      {
        id: 4,
        carousel: 'Philo',
        quote: 'The pinky toe may be small, but it shoulders an unfair share of furniture encounters.'
      },
      {
        id: 5,
        carousel: 'Philo',
        quote: 'A pinky toe\'s strength isn\'t measured by its size, but by how loudly it makes you yell when it hits the coffee table.'
      }
    ];
  }
}

// Export appropriate storage implementation based on environment
export const storage: IStorage = airtableApiKey && airtableBaseId
  ? new AirtableStorage()
  : new MemStorage();
