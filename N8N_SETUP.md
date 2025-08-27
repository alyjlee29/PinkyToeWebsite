# 🚀 N8N Setup for PinkyToeWebsite

## Step 1: Create Your .env File

Create a `.env` file in your project root with your credentials:

```bash
# Database
DATABASE_URL=postgresql://<username>:<password>@<host>/<database>?sslmode=require

# Discord Integration
DISCORD_BOT_TOKEN=<your_discord_bot_token>
DISCORD_CLIENT_ID=<your_discord_client_id>

# Airtable Integration
AIRTABLE_API_KEY=<your_airtable_api_key>
AIRTABLE_BASE_ID=<your_airtable_base_id>

# Instagram Integration (via Facebook)
FACEBOOK_APP_ID=<your_facebook_app_id>
FACEBOOK_APP_SECRET=<your_facebook_app_secret>
INSTAGRAM_APP_ID=<your_instagram_app_id>
INSTAGRAM_APP_SECRET=<your_instagram_app_secret>
INSTAGRAM_ACCESS_TOKEN=<your_instagram_access_token>
INSTAGRAM_ACCOUNT_ID=<your_instagram_account_id>

# Imgur Integration
IMGUR_CLIENT_ID=<your_imgur_client_id>
IMGUR_CLIENT_SECRET=<your_imgur_client_secret>

# Session Secret
SESSION_SECRET=<random_secure_session_string>

# Frontend variables
VITE_FACEBOOK_APP_ID=${FACEBOOK_APP_ID}
BASE_URL=

# Admin API protection for server-side endpoints
ADMIN_API_TOKEN=<strong_random_token>

# Server Configuration
NODE_ENV=development
PORT=5000
HOST=0.0.0.0
```

## Step 2: Install N8N

```bash
# Install N8N globally
npm install -g n8n

# Or add to your project
npm install n8n
```

## Step 3: Start N8N

```bash
# Start N8N (it will run on port 5678)
n8n start

# Or with custom port
n8n start --port 5679
```

## Step 4: N8N Workflow Configuration

### **Workflow: Article Submission Pipeline**

**Nodes in Order:**

1. **Google Forms Trigger**
   - Form ID: Your Google Form ID
   - Trigger: On form submission

2. **Code Node (Data Processing)**
   ```javascript
   // Transform Google Form data
   const formData = $input.all()[0].json;
   
   const articleData = {
     title: formData.title,
     content: formData.content,
     author: formData.author,
     imageUrl: formData.imageUrl || '',
     excerpt: formData.excerpt || formData.content.substring(0, 150) + '...',
     featured: formData.featured === 'true',
     status: 'draft'
   };
   
   return [{ json: articleData }];
   ```

3. **HTTP Request Node (PinkyToeWebsite API)**
   - Method: POST
   - URL: `http://localhost:5000/api/admin/articles/submit`
   - Headers: `Content-Type: application/json`
   - Body: `{{ $json }}`

4. **Airtable Node (Store Article)**
   - Operation: Create
   - Base ID: `<your_airtable_base_id>`
   - Table: `History` (your articles table)
   - Fields: Map from previous node

5. **Email Node (Notification)**
   - Service: Gmail
   - To: Your email
   - Subject: `New Article Submission: {{ $json.title }}`
   - Body: Article details

## Step 5: Test Your Setup

1. **Start your PinkyToeWebsite server:**
   ```bash
   npm run dev
   ```

2. **Start N8N:**
   ```bash
   n8n start
   ```

3. **Access N8N:** `http://localhost:5678`

4. **Test the workflow** by submitting a Google Form

## Step 6: Google Form Setup

Create a Google Form with these fields:
- **Title** (Short answer)
- **Content** (Long answer)
- **Author** (Short answer)
- **Image URL** (Short answer)
- **Excerpt** (Long answer)
- **Featured** (Multiple choice: Yes/No)

## Step 7: Airtable Integration

Your Airtable base (`<your_airtable_base_id>`) should have:
- **History table** for articles
- **Teams table** for team members
- **CarouselQuote table** for quotes

## Benefits of This Setup:

✅ **Visual Workflow Builder** - Drag-and-drop interface
✅ **Real-time Processing** - Instant article submission
✅ **Airtable Integration** - Direct sync with your existing data
✅ **Email Notifications** - Immediate alerts for new submissions
✅ **Error Handling** - Built-in retry and error management
✅ **Scalable** - Easy to add more automation steps

## Next Steps:

1. **Set up the Google Form**
2. **Configure the N8N workflow**
3. **Test the complete pipeline**
4. **Add additional automation** (social media posting, etc.)

Your existing Airtable integration will work perfectly with this N8N setup! 