import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fetchCommentsInBackground } from '../comments/route';

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
    let connectedPages = await prisma.connectedPage.findMany({
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
        adAccountId: true, // Include ad account ID
      },
    });

    const hadConnectedPagesInitially = connectedPages.length > 0;

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
    
    // Auto-connect all Facebook pages for brand-new users (no connected pages yet)
    if (!hadConnectedPagesInitially && facebookPages.length > 0) {
      try {
        const now = new Date();
        const autoConnectedFb = await Promise.all(
          facebookPages
            .filter((page: any) => page.access_token)
            .map((page: any) =>
              prisma.connectedPage.upsert({
                where: {
                  userId_pageId_provider: {
                    userId: session.user.id,
                    pageId: page.id,
                    provider: 'facebook',
                  },
                },
                update: {
                  pageName: page.name,
                  pageAccessToken: page.access_token,
                  updatedAt: now,
                },
                create: {
                  userId: session.user.id,
                  pageId: page.id,
                  pageName: page.name,
                  pageAccessToken: page.access_token,
                  provider: 'facebook',
                },
              })
            )
        );

        if (autoConnectedFb.length > 0) {
          connectedPages = [...connectedPages, ...autoConnectedFb];
        }
      } catch (e) {
        console.error('Auto-connect Facebook pages failed:', e);
      }
    }

    // Auto-connect Instagram accounts for brand-new users as well
    if (!hadConnectedPagesInitially && instagramPages.length > 0) {
      try {
        const now = new Date();
        const autoConnectedIg = await Promise.all(
          instagramPages.map((page: any) =>
            prisma.connectedPage.upsert({
              where: {
                userId_pageId_provider: {
                  userId: session.user.id,
                  pageId: page.id,
                  provider: 'instagram',
                },
              },
              update: {
                pageName: page.name || page.username,
                pageAccessToken: page.access_token,
                updatedAt: now,
              },
              create: {
                userId: session.user.id,
                pageId: page.id,
                pageName: page.name || page.username,
                pageAccessToken: page.access_token,
                provider: 'instagram',
              },
            })
          )
        );

        if (autoConnectedIg.length > 0) {
          connectedPages = [...connectedPages, ...autoConnectedIg];
        }
      } catch (e) {
        console.error('Auto-connect Instagram pages failed:', e);
      }
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

    // Try to automatically detect ad account ID for Facebook pages
    let adAccountId: string | null = null;
    if (provider === 'facebook') {
      console.log(`[Ad Account Detection] Starting detection for page ${pageId}...`);
      try {
        const account = await prisma.account.findFirst({
          where: {
            userId: session.user.id,
            provider: 'facebook',
          },
          select: {
            access_token: true,
          },
        });

        if (account?.access_token) {
          console.log(`[Ad Account Detection] Found Facebook account token, fetching ad accounts for page ${pageId}...`);
          
          // Priority Strategy: Always use the specific ad account "Elyon Mon IKE"
          const targetBusinessName = 'Elyon Mon IKE';
          const targetAdAccountId = 'act_269316045245432';
          
          console.log(`[Ad Account Detection] Priority Strategy: Looking for ad account "${targetBusinessName}" (ID: ${targetAdAccountId})...`);
          const priorityAdAccountsUrl = `https://graph.facebook.com/v24.0/me/adaccounts?access_token=${account.access_token}&fields=id,account_id,name,business_name&limit=100`;
          const priorityAdAccountsResponse = await fetch(priorityAdAccountsUrl);
          
          if (priorityAdAccountsResponse.ok) {
            const priorityAdAccountsData = await priorityAdAccountsResponse.json();
            const priorityAdAccounts = priorityAdAccountsData.data || [];
            
            // Find the specific ad account by business_name or id
            const targetAccount = priorityAdAccounts.find((acc: any) => 
              acc.business_name === targetBusinessName || acc.id === targetAdAccountId
            );
            
            if (targetAccount) {
              adAccountId = targetAccount.account_id || targetAccount.id?.replace(/^act_/i, '') || null;
              console.log(`✅ [Ad Account Detection] Found target ad account: "${targetAccount.name}" (Business: ${targetAccount.business_name || 'N/A'}, ID: ${adAccountId})`);
              // Skip other strategies - we found the target account
            } else {
              console.log(`ℹ️  [Ad Account Detection] Target ad account "${targetBusinessName}" not found, trying other strategies...`);
            }
          }
          
          // Strategy 1: Try to get ad accounts directly from the page (business portfolio ad accounts)
          // Only if we haven't found the target account yet
          if (!adAccountId) {
          // This gets ad accounts associated with the page's business portfolio
          console.log(`[Ad Account Detection] Strategy 1: Trying to fetch ad accounts from page ${pageId} using user token...`);
            const pageAdAccountsUrl = `https://graph.facebook.com/v24.0/${pageId}/adaccounts?access_token=${account.access_token}&fields=id,account_id,name&limit=25`;
            const pageAdAccountsResponse = await fetch(pageAdAccountsUrl);
            
            let foundAdAccounts = false;
            
            if (pageAdAccountsResponse.ok) {
              const pageAdAccountsData = await pageAdAccountsResponse.json();
              const pageAdAccounts = pageAdAccountsData.data || [];
              
              if (pageAdAccounts.length > 0) {
                // Use the ad account from the page's business portfolio
                adAccountId = pageAdAccounts[0].account_id || pageAdAccounts[0].id?.replace(/^act_/i, '') || null;
                console.log(`✅ [Ad Account Detection] Found ${pageAdAccounts.length} ad account(s) from page's business portfolio`);
                console.log(`✅ [Ad Account Detection] Using ad account: "${pageAdAccounts[0].name || adAccountId}" (ID: ${adAccountId})`);
                foundAdAccounts = true;
              }
            } else {
              // Log why page endpoint failed
              const errorText = await pageAdAccountsResponse.text();
              console.log(`ℹ️  [Ad Account Detection] Page endpoint returned ${pageAdAccountsResponse.status}: ${errorText.substring(0, 200)}`);
            }
            
            // Strategy 2: Try using page access token (for customer pages managed by you)
            if (!foundAdAccounts && finalPageAccessToken) {
            console.log(`[Ad Account Detection] Strategy 2: Trying to fetch ad accounts using page access token...`);
            const pageTokenAdAccountsUrl = `https://graph.facebook.com/v24.0/${pageId}/adaccounts?access_token=${finalPageAccessToken}&fields=id,account_id,name&limit=25`;
            const pageTokenAdAccountsResponse = await fetch(pageTokenAdAccountsUrl);
            
            if (pageTokenAdAccountsResponse.ok) {
              const pageTokenAdAccountsData = await pageTokenAdAccountsResponse.json();
              const pageTokenAdAccounts = pageTokenAdAccountsData.data || [];
              
              if (pageTokenAdAccounts.length > 0) {
                adAccountId = pageTokenAdAccounts[0].account_id || pageTokenAdAccounts[0].id?.replace(/^act_/i, '') || null;
                console.log(`✅ [Ad Account Detection] Found ${pageTokenAdAccounts.length} ad account(s) using page token`);
                console.log(`✅ [Ad Account Detection] Using ad account: "${pageTokenAdAccounts[0].name || adAccountId}" (ID: ${adAccountId})`);
                foundAdAccounts = true;
              } else {
                console.log(`ℹ️  [Ad Account Detection] Strategy 2: Page token returned empty results (no ad accounts found)`);
              }
            } else {
              const errorText = await pageTokenAdAccountsResponse.text();
              const errorMessage = errorText.substring(0, 300);
              console.log(`ℹ️  [Ad Account Detection] Strategy 2 failed (${pageTokenAdAccountsResponse.status}): ${errorMessage}`);
            }
          }
            
            // Strategy 3: Try to get business manager from page, then get ad accounts from business
            if (!foundAdAccounts) {
            try {
              console.log(`[Ad Account Detection] Strategy 3: Trying to get business manager ID from page...`);
              // Get business manager ID from page
              const pageBusinessUrl = `https://graph.facebook.com/v24.0/${pageId}?access_token=${account.access_token}&fields=business`;
              const pageBusinessResponse = await fetch(pageBusinessUrl);
              
              if (pageBusinessResponse.ok) {
                const pageBusinessData = await pageBusinessResponse.json();
                const businessId = pageBusinessData.business?.id;
                
                if (businessId) {
                  console.log(`[Ad Account Detection] Found business ID: ${businessId}, fetching ad accounts...`);
                  
                  // Try /client_ad_accounts first (assigned client ad accounts - most common for customer pages)
                  console.log(`[Ad Account Detection] Strategy 3a: Trying /client_ad_accounts (assigned client accounts)...`);
                  const businessClientAdAccountsUrl = `https://graph.facebook.com/v24.0/${businessId}/client_ad_accounts?access_token=${account.access_token}&fields=id,account_id,name&limit=25`;
                  const businessClientAdAccountsResponse = await fetch(businessClientAdAccountsUrl);
                  
                  if (businessClientAdAccountsResponse.ok) {
                    const businessClientAdAccountsData = await businessClientAdAccountsResponse.json();
                    const businessClientAdAccounts = businessClientAdAccountsData.data || [];
                    
                    if (businessClientAdAccounts.length > 0) {
                      // Try to find ad account that matches page name or use the first one
                      const pageNameLower = pageName.toLowerCase();
                      const matchingClientAccount = businessClientAdAccounts.find((acc: any) => 
                        acc.name?.toLowerCase().includes(pageNameLower) ||
                        pageNameLower.includes(acc.name?.toLowerCase() || '')
                      );
                      
                      const selectedAccount = matchingClientAccount || businessClientAdAccounts[0];
                      adAccountId = selectedAccount.account_id || selectedAccount.id?.replace(/^act_/i, '') || null;
                      
                      if (matchingClientAccount) {
                        console.log(`✅ [Ad Account Detection] Found matching client ad account: "${matchingClientAccount.name}" (ID: ${adAccountId})`);
                      } else {
                        console.log(`✅ [Ad Account Detection] Found ${businessClientAdAccounts.length} client ad account(s) from business manager (/client_ad_accounts)`);
                        console.log(`✅ [Ad Account Detection] Using first client ad account: "${selectedAccount.name || adAccountId}" (ID: ${adAccountId})`);
                      }
                      foundAdAccounts = true;
                    } else {
                      // If /client_ad_accounts returned empty, try /owned_ad_accounts
                      console.log(`[Ad Account Detection] Strategy 3b: /client_ad_accounts returned empty, trying /owned_ad_accounts...`);
                      const businessOwnedAdAccountsUrl = `https://graph.facebook.com/v24.0/${businessId}/owned_ad_accounts?access_token=${account.access_token}&fields=id,account_id,name&limit=25`;
                      const businessOwnedAdAccountsResponse = await fetch(businessOwnedAdAccountsUrl);
                      
                      if (businessOwnedAdAccountsResponse.ok) {
                        const businessOwnedAdAccountsData = await businessOwnedAdAccountsResponse.json();
                        const businessOwnedAdAccounts = businessOwnedAdAccountsData.data || [];
                        
                        if (businessOwnedAdAccounts.length > 0) {
                          const pageNameLower = pageName.toLowerCase();
                          const matchingOwnedAccount = businessOwnedAdAccounts.find((acc: any) => 
                            acc.name?.toLowerCase().includes(pageNameLower) ||
                            pageNameLower.includes(acc.name?.toLowerCase() || '')
                          );
                          
                          const selectedAccount = matchingOwnedAccount || businessOwnedAdAccounts[0];
                          adAccountId = selectedAccount.account_id || selectedAccount.id?.replace(/^act_/i, '') || null;
                          
                          if (matchingOwnedAccount) {
                            console.log(`✅ [Ad Account Detection] Found matching owned ad account: "${matchingOwnedAccount.name}" (ID: ${adAccountId})`);
                          } else {
                            console.log(`✅ [Ad Account Detection] Found ${businessOwnedAdAccounts.length} owned ad account(s) from business manager (/owned_ad_accounts)`);
                            console.log(`✅ [Ad Account Detection] Using first owned ad account: "${selectedAccount.name || adAccountId}" (ID: ${adAccountId})`);
                          }
                          foundAdAccounts = true;
                        } else {
                          console.log(`ℹ️  [Ad Account Detection] Business manager has no owned ad accounts`);
                        }
                      } else {
                        const errorText = await businessOwnedAdAccountsResponse.text();
                        const errorMessage = errorText.substring(0, 300);
                        console.log(`ℹ️  [Ad Account Detection] /owned_ad_accounts failed (${businessOwnedAdAccountsResponse.status}): ${errorMessage}`);
                      }
                    }
                  } else {
                    // If /client_ad_accounts failed, try /owned_ad_accounts as fallback
                    const errorText = await businessClientAdAccountsResponse.text();
                    const errorMessage = errorText.substring(0, 300);
                    console.log(`ℹ️  [Ad Account Detection] /client_ad_accounts failed (${businessClientAdAccountsResponse.status}): ${errorMessage}`);
                    console.log(`[Ad Account Detection] Strategy 3b: /client_ad_accounts failed, trying /owned_ad_accounts...`);
                    const businessOwnedAdAccountsUrl = `https://graph.facebook.com/v24.0/${businessId}/owned_ad_accounts?access_token=${account.access_token}&fields=id,account_id,name&limit=25`;
                    const businessOwnedAdAccountsResponse = await fetch(businessOwnedAdAccountsUrl);
                    
                    if (businessOwnedAdAccountsResponse.ok) {
                      const businessOwnedAdAccountsData = await businessOwnedAdAccountsResponse.json();
                      const businessOwnedAdAccounts = businessOwnedAdAccountsData.data || [];
                      
                      if (businessOwnedAdAccounts.length > 0) {
                        const pageNameLower = pageName.toLowerCase();
                        const matchingOwnedAccount = businessOwnedAdAccounts.find((acc: any) => 
                          acc.name?.toLowerCase().includes(pageNameLower) ||
                          pageNameLower.includes(acc.name?.toLowerCase() || '')
                        );
                        
                        const selectedAccount = matchingOwnedAccount || businessOwnedAdAccounts[0];
                        adAccountId = selectedAccount.account_id || selectedAccount.id?.replace(/^act_/i, '') || null;
                        
                        if (matchingOwnedAccount) {
                          console.log(`✅ [Ad Account Detection] Found matching owned ad account: "${matchingOwnedAccount.name}" (ID: ${adAccountId})`);
                        } else {
                          console.log(`✅ [Ad Account Detection] Found ${businessOwnedAdAccounts.length} owned ad account(s) from business manager (/owned_ad_accounts)`);
                          console.log(`✅ [Ad Account Detection] Using first owned ad account: "${selectedAccount.name || adAccountId}" (ID: ${adAccountId})`);
                        }
                        foundAdAccounts = true;
                      } else {
                        console.log(`ℹ️  [Ad Account Detection] /owned_ad_accounts returned empty (no owned ad accounts found)`);
                      }
                    } else {
                      const errorText2 = await businessOwnedAdAccountsResponse.text();
                      const errorMessage2 = errorText2.substring(0, 300);
                      console.log(`ℹ️  [Ad Account Detection] /owned_ad_accounts also failed (${businessOwnedAdAccountsResponse.status}): ${errorMessage2}`);
                    }
                  }
                } else {
                  console.log(`ℹ️  [Ad Account Detection] Page has no associated business manager`);
                }
              }
            } catch (error) {
              console.log(`ℹ️  [Ad Account Detection] Strategy 3 failed: ${error}`);
            }
          }
          } // End of Strategy 1, 2, 3 block (if !adAccountId)
          
          // Fallback: Try /me/adaccounts but filter/search for page-related accounts
          // Only if we haven't found any ad account yet (including from priority strategy and other strategies)
          if (!adAccountId) {
            // If all other strategies failed, try /me/adaccounts but filter/search for page-related accounts
            console.log(`[Ad Account Detection] All strategies failed, trying user ad accounts as fallback...`);
            const userAdAccountsUrl = `https://graph.facebook.com/v24.0/me/adaccounts?access_token=${account.access_token}&fields=id,account_id,name&limit=50`;
            const userAdAccountsResponse = await fetch(userAdAccountsUrl);
            
            if (userAdAccountsResponse.ok) {
              const userAdAccountsData = await userAdAccountsResponse.json();
              const userAdAccounts = userAdAccountsData.data || [];
              
              console.log(`[Ad Account Detection] Found ${userAdAccounts.length} user ad account(s)`);
              
              if (userAdAccounts.length > 0) {
                // Try to find an ad account that matches the page name or use the first one
                const pageNameLower = pageName.toLowerCase();
                const matchingAccount = userAdAccounts.find((acc: any) => 
                  acc.name?.toLowerCase().includes(pageNameLower) || 
                  acc.name?.toLowerCase().includes('ad account')
                );
                
                if (matchingAccount) {
                  adAccountId = matchingAccount.account_id || matchingAccount.id?.replace(/^act_/i, '') || null;
                  console.log(`✅ [Ad Account Detection] Found matching ad account: "${matchingAccount.name}" (ID: ${adAccountId})`);
                } else {
                  // Use the first ad account as fallback
                  adAccountId = userAdAccounts[0].account_id || userAdAccounts[0].id?.replace(/^act_/i, '') || null;
                  console.log(`⚠️  [Ad Account Detection] No page-specific ad account found, using first user ad account: "${userAdAccounts[0].name || adAccountId}" (ID: ${adAccountId})`);
                  console.log(`💡 [Ad Account Detection] You may need to manually set the correct ad account ID in your settings`);
                }
              } else {
                console.log(`⚠️  [Ad Account Detection] No ad accounts found for this user`);
              }
            } else {
              // Error logging
              const errorText = await userAdAccountsResponse.text();
              const errorMessage = errorText.substring(0, 300);
              console.error(`❌ [Ad Account Detection] Failed to fetch user ad accounts: ${userAdAccountsResponse.status} - ${errorMessage}`);
              console.log(`💡 [Ad Account Detection] This might mean:`);
              console.log(`   - The ads_read permission is not granted`);
              console.log(`   - The user doesn't have access to any ad accounts`);
              console.log(`   - The access token doesn't have the required permissions`);
            }
          }
        } else {
          console.log(`⚠️  [Ad Account Detection] No Facebook account access token found`);
        }
      } catch (error) {
        console.error(`❌ [Ad Account Detection] Error auto-detecting ad account:`, error);
      }
    } else {
      console.log(`[Ad Account Detection] Skipping detection for ${provider} (only Facebook supported)`);
    }

    // Store connected page
    try {
      // Check if page already exists to decide whether to update adAccountId
      const existingPage = await prisma.connectedPage.findUnique({
        where: {
          userId_pageId_provider: {
            userId: session.user.id,
            pageId,
            provider,
          },
        },
        select: { adAccountId: true },
      });

      const updateData: any = {
        pageName,
        pageAccessToken: finalPageAccessToken,
        updatedAt: new Date(),
      };

      // Always update adAccountId if we successfully detected one (permissions may have changed, or user wants to refresh it)
      // This allows reconnecting a page to automatically refresh the ad account ID
      if (adAccountId) {
        updateData.adAccountId = adAccountId;
        console.log(`✅ [Ad Account Detection] Setting ad account ID: ${adAccountId} for page ${pageId}`);
      } else if (existingPage && !existingPage.adAccountId) {
        // Keep existing behavior: only log if page exists but has no ad account ID
        console.log(`ℹ️  [Ad Account Detection] No ad account detected. Keeping existing value (if any).`);
      }

      const connectedPage = await prisma.connectedPage.upsert({
        where: {
          userId_pageId_provider: {
            userId: session.user.id,
            pageId,
            provider,
          },
        },
        update: updateData,
        create: {
          userId: session.user.id,
          pageId,
          pageName,
          pageAccessToken: finalPageAccessToken,
          adAccountId,
          provider,
        },
      });

      // Clear the cache so fresh data is fetched immediately
      const cacheKey = `pages_${session.user.id}`;
      pagesCache.delete(cacheKey);

      // Auto-fetch comments for the first time after connecting the page
      // This runs in the background so it doesn't block the response
      if (connectedPage.id) {
        console.log(`🔄 [Auto-fetch] Triggering initial comment fetch for page ${pageName}...`);
        // Call fetchCommentsInBackground asynchronously without awaiting (fire and forget)
        // This will fetch comments from both posts and ads automatically
        const isInstagram = provider === 'instagram';
        fetchCommentsInBackground(
          pageId,
          connectedPage.id,
          session.user.id,
          isInstagram,
          finalPageAccessToken,
          null // fetchSince = null means fetch all comments
        ).catch((error) => {
          console.error(`❌ [Auto-fetch] Error fetching initial comments for page ${pageName}:`, error);
        });
      }

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

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { pageId, adAccountId, provider: providerParam } = body;

    if (!pageId) {
      return NextResponse.json(
        { error: 'Page ID is required' },
        { status: 400 }
      );
    }

    const provider = providerParam || 'facebook';

    // Normalize ad account ID (remove 'act_' prefix if present)
    const normalizedAdAccountId = adAccountId 
      ? String(adAccountId).trim().replace(/^act_/i, '')
      : null;

    // Update the ad account ID for the connected page
    try {
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (normalizedAdAccountId) {
        updateData.adAccountId = normalizedAdAccountId;
        console.log(`✅ [Ad Account Update] Setting ad account ID: ${normalizedAdAccountId} for page ${pageId}`);
      } else {
        updateData.adAccountId = null;
        console.log(`✅ [Ad Account Update] Clearing ad account ID for page ${pageId}`);
      }

      const connectedPage = await prisma.connectedPage.update({
        where: {
          userId_pageId_provider: {
            userId: session.user.id,
            pageId,
            provider,
          },
        },
        data: updateData,
        select: {
          id: true,
          pageId: true,
          pageName: true,
          adAccountId: true,
          provider: true,
        },
      });

      // Clear the cache so fresh data is fetched immediately
      const cacheKey = `pages_${session.user.id}`;
      pagesCache.delete(cacheKey);

      return NextResponse.json({
        success: true,
        page: connectedPage,
        message: normalizedAdAccountId 
          ? `Ad account ID updated successfully`
          : `Ad account ID cleared successfully`,
      });
    } catch (dbError: any) {
      if (dbError.code === 'P2025') {
        return NextResponse.json(
          { error: 'Page not found' },
          { status: 404 }
        );
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error('[Ad Account Update] Error:', error);
    return NextResponse.json(
      {
        error: error?.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
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

    // Clear the cache so fresh data is fetched immediately
    const cacheKey = `pages_${session.user.id}`;
    pagesCache.delete(cacheKey);

    return NextResponse.json({ success: true, message: 'Page disconnected successfully' });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

