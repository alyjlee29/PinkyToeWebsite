# Railway Deployment

This application is configured to deploy on Railway with the following setup:

## Environment Variables Required

Set these environment variables in your Railway project:

- `NODE_ENV=production`
- `DATABASE_URL` - PostgreSQL connection string (provided by Railway)
- `AIRTABLE_API_KEY` - Your Airtable API key
- `AIRTABLE_BASE_ID` - Your Airtable base ID

## Deployment

1. Connect your GitHub repository to Railway
2. Set the required environment variables
3. Railway will automatically build and deploy using the `railway.toml` configuration

The application will:
- Build the client and server using `npm run build`
- Start the server using `npm start`
- Serve the React client from the Express server
- Connect to PostgreSQL database for data persistence
- Sync with Airtable for content updates

## Local Development

```bash
npm install
npm run dev
```

The server runs on `http://localhost:5000` by default.