import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');

    if (!pageId) {
      return NextResponse.json(
        { error: 'Page ID is required' },
        { status: 400 }
      );
    }

    // Get connected page
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
    
    // Add a small buffer (30 seconds) to account for clock differences and API delays
    const fetchSince = lastFetchedAt 
      ? new Date(lastFetchedAt.getTime() - 30000) // 30 seconds before last fetch
      : null;

    console.log('───────────── FB COMMENTS ─────────────');
    console.log('[info] Fetching comments…');
    console.log(`[page] ${connectedPage.pageName || 'Unknown'} – id: ${pageId}`);
    console.log(`[token] page token – length: ${connectedPage.pageAccessToken?.length || 0}`);

    // Check if this is Instagram or Facebook
    const isInstagram = connectedPage.provider === 'instagram';
    
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
          console.error('[retry] No user access token found');
          return null;
        }
        
        console.log('──────────── FB COMMENTS RETRY ─────────────');
        console.log('[retry] refreshing page token…');
        
        // Fetch fresh Page access token from Facebook using /me/accounts endpoint
        // This returns Page access tokens (not user tokens) which are required for reading page posts and comments
        const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?access_token=${account.access_token}&fields=id,name,access_token&limit=100`;
        const pagesResponse = await fetch(pagesUrl);
        
        if (pagesResponse.ok) {
          const pagesData = await pagesResponse.json();
          const page = pagesData.data?.find((p: any) => p.id === pageId);
          
          if (page?.access_token) {
            // Verify the new token has the right permissions by checking it
            try {
              const debugTokenUrl = `https://graph.facebook.com/v24.0/debug_token?input_token=${page.access_token}&access_token=${account.access_token}`;
              const debugResponse = await fetch(debugTokenUrl);
              
              if (debugResponse.ok) {
                const debugData = await debugResponse.json();
                const scopes = debugData.data?.scopes || [];
                
                if (!scopes.includes('pages_read_engagement')) {
                  console.warn('[retry] token missing pages_read_engagement');
                }
              }
            } catch (debugError) {
              // Silent fail
            }
            
            // Update the stored page access token
            await prisma.connectedPage.update({
              where: { id: connectedPage.id },
              data: { pageAccessToken: page.access_token },
            });
            
            console.log('[retry] token refreshed');
            console.log('────────────────────────────────────────────');
            return page.access_token;
          }
        } else {
          const errorText = await pagesResponse.text();
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error) {
              const errorCode = errorData.error.code;
              const errorType = errorData.error.type || '';
              console.error(`[retry] request failed code ${errorCode}`);
              if (errorType) {
                console.error(`[msg] ${errorData.error.message || ''}`);
              }
            }
          } catch (parseError) {
            // Not JSON
          }
        }
      } catch (error) {
        console.error('[retry] error refreshing token');
      }
      return null;
    };
    
    // Verify page access token has required permissions (for Facebook only)
    let currentPageAccessToken = connectedPage.pageAccessToken;
    
    // Ensure we have a Page access token - if missing, try to fetch it
    if (!currentPageAccessToken) {
      console.warn('[info] Page token missing, fetching…');
      const refreshedToken = await refreshPageAccessToken();
      if (refreshedToken) {
        currentPageAccessToken = refreshedToken;
        console.log('[info] Page token retrieved');
      } else {
        console.error('──────────── FB COMMENTS ERROR ────────────');
        console.error('[error] Missing page token');
        console.error('[msg] Page access token is missing or expired');
        console.error('────────────────────────────────────────────');
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
      
      console.log(`[api] GET /${isInstagram ? 'media' : 'posts'}`);
      const postsResponse = await fetch(postsUrl);

      if (postsResponse.ok) {
        const postsData = await postsResponse.json();
        posts = postsData.data || [];
        postsFetchSuccess = true;
        console.log(`[result] ${posts.length} ${isInstagram ? 'media' : 'posts'} found`);
      } else {
        const errorText = await postsResponse.text();
        postsError = errorText;
        
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            const errorCode = errorData.error.code;
            if (errorCode === 10 && !isInstagram) {
              hasErrorCode10 = true;
              console.warn('FB COMMENTS: permission blocked by Meta (code 10 – requires pages_read_engagement or Page Public Content Access).');
            }
            console.error('──────────── FB COMMENTS ERROR ────────────');
            console.error(`[error] ${errorData.error.type || 'Unknown'} code ${errorData.error.code || 'N/A'}`);
            console.error(`[msg] ${errorData.error.message || ''}`);
            console.error('────────────────────────────────────────────');
          }
        } catch (e) {
          console.error('[error] Failed to fetch posts');
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
              console.log(`[result] ${posts.length} posts from /feed`);
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
          console.log(`[info] Using ${posts.length} existing post IDs`);
        }
      }
    } catch (error) {
      console.error('[error] Error fetching posts');
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
      console.log(`[info] Using ${posts.length} existing post IDs`);
    }

    // Fetch comments for each post
    const newComments = [];
    let newCommentsCount = 0;
    let commentsFetchSuccess = false;
    let totalCommentsFetched = 0;
    let skippedCommentsCount = 0;
    let commentsErrors: string[] = [];
    
    console.log(`[info] Processing ${posts.length} ${isInstagram ? 'media' : 'posts'}`);
    
    for (const post of posts) {
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
        
        console.log(`[post] ${post.id}`);
        console.log(`[api] GET /comments`);
        const commentsResponse = await fetch(commentsUrl);

        if (commentsResponse.ok) {
          commentsFetchSuccess = true;
          const commentsData = await commentsResponse.json();
          const comments = commentsData.data || [];
          totalCommentsFetched += comments.length;

          console.log(`[result] ${comments.length} comments returned`);

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
              await prisma.comment.upsert({
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
                console.warn('FB COMMENTS: permission blocked by Meta (code 10 – requires pages_read_engagement or Page Public Content Access).');
                // Do not retry for code 10, just track it
                continue; // Skip to next post
              }
              
              console.error('──────────── FB COMMENTS ERROR ────────────');
              console.error(`[error] ${errorType} code ${errorCode}`);
              console.error(`[msg] ${errorMessageText}`);
              console.error('────────────────────────────────────────────');
              
              // Check if this is a token expiration or permission error that we should retry
              if (errorCode === 200 || errorType === 'OAuthException' || errorCode === 190) {
                // Try to refresh the token - but only if user token has permission
                if (!isInstagram && userTokenHasPermission) {
                  try {
                    const refreshedToken = await refreshPageAccessToken();
                    if (refreshedToken) {
                      currentPageAccessToken = refreshedToken;
                      shouldRetry = true;
                    } else {
                      // Add error only if refresh failed
                      commentsErrors.push(errorMessage);
                    }
                  } catch (refreshError) {
                    commentsErrors.push(errorMessage);
                  }
                } else {
                  // Add error - user needs to reconnect
                  commentsErrors.push(errorMessage);
                }
              } else {
                // Not a permission error, add to errors
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
              console.log('──────────── FB COMMENTS RETRY ─────────────');
              // Retry the comment fetch with new token
              const retryCommentsUrl = `https://graph.facebook.com/v24.0/${post.id}/comments?access_token=${currentPageAccessToken}&fields=id,message,from,created_time&limit=50${fetchSince ? `&since=${Math.floor(fetchSince.getTime() / 1000)}` : ''}`;
              const retryResponse = await fetch(retryCommentsUrl);
              
              if (retryResponse.ok) {
                commentsFetchSuccess = true;
                const retryCommentsData = await retryResponse.json();
                const retryComments = retryCommentsData.data || [];
                totalCommentsFetched += retryComments.length;
                console.log(`[retry] success – ${retryComments.length} comments`);
                console.log('────────────────────────────────────────────');
                
                // Process the retried comments
                for (const comment of retryComments) {
                  const commentCreatedAt = new Date(comment.created_time);
                  const commentMessage = comment.message || '';
                  const authorName = comment.from?.name || 'Unknown';
                  const authorId = comment.from?.id || '';
                  
                  const shouldProcess = !fetchSince || commentCreatedAt > fetchSince;
                  
                  if (shouldProcess) {
                    await prisma.comment.upsert({
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

                    // Extract image URL from post
                    let postImage: string | undefined;
                    let postCreatedAt: string | undefined;
                    
                    postImage = post.full_picture || post.attachments?.data?.[0]?.media?.image?.src;
                    postCreatedAt = post.created_time;
                    
                    newComments.push({
                      ...comment,
                      postId: post.id,
                      postMessage: post.message || '',
                      postImage,
                      postCreatedAt,
                    });
                    newCommentsCount++;
                  } else {
                    skippedCommentsCount++;
                  }
                }
                continue; // Skip to next post - success!
              } else {
                const retryErrorText = await retryResponse.text();
                try {
                  const retryErrorData = JSON.parse(retryErrorText);
                  if (retryErrorData.error) {
                    const retryErrorCode = retryErrorData.error.code;
                    if (retryErrorCode === 10 && !isInstagram) {
                      hasErrorCode10 = true;
                      console.warn('FB COMMENTS: permission blocked by Meta (code 10 – requires pages_read_engagement or Page Public Content Access).');
                    }
                    console.error(`[retry] request failed again code ${retryErrorCode || 'N/A'}`);
                  }
                } catch (e) {
                  console.error(`[retry] request failed again`);
                }
                console.log('────────────────────────────────────────────');
                // Add retry error
                commentsErrors.push(`Post ${post.id} (retry): ${retryErrorText.substring(0, 200)}`);
              }
            } catch (retryError) {
              console.error(`[retry] error during retry`);
              console.log('────────────────────────────────────────────');
              commentsErrors.push(`Post ${post.id} (retry error): ${String(retryError).substring(0, 200)}`);
            }
          }
        }
      } catch (error) {
        // Silent fail - continue with next post
      }
    }
    
    console.log(`[result] ${totalCommentsFetched} total, ${newCommentsCount} new, ${skippedCommentsCount} skipped`);
    console.log('───────────────────────────────────────');

    // Update lastCommentsFetchedAt after successful comment fetch
    if (commentsFetchSuccess) {
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
      postId: comment.postId,
      postMessage: postMessages[comment.postId] || '',
      postImage: postImages[comment.postId] || undefined,
      postCreatedAt: postCreatedAts[comment.postId] || undefined,
      pageName: comment.connectedPage.pageName,
      provider: comment.connectedPage.provider,
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

    return NextResponse.json(response);
  } catch (error) {
    console.error('──────────── FB COMMENTS ERROR ────────────');
    console.error('[error] Internal server error');
    console.error('────────────────────────────────────────────');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

