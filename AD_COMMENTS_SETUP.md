# Facebook Ads Comments Setup Guide

This application now supports fetching and displaying comments from Facebook Ads! 

## Features Added

✅ **Database Schema Updates**
- Added `isFromAd`, `adId`, and `adName` fields to Comment model
- Added `adAccountId` field to ConnectedPage model
- Added database indexes for better performance

✅ **Facebook OAuth Permissions**
- Added `ads_read` permission to Facebook OAuth scope
- Allows reading ads data from Facebook Ad Accounts

✅ **API Updates**
- New `fetchAdsComments()` function to fetch comments from promoted posts/ads
- Integrated ads comment fetching into background and manual refresh modes
- Comments from ads are properly tagged and stored

✅ **UI Updates**
- Comments from ads display a yellow "Ad" badge
- Ad name is available in the comment metadata
- Seamless integration with existing comment management features

## Setup Instructions

### 1. Reconnect Facebook Account

Since we've added new permissions (`ads_read`), users need to reconnect their Facebook account:

1. Go to **Dashboard → Settings** (or wherever Facebook connection is managed)
2. Disconnect current Facebook connection
3. Reconnect Facebook - this will request the new permissions

### 2. Add Ad Account ID to Connected Pages

To fetch ad comments, you need to configure the Ad Account ID for each Facebook page:

**Option A: Manual Database Update**
```sql
-- Update the ConnectedPage with your Ad Account ID
UPDATE "ConnectedPage" 
SET "adAccountId" = 'YOUR_AD_ACCOUNT_ID' 
WHERE "pageId" = 'YOUR_PAGE_ID';
```

**Option B: Add UI for Ad Account Management** (Recommended for production)
- Create a settings page where users can input their Facebook Ad Account ID
- The Ad Account ID can be found in Facebook Ads Manager (format: `act_XXXXXXXXXX`)
- For the API, use just the numeric part (without `act_` prefix)

### 3. Find Your Ad Account ID

1. Go to [Facebook Ads Manager](https://www.facebook.com/adsmanager)
2. Click on the account dropdown in the top left
3. Select "See all ad accounts"
4. Your Ad Account ID will be shown (format: `XXXXXXXXXX`)

## How It Works

### Ads Comment Fetching Process

1. **Background Fetch Mode**: 
   - Fetches regular post comments first
   - Then fetches ads comments if `adAccountId` is configured
   - Only fetches comments from active/paused ads with promoted posts

2. **Manual Refresh Mode**:
   - Same process as background fetch
   - Returns all comments together (posts + ads)

3. **Ad Detection**:
   - Only fetches ads with `effective_object_story_id` (promoted posts)
   - Other ad types (image/video ads without posts) are not supported yet

### API Endpoints

- **GET** `/api/facebook/comments?pageId={pageId}&background=true`
  - Returns cached comments and starts background fetch
  - Now includes comments from ads

### Data Structure

Comments from ads include these additional fields:
```typescript
{
  // ... regular comment fields ...
  isFromAd: true,
  adId: "123456789",  // Facebook Ad ID
  adName: "Summer Sale Campaign"  // Ad name for reference
}
```

## UI Features

### Comment List View
- Comments from ads show a **yellow "Ad" badge** with a play icon
- Hover over the badge to see the full ad name
- All other features work the same (reply, hide, sentiment analysis, etc.)

### Filtering (Future Enhancement)
You can add filtering to show only ad comments or exclude them:
```typescript
// Filter to show only ad comments
const adComments = comments.filter(c => c.isFromAd);

// Filter to exclude ad comments
const regularComments = comments.filter(c => !c.isFromAd);
```

## Troubleshooting

### No Ad Comments Appearing

1. **Check if adAccountId is set**:
   ```sql
   SELECT "pageId", "pageName", "adAccountId" 
   FROM "ConnectedPage";
   ```

2. **Verify Facebook permissions**:
   - Check if `ads_read` permission was granted
   - User must have access to the Ad Account in Facebook

3. **Check if ads have promoted posts**:
   - Only ads with `effective_object_story_id` will have fetchable comments
   - Image/video ads without posts don't support comments in the same way

4. **Review server logs**:
   - Look for "Facebook Ads: Fetching ads from account" messages
   - Check for any API errors

### Permission Errors

If you see permission errors:
- Ensure the user has admin access to the Facebook Ad Account
- Verify the page is connected to the ad account
- Reconnect Facebook account to refresh permissions

## Technical Details

### Database Schema

```prisma
model ConnectedPage {
  // ... existing fields ...
  adAccountId String? // Facebook Ad Account ID
}

model Comment {
  // ... existing fields ...
  isFromAd Boolean @default(false)
  adId     String?
  adName   String?
}
```

### Facebook Graph API Calls

```
GET /act_{ad-account-id}/ads
  ?fields=id,name,creative{effective_object_story_id},status
  &filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]
  
GET /{post-id}/comments
  ?fields=id,message,from,created_time
```

## Future Enhancements

Potential improvements:
- [ ] UI for managing Ad Account IDs per page
- [ ] Filter comments by source (posts vs ads)
- [ ] Show ad performance metrics alongside comments
- [ ] Support for Instagram ad comments (different API flow)
- [ ] Bulk operations on ad comments only
- [ ] Ad campaign grouping and analytics

## Support

For issues or questions:
1. Check server logs for detailed error messages
2. Verify Facebook permissions in Facebook Developer Console
3. Ensure Ad Account is properly linked to the Page

---

**Last Updated**: January 2, 2026

