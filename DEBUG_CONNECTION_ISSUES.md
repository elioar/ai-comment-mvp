# Debugging Page Connection Issues

If pages are not connecting, follow these steps:

## Step 1: Check Browser Console

1. Open your browser's Developer Tools (F12)
2. Go to the **Console** tab
3. Try to connect a page
4. Look for messages that start with:
   - `Connecting page:` - Shows what page is being connected
   - `Page connected successfully:` - Confirms successful connection
   - `Failed to connect page:` - Shows the error

## Step 2: Check Network Tab

1. In Developer Tools, go to **Network** tab
2. Filter by **Fetch/XHR**
3. Try connecting a page
4. Look for the request to `/api/facebook/pages` (POST)
5. Check:
   - **Status Code**: Should be 200 (success) or check the error
   - **Response**: Click on the request and check the **Response** tab
   - **Request Payload**: Check what data is being sent

## Step 3: Check Server Logs

Check your server console/terminal for:
- `Page connected successfully:` - Confirms database save
- `Database error connecting page:` - Database issue
- `Error connecting page:` - General error

## Step 4: Verify Database

Check if the page was actually saved:

1. Run: `npm run db:studio`
2. Open the `ConnectedPage` table
3. Look for entries with your `pageId`
4. Check if `provider` matches (facebook/instagram)

## Step 5: Common Issues

### Issue: "Missing required fields"

**Check**: The page object might be missing `access_token`
**Solution**: Ensure Facebook OAuth completed successfully

### Issue: Database error (P2002)

**Check**: Unique constraint violation
**Solution**: Page might already be connected, try disconnecting first

### Issue: No error but page doesn't show as connected

**Check**: 
1. Is `fetchData()` being called after connection?
2. Are `connectedPages` being updated in state?
3. Is `isPageConnected` checking the right `pageId`?

### Issue: API returns 401 Unauthorized

**Check**: 
1. Is the user logged in?
2. Is the session valid?
3. Check if `session.user.id` exists

### Issue: API returns 500 Internal Server Error

**Check Server Logs** for the actual error message

## Step 6: Manual Test

Try connecting a page manually using curl or Postman:

```bash
POST /api/facebook/pages
Headers:
  Content-Type: application/json
  Cookie: (your session cookie)

Body:
{
  "pageId": "test-page-id",
  "pageName": "Test Page",
  "pageAccessToken": "test-token",
  "provider": "facebook"
}
```

## Step 7: Verify State Updates

After connecting, check:
1. Does the toggle switch move to "connected"?
2. Does the border color change (blue for Facebook, pink for Instagram)?
3. Does "View Comments" button appear?
4. After page refresh, is it still connected?

## Quick Fixes

1. **Clear browser cache and cookies**
2. **Refresh the page after connecting**
3. **Check if database is accessible**
4. **Verify environment variables are set**
5. **Check if Facebook access token is valid**

## Still Not Working?

Share these details:
1. Browser console errors
2. Network tab request/response
3. Server logs
4. Database entries (if any)
5. Steps to reproduce

