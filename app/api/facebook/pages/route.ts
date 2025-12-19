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
          console.error('Facebook client ID or secret not configured');
          return null;
        }
        
        const tokenExchangeUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${shortLivedToken}`;
        console.log('Attempting to exchange Facebook token...');
        const tokenResponse = await fetch(tokenExchangeUrl);
        
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          const longLivedToken = tokenData.access_token;
          
          if (!longLivedToken) {
            console.error('No access token in exchange response:', tokenData);
            return null;
          }
          
          // Update the stored token in database
          const updateResult = await prisma.account.updateMany({
            where: {
              id: account.id,
            },
            data: {
              access_token: longLivedToken,
            },
          });
          
          console.log('Successfully refreshed Facebook token, updated rows:', updateResult.count);
          return longLivedToken;
        } else {
          const errorText = await tokenResponse.text();
          console.error('Failed to exchange Facebook token. Status:', tokenResponse.status, 'Error:', errorText);
        }
      } catch (error) {
        console.error('Error exchanging Facebook token:', error);
      }
      return null;
    };

    let accessToken = account.access_token;

    // ALWAYS try to exchange token first to ensure we have a long-lived token
    console.log('[API] Fetching Facebook pages for user:', session.user.id);
    console.log('[API] Current token length:', accessToken?.length || 0);
    console.log('[API] Token preview:', accessToken ? `${accessToken.substring(0, 20)}...` : 'NO TOKEN');
    
    // Verify user token has required permissions
    try {
      const userTokenDebugUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${accessToken}&access_token=${accessToken}`;
      const userTokenDebugResponse = await fetch(userTokenDebugUrl);
      
      if (userTokenDebugResponse.ok) {
        const userTokenDebugData = await userTokenDebugResponse.json();
        const userScopes = userTokenDebugData.data?.scopes || [];
        console.log('[API] User token scopes:', userScopes);
        
        if (!userScopes.includes('pages_read_engagement')) {
          console.warn('[API] ⚠️ User token missing pages_read_engagement permission');
          console.warn('[API] This means page tokens will also not have this permission');
          console.warn('[API] User needs to reconnect Facebook account to grant the permission');
        } else {
          console.log('[API] ✅ User token has pages_read_engagement permission');
        }
      }
    } catch (debugError) {
      console.error('[API] Error debugging user token:', debugError);
    }
    
    // Try to exchange token immediately if it's short-lived
    console.log('[API] Attempting token exchange...');
    const refreshedToken = await exchangeToken(accessToken);
    if (refreshedToken) {
      accessToken = refreshedToken;
      console.log('[API] ✅ Token exchanged to long-lived before fetching pages');
      console.log('[API] New token length:', accessToken.length);
    } else {
      console.log('[API] ⚠️ Token exchange failed or skipped, using original token');
    }

    // First, verify the token has the right permissions by checking user info
    console.log('[API] Verifying token permissions...');
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
        console.warn('[API] ⚠️ Facebook rate limit reached. Skipping token verification and continuing...');
        console.warn('[API] Rate limit will reset automatically. This is temporary.');
        // Continue without verification - rate limit is temporary
      } else {
        console.error('[API] ❌ Token validation failed:', meErrorText);
        return NextResponse.json({
          connectedPages,
          pages: [],
          instagramPages: [],
          error: 'Facebook token is invalid. Please reconnect your Facebook account.',
        });
      }
    } else {
      const meData = await meResponse.json();
      console.log('[API] ✅ Token is valid for user:', meData.name || meData.id);
    }

    // Fetch user's Facebook pages
    // Note: We need pages_show_list permission for this to work
    // This endpoint returns Page access tokens (not user tokens) for each page
    const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?access_token=${accessToken}&fields=id,name,access_token,category&limit=100`;
    console.log('[API] Fetching pages from Facebook API...');
    console.log('[API] URL:', pagesUrl.replace(accessToken, '[TOKEN]'));
    
    let pagesResponse = await fetch(pagesUrl);
    
    console.log('[API] Facebook pages API response status:', pagesResponse.status);

    // If token expired, try to exchange it for a long-lived token
    if (!pagesResponse.ok) {
      const errorText = await pagesResponse.text();
      console.error('Facebook API error:', errorText);
      
      // Check if it's a token error
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.code === 190 || errorData.error?.type === 'OAuthException') {
          // Access token expired or invalid - try to exchange for long-lived token
          console.log('Facebook access token expired, attempting to refresh...');
          const refreshedToken = await exchangeToken(accessToken);
          
          if (refreshedToken) {
            // Retry with refreshed token
            accessToken = refreshedToken;
            pagesResponse = await fetch(
              `https://graph.facebook.com/v24.0/me/accounts?access_token=${accessToken}&fields=id,name,access_token`
            );
          } else {
            // Could not refresh, return error
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
    console.log('[API] Raw response text:', responseText.substring(0, 500));
    
    let pagesData: any;
    try {
      pagesData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[API] ❌ Failed to parse response as JSON:', parseError);
      console.error('[API] Response text:', responseText);
      return NextResponse.json({
        connectedPages,
        pages: [],
        instagramPages: [],
        error: 'Invalid response from Facebook API',
      });
    }
    
    console.log('[API] Parsed response data:', JSON.stringify(pagesData, null, 2));
    
    // Check for errors in response
    if (pagesData.error) {
      console.error('[API] ❌ Facebook API returned error:', pagesData.error);
      console.error('[API] Error code:', pagesData.error.code);
      console.error('[API] Error type:', pagesData.error.type);
      console.error('[API] Error message:', pagesData.error.message);
      
      // Check if it's a rate limit error (code 4, is_transient: true)
      if (pagesData.error.code === 4 && pagesData.error.is_transient === true) {
        console.warn('[API] ⚠️ Facebook rate limit reached. Returning connected pages from database.');
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
    console.log('[API] ✅ Found Facebook pages:', facebookPages.length);
    
    if (facebookPages.length > 0) {
      console.log('[API] Page names:', facebookPages.map((p: any) => p.name));
      
      // Refresh stored page tokens for existing connected pages to ensure they have latest permissions
      // This is important when permissions are added after pages were initially connected
      try {
        for (const page of facebookPages) {
          const existingPage = connectedPages.find(cp => cp.pageId === page.id && cp.provider === 'facebook');
          if (existingPage && page.access_token) {
            // Verify the fresh token has the required permissions
            const debugTokenUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${page.access_token}&access_token=${accessToken}`;
            const debugResponse = await fetch(debugTokenUrl);
            
            if (debugResponse.ok) {
              const debugData = await debugResponse.json();
              const scopes = debugData.data?.scopes || [];
              
              if (scopes.includes('pages_read_engagement')) {
                // Update the stored token with the fresh one
                await prisma.connectedPage.updateMany({
                  where: {
                    id: existingPage.id,
                  },
                  data: {
                    pageAccessToken: page.access_token,
                    updatedAt: new Date(),
                  },
                });
                console.log(`[API] ✅ Refreshed page token for ${page.name} with updated permissions`);
              } else {
                console.warn(`[API] ⚠️ Fresh token for ${page.name} still missing pages_read_engagement`);
              }
            } else {
              // Check if it's a rate limit error
              const errorText = await debugResponse.text();
              let errorData: any = {};
              try {
                errorData = JSON.parse(errorText);
              } catch (e) {
                // Not JSON
              }
              
              if (errorData.error?.code === 4 && errorData.error?.is_transient === true) {
                console.warn(`[API] ⚠️ Rate limit reached while verifying token for ${page.name}. Skipping verification.`);
                // Still update the token even if we can't verify it (rate limit is temporary)
                await prisma.connectedPage.updateMany({
                  where: {
                    id: existingPage.id,
                  },
                  data: {
                    pageAccessToken: page.access_token,
                    updatedAt: new Date(),
                  },
                });
                console.log(`[API] ✅ Updated page token for ${page.name} (verification skipped due to rate limit)`);
              } else {
                console.warn(`[API] ⚠️ Failed to verify token for ${page.name}:`, errorText.substring(0, 200));
              }
            }
          }
        }
      } catch (refreshError) {
        console.error('[API] Error refreshing page tokens:', refreshError);
        // Don't fail the request if token refresh fails
      }
    } else {
      console.log('[API] ⚠️ No pages found. This could mean:');
      console.log('[API]   1. User has no Facebook pages');
      console.log('[API]   2. User doesn\'t have admin access to any pages');
      console.log('[API]   3. Token doesn\'t have required permissions');
    }

    // Return Facebook pages immediately, fetch Instagram in parallel (non-blocking)
    const facebookPagesResponse = facebookPages.map((page: any) => ({
      ...page,
      provider: 'facebook',
    }));

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
        console.error(`Error fetching Instagram account for page ${page.id}:`, error);
        return null;
      }
      return null;
    });

    // Wait for all Instagram fetches in parallel (much faster than sequential)
    const instagramResults = await Promise.all(instagramPromises);
    const instagramPages = instagramResults.filter((page): page is any => page !== null);
    
    const response = {
      connectedPages,
      pages: facebookPagesResponse,
      instagramPages,
    };
    
    console.log('[API] ✅ Returning response with:', {
      connectedPages: response.connectedPages.length,
      pages: response.pages.length,
      instagramPages: response.instagramPages.length,
    });
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching Facebook pages:', error);
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
          console.log('[Pages API] Checking user token permissions...');
          const userTokenDebugUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${account.access_token}&access_token=${account.access_token}`;
          const userTokenDebugResponse = await fetch(userTokenDebugUrl);
          
          let userTokenHasPermission = false;
          if (userTokenDebugResponse.ok) {
            const userTokenDebugData = await userTokenDebugResponse.json();
            const userScopes = userTokenDebugData.data?.scopes || [];
            console.log('[Pages API] User token scopes:', userScopes);
            userTokenHasPermission = userScopes.includes('pages_read_engagement');
            
            if (!userTokenHasPermission) {
              console.error('[Pages API] ❌ CRITICAL: User token is missing pages_read_engagement permission!');
              console.error('[Pages API] This means page tokens will NOT have this permission either.');
              console.error('[Pages API] Possible reasons:');
              console.error('[Pages API] 1. Permission requires Facebook App Review and hasn\'t been approved yet');
              console.error('[Pages API] 2. User didn\'t grant the permission during OAuth');
              console.error('[Pages API] 3. App is in development mode and permission requires review');
              console.error('[Pages API] User MUST reconnect and ensure they grant the permission, OR submit for App Review.');
            } else {
              console.log('[Pages API] ✅ User token has pages_read_engagement permission');
            }
          } else {
            const userTokenErrorText = await userTokenDebugResponse.text();
            console.error('[Pages API] Error debugging user token:', userTokenErrorText);
          }
          
          // Verify the page token has the required permissions
          const debugTokenUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${pageAccessToken}&access_token=${account.access_token}`;
          const debugResponse = await fetch(debugTokenUrl);
          
          if (debugResponse.ok) {
            const debugData = await debugResponse.json();
            const scopes = debugData.data?.scopes || [];
            console.log('[Pages API] Page token scopes:', scopes);
            
            if (!scopes.includes('pages_read_engagement')) {
              console.warn('[Pages API] ⚠️ Page token missing pages_read_engagement permission');
              
              // Only try to refresh if user token has permission
              if (userTokenHasPermission) {
                console.log('[Pages API] User token has permission, fetching fresh page token...');
                
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
                      console.log('[Pages API] Fresh page token scopes:', freshScopes);
                      
                      if (freshScopes.includes('pages_read_engagement')) {
                        finalPageAccessToken = page.access_token;
                        console.log('[Pages API] ✅ Using fresh page token with pages_read_engagement permission');
                      } else {
                        console.error('[Pages API] ❌ Fresh token also missing permission even though user token has it!');
                        console.error('[Pages API] This is unusual - page tokens should inherit permissions from user token.');
                      }
                    }
                  } else {
                    console.error('[Pages API] Page not found when fetching fresh tokens');
                  }
                } else {
                  const errorText = await pagesResponse.text();
                  console.error('[Pages API] Failed to fetch fresh page tokens:', errorText);
                }
              } else {
                console.error('[Pages API] ❌ Cannot refresh page token - user token missing permission');
                console.error('[Pages API] Page token will also be missing permission. User needs to reconnect.');
              }
            } else {
              console.log('[Pages API] ✅ Page token has pages_read_engagement permission');
            }
          } else {
            const errorText = await debugResponse.text();
            console.error('[Pages API] Error debugging page token:', errorText);
          }
        }
      } catch (error) {
        console.error('[Pages API] Error verifying/refreshing page token:', error);
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

      console.log('Page connected successfully:', { pageId, pageName, provider, userId: session.user.id });
      return NextResponse.json({ success: true, page: connectedPage });
    } catch (dbError: any) {
      console.error('Database error connecting page:', dbError);
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
    console.error('Error connecting page:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });
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
    console.error('Error disconnecting page:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

