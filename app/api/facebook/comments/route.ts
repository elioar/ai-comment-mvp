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

    console.log('[Comments API] Fetching comments for page:', pageId);
    console.log('[Comments API] Provider:', connectedPage.provider);
    console.log('[Comments API] Last fetched at:', lastFetchedAt);
    console.log('[Comments API] Fetching comments since:', fetchSince);
    console.log('[Comments API] Page access token length:', connectedPage.pageAccessToken?.length || 0);

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
          console.error('[Comments API] No user access token found');
          return null;
        }
        
        console.log('[Comments API] Attempting to refresh page access token...');
        console.log('[Comments API] Fetching pages from /me/accounts to get fresh page tokens');
        
        // Fetch fresh page access token from Facebook
        // Make sure to request the access_token field explicitly
        const pagesUrl = `https://graph.facebook.com/v18.0/me/accounts?access_token=${account.access_token}&fields=id,name,access_token&limit=100`;
        const pagesResponse = await fetch(pagesUrl);
        
        console.log('[Comments API] Pages response status:', pagesResponse.status);
        
        if (pagesResponse.ok) {
          const pagesData = await pagesResponse.json();
          console.log('[Comments API] Found', pagesData.data?.length || 0, 'pages');
          
          const page = pagesData.data?.find((p: any) => p.id === pageId);
          
          if (page?.access_token) {
            console.log('[Comments API] Found page access token, length:', page.access_token.length);
            
            // Verify the new token has the right permissions by checking it
            try {
              const debugTokenUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${page.access_token}&access_token=${account.access_token}`;
              const debugResponse = await fetch(debugTokenUrl);
              
              if (debugResponse.ok) {
                const debugData = await debugResponse.json();
                const scopes = debugData.data?.scopes || [];
                console.log('[Comments API] New page token scopes:', scopes);
                
                if (!scopes.includes('pages_read_engagement')) {
                  console.warn('[Comments API] ⚠️ New page token still missing pages_read_engagement permission');
                  console.warn('[Comments API] User may need to reconnect their Facebook account to get updated permissions');
                } else {
                  console.log('[Comments API] ✅ New page token has pages_read_engagement permission');
                }
              }
            } catch (debugError) {
              console.error('[Comments API] Error debugging new token:', debugError);
            }
            
            // Update the stored page access token
            await prisma.connectedPage.update({
              where: { id: connectedPage.id },
              data: { pageAccessToken: page.access_token },
            });
            
            console.log('[Comments API] ✅ Successfully refreshed and stored page access token');
            return page.access_token;
          } else {
            console.error('[Comments API] Page not found in accounts list. Page ID:', pageId);
            console.error('[Comments API] Available page IDs:', pagesData.data?.map((p: any) => p.id) || []);
          }
        } else {
          const errorText = await pagesResponse.text();
          console.error('[Comments API] Failed to fetch pages:', errorText);
          
          // Try to parse the error
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error) {
              console.error('[Comments API] Error code:', errorData.error.code);
              console.error('[Comments API] Error message:', errorData.error.message);
              
              if (errorData.error.code === 190 || errorData.error.type === 'OAuthException') {
                console.error('[Comments API] User access token may be expired. User needs to reconnect Facebook account.');
              }
            }
          } catch (parseError) {
            // Not JSON, that's fine
          }
        }
      } catch (error) {
        console.error('[Comments API] Error refreshing page access token:', error);
      }
      return null;
    };
    
    // Verify page access token has required permissions (for Facebook only)
    let currentPageAccessToken = connectedPage.pageAccessToken;
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
          const debugTokenUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${currentPageAccessToken}&access_token=${account.access_token}`;
          const debugResponse = await fetch(debugTokenUrl);
          if (debugResponse.ok) {
            const debugData = await debugResponse.json();
            const scopes = debugData.data?.scopes || [];
            console.log('[Comments API] Page access token scopes:', scopes);
            console.log('[Comments API] Page access token is valid:', debugData.data?.is_valid);
            
            if (!scopes.includes('pages_read_engagement')) {
              console.warn('[Comments API] ⚠️ Page access token missing pages_read_engagement permission, attempting to refresh...');
              const refreshedToken = await refreshPageAccessToken();
              if (refreshedToken) {
                currentPageAccessToken = refreshedToken;
                console.log('[Comments API] ✅ Using refreshed page access token');
              }
            }
          } else {
            const errorText = await debugResponse.text();
            console.error('[Comments API] Error debugging page token:', errorText);
            // Try to refresh token if debug fails
            const refreshedToken = await refreshPageAccessToken();
            if (refreshedToken) {
              currentPageAccessToken = refreshedToken;
            }
          }
        }
      } catch (error) {
        console.error('[Comments API] Error checking page token permissions:', error);
      }
    }

    // Fetch recent posts/media from the page to get their comments
    let posts: any[] = [];
    let postsFetchSuccess = false;
    let postsError: string | null = null;
    
    try {
      let postsUrl: string;
      
      if (isInstagram) {
        // Instagram: Use /media endpoint to get media (posts)
        postsUrl = `https://graph.facebook.com/v18.0/${pageId}/media?access_token=${currentPageAccessToken}&fields=id,caption,timestamp&limit=50`;
      } else {
        // Facebook: Try /posts endpoint first (most common)
        // This gets all posts including published ones
        postsUrl = `https://graph.facebook.com/v18.0/${pageId}/posts?access_token=${currentPageAccessToken}&fields=id,message,created_time&limit=50`;
      }
      
      console.log('[Comments API] Fetching posts/media from:', postsUrl.replace(currentPageAccessToken, '[TOKEN]'));
      const postsResponse = await fetch(postsUrl);

      if (postsResponse.ok) {
        const postsData = await postsResponse.json();
        posts = postsData.data || [];
        postsFetchSuccess = true;
        console.log(`[Comments API] Successfully fetched ${posts.length} ${isInstagram ? 'media' : 'posts'}`);
      } else {
        const errorText = await postsResponse.text();
        postsError = errorText;
        console.error(`[Comments API] ${isInstagram ? 'Instagram' : 'Facebook'} API error fetching ${isInstagram ? 'media' : 'posts'}:`, errorText);
        
        // For Facebook, try /feed endpoint as fallback
        if (!isInstagram) {
          try {
            const feedUrl = `https://graph.facebook.com/v18.0/${pageId}/feed?access_token=${currentPageAccessToken}&fields=id,message,created_time&limit=50`;
            console.log('[Comments API] Trying /feed endpoint as fallback:', feedUrl.replace(currentPageAccessToken, '[TOKEN]'));
            const feedResponse = await fetch(feedUrl);
            
            if (feedResponse.ok) {
              const feedData = await feedResponse.json();
              posts = feedData.data || [];
              postsFetchSuccess = true;
              console.log(`[Comments API] Successfully fetched ${posts.length} posts from /feed endpoint`);
            } else {
              const feedErrorText = await feedResponse.text();
              console.error('[Comments API] /feed endpoint also failed:', feedErrorText);
            }
          } catch (feedError) {
            console.error('[Comments API] Error trying /feed endpoint:', feedError);
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
          console.log(`[Comments API] Using ${posts.length} existing post IDs from database`);
        }
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
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
      console.log(`[Comments API] Using ${posts.length} existing post IDs from database after error`);
    }

    // Fetch comments for each post
    const newComments = [];
    let newCommentsCount = 0;
    let commentsFetchSuccess = false;
    let totalCommentsFetched = 0;
    let skippedCommentsCount = 0;
    let commentsErrors: string[] = [];
    
    console.log(`[Comments API] Processing ${posts.length} ${isInstagram ? 'media' : 'posts'} to fetch comments`);
    
    for (const post of posts) {
      try {
        // Build comments URL - Instagram and Facebook use different field names
        let commentsUrl: string;
        
        if (isInstagram) {
          // Instagram: Use /comments endpoint with different fields
          commentsUrl = `https://graph.facebook.com/v18.0/${post.id}/comments?access_token=${currentPageAccessToken}&fields=id,text,username,timestamp&limit=50`;
        } else {
          // Facebook: Use /comments endpoint
          commentsUrl = `https://graph.facebook.com/v18.0/${post.id}/comments?access_token=${currentPageAccessToken}&fields=id,message,from,created_time&limit=50`;
        }
        
        // Add since parameter if we have a last fetch time (Facebook/Instagram use Unix timestamp)
        if (fetchSince) {
          const sinceTimestamp = Math.floor(fetchSince.getTime() / 1000);
          commentsUrl += `&since=${sinceTimestamp}`;
        }
        
        console.log(`[Comments API] Fetching comments for ${isInstagram ? 'media' : 'post'} ${post.id}`);
        console.log(`[Comments API] Comments URL:`, commentsUrl.replace(currentPageAccessToken, '[TOKEN]'));
        const commentsResponse = await fetch(commentsUrl);
        
        console.log(`[Comments API] Comments response status: ${commentsResponse.status} ${commentsResponse.statusText}`);

        if (commentsResponse.ok) {
          commentsFetchSuccess = true;
          const commentsData = await commentsResponse.json();
          const comments = commentsData.data || [];
          totalCommentsFetched += comments.length;

          console.log(`[Comments API] Post ${post.id}: Found ${comments.length} comments`);
          
          // Log if there are no comments (might indicate permissions issue)
          if (comments.length === 0 && !fetchSince) {
            console.log(`[Comments API] Warning: Post ${post.id} has no comments. This might be normal or indicate a permissions issue.`);
          }

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

              newComments.push({
                ...comment,
                postId: post.id,
                postMessage: isInstagram ? (post.caption || '') : (post.message || ''),
              });
              newCommentsCount++;
              console.log(`[Comments API] New comment found: ${comment.id} created at ${commentCreatedAt.toISOString()}`);
            } else {
              skippedCommentsCount++;
              console.log(`[Comments API] Skipped comment ${comment.id} (created: ${commentCreatedAt.toISOString()}, last fetch: ${lastFetchedAt?.toISOString()})`);
            }
          }
        } else {
          const errorText = await commentsResponse.text();
          console.error(`[Comments API] ❌ Error fetching comments for post ${post.id}:`, errorText);
          console.error(`[Comments API] Response status:`, commentsResponse.status);
          
          // Store error for debugging
          let errorMessage = `Post ${post.id}: ${commentsResponse.status} - ${errorText.substring(0, 200)}`;
          commentsErrors.push(errorMessage);
          
          // Try to parse error for more details
          try {
            const errorData = JSON.parse(errorText);
            console.error(`[Comments API] Error details:`, JSON.stringify(errorData, null, 2));
            
            // Check for specific permission errors and try to refresh token
            if (errorData.error) {
              const errorCode = errorData.error.code;
              const errorType = errorData.error.type;
              const errorMessage = errorData.error.message;
              
              console.error(`[Comments API] Facebook API Error - Code: ${errorCode}, Type: ${errorType}, Message: ${errorMessage}`);
              
              if (errorCode === 200 || errorType === 'OAuthException' || errorCode === 190 || errorCode === 10) {
                console.error(`[Comments API] Permission/OAuth error detected. Attempting to refresh page access token...`);
                
                // Try to refresh the token once
                if (currentPageAccessToken === connectedPage.pageAccessToken && !isInstagram) {
                  const refreshedToken = await refreshPageAccessToken();
                  if (refreshedToken) {
                    currentPageAccessToken = refreshedToken;
                    console.log(`[Comments API] ✅ Token refreshed, retrying comment fetch for post ${post.id}...`);
                    
                    // Retry the comment fetch with new token
                    const retryCommentsUrl = `https://graph.facebook.com/v18.0/${post.id}/comments?access_token=${currentPageAccessToken}&fields=id,message,from,created_time&limit=50${fetchSince ? `&since=${Math.floor(fetchSince.getTime() / 1000)}` : ''}`;
                    console.log(`[Comments API] Retry URL:`, retryCommentsUrl.replace(currentPageAccessToken, '[TOKEN]'));
                    const retryResponse = await fetch(retryCommentsUrl);
                    
                    console.log(`[Comments API] Retry response status: ${retryResponse.status}`);
                    
                    if (retryResponse.ok) {
                      commentsFetchSuccess = true;
                      const retryCommentsData = await retryResponse.json();
                      const retryComments = retryCommentsData.data || [];
                      totalCommentsFetched += retryComments.length;
                      console.log(`[Comments API] ✅ Successfully fetched ${retryComments.length} comments after token refresh`);
                      
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

                          newComments.push({
                            ...comment,
                            postId: post.id,
                            postMessage: post.message || '',
                          });
                          newCommentsCount++;
                        } else {
                          skippedCommentsCount++;
                        }
                      }
                      continue; // Skip to next post
                    } else {
                      const retryErrorText = await retryResponse.text();
                      console.error(`[Comments API] ❌ Retry also failed:`, retryErrorText);
                      commentsErrors.push(`Post ${post.id} (retry): ${retryErrorText.substring(0, 200)}`);
                    }
                  } else {
                    console.error(`[Comments API] ❌ Failed to refresh page access token`);
                  }
                }
              } else if (errorCode === 100) {
                console.error(`[Comments API] Invalid parameter error. Post ${post.id} might not support comments or might be invalid.`);
              } else if (errorCode === 3) {
                console.error(`[Comments API] Unknown error. This might indicate the post doesn't exist or is inaccessible.`);
              }
            }
          } catch (parseError) {
            console.error(`[Comments API] Could not parse error response:`, parseError);
          }
        }
      } catch (error) {
        console.error(`[Comments API] Error fetching comments for post ${post.id}:`, error);
        // Continue with next post
      }
    }
    
    console.log(`[Comments API] Summary: ${totalCommentsFetched} total comments fetched, ${newCommentsCount} new comments, ${skippedCommentsCount} skipped`);

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

    // Fetch post messages for all unique post IDs
    const postIds = [...new Set(storedComments.map(c => c.postId))];
    const postMessages: Record<string, string> = {};
    
    // Try to fetch post messages (optional - don't fail if this doesn't work)
    for (const postId of postIds.slice(0, 20)) { // Limit to 20 to avoid too many API calls
      try {
        const postResponse = await fetch(
          `https://graph.facebook.com/v18.0/${postId}?access_token=${currentPageAccessToken}&fields=${isInstagram ? 'caption' : 'message'}`
        );
        if (postResponse.ok) {
          const postData = await postResponse.json();
          postMessages[postId] = isInstagram ? (postData.caption || '') : (postData.message || '');
        }
      } catch (error) {
        // Silently fail - post message is optional
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
      pageName: comment.connectedPage.pageName,
      provider: comment.connectedPage.provider,
    }));

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
          response.error = `Your page access token doesn't have the 'pages_read_engagement' permission. This usually happens when pages were connected before the permission was granted. Please try refreshing your page tokens or disconnect and reconnect your Facebook account in Settings.`;
          response.suggestion = 'refresh_tokens'; // Flag to show refresh button in UI
        } else {
          response.error = `Failed to fetch comments from ${isInstagram ? 'Instagram' : 'Facebook'} posts. Please check your page permissions (pages_read_engagement) and try again.`;
        }
      }
    } else if (!postsFetchSuccess && commentsFetchSuccess) {
      // Successfully fetched comments but couldn't fetch new posts
      response.warning = `Fetched comments from existing ${isInstagram ? 'media' : 'posts'}. Some new ${isInstagram ? 'media' : 'posts'} may not have been included.`;
    }

    console.log('[Comments API] Returning response:', {
      commentsCount: storedComments.length,
      newCommentsCount,
      lastFetchedAt: response.lastFetchedAt,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

