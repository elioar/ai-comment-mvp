# Instagram Pages Setup Guide

To enable Instagram Business account access in your app, you need to configure your Facebook App in the Facebook Developer Console.

## Prerequisites

1. Your Instagram account must be a **Business** or **Creator** account (not a personal account)
2. Your Instagram account must be **linked to a Facebook Page** that you manage
3. You must have **Admin** or **Editor** access to the Facebook Page

## Step-by-Step Configuration

### 1. Go to Facebook Developers Console

Visit: https://developers.facebook.com/apps/

### 2. Select Your App

Click on your app (the one you're using for Facebook OAuth)

### 3. Add Instagram Basic Display Product (if not already added)

1. In the left sidebar, click **"Add Product"** or go to **"Products"**
2. Find **"Instagram Basic Display"** and click **"Set Up"**
   - Note: You might also see "Instagram Graph API" - that's for more advanced features
   - For basic access, "Instagram Basic Display" is sufficient

### 4. Configure App Permissions

1. Go to **"App Review"** → **"Permissions and Features"**
2. Request the following permissions:
   - ✅ `pages_read_engagement` (for Facebook pages)
   - ✅ `pages_show_list` (to list Facebook pages)
   - ✅ `pages_manage_posts` (to manage posts and comments)
   - ✅ `instagram_basic` (for Instagram account access)
   - ✅ `instagram_manage_comments` (to manage Instagram comments)

### 5. Add Instagram Test Users (for Development)

If your app is in **Development Mode**:

1. Go to **"Roles"** → **"Instagram Testers"**
2. Add Instagram accounts that you want to test with
3. The Instagram account owner must accept the invitation

### 6. Submit for App Review (for Production)

If you want to use this in production:

1. Go to **"App Review"** → **"Permissions and Features"**
2. Click **"Request"** next to each permission you need
3. Fill out the required information:
   - **Use Case**: "Manage comments on Instagram Business accounts"
   - **Instructions**: Explain that your app helps businesses manage and respond to Instagram comments
   - **Screencast**: Provide a video showing how your app uses the permission
4. Submit for review (can take 1-7 days)

### 7. Link Instagram to Facebook Page

**Important**: Each Instagram Business account must be linked to a Facebook Page:

1. Go to your Facebook Page settings
2. Navigate to **"Instagram"** in the left sidebar
3. Click **"Connect Account"** or **"Link Account"**
4. Enter your Instagram Business account credentials
5. Confirm the connection

### 8. Verify Your Configuration

After configuration, test by:

1. Connecting your Facebook account in your app
2. Checking if Instagram accounts appear in the pages list
3. If they don't appear, check:
   - Is the Instagram account a Business/Creator account?
   - Is it linked to a Facebook Page?
   - Do you have admin access to that Facebook Page?
   - Are the permissions approved?

## Current App Configuration

Your app is already configured with these scopes:
```
pages_read_engagement pages_show_list pages_manage_posts instagram_basic instagram_manage_comments
```

## Common Issues

### Issue: Instagram accounts don't appear
**Solution**: 
- Make sure Instagram account is Business/Creator type
- Verify it's linked to a Facebook Page
- Check that you have admin access to the Facebook Page

### Issue: Permission denied errors
**Solution**:
- Ensure permissions are approved in App Review
- If in Development Mode, add Instagram accounts as testers
- Re-authenticate your Facebook connection

### Issue: "Instagram account not found"
**Solution**:
- The Instagram account must be linked to the Facebook Page
- Only Business/Creator accounts work (not personal accounts)
- The Facebook Page must have the Instagram account connected in its settings

## Testing Checklist

- [ ] Instagram account is Business or Creator type
- [ ] Instagram account is linked to a Facebook Page
- [ ] You have admin access to the Facebook Page
- [ ] App permissions are requested/approved
- [ ] Instagram testers are added (if in Development Mode)
- [ ] Facebook OAuth connection works
- [ ] Instagram pages appear in the dashboard

## Need Help?

- Facebook Developer Docs: https://developers.facebook.com/docs/instagram-api/
- Instagram Graph API: https://developers.facebook.com/docs/instagram-api/overview
- Facebook Support: https://developers.facebook.com/support/

