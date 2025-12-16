# Vercel Deployment Guide

## Environment Variables Setup

Add these environment variables in your Vercel project settings:

### Required Environment Variables

1. **NEXTAUTH_URL**
   ```
   https://my-comments-rosy.vercel.app
   ```

2. **NEXTAUTH_SECRET**
   ```
   [Generate a secure random string]
   ```
   Generate with: `openssl rand -base64 32`

3. **DATABASE_URL**
   ```
   [Your PostgreSQL connection string]
   ```
   Example: `postgresql://user:password@host:5432/database?schema=public`

4. **FACEBOOK_CLIENT_ID**
   ```
   [Your Facebook App ID]
   ```

5. **FACEBOOK_CLIENT_SECRET**
   ```
   [Your Facebook App Secret]
   ```

### Optional Environment Variables

- `GOOGLE_CLIENT_ID` (if using Google OAuth)
- `GOOGLE_CLIENT_SECRET` (if using Google OAuth)
- `RESEND_API_KEY` (if using email features)
- `EMAIL_FROM` (if using email features)

## Facebook App Configuration

### Step 1: Update Facebook App Settings

1. Go to https://developers.facebook.com/apps
2. Select your app
3. Go to **Settings** > **Basic**
4. Add to **App Domains**:
   ```
   my-comments-rosy.vercel.app
   ```

### Step 2: Configure OAuth Redirect URIs

1. Go to **Products** > **Facebook Login** > **Settings**
2. Add to **Valid OAuth Redirect URIs**:
   ```
   https://my-comments-rosy.vercel.app/api/auth/callback/facebook
   ```
3. Click **Save Changes**

### Step 3: Update Site URL

1. In **Settings** > **Basic**
2. Set **Site URL** to:
   ```
   https://my-comments-rosy.vercel.app
   ```

## Vercel Deployment Steps

### 1. Connect Your Repository

1. Go to https://vercel.com
2. Click **New Project**
3. Import your Git repository
4. Configure the project

### 2. Add Environment Variables

1. In your Vercel project, go to **Settings** > **Environment Variables**
2. Add all the environment variables listed above
3. Make sure to set them for **Production**, **Preview**, and **Development** environments

### 3. Deploy

1. Push your code to your Git repository
2. Vercel will automatically deploy
3. Or manually trigger a deployment from the Vercel dashboard

### 4. Verify Deployment

1. Visit: https://my-comments-rosy.vercel.app
2. Test Facebook login
3. Check that pages can be connected
4. Verify comments can be fetched

## Database Setup

### Option 1: Vercel Postgres (Recommended)

1. In Vercel dashboard, go to **Storage**
2. Create a new **Postgres** database
3. Copy the connection string
4. Add it as `DATABASE_URL` environment variable

### Option 2: External Database

Use any PostgreSQL provider:
- Supabase
- Neon
- Railway
- AWS RDS
- etc.

Make sure the connection string is in this format:
```
postgresql://user:password@host:5432/database?schema=public
```

## Post-Deployment Checklist

- [ ] Environment variables are set in Vercel
- [ ] Facebook App settings updated with production domain
- [ ] Facebook OAuth redirect URI added
- [ ] Database is accessible from Vercel
- [ ] NEXTAUTH_URL matches your Vercel domain
- [ ] Test Facebook login works
- [ ] Test page connection works
- [ ] Test comment fetching works

## Troubleshooting

### "Invalid redirect URI"
- Double-check the redirect URI in Facebook App settings matches exactly
- No trailing slashes
- Must be HTTPS

### "Database connection failed"
- Check DATABASE_URL format
- Ensure database allows connections from Vercel IPs
- Check if SSL is required (add `?sslmode=require` if needed)

### "NEXTAUTH_URL mismatch"
- Ensure NEXTAUTH_URL in Vercel matches your actual domain
- No trailing slash
- Must be HTTPS

### "Session not working"
- Check NEXTAUTH_SECRET is set
- Restart deployment after adding environment variables

## Custom Domain (Optional)

If you want to use a custom domain:

1. Add your domain in Vercel project settings
2. Update `NEXTAUTH_URL` to your custom domain
3. Update Facebook App settings with your custom domain
4. Update OAuth redirect URI to use custom domain

