import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { analyzeCommentSentiment } from '@/lib/openai';

const { auth } = NextAuth(authOptions);

// Helper function to fetch ads and their comments
async function fetchAdsComments(
  connectedPageId: string,
  adAccountId: string,
  pageAccessToken: string,
  fetchSince: Date | null,
  userId: string,
  isInstagram: boolean
): Promise<{ newCommentsCount: number; totalCommentsFetched: number }> {
  let newCommentsCount = 0;
  let totalCommentsFetched = 0;

  try {
    const platform = isInstagram ? 'Instagram' : 'Facebook';
    console.log(`🔍 [${platform} Ad Comments] Starting fetch for Ad Account: ${adAccountId}`);

    // Marketing API (ads list) generally requires a USER access token with ads_read.
    const account = await prisma.account.findFirst({
      where: {
        userId,
        provider: 'facebook',
      },
      select: {
        access_token: true,
      },
    });

    const marketingAccessToken = account?.access_token;
    if (!marketingAccessToken) {
      console.log(`⚠️  [${platform} Ad Comments] No marketing access token found - skipping ad comments`);
      return { newCommentsCount, totalCommentsFetched };
    }
    
    // Normalize ad account id (people often paste "act_123...", while our code adds "act_" itself)
    const normalizedAdAccountId = String(adAccountId || '').trim().replace(/^act_/i, '');
    if (!normalizedAdAccountId) {
      console.log(`⚠️  [${platform} Ad Comments] Invalid ad account ID - skipping ad comments`);
      return { newCommentsCount, totalCommentsFetched };
    }


    // Fetch ads from the ad account
    // Ads comments are comments on the post/media behind the ad.
    // Facebook: creative.effective_object_story_id (fallback: creative.object_story_id) => /{post_id}/comments
    // Instagram: effective_instagram_media_id (Marketing API) => /{ig_media_id}/comments
    const adsFields = isInstagram
      ? 'id,name,effective_instagram_media_id,creative{effective_instagram_media_id,object_story_spec},status,effective_status,permalink_url'
      : 'id,name,creative{effective_object_story_id,object_story_id},status,effective_status,permalink_url';

    // First, fetch ALL ads to see what we have (for debugging)
    const allAdsUrl = `https://graph.facebook.com/v24.0/act_${normalizedAdAccountId}/ads?access_token=${marketingAccessToken}&fields=${encodeURIComponent(adsFields)}&limit=100`;
    const allAdsResponse = await fetch(allAdsUrl);
    
    if (!allAdsResponse.ok) {
      const errorText = await allAdsResponse.text();
      console.log(`❌ [${platform} Ad Comments] Failed to fetch ads: ${errorText.substring(0, 200)}`);
      return { newCommentsCount, totalCommentsFetched };
    }
    
    const allAdsData = await allAdsResponse.json();
    const allAds = allAdsData.data || [];
    
    // Log all ads with their statuses
    if (allAds.length > 0) {
      console.log(`📊 [${platform} Ads] Ad Account: act_${normalizedAdAccountId} | Found ${allAds.length} total ads`);
      allAds.forEach((ad: any) => {
        const permalink = ad.permalink_url || 'N/A';
        console.log(`   - Ad ID: ${ad.id} | Name: ${ad.name || 'N/A'} | Status: ${ad.status || 'N/A'} | Effective Status: ${ad.effective_status || 'N/A'} | Link: ${permalink}`);
      });
      
      // Filter for only ACTIVE ads
      const ads = allAds.filter((ad: any) => ad.effective_status === 'ACTIVE');
      console.log(`📢 [${platform} Ads] Ad Account: act_${normalizedAdAccountId} | Found ${ads.length} ACTIVE ads (filtered from ${allAds.length} total)`);
      
      if (ads.length === 0 && allAds.length > 0) {
        const statusCounts: Record<string, number> = {};
        allAds.forEach((ad: any) => {
          const status = ad.effective_status || 'UNKNOWN';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        console.log(`⚠️  [${platform} Ads] Ad Account: act_${normalizedAdAccountId} | No ACTIVE ads found. Status breakdown:`, statusCounts);
      }
    } else {
      console.log(`ℹ️  [${platform} Ads] Ad Account: act_${normalizedAdAccountId} | No ads found at all`);
    }
    
    // Filter for only ACTIVE ads
    const ads = allAds.filter((ad: any) => ad.effective_status === 'ACTIVE');
    
    // Process ads in batches
    const batchSize = 5;
    for (let i = 0; i < ads.length; i += batchSize) {
      const batch = ads.slice(i, i + batchSize);
      
      const commentFetchPromises = batch.map(async (ad: any) => {
        try {
          let targetId: string | undefined;

          if (isInstagram) {
            targetId = ad.effective_instagram_media_id || ad.creative?.effective_instagram_media_id;
          } else {
            targetId = ad.creative?.effective_object_story_id || ad.creative?.object_story_id;
          }
          
          if (!targetId) {
            return { ad, comments: [], error: null };
          }
          
          // Fetch comments for this ad's post/media (comments are on the underlying object, not a separate "ads comments" API)
          // Try with page access token first (preferred), then fallback to user token if needed
          const commentFields = isInstagram ? 'id,text,username,timestamp' : 'id,message,from,created_time';
          
          // Build base URL
          const baseCommentsUrl = `https://graph.facebook.com/v24.0/${targetId}/comments?access_token=${pageAccessToken}&fields=${commentFields}&limit=50`;
          let commentsUrl = baseCommentsUrl;
          
          if (fetchSince) {
            const sinceTimestamp = Math.floor(fetchSince.getTime() / 1000);
            commentsUrl += `&since=${sinceTimestamp}`;
          }
          
          let commentsResponse = await fetch(commentsUrl);
          let useUserToken = false;
          
          // If page token fails with permission error, try with user token as fallback
          if (!commentsResponse.ok) {
            const errorText = await commentsResponse.text();
            const errorData = JSON.parse(errorText);
            
            // Check if it's a permission error (code 10) and try user token
            if (errorData.error?.code === 10 && marketingAccessToken) {
              useUserToken = true;
              commentsUrl = `https://graph.facebook.com/v24.0/${targetId}/comments?access_token=${marketingAccessToken}&fields=${commentFields}&limit=50`;
              if (fetchSince) {
                const sinceTimestamp = Math.floor(fetchSince.getTime() / 1000);
                commentsUrl += `&since=${sinceTimestamp}`;
              }
              
              commentsResponse = await fetch(commentsUrl);
              
              if (!commentsResponse.ok) {
                return { ad, comments: [], error: await commentsResponse.text() };
              }
            } else {
              return { ad, comments: [], error: errorText };
            }
          }
          
          // Fetch all comments with pagination
          let allComments: any[] = [];
          let nextUrl: string | null = null;
          let pageCount = 0;
          
          do {
            if (nextUrl) {
              commentsResponse = await fetch(nextUrl);
              if (!commentsResponse.ok) {
                break;
              }
            }
            
            const commentsData = await commentsResponse.json();
            const pageComments = commentsData.data || [];
            allComments = [...allComments, ...pageComments];
            pageCount++;
            
            // Get next page URL from pagination
            nextUrl = commentsData.paging?.next || null;
            
            if (nextUrl && pageComments.length > 0) {
              console.log(`📄 [${platform} Ad Comments] Ad ID: ${ad.id} | Fetched page ${pageCount} with ${pageComments.length} comments (total so far: ${allComments.length})`);
            }
          } while (nextUrl);
          
          if (pageCount > 1) {
            console.log(`📚 [${platform} Ad Comments] Ad ID: ${ad.id} | Completed pagination: ${pageCount} pages, ${allComments.length} total comments`);
          }
          
          return { ad, comments: allComments, error: null };
        } catch (error) {
          return { ad, comments: [], error };
        }
      });
      
      const batchResults = await Promise.all(commentFetchPromises);
      
      // Process comments from ads
      for (const { ad, comments, error } of batchResults) {
        if (error) {
          console.log(`⚠️  [${platform} Ad Comments] Error fetching comments for Ad ID ${ad.id}: ${error}`);
          continue;
        }
        
        totalCommentsFetched += comments.length;
        
        if (comments.length > 0) {
          console.log(`📝 [${platform} Ad Comments] Ad ID: ${ad.id} | Found ${comments.length} comment(s)`);
        }
        
        for (const comment of comments) {
          // Instagram and Facebook have different field names
          let commentCreatedAt: Date;
          let commentMessage: string;
          let authorName: string;
          let authorId: string;

          if (isInstagram) {
            commentCreatedAt = new Date(comment.timestamp);
            commentMessage = comment.text || '';
            authorName = comment.username || 'Unknown';
            authorId = comment.id || '';
          } else {
            commentCreatedAt = new Date(comment.created_time);
            commentMessage = comment.message || '';
            authorName = comment.from?.name || 'Unknown';
            authorId = comment.from?.id || '';
          }
          
          const shouldProcess = !fetchSince || commentCreatedAt > fetchSince;
          
          if (!shouldProcess) {
            console.log(`⏭️  [${platform} Ad Comments] Skipping old comment from Ad ID ${ad.id} (created: ${commentCreatedAt.toISOString()}, fetchSince: ${fetchSince?.toISOString() || 'none'})`);
          }
          
          if (shouldProcess) {
            const postId = isInstagram
              ? (ad.effective_instagram_media_id || ad.creative?.effective_instagram_media_id || '')
              : (ad.creative?.effective_object_story_id || ad.creative?.object_story_id || '');
            
            const savedComment = await prisma.comment.upsert({
              where: {
                pageId_commentId: {
                  pageId: connectedPageId,
                  commentId: comment.id,
                },
              },
              update: {
                message: commentMessage,
                authorName: authorName,
                authorId: authorId,
                isFromAd: true,
                adId: ad.id,
                adName: ad.name,
              },
              create: {
                pageId: connectedPageId,
                commentId: comment.id,
                postId: postId,
                message: commentMessage,
                authorName: authorName,
                authorId: authorId,
                createdAt: commentCreatedAt,
                isFromAd: true,
                adId: ad.id,
                adName: ad.name,
              },
            });
            
            // Log ad comment fetch
            const platform = isInstagram ? 'Instagram' : 'Facebook';
            const mediaId = postId || 'N/A';
            const commentPreview = commentMessage.substring(0, 100) + (commentMessage.length > 100 ? '...' : '');
            
            // Construct ad link
            let adLink: string;
            if (ad.permalink_url) {
              adLink = ad.permalink_url;
            } else if (isInstagram && mediaId && mediaId !== 'N/A') {
              // Instagram media link format
              adLink = `https://www.instagram.com/p/${mediaId}/`;
            } else if (!isInstagram && mediaId && mediaId !== 'N/A') {
              // Facebook post link format: pageId_postId
              const parts = mediaId.split('_');
              if (parts.length === 2) {
                adLink = `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
              } else {
                adLink = `https://www.facebook.com/ads/library/?id=${ad.id}`;
              }
            } else {
              // Fallback to Ad Library link
              adLink = `https://www.facebook.com/ads/library/?id=${ad.id}`;
            }
            
            console.log(`📢 [${platform} Ad Comment] Ad Account: act_${normalizedAdAccountId} | Ad ID: ${ad.id} | Media/Post ID: ${mediaId} | Ad Link: ${adLink} | ${authorName}: ${commentPreview}`);
            
            // Analyze sentiment if not already set
            if (!savedComment.sentiment) {
              const sentiment = await analyzeCommentSentiment(commentMessage);
              if (sentiment) {
                await prisma.comment.update({
                  where: { id: savedComment.id },
                  data: { sentiment },
                });
              }
            }
            
            newCommentsCount++;
          }
        }
      }
    }
    
    if (totalCommentsFetched > 0) {
      console.log(`✅ [${platform} Ad Comments] Completed: ${newCommentsCount} new comments saved, ${totalCommentsFetched} total comments fetched`);
    } else {
      console.log(`ℹ️  [${platform} Ad Comments] No comments found in ads`);
    }
  } catch (error) {
    console.error(`❌ [${platform} Ad Comments] Error:`, error);
  }
  
  return { newCommentsCount, totalCommentsFetched };
}

// Background function to fetch comments from Facebook/Instagram API
export async function fetchCommentsInBackground(
  pageId: string,
  connectedPageId: string,
  userId: string,
  isInstagram: boolean,
  currentPageAccessToken: string,
  fetchSince: Date | null
): Promise<void> {
  try {
    // Helper function to refresh page access token
    const refreshPageAccessToken = async (): Promise<string | null> => {
      try {
        // Get user's Facebook account access token
        const account = await prisma.account.findFirst({
          where: {
            userId: userId,
            provider: 'facebook',
          },
        });
        
        if (!account?.access_token) {
          return null;
        }
        
        
        let targetPageId = pageId;
        let facebookPageId: string | null = null;
        
        // For Instagram, we need to find the Facebook Page ID that owns this Instagram account
        if (isInstagram) {
          try {
            // Get the Facebook Page ID from the Instagram Business Account
            const instagramAccountUrl = `https://graph.facebook.com/v24.0/${pageId}?fields=connected_facebook_page&access_token=${account.access_token}`;
            const instagramAccountResponse = await fetch(instagramAccountUrl);
            
            if (instagramAccountResponse.ok) {
              const instagramAccountData = await instagramAccountResponse.json();
              if (instagramAccountData.connected_facebook_page?.id) {
                facebookPageId = instagramAccountData.connected_facebook_page.id;
                targetPageId = instagramAccountData.connected_facebook_page.id;
              }
            } else {
              const errorText = await instagramAccountResponse.text();
              try {
                const errorData = JSON.parse(errorText);
                // Rate limit or other error - continue to try /me/accounts
              } catch (e) {
                // Continue
              }
            }
          } catch (instagramError) {
            // Continue - will try to find via /me/accounts
          }
        }
        
        // Fetch fresh Page access token from Facebook using /me/accounts endpoint
        const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?access_token=${account.access_token}&fields=id,name,access_token&limit=100`;
        const pagesResponse = await fetch(pagesUrl);
        
        if (pagesResponse.ok) {
          const pagesData = await pagesResponse.json();
          let page = pagesData.data?.find((p: any) => p.id === targetPageId);
          
          // If not found and it's Instagram, try to find by checking which page has this Instagram account
          if (!page && isInstagram) {
            const instagramChecks = (pagesData.data || []).map(async (fbPage: any) => {
              try {
                const instagramCheckUrl = `https://graph.facebook.com/v24.0/${fbPage.id}?fields=instagram_business_account&access_token=${fbPage.access_token}`;
                const instagramCheckResponse = await fetch(instagramCheckUrl);
                if (instagramCheckResponse.ok) {
                  const instagramCheckData = await instagramCheckResponse.json();
                  if (instagramCheckData.instagram_business_account?.id === pageId) {
                    return fbPage;
                  }
                }
              } catch (e) {
                // Continue
              }
              return null;
            });
            
            const results = await Promise.all(instagramChecks);
            const foundPage = results.find(p => p !== null);
            if (foundPage) {
              page = foundPage;
              targetPageId = foundPage.id;
            }
          }
          
          if (page?.access_token) {
            // Update the stored page access token
            await prisma.connectedPage.update({
              where: { id: connectedPageId },
              data: { pageAccessToken: page.access_token },
            });
            
            return page.access_token;
          } else {
          }
        } else {
          const errorText = await pagesResponse.text();
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error) {
              const errorCode = errorData.error.code;
              const errorMessage = errorData.error.message || '';
              
              if (errorCode === 4) {
              } else {
              }
            }
          } catch (parseError) {
          }
        }
      } catch (error) {
      }
      return null;
    };

    let pageAccessToken = currentPageAccessToken;
    let tokenRefreshedOnce = false;
    let hasErrorCode10 = false;
    const now = new Date();

    // Fetch recent posts/media from the page to get their comments
    let posts: any[] = [];
    let postsFetchSuccess = false;
    
    try {
      let postsUrl: string;
      
      if (isInstagram) {
        postsUrl = `https://graph.facebook.com/v24.0/${pageId}/media?access_token=${pageAccessToken}&fields=id,caption,timestamp,media_url,thumbnail_url&limit=50`;
      } else {
        postsUrl = `https://graph.facebook.com/v24.0/${pageId}/posts?access_token=${pageAccessToken}&fields=id,message,created_time,full_picture,attachments&limit=50`;
      }
      
      const postsResponse = await fetch(postsUrl);

      if (postsResponse.ok) {
        const postsData = await postsResponse.json();
        posts = postsData.data || [];
        postsFetchSuccess = true;
      } else {
        const errorText = await postsResponse.text();
        
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            const errorCode = errorData.error.code;
            const errorType = errorData.error.type || 'Unknown';
            const errorMessage = errorData.error.message || '';
            
            if (errorCode === 10 && !isInstagram) {
              hasErrorCode10 = true;
            } else if (errorCode === 190 || errorCode === 200 || errorType === 'OAuthException') {
              
              // For Instagram, try to refresh token if it's a token error
              if (isInstagram) {
                try {
                  const refreshedToken = await refreshPageAccessToken();
                  if (refreshedToken) {
                    pageAccessToken = refreshedToken;
                    tokenRefreshedOnce = true;
                    // Retry the media fetch with the new token
                    const retryPostsUrl = `https://graph.facebook.com/v24.0/${pageId}/media?access_token=${pageAccessToken}&fields=id,caption,timestamp,media_url,thumbnail_url&limit=50`;
                    const retryPostsResponse = await fetch(retryPostsUrl);
                    
                    if (retryPostsResponse.ok) {
                      const retryPostsData = await retryPostsResponse.json();
                      posts = retryPostsData.data || [];
                      postsFetchSuccess = true;
                    } else {
                    }
                  } else {
                  }
                } catch (refreshError) {
                }
              }
            } else if (errorCode === 4) {
            } else {
            }
          }
        } catch (e) {
        }
        
        // For Facebook, try /feed endpoint as fallback
        if (!isInstagram) {
          try {
            const feedUrl = `https://graph.facebook.com/v24.0/${pageId}/feed?access_token=${pageAccessToken}&fields=id,message,created_time,full_picture,attachments&limit=50`;
            const feedResponse = await fetch(feedUrl);
            
            if (feedResponse.ok) {
              const feedData = await feedResponse.json();
              posts = feedData.data || [];
              postsFetchSuccess = true;
            }
          } catch (feedError) {
            // Silent fail
          }
        }
        
        // If we still can't fetch new posts, try to get post IDs from existing comments
        if (!postsFetchSuccess) {
          const existingComments = await prisma.comment.findMany({
            where: {
              pageId: connectedPageId,
            },
            select: {
              postId: true,
            },
            distinct: ['postId'],
            take: 10,
          });
          
          posts = existingComments.map(c => ({ id: c.postId }));
          if (posts.length > 0) {
          }
        }
      }
    } catch (error) {
      // Try to get post IDs from existing comments
      const existingComments = await prisma.comment.findMany({
        where: {
          pageId: connectedPageId,
        },
        select: {
          postId: true,
        },
        distinct: ['postId'],
        take: 10,
      });
      posts = existingComments.map(c => ({ id: c.postId }));
    }

    // Fetch comments for each post
    let newCommentsCount = 0;
    let commentsFetchSuccess = false;
    let totalCommentsFetched = 0;
    let skippedCommentsCount = 0;
    
    if (posts.length > 0) {
    }
    
    // Fetch comments for all posts in parallel for better performance
    const batchSize = 10;
    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);
      
      const commentFetchPromises = batch.map(async (post) => {
        try {
          let commentsUrl: string;
          
          if (isInstagram) {
            commentsUrl = `https://graph.facebook.com/v24.0/${post.id}/comments?access_token=${pageAccessToken}&fields=id,text,username,timestamp&limit=50`;
          } else {
            commentsUrl = `https://graph.facebook.com/v24.0/${post.id}/comments?access_token=${pageAccessToken}&fields=id,message,from,created_time&limit=50`;
          }
          
          if (fetchSince) {
            const sinceTimestamp = Math.floor(fetchSince.getTime() / 1000);
            commentsUrl += `&since=${sinceTimestamp}`;
          }
          
          const commentsResponse = await fetch(commentsUrl);
          return { post, commentsResponse, error: null };
        } catch (error) {
          return { post, commentsResponse: null, error };
        }
      });
      
      const batchResults = await Promise.all(commentFetchPromises);
      
      // Process batch results
      for (const { post, commentsResponse, error } of batchResults) {
        if (error) {
          continue;
        }
        
        if (!commentsResponse) continue;
        
        try {
          if (commentsResponse.ok) {
            commentsFetchSuccess = true;
            const commentsData = await commentsResponse.json();
            const comments = commentsData.data || [];
            totalCommentsFetched += comments.length;

            for (const comment of comments) {
              let commentCreatedAt: Date;
              let commentMessage: string;
              let authorName: string;
              let authorId: string;
              
              if (isInstagram) {
                commentCreatedAt = new Date(comment.timestamp);
                commentMessage = comment.text || '';
                authorName = comment.username || 'Unknown';
                authorId = comment.id || '';
              } else {
                commentCreatedAt = new Date(comment.created_time);
                commentMessage = comment.message || '';
                authorName = comment.from?.name || 'Unknown';
                authorId = comment.from?.id || '';
              }
              
              const shouldProcess = !fetchSince || commentCreatedAt > fetchSince;
              
              if (shouldProcess) {
                const savedComment = await prisma.comment.upsert({
                  where: {
                    pageId_commentId: {
                      pageId: connectedPageId,
                      commentId: comment.id,
                    },
                  },
                  update: {
                    message: commentMessage,
                    authorName: authorName,
                    authorId: authorId,
                  },
                  create: {
                    pageId: connectedPageId,
                    commentId: comment.id,
                    postId: post.id,
                    message: commentMessage,
                    authorName: authorName,
                    authorId: authorId,
                    createdAt: commentCreatedAt,
                  },
                });
                
                // Analyze sentiment if not already set
                if (!savedComment.sentiment) {
                  const sentiment = await analyzeCommentSentiment(commentMessage);
                  if (sentiment) {
                    await prisma.comment.update({
                      where: { id: savedComment.id },
                      data: { sentiment },
                    });
                  } else {
                  }
                }
                
                newCommentsCount++;
              } else {
                skippedCommentsCount++;
              }
            }
          } else {
            const errorText = await commentsResponse.text();
            
            try {
              const errorData = JSON.parse(errorText);
              
              if (errorData.error) {
                const errorCode = errorData.error.code;
                const errorType = errorData.error.type || 'Unknown';
                
                if (errorCode === 10 && !isInstagram) {
                  hasErrorCode10 = true;
                  continue;
                }
                
                if (errorCode === 200 || errorType === 'OAuthException' || errorCode === 190) {
                  const shouldTryRefresh = isInstagram && !tokenRefreshedOnce;
                  
                  if (shouldTryRefresh) {
                    try {
                      const refreshedToken = await refreshPageAccessToken();
                      if (refreshedToken) {
                        pageAccessToken = refreshedToken;
                        tokenRefreshedOnce = true;
                      }
                    } catch (refreshError) {
                      // Continue
                    }
                  }
                }
              }
            } catch (parseError) {
              // Continue
            }
          }
        } catch (error) {
          // Silent fail - continue with next post
        }
      }
    }


    // Fetch comments from ads (Facebook + Instagram)
    // Ads comments are comments on the post/media behind the ad.
    const connectedPageForAds = await prisma.connectedPage.findUnique({
      where: { id: connectedPageId },
      select: { adAccountId: true },
    });

    if (connectedPageForAds?.adAccountId) {
      const adsResult = await fetchAdsComments(
        connectedPageId,
        connectedPageForAds.adAccountId,
        pageAccessToken,
        fetchSince,
        userId,
        isInstagram
      );

      newCommentsCount += adsResult.newCommentsCount;
      totalCommentsFetched += adsResult.totalCommentsFetched;
    } else {
      const platform = isInstagram ? 'Instagram' : 'Facebook';
    }

    // Update lastCommentsFetchedAt after successful comment fetch
    if (commentsFetchSuccess) {
      await prisma.connectedPage.update({
        where: {
          id: connectedPageId,
        },
        data: {
          lastCommentsFetchedAt: now,
        },
      });
    }
  } catch (error) {
  }
}

export async function GET(request: NextRequest) {
  const performanceStart = Date.now();
  
  try {
    const authStart = Date.now();
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');
    const background = searchParams.get('background') === 'true';

    if (!pageId) {
      return NextResponse.json(
        { error: 'Page ID is required' },
        { status: 400 }
      );
    }

    // Get connected page
    const dbQueryStart = Date.now();
    const connectedPage = await prisma.connectedPage.findFirst({
      where: {
        userId: session.user.id,
        pageId,
      },
    });

    if (!connectedPage) {
      return NextResponse.json(
        { error: 'Page not found or not connected' },
        { status: 404 }
      );
    }

    // Get the last fetch timestamp
    const lastFetchedAt = connectedPage.lastCommentsFetchedAt;
    const now = new Date();
    
    // For background polling we use fetchSince to only get new comments.
    // For manual refresh (background = false), we fetch the full set so we can also detect deletions.
    const fetchSince = background
      ? (lastFetchedAt ? new Date(lastFetchedAt.getTime() - 30000) : null)
      : null;

    // Check if this is Instagram or Facebook
    const isInstagram = connectedPage.provider === 'instagram';
    
    // If background mode, return cached comments immediately and start background fetch
    if (background) {
      const cacheStart = Date.now();
      // Get cached comments from database
      const storedComments = await prisma.comment.findMany({
        where: {
          pageId: connectedPage.id,
        },
        include: {
          connectedPage: {
            select: {
              pageName: true,
              provider: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 100,
      });

      // Fetch post messages, images, and dates for cached comments
      const postIds = [...new Set(storedComments.map(c => c.postId))];
      const postMessages: Record<string, string> = {};
      const postImages: Record<string, string> = {};
      const postCreatedAts: Record<string, string> = {};
      
      // Try to fetch post data (optional - don't fail if this doesn't work)
      const postMetadataStart = Date.now();
      const currentPageAccessToken = connectedPage.pageAccessToken;
      if (currentPageAccessToken) {
        for (const postId of postIds.slice(0, 20)) {
          try {
            const fields = isInstagram 
              ? 'caption,timestamp,media_url,thumbnail_url' 
              : 'message,created_time,full_picture,attachments';
            const postResponse = await fetch(
              `https://graph.facebook.com/v24.0/${postId}?access_token=${currentPageAccessToken}&fields=${fields}`
            );
            if (postResponse.ok) {
              const postData = await postResponse.json();
              postMessages[postId] = isInstagram ? (postData.caption || '') : (postData.message || '');
              
              if (isInstagram) {
                postImages[postId] = postData.media_url || postData.thumbnail_url || '';
                postCreatedAts[postId] = postData.timestamp || '';
              } else {
                postImages[postId] = postData.full_picture || postData.attachments?.data?.[0]?.media?.image?.src || '';
                postCreatedAts[postId] = postData.created_time || '';
              }
            }
          } catch (error) {
            // Silently fail - post data is optional
          }
        }
      }

      // Format cached comments
      const formattedComments = storedComments.map(comment => ({
        id: comment.id,
        commentId: comment.commentId,
        message: comment.message,
        authorName: comment.authorName,
        createdAt: comment.createdAt.toISOString(),
        status: comment.status,
        sentiment: comment.sentiment,
        postId: comment.postId,
        postMessage: postMessages[comment.postId] || '',
        postImage: postImages[comment.postId] || undefined,
        postCreatedAt: postCreatedAts[comment.postId] || undefined,
        pageName: comment.connectedPage.pageName,
        provider: comment.connectedPage.provider,
        isFromAd: comment.isFromAd,
        adId: comment.adId,
        adName: comment.adName,
      }));

      // Start background fetch without awaiting
      const lastFetchedAt = connectedPage.lastCommentsFetchedAt;
      const fetchSince = lastFetchedAt 
        ? new Date(lastFetchedAt.getTime() - 30000)
        : null;
      
      const currentPageAccessTokenForBackground = connectedPage.pageAccessToken;
      if (currentPageAccessTokenForBackground) {
        // Don't await - let it run in background
        fetchCommentsInBackground(
          pageId,
          connectedPage.id,
          session.user.id,
          isInstagram,
          currentPageAccessTokenForBackground,
          fetchSince
        ).catch(error => {
        });
      }

      // Return cached comments immediately
      const totalTime = Date.now() - performanceStart;
      
      return NextResponse.json({
        comments: formattedComments,
        newCommentsCount: 0,
        lastFetchedAt: connectedPage.lastCommentsFetchedAt?.toISOString() || null,
        fetched: 0,
        isCached: true,
        backgroundFetching: true,
      });
    }
    
    const manualFetchStart = Date.now();
    
    
    // Helper function to refresh page access token
    const refreshPageAccessToken = async (): Promise<string | null> => {
      try {
        // Get user's Facebook account access token
        const account = await prisma.account.findFirst({
          where: {
            userId: session.user.id,
            provider: 'facebook',
          },
        });
        
        if (!account?.access_token) {
          return null;
        }
        
        
        let targetPageId = pageId;
        let facebookPageId: string | null = null;
        
        // For Instagram, we need to find the Facebook Page ID that owns this Instagram account
        if (isInstagram) {
          try {
            // Get the Facebook Page ID from the Instagram Business Account
            const instagramAccountUrl = `https://graph.facebook.com/v24.0/${pageId}?fields=connected_facebook_page&access_token=${account.access_token}`;
            const instagramAccountResponse = await fetch(instagramAccountUrl);
            
            if (instagramAccountResponse.ok) {
              const instagramAccountData = await instagramAccountResponse.json();
              if (instagramAccountData.connected_facebook_page?.id) {
                facebookPageId = instagramAccountData.connected_facebook_page.id;
                targetPageId = instagramAccountData.connected_facebook_page.id;
              }
            } else {
              const errorText = await instagramAccountResponse.text();
              try {
                const errorData = JSON.parse(errorText);
                // Rate limit or other error - continue to try /me/accounts
              } catch (e) {
                // Continue
              }
            }
          } catch (instagramError) {
            // Continue - will try to find via /me/accounts
          }
        }
        
        // Fetch fresh Page access token from Facebook using /me/accounts endpoint
        // This returns Page access tokens (not user tokens) which are required for reading page posts and comments
        const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?access_token=${account.access_token}&fields=id,name,access_token&limit=100`;
        const pagesResponse = await fetch(pagesUrl);
        
        if (pagesResponse.ok) {
          const pagesData = await pagesResponse.json();
          let page = pagesData.data?.find((p: any) => p.id === targetPageId);
          
          // If not found and it's Instagram, try to find by checking which page has this Instagram account
          // Use parallel calls instead of sequential loop for better performance
          if (!page && isInstagram) {
            const instagramChecks = (pagesData.data || []).map(async (fbPage: any) => {
              try {
                const instagramCheckUrl = `https://graph.facebook.com/v24.0/${fbPage.id}?fields=instagram_business_account&access_token=${fbPage.access_token}`;
                const instagramCheckResponse = await fetch(instagramCheckUrl);
                if (instagramCheckResponse.ok) {
                  const instagramCheckData = await instagramCheckResponse.json();
                  if (instagramCheckData.instagram_business_account?.id === pageId) {
                    return fbPage;
                  }
                }
              } catch (e) {
                // Continue
              }
              return null;
            });
            
            const results = await Promise.all(instagramChecks);
            const foundPage = results.find(p => p !== null);
            if (foundPage) {
              page = foundPage;
              targetPageId = foundPage.id;
            }
          }
          
          if (page?.access_token) {
            // Skip debug_token call if we're hitting rate limits (it's optional)
            // Update the stored page access token
            await prisma.connectedPage.update({
              where: { id: connectedPage.id },
              data: { pageAccessToken: page.access_token },
            });
            
            return page.access_token;
          } else {
          }
        } else {
          const errorText = await pagesResponse.text();
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error) {
              const errorCode = errorData.error.code;
              const errorMessage = errorData.error.message || '';
              
              if (errorCode === 4) {
              } else {
              }
            }
          } catch (parseError) {
          }
        }
      } catch (error) {
      }
      return null;
    };
    
    // Verify page access token has required permissions (for Facebook only)
    let currentPageAccessToken = connectedPage.pageAccessToken;
    
    // Ensure we have a Page access token - if missing, try to fetch it
    if (!currentPageAccessToken) {
      const refreshedToken = await refreshPageAccessToken();
      if (refreshedToken) {
        currentPageAccessToken = refreshedToken;
      } else {
        return NextResponse.json({
          error: 'Page access token is missing or expired. Please reconnect your Facebook account to refresh the token.',
          suggestion: 'reconnect_account',
        }, { status: 401 });
      }
    }
    
    let userTokenHasPermission = false; // Track this for error messages
    if (!isInstagram) {
      try {
        // Get user's access token to debug the page token
        const account = await prisma.account.findFirst({
          where: {
            userId: session.user.id,
            provider: 'facebook',
          },
        });
        
        if (account?.access_token) {
          // First, check if the user's main Facebook token has the permission
          // If the main token doesn't have it, refreshing page tokens won't help
          try {
            const userTokenDebugUrl = `https://graph.facebook.com/v24.0/debug_token?input_token=${account.access_token}&access_token=${account.access_token}`;
            const userTokenDebugResponse = await fetch(userTokenDebugUrl);
            
            if (userTokenDebugResponse.ok) {
              const userTokenDebugData = await userTokenDebugResponse.json();
              const userScopes = userTokenDebugData.data?.scopes || [];
              userTokenHasPermission = userScopes.includes('pages_read_engagement');
            }
          } catch (userTokenError) {
            // Silent fail
          }
          
          // Now check the page token
          const debugTokenUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${currentPageAccessToken}&access_token=${account.access_token}`;
          const debugResponse = await fetch(debugTokenUrl);
          
          if (debugResponse.ok) {
            const debugData = await debugResponse.json();
            const scopes = debugData.data?.scopes || [];
            
            if (!scopes.includes('pages_read_engagement')) {
              // Only try to refresh if the user's main token has the permission
              if (userTokenHasPermission) {
                const refreshedToken = await refreshPageAccessToken();
                if (refreshedToken) {
                  currentPageAccessToken = refreshedToken;
                }
              }
            }
          } else {
            const errorText = await debugResponse.text();
            
            // Check if it's a rate limit error
            let errorData: any = {};
            try {
              errorData = JSON.parse(errorText);
            } catch (e) {
              // Not JSON
            }
            
            // Only try to refresh if not rate limited and user token has permission
            if (!(errorData.error?.code === 4 && errorData.error?.is_transient === true) && userTokenHasPermission) {
              const refreshedToken = await refreshPageAccessToken();
              if (refreshedToken) {
                currentPageAccessToken = refreshedToken;
              }
            }
          }
        }
      } catch (error) {
        // Silent fail
      }
    }

    // Fetch recent posts/media from the page to get their comments
    let posts: any[] = [];
    let postsFetchSuccess = false;
    let postsError: string | null = null;
    let hasErrorCode10 = false; // Track if we encountered Facebook error code 10
    let tokenRefreshedOnce = false; // Track if we already refreshed token once (to avoid multiple refreshes)
    
    const postsFetchStart = Date.now();
    
    try {
      let postsUrl: string;
      
      if (isInstagram) {
        // Instagram: Use /media endpoint to get media (posts)
        postsUrl = `https://graph.facebook.com/v24.0/${pageId}/media?access_token=${currentPageAccessToken}&fields=id,caption,timestamp,media_url,thumbnail_url&limit=50`;
      } else {
        // Facebook: Use Page access token (not user token) to fetch posts
        // This gets all posts including published ones
        postsUrl = `https://graph.facebook.com/v24.0/${pageId}/posts?access_token=${currentPageAccessToken}&fields=id,message,created_time,full_picture,attachments&limit=50`;
      }
      
      const postsResponse = await fetch(postsUrl);

      if (postsResponse.ok) {
        const postsData = await postsResponse.json();
        posts = postsData.data || [];
        postsFetchSuccess = true;
        const postsFetchTime = Date.now() - postsFetchStart;
      } else {
        const errorText = await postsResponse.text();
        postsError = errorText;
        
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            const errorCode = errorData.error.code;
            const errorType = errorData.error.type || 'Unknown';
            const errorMessage = errorData.error.message || '';
            
            if (errorCode === 10 && !isInstagram) {
              hasErrorCode10 = true;
            } else if (errorCode === 190 || errorCode === 200 || errorType === 'OAuthException') {
              
              // For Instagram, try to refresh token if it's a token error
              if (isInstagram) {
                try {
                  const refreshedToken = await refreshPageAccessToken();
                  if (refreshedToken) {
                    currentPageAccessToken = refreshedToken;
                    tokenRefreshedOnce = true; // Mark as refreshed so we don't do it again for comments
                    // Retry the media fetch with the new token
                    const retryPostsUrl = `https://graph.facebook.com/v24.0/${pageId}/media?access_token=${currentPageAccessToken}&fields=id,caption,timestamp,media_url,thumbnail_url&limit=50`;
                    const retryPostsResponse = await fetch(retryPostsUrl);
                    
                    if (retryPostsResponse.ok) {
                      const retryPostsData = await retryPostsResponse.json();
                      posts = retryPostsData.data || [];
                      postsFetchSuccess = true;
                    } else {
                    }
                  } else {
                  }
                } catch (refreshError) {
                }
              }
            } else if (errorCode === 4) {
            } else {
            }
          }
        } catch (e) {
        }
        
        // For Facebook, try /feed endpoint as fallback
        if (!isInstagram) {
          try {
            const feedUrl = `https://graph.facebook.com/v24.0/${pageId}/feed?access_token=${currentPageAccessToken}&fields=id,message,created_time,full_picture,attachments&limit=50`;
            const feedResponse = await fetch(feedUrl);
            
            if (feedResponse.ok) {
              const feedData = await feedResponse.json();
              posts = feedData.data || [];
              postsFetchSuccess = true;
            }
          } catch (feedError) {
            // Silent fail
          }
        }
        
        // If we still can't fetch new posts, try to get post IDs from existing comments
        if (!postsFetchSuccess) {
          const existingComments = await prisma.comment.findMany({
            where: {
              pageId: connectedPage.id,
            },
            select: {
              postId: true,
            },
            distinct: ['postId'],
            take: 10,
          });
          
          // Use existing post IDs to fetch new comments
          posts = existingComments.map(c => ({ id: c.postId }));
          if (posts.length > 0) {
          }
        }
      }
    } catch (error) {
      postsError = String(error);
      // Try to get post IDs from existing comments
      const existingComments = await prisma.comment.findMany({
        where: {
          pageId: connectedPage.id,
        },
        select: {
          postId: true,
        },
        distinct: ['postId'],
        take: 10,
      });
      posts = existingComments.map(c => ({ id: c.postId }));
    }

    // Fetch comments for each post
    const newComments = [];
    let newCommentsCount = 0;
    let commentsFetchSuccess = false;
    let totalCommentsFetched = 0;
    let skippedCommentsCount = 0;
    let commentsErrors: string[] = [];
    let sentimentAnalysisCount = 0;
    let sentimentAnalysisTime = 0;
    
    if (posts.length > 0) {
    }
    
    const commentsFetchStart = Date.now();
    
    // Fetch comments for all posts in parallel for better performance
    // Process in batches to avoid overwhelming the API
    const batchSize = 10; // Increased from 5 to 10 for better performance
    
    for (let i = 0; i < posts.length; i += batchSize) {
      const batchStart = Date.now();
      const batch = posts.slice(i, i + batchSize);
      
      const commentFetchPromises = batch.map(async (post) => {
        try {
          // Build comments URL - Instagram and Facebook use different field names
          let commentsUrl: string;
          
          if (isInstagram) {
            // Instagram: Use /comments endpoint with different fields
            commentsUrl = `https://graph.facebook.com/v24.0/${post.id}/comments?access_token=${currentPageAccessToken}&fields=id,text,username,timestamp&limit=50`;
          } else {
            // Facebook: Use Page access token (not user token) to fetch comments
            commentsUrl = `https://graph.facebook.com/v24.0/${post.id}/comments?access_token=${currentPageAccessToken}&fields=id,message,from,created_time&limit=50`;
          }
          
          // Add since parameter if we have a last fetch time (Facebook/Instagram use Unix timestamp)
          if (fetchSince) {
            const sinceTimestamp = Math.floor(fetchSince.getTime() / 1000);
            commentsUrl += `&since=${sinceTimestamp}`;
          }
          
          const commentsResponse = await fetch(commentsUrl);
          return { post, commentsResponse, error: null };
        } catch (error) {
          return { post, commentsResponse: null, error };
        }
      });
      
      const batchResults = await Promise.all(commentFetchPromises);
      
      // Process batch results
      for (const { post, commentsResponse, error } of batchResults) {
        if (error) {
          commentsErrors.push(`Post ${post.id}: ${String(error)}`);
          continue;
        }
        
        if (!commentsResponse) continue;
        
        try {
          if (commentsResponse.ok) {
            commentsFetchSuccess = true;
            const commentsData = await commentsResponse.json();
            const comments = commentsData.data || [];
            totalCommentsFetched += comments.length;

            for (const comment of comments) {
            // Instagram and Facebook have different field names
            let commentCreatedAt: Date;
            let commentMessage: string;
            let authorName: string;
            let authorId: string;
            
            if (isInstagram) {
              // Instagram uses: text, username, timestamp
              commentCreatedAt = new Date(comment.timestamp);
              commentMessage = comment.text || '';
              authorName = comment.username || 'Unknown';
              authorId = comment.id || ''; // Instagram doesn't provide user ID in comments
            } else {
              // Facebook uses: message, from.name, from.id, created_time
              commentCreatedAt = new Date(comment.created_time);
              commentMessage = comment.message || '';
              authorName = comment.from?.name || 'Unknown';
              authorId = comment.from?.id || '';
            }
            
            // Filter: only process comments created after fetchSince (or all if first fetch)
            // Using fetchSince (30 seconds before last fetch) to account for timing issues
            const shouldProcess = !fetchSince || commentCreatedAt > fetchSince;
            
            if (shouldProcess) {
              // Store comment in database
              const savedComment = await prisma.comment.upsert({
                where: {
                  pageId_commentId: {
                    pageId: connectedPage.id,
                    commentId: comment.id,
                  },
                },
                update: {
                  message: commentMessage,
                  authorName: authorName,
                  authorId: authorId,
                },
                create: {
                  pageId: connectedPage.id,
                  commentId: comment.id,
                  postId: post.id,
                  message: commentMessage,
                  authorName: authorName,
                  authorId: authorId,
                  createdAt: commentCreatedAt,
                },
              });

              // Analyze sentiment if not already set
              if (!savedComment.sentiment) {
                const sentimentStart = Date.now();
                const sentiment = await analyzeCommentSentiment(commentMessage);
                const sentimentTime = Date.now() - sentimentStart;
                sentimentAnalysisTime += sentimentTime;
                sentimentAnalysisCount++;
                
                if (sentiment) {
                  await prisma.comment.update({
                    where: { id: savedComment.id },
                    data: { sentiment },
                  });
                } else {
                }
              }

              // Extract image URL from post
              let postImage: string | undefined;
              let postCreatedAt: string | undefined;
              
              if (isInstagram) {
                postImage = post.media_url || post.thumbnail_url;
                postCreatedAt = post.timestamp;
              } else {
                postImage = post.full_picture || post.attachments?.data?.[0]?.media?.image?.src;
                postCreatedAt = post.created_time;
              }
              
              newComments.push({
                ...comment,
                postId: post.id,
                postMessage: isInstagram ? (post.caption || '') : (post.message || ''),
                postImage,
                postCreatedAt,
              });
              newCommentsCount++;
            } else {
              skippedCommentsCount++;
            }
          }
          } else {
            const errorText = await commentsResponse.text();
            
            // Try to parse error for more details
            let shouldRetry = false;
            let errorMessage = `Post ${post.id}: ${commentsResponse.status} - ${errorText.substring(0, 200)}`;
            
            try {
              const errorData = JSON.parse(errorText);
              
              // Check for specific permission errors and try to refresh token
              if (errorData.error) {
                const errorCode = errorData.error.code;
                const errorType = errorData.error.type || 'Unknown';
                const errorMessageText = errorData.error.message || '';
                
                // Handle error code 10 specifically - do NOT retry
                if (errorCode === 10 && !isInstagram) {
                  hasErrorCode10 = true;
                  // Do not retry for code 10, just track it
                  continue; // Skip to next post
                }
                
                // Check if this is a token expiration or permission error that we should retry
                if (errorCode === 200 || errorType === 'OAuthException' || errorCode === 190) {
                  
                  // Try to refresh the token - BUT ONLY ONCE for all posts
                  // For Facebook: only if user token has permission
                  // For Instagram: always try (uses Facebook Page token which can be refreshed)
                  const shouldTryRefresh = (isInstagram || userTokenHasPermission) && !tokenRefreshedOnce;
                  
                  if (shouldTryRefresh) {
                    try {
                      const refreshedToken = await refreshPageAccessToken();
                      if (refreshedToken) {
                        currentPageAccessToken = refreshedToken;
                        tokenRefreshedOnce = true; // Mark as refreshed so we don't do it again
                        shouldRetry = true;
                      } else {
                        commentsErrors.push(errorMessage);
                      }
                    } catch (refreshError) {
                      commentsErrors.push(errorMessage);
                    }
                  } else if (tokenRefreshedOnce) {
                    // Token already refreshed once, just retry with the refreshed token
                    shouldRetry = true;
                  } else {
                    commentsErrors.push(errorMessage);
                  }
                } else if (errorCode === 4) {
                  commentsErrors.push(errorMessage);
                } else {
                  commentsErrors.push(errorMessage);
                }
              } else {
                // Couldn't parse error structure, add to errors
                commentsErrors.push(errorMessage);
              }
            } catch (parseError) {
              // Add error if we can't parse it
              commentsErrors.push(errorMessage);
            }
            
            // If we should retry, do it now
            if (shouldRetry) {
              try {
                // Retry the comment fetch with new token - use correct fields for Instagram vs Facebook
                const retryFields = isInstagram 
                  ? 'id,text,username,timestamp'
                  : 'id,message,from,created_time';
                const retryCommentsUrl = `https://graph.facebook.com/v24.0/${post.id}/comments?access_token=${currentPageAccessToken}&fields=${retryFields}&limit=50${fetchSince ? `&since=${Math.floor(fetchSince.getTime() / 1000)}` : ''}`;
                const retryResponse = await fetch(retryCommentsUrl);
                
                if (retryResponse.ok) {
                  commentsFetchSuccess = true;
                  const retryCommentsData = await retryResponse.json();
                  const retryComments = retryCommentsData.data || [];
                  totalCommentsFetched += retryComments.length;
                  
                  // Process the retried comments
                  for (const comment of retryComments) {
                    // Instagram and Facebook have different field names
                    let commentCreatedAt: Date;
                    let commentMessage: string;
                    let authorName: string;
                    let authorId: string;
                    
                    if (isInstagram) {
                      commentCreatedAt = new Date(comment.timestamp);
                      commentMessage = comment.text || '';
                      authorName = comment.username || 'Unknown';
                      authorId = comment.id || '';
                    } else {
                      commentCreatedAt = new Date(comment.created_time);
                      commentMessage = comment.message || '';
                      authorName = comment.from?.name || 'Unknown';
                      authorId = comment.from?.id || '';
                    }
                    
                    const shouldProcess = !fetchSince || commentCreatedAt > fetchSince;
                    
                    if (shouldProcess) {
                      const savedComment = await prisma.comment.upsert({
                        where: {
                          pageId_commentId: {
                            pageId: connectedPage.id,
                            commentId: comment.id,
                          },
                        },
                        update: {
                          message: commentMessage,
                          authorName: authorName,
                          authorId: authorId,
                        },
                        create: {
                          pageId: connectedPage.id,
                          commentId: comment.id,
                          postId: post.id,
                          message: commentMessage,
                          authorName: authorName,
                          authorId: authorId,
                          createdAt: commentCreatedAt,
                        },
                      });

                      // Analyze sentiment if not already set
                      if (!savedComment.sentiment) {
                        const sentimentStart = Date.now();
                        const sentiment = await analyzeCommentSentiment(commentMessage);
                        const sentimentTime = Date.now() - sentimentStart;
                        sentimentAnalysisTime += sentimentTime;
                        sentimentAnalysisCount++;
                        
                        if (sentiment) {
                          await prisma.comment.update({
                            where: { id: savedComment.id },
                            data: { sentiment },
                          });
                        } else {
                        }
                      }

                      // Extract image URL from post
                      let postImage: string | undefined;
                      let postCreatedAt: string | undefined;
                      
                      if (isInstagram) {
                        postImage = post.media_url || post.thumbnail_url;
                        postCreatedAt = post.timestamp;
                      } else {
                        postImage = post.full_picture || post.attachments?.data?.[0]?.media?.image?.src;
                        postCreatedAt = post.created_time;
                      }
                      
                      newComments.push({
                        ...comment,
                        postId: post.id,
                        postMessage: isInstagram ? (post.caption || '') : (post.message || ''),
                        postImage,
                        postCreatedAt,
                      });
                      newCommentsCount++;
                    } else {
                      skippedCommentsCount++;
                    }
                  }
                } else {
                  const retryErrorText = await retryResponse.text();
                  try {
                    const retryErrorData = JSON.parse(retryErrorText);
                    if (retryErrorData.error) {
                      const retryErrorCode = retryErrorData.error.code;
                      const retryErrorMessage = retryErrorData.error.message || '';
                      if (retryErrorCode === 10 && !isInstagram) {
                        hasErrorCode10 = true;
                      } else {
                      }
                    }
                  } catch (e) {
                  }
                  commentsErrors.push(`Post ${post.id} (retry): ${retryErrorText.substring(0, 200)}`);
                }
              } catch (retryError) {
                commentsErrors.push(`Post ${post.id} (retry error): ${String(retryError).substring(0, 200)}`);
              }
            }
          }
        } catch (error) {
          // Silent fail - continue with next post
        }
      }
      
      const batchTime = Date.now() - batchStart;
    }

    const totalCommentsFetchTime = Date.now() - commentsFetchStart;
    
    if (sentimentAnalysisCount > 0) {
      const avgSentimentTime = Math.round(sentimentAnalysisTime / sentimentAnalysisCount);
    }
    

    // Fetch comments from ads (Facebook + Instagram)
    // Ads comments are comments on the post/media behind the ad.
    const connectedPageForAds = await prisma.connectedPage.findUnique({
      where: { id: connectedPage.id },
      select: { adAccountId: true },
    });

    if (connectedPageForAds?.adAccountId) {
      const adsResult = await fetchAdsComments(
        connectedPage.id,
        connectedPageForAds.adAccountId,
        currentPageAccessToken,
        fetchSince,
        session.user.id,
        isInstagram
      );

      newCommentsCount += adsResult.newCommentsCount;
      totalCommentsFetched += adsResult.totalCommentsFetched;
    } else {
      const platform = isInstagram ? 'Instagram' : 'Facebook';
    }

    // Update lastCommentsFetchedAt after successful comment fetch
    if (commentsFetchSuccess) {
      // On manual refresh (background = false), we fetched the full set of comments for the posts window.
      // Remove any comments from our database for those posts that no longer exist on Facebook/Instagram
      try {
        const fetchedPostIds = posts.map((p: any) => p.id);
        const fetchedCommentIds = Array.from(
          new Set(newComments.map((c: any) => c.id))
        );

        if (fetchedPostIds.length > 0 && fetchedCommentIds.length > 0) {
          await prisma.comment.deleteMany({
            where: {
              pageId: connectedPage.id,
              postId: { in: fetchedPostIds },
              commentId: { notIn: fetchedCommentIds },
            },
          });
        }
      } catch (cleanupError) {
      }

      await prisma.connectedPage.update({
        where: {
          id: connectedPage.id,
        },
        data: {
          lastCommentsFetchedAt: now,
        },
      });
    }

    // Get stored comments from database with page information
    const dbFinalQueryStart = Date.now();
    const storedComments = await prisma.comment.findMany({
      where: {
        pageId: connectedPage.id,
      },
      include: {
        connectedPage: {
          select: {
            pageName: true,
            provider: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    // Fetch post messages, images, and dates for all unique post IDs
    const postIds = [...new Set(storedComments.map(c => c.postId))];
    const postMessages: Record<string, string> = {};
    const postImages: Record<string, string> = {};
    const postCreatedAts: Record<string, string> = {};
    
    const postMetaFetchStart = Date.now();
    // Try to fetch post data (optional - don't fail if this doesn't work)
    for (const postId of postIds.slice(0, 20)) { // Limit to 20 to avoid too many API calls
      try {
        const fields = isInstagram 
          ? 'caption,timestamp,media_url,thumbnail_url' 
          : 'message,created_time,full_picture,attachments';
        const postResponse = await fetch(
          `https://graph.facebook.com/v24.0/${postId}?access_token=${currentPageAccessToken}&fields=${fields}`
        );
        if (postResponse.ok) {
          const postData = await postResponse.json();
          postMessages[postId] = isInstagram ? (postData.caption || '') : (postData.message || '');
          
          // Extract image
          if (isInstagram) {
            postImages[postId] = postData.media_url || postData.thumbnail_url || '';
            postCreatedAts[postId] = postData.timestamp || '';
          } else {
            postImages[postId] = postData.full_picture || postData.attachments?.data?.[0]?.media?.image?.src || '';
            postCreatedAts[postId] = postData.created_time || '';
          }
        }
      } catch (error) {
        // Silently fail - post data is optional
      }
    }

    // Format comments with page and post information
    const formattedComments = storedComments.map(comment => ({
      id: comment.id,
      commentId: comment.commentId,
      message: comment.message,
      authorName: comment.authorName,
      createdAt: comment.createdAt.toISOString(),
      status: comment.status,
      sentiment: comment.sentiment,
      postId: comment.postId,
      postMessage: postMessages[comment.postId] || '',
      postImage: postImages[comment.postId] || undefined,
      postCreatedAt: postCreatedAts[comment.postId] || undefined,
      pageName: comment.connectedPage.pageName,
      provider: comment.connectedPage.provider,
      isFromAd: comment.isFromAd,
      adId: comment.adId,
      adName: comment.adName,
    }));

    // Check for Facebook error code 10 and return specific response
    if (hasErrorCode10 && !isInstagram) {
      return NextResponse.json({
        comments: [],
        newCommentsCount: 0,
        lastFetchedAt: null,
        fetched: 0,
        error: 'FACEBOOK_PERMISSION_BLOCK',
        message: 'Facebook is blocking access to comments for this Page in this app mode. This is a Meta permission limitation, not an application error.',
      });
    }

    // Return response with appropriate error message if needed
    const response: any = {
      comments: formattedComments,
      newCommentsCount,
      lastFetchedAt: commentsFetchSuccess ? now.toISOString() : (connectedPage.lastCommentsFetchedAt?.toISOString() || null),
      fetched: newComments.length,
      debug: {
        postsChecked: posts.length,
        totalCommentsFetched: totalCommentsFetched,
        skippedComments: skippedCommentsCount,
        lastFetchedAt: lastFetchedAt?.toISOString() || null,
        postsFetchSuccess,
        commentsFetchSuccess,
        postsError: postsError ? postsError.substring(0, 200) : null,
        commentsErrors: commentsErrors.length > 0 ? commentsErrors : undefined,
      },
    };

    if (!commentsFetchSuccess && newCommentsCount === 0) {
      // Provide more specific error message
      if (postsError && !postsFetchSuccess) {
        response.error = `Failed to fetch ${isInstagram ? 'media' : 'posts'} from ${isInstagram ? 'Instagram' : 'Facebook'}. Please check your page permissions (pages_read_engagement, pages_show_list) and try again.`;
      } else if (posts.length === 0) {
        response.error = `No ${isInstagram ? 'media' : 'posts'} found for this page. Make sure the page has published ${isInstagram ? 'media' : 'posts'} with comments.`;
      } else {
        // Check if we have permission errors in commentsErrors
        const hasPermissionError = commentsErrors.some(err => 
          err.includes('pages_read_engagement') || 
          err.includes('(#10)') ||
          err.includes('Page Public Content Access')
        );
        
        if (hasPermissionError) {
          // Provide more specific error message based on whether user token has permission
          if (!userTokenHasPermission) {
            response.error = `The 'pages_read_engagement' permission requires Facebook App Review approval. Your app must be submitted and approved for this permission before users can access it. IMPORTANT: Even if the permission is enabled in your Facebook App settings, it won't be granted to users' tokens until App Review is approved. Please submit your app for App Review in the Facebook Developer Console. For development/testing, only the app owner and test users can access permissions that require review.`;
            response.suggestion = 'app_review_required'; // Flag to show App Review instructions
            response.appReviewLink = 'https://developers.facebook.com/apps/' + (process.env.FACEBOOK_CLIENT_ID || 'YOUR_APP_ID') + '/app-review';
          } else {
            response.error = `Your page access token doesn't have the 'pages_read_engagement' permission. This usually happens when pages were connected before the permission was granted. Please try refreshing your page tokens or disconnect and reconnect your Facebook account in Settings.`;
            response.suggestion = 'refresh_tokens'; // Flag to show refresh button in UI
          }
        } else {
          response.error = `Failed to fetch comments from ${isInstagram ? 'Instagram' : 'Facebook'} posts. Please check your page permissions (pages_read_engagement) and try again.`;
        }
      }
    } else if (!postsFetchSuccess && commentsFetchSuccess) {
      // Successfully fetched comments but couldn't fetch new posts
      response.warning = `Fetched comments from existing ${isInstagram ? 'media' : 'posts'}. Some new ${isInstagram ? 'media' : 'posts'} may not have been included.`;
    }

    // Response logged above

    const totalRequestTime = Date.now() - performanceStart;
    const manualFetchTime = Date.now() - manualFetchStart;
    
    if (sentimentAnalysisCount > 0) {
    }

    return NextResponse.json(response);
  } catch (error) {
    
    if (error instanceof Error) {
    } else {
    }
    
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Failed to fetch comments. Please try again or check your page connection.',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

