# Railway Environment Variables Configuration

## Web Service Environment Variables

### Required for Production

1. **`VITE_API_URL`** - The full URL of your API service
   - Example: `https://api-development-xxxx.up.railway.app`
   - Or if you have a custom domain: `https://api.boazos.app`
   - **Important:** This must be set for the web app to communicate with the API

### Optional

- Any other Vite environment variables your app needs (prefixed with `VITE_`)

## API Service Environment Variables

### Required

1. **`ORIGIN`** - Comma-separated list of allowed CORS origins
   - Must include your web service domain(s)
   - Example: `https://demo.boazos.app,https://www.boazos.app`
   - Or use wildcard: `*` (allows all origins - less secure)
   - Railway preview domains are automatically allowed

2. **`MONGO_URL`** - MongoDB connection string
   - Get this from your Railway MongoDB service

3. **`PORT`** - Port number (default: 3000)
   - Railway usually sets this automatically

4. **`NODE_ENV`** - Set to `production`

5. **`JWT_SECRET`** - JWT secret key (minimum 24 characters)
   - Use a strong, random secret in production

### Optional

- See `apps/api/env.example` for all available environment variables

## How to Find Your API Service URL

1. Go to Railway Dashboard
2. Click on your **API service**
3. Go to **Settings** → **Networking**
4. Copy the public domain (e.g., `api-development-xxxx.up.railway.app`)
5. Use this as the `VITE_API_URL` in your Web service

## Quick Setup Checklist

### Web Service:
- [ ] Set `VITE_API_URL` to your API service URL

### API Service:
- [ ] Set `ORIGIN` to include `https://demo.boazos.app`
- [ ] Set `MONGO_URL` from your MongoDB service
- [ ] Set `NODE_ENV=production`
- [ ] Set `JWT_SECRET` (strong random string, min 24 chars)
- [ ] Set `PORT` (usually auto-set by Railway)

## Example Configuration

### Web Service Variables:
```
VITE_API_URL=https://api-development-1960.up.railway.app
```

### API Service Variables:
```
ORIGIN=https://demo.boazos.app,https://www.boazos.app
MONGO_URL=mongodb+srv://...
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-min-24-chars
PORT=3000
```
