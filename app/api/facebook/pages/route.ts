import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

// Cache for pages data (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const pagesCache = new Map<string, { data: any; timestamp: number }>();

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check cache first
    const cacheKey = `pages_${session.user.id}`;
    const cached = pagesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data);
    }

    // Get connected pages from database
    const connectedPages = await prisma.connectedPage.findMany({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        pageId: true,
        pageName: true,
        provider: true,
        createdAt: true,
        pageAccessToken: true, // Include to compare with fresh tokens
      },
    });

    // Get user's Facebook account access token
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: 'facebook',
      },
    });

    if (!account?.access_token) {
      // Return connected pages even if Facebook account is not connected
      // This allows users to see previously connected pages
      return NextResponse.json({
        connectedPages,
        pages: [],
        instagramPages: [],
        error: connectedPages.length > 0 ? undefined : 'No Facebook account connected',
      });
    }

    // Helper function to exchange token for long-lived token
    const exchangeToken = async (shortLivedToken: string): Promise<string | null> => {
      try {
        if (!process.env.FACEBOOK_CLIENT_ID || !process.env.FACEBOOK_CLIENT_SECRET) {
          return null;
        }
        
        const tokenExchangeUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${shortLivedToken}`;
        const tokenResponse = await fetch(tokenExchangeUrl);
        
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          const longLivedToken = tokenData.access_token;
          
          if (!longLivedToken) {
            return null;
          }
          
          // Update the stored token in database
          await prisma.account.updateMany({
            where: {
              id: account.id,
            },
            data: {
              access_token: longLivedToken,
            },
          });
          
          return longLivedToken;
        }
      } catch (error) {
        // Token exchange failed
      }
      return null;
    };

    let accessToken = account.access_token;

    // ALWAYS try to exchange token first to ensure we have a long-lived token
    console.log('Facebook Pages: Fetching pages...');
    
    // Verify user token has required permissions
    try {
      const userTokenDebugUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${accessToken}&access_token=${accessToken}`;
      const userTokenDebugResponse = await fetch(userTokenDebugUrl);
      
      if (userTokenDebugResponse.ok) {
        const userTokenDebugData = await userTokenDebugResponse.json();
        const userScopes = userTokenDebugData.data?.scopes || [];
        // Check if user token has pages_read_engagement permission
      }
    } catch (debugError) {
      // Error debugging user token
    }
    
    // Try to exchange token immediately if it's short-lived
    const refreshedToken = await exchangeToken(accessToken);
    if (refreshedToken) {
      accessToken = refreshedToken;
    }

    // First, verify the token has the right permissions by checking user info
    const meUrl = `https://graph.facebook.com/v18.0/me?access_token=${accessToken}`;
    const meResponse = await fetch(meUrl);
    
    if (!meResponse.ok) {
      const meErrorText = await meResponse.text();
      let meErrorData: any = {};
      try {
        meErrorData = JSON.parse(meErrorText);
      } catch (e) {
        // Not JSON, use as string
      }
      
      // Check if it's a rate limit error (code 4, is_transient: true)
      if (meErrorData.error?.code === 4 && meErrorData.error?.is_transient === true) {
        console.error('Facebook Rate Limit: Skipping token verification');
        // Continue without verification - rate limit is temporary
      } else {
        console.error('Facebook Error: Token validation failed');
        return NextResponse.json({
          connectedPages,
          pages: [],
          instagramPages: [],
          error: 'Facebook token is invalid. Please reconnect your Facebook account.',
        });
      }
    }

    // Fetch user's Facebook pages
    // Note: We need pages_show_list permission for this to work
    // This endpoint returns Page access tokens (not user tokens) for each page
    const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?access_token=${accessToken}&fields=id,name,access_token,category,picture.type(large)&limit=100`;
    
    let pagesResponse = await fetch(pagesUrl);

    // If token expired, try to exchange it for a long-lived token
    if (!pagesResponse.ok) {
      const errorText = await pagesResponse.text();
      
      // Check if it's a token error
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.code === 190 || errorData.error?.type === 'OAuthException') {
          // Access token expired or invalid - try to exchange for long-lived token
          console.log('Facebook: Token expired, attempting refresh...');
          const refreshedToken = await exchangeToken(accessToken);
          
          if (refreshedToken) {
            // Retry with refreshed token
            accessToken = refreshedToken;
            console.log('Facebook: Token refreshed successfully');
            pagesResponse = await fetch(
              `https://graph.facebook.com/v24.0/me/accounts?access_token=${accessToken}&fields=id,name,access_token,picture.type(large)`
            );
          } else {
            // Could not refresh, return error
            console.error('Facebook Error: Failed to refresh token');
            return NextResponse.json({
              connectedPages,
              pages: [],
              instagramPages: [],
              error: 'Facebook access token expired. Please reconnect your Facebook account.',
            });
          }
        }
      } catch (e) {
        // Not JSON, continue with generic error
      }
      
      // If still not ok after refresh attempt
      if (!pagesResponse.ok) {
        return NextResponse.json({
          connectedPages,
          pages: [],
          instagramPages: [],
          error: 'Failed to fetch pages from Facebook',
        });
      }
    }

    // Parse response
    const responseText = await pagesResponse.text();
    
    let pagesData: any;
    try {
      pagesData = JSON.parse(responseText);
    } catch (parseError) {
      return NextResponse.json({
        connectedPages,
        pages: [],
        instagramPages: [],
        error: 'Invalid response from Facebook API',
      });
    }
    
    // Check for errors in response
    if (pagesData.error) {
      // Check if it's a rate limit error (code 4, is_transient: true)
      if (pagesData.error.code === 4 && pagesData.error.is_transient === true) {
        console.error('Facebook Rate Limit: Cannot fetch pages (code 4). Returning cached pages.');
        // Return connected pages from database even if we can't fetch new ones
        // This allows the app to continue working
        return NextResponse.json({
          connectedPages,
          pages: [],
          instagramPages: [],
          error: 'Facebook API rate limit reached. Please try again in a few minutes. Your connected pages are still available.',
          rateLimited: true,
        });
      }
      
      return NextResponse.json({
        connectedPages,
        pages: [],
        instagramPages: [],
        error: `Facebook API error: ${pagesData.error.message || 'Unknown error'}`,
      });
    }
    
    const facebookPages = pagesData.data || [];
    console.log(`Facebook Pages: Found ${facebookPages.length} pages`);
    
    if (facebookPages.length > 0) {
      // Refresh stored page tokens for existing connected pages
      // Skip token verification to speed up - just update tokens directly
      // Token verification can be done on-demand when needed
      try {
        const updatePromises = facebookPages.map(async (page: any) => {
          const existingPage = connectedPages.find(cp => cp.pageId === page.id && cp.provider === 'facebook');
          if (existingPage && page.access_token) {
            // Update token directly without verification for speed
            await prisma.connectedPage.updateMany({
              where: {
                id: existingPage.id,
              },
              data: {
                pageAccessToken: page.access_token,
                updatedAt: new Date(),
              },
            });
          }
        });
        
        // Execute all updates in parallel
        await Promise.all(updatePromises);
      } catch (refreshError) {
        // Don't fail the request if token refresh fails
      }
    }

    // Return Facebook pages immediately, fetch Instagram in parallel (non-blocking)
    const facebookPagesResponse = facebookPages.map((page: any) => ({
      ...page,
      provider: 'facebook',
    }));

    // Only fetch Instagram if user has connected Instagram pages or if we need to discover them
    // Check if any connected page is Instagram or if we should check for new Instagram accounts
    const hasInstagramPages = connectedPages.some(cp => cp.provider === 'instagram');
    const shouldFetchInstagram = hasInstagramPages || facebookPages.length > 0;

    let instagramPages: any[] = [];

    if (shouldFetchInstagram) {
      // Fetch Instagram Business accounts in PARALLEL for all pages (much faster)
      const instagramPromises = facebookPages.map(async (page: any) => {
        try {
          // Check if this page has an Instagram Business account
          const instagramAccountResponse = await fetch(
            `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
          );

          if (instagramAccountResponse.ok) {
            const instagramAccountData = await instagramAccountResponse.json();
            
            if (instagramAccountData.instagram_business_account?.id) {
              const instagramAccountId = instagramAccountData.instagram_business_account.id;
              
              // Get Instagram account details
              const instagramDetailsResponse = await fetch(
                `https://graph.facebook.com/v18.0/${instagramAccountId}?fields=id,username,name,profile_picture_url&access_token=${page.access_token}`
              );

              if (instagramDetailsResponse.ok) {
                const instagramDetails = await instagramDetailsResponse.json();
                return {
                  id: instagramDetails.id,
                  username: instagramDetails.username || instagramDetails.name || `Instagram ${instagramDetails.id}`,
                  name: instagramDetails.name || instagramDetails.username || `Instagram ${instagramDetails.id}`,
                  profile_picture_url: instagramDetails.profile_picture_url,
                  access_token: page.access_token,
                  facebook_page_id: page.id,
                  provider: 'instagram',
                };
              }
            }
          }
        } catch (error) {
          return null;
        }
        return null;
      });

      // Wait for all Instagram fetches in parallel (much faster than sequential)
      const instagramResults = await Promise.all(instagramPromises);
      instagramPages = instagramResults.filter((page): page is any => page !== null);
    }
    
    const response = {
      connectedPages,
      pages: facebookPagesResponse,
      instagramPages,
    };
    
    // Store in cache before returning
    pagesCache.set(cacheKey, {
      data: response,
      timestamp: Date.now()
    });
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Facebook Pages Error: Internal server error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { pageId, pageName, pageAccessToken, provider = 'facebook' } = body;

    if (!pageId || !pageName || !pageAccessToken) {
      return NextResponse.json(
        { error: 'Missing required fields: pageId, pageName, and pageAccessToken are required' },
        { status: 400 }
      );
    }

    // For Facebook pages, verify and refresh the page access token to ensure it has the latest permissions
    let finalPageAccessToken = pageAccessToken;
    if (provider === 'facebook') {
      try {
        // Get user's Facebook account access token to debug the page token
        const account = await prisma.account.findFirst({
          where: {
            userId: session.user.id,
            provider: 'facebook',
          },
        });

        if (account?.access_token) {
          // FIRST: Check if the user's main token has the permission
          const userTokenDebugUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${account.access_token}&access_token=${account.access_token}`;
          const userTokenDebugResponse = await fetch(userTokenDebugUrl);
          
          let userTokenHasPermission = false;
          if (userTokenDebugResponse.ok) {
            const userTokenDebugData = await userTokenDebugResponse.json();
            const userScopes = userTokenDebugData.data?.scopes || [];
            userTokenHasPermission = userScopes.includes('pages_read_engagement');
          }
          
          // Verify the page token has the required permissions
          const debugTokenUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${pageAccessToken}&access_token=${account.access_token}`;
          const debugResponse = await fetch(debugTokenUrl);
          
          if (debugResponse.ok) {
            const debugData = await debugResponse.json();
            const scopes = debugData.data?.scopes || [];
            
            if (!scopes.includes('pages_read_engagement')) {
              // Only try to refresh if user token has permission
              if (userTokenHasPermission) {
                // Fetch fresh page tokens from Facebook
                const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?access_token=${account.access_token}&fields=id,name,access_token&limit=100`;
                const pagesResponse = await fetch(pagesUrl);
                
                if (pagesResponse.ok) {
                  const pagesData = await pagesResponse.json();
                  const page = pagesData.data?.find((p: any) => p.id === pageId);
                  
                  if (page?.access_token) {
                    // Verify the fresh token has the permission
                    const freshDebugUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${page.access_token}&access_token=${account.access_token}`;
                    const freshDebugResponse = await fetch(freshDebugUrl);
                    
                    if (freshDebugResponse.ok) {
                      const freshDebugData = await freshDebugResponse.json();
                      const freshScopes = freshDebugData.data?.scopes || [];
                      
                      if (freshScopes.includes('pages_read_engagement')) {
                        finalPageAccessToken = page.access_token;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        // Continue with original token if verification fails
      }
    }

    // Store connected page
    try {
      const connectedPage = await prisma.connectedPage.upsert({
        where: {
          userId_pageId_provider: {
            userId: session.user.id,
            pageId,
            provider,
          },
        },
        update: {
          pageName,
          pageAccessToken: finalPageAccessToken,
          updatedAt: new Date(),
        },
        create: {
          userId: session.user.id,
          pageId,
          pageName,
          pageAccessToken: finalPageAccessToken,
          provider,
        },
      });

      return NextResponse.json({ success: true, page: connectedPage });
    } catch (dbError: any) {
      // Check for unique constraint violation
      if (dbError.code === 'P2002') {
        return NextResponse.json(
          { error: 'Page is already connected' },
          { status: 409 }
        );
      }
      throw dbError; // Re-throw to be caught by outer catch
    }
  } catch (error: any) {
    return NextResponse.json(
      { 
        error: error?.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');
    const provider = searchParams.get('provider') || 'facebook';

    if (!pageId) {
      return NextResponse.json(
        { error: 'Page ID is required' },
        { status: 400 }
      );
    }

    // Find and delete the connected page
    const connectedPage = await prisma.connectedPage.findFirst({
      where: {
        userId: session.user.id,
        pageId,
        provider,
      },
    });

    if (!connectedPage) {
      return NextResponse.json(
        { error: 'Page not found or not connected' },
        { status: 404 }
      );
    }

    // Delete the connected page (this will also delete associated comments due to cascade)
    await prisma.connectedPage.delete({
      where: {
        id: connectedPage.id,
      },
    });

    return NextResponse.json({ success: true, message: 'Page disconnected successfully' });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

