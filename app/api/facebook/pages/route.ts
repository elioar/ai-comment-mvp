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
      console.error('[API] ❌ Token validation failed:', meErrorText);
      return NextResponse.json({
        connectedPages,
        pages: [],
        instagramPages: [],
        error: 'Facebook token is invalid. Please reconnect your Facebook account.',
      });
    }
    
    const meData = await meResponse.json();
    console.log('[API] ✅ Token is valid for user:', meData.name || meData.id);

    // Fetch user's Facebook pages
    // Try multiple endpoints to find pages
    console.log('[API] Attempting to fetch pages using multiple methods...');
    
    // Method 1: Standard me/accounts endpoint
    let pagesUrl = `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}&fields=id,name,access_token,category`;
    console.log('[API] Method 1 - Fetching from me/accounts...');
    console.log('[API] URL:', pagesUrl.replace(accessToken, '[TOKEN]'));
    
    let pagesResponse = await fetch(pagesUrl);
    
    // If empty, try Method 2: Check if user has pages via /me endpoint
    if (pagesResponse.ok) {
      const testData = await pagesResponse.text();
      const testParsed = JSON.parse(testData);
      if (!testParsed.data || testParsed.data.length === 0) {
        console.log('[API] Method 1 returned empty, trying alternative methods...');
        
        // Method 2: Try with limit parameter
        pagesUrl = `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}&fields=id,name,access_token,category&limit=100`;
        console.log('[API] Method 2 - Trying with limit=100...');
        pagesResponse = await fetch(pagesUrl);
        
        if (pagesResponse.ok) {
          const testData2 = await pagesResponse.text();
          const testParsed2 = JSON.parse(testData2);
          if (!testParsed2.data || testParsed2.data.length === 0) {
            // Method 3: Try checking user's pages via /me?fields=accounts
            console.log('[API] Method 3 - Trying /me?fields=accounts...');
            const meAccountsUrl = `https://graph.facebook.com/v18.0/me?fields=accounts{id,name,access_token}&access_token=${accessToken}`;
            const meAccountsResponse = await fetch(meAccountsUrl);
            
            if (meAccountsResponse.ok) {
              const meAccountsData = await meAccountsResponse.json();
              console.log('[API] Method 3 response:', JSON.stringify(meAccountsData, null, 2));
              
              if (meAccountsData.accounts && meAccountsData.accounts.data && meAccountsData.accounts.data.length > 0) {
                // Found pages via alternative method
                const pagesData = {
                  data: meAccountsData.accounts.data.map((page: any) => ({
                    id: page.id,
                    name: page.name,
                    access_token: page.access_token || accessToken, // Use user token if page token not available
                  }))
                };
                console.log('[API] ✅ Found pages via Method 3:', pagesData.data.length);
                // Continue with this data
                const facebookPages = pagesData.data || [];
                // Skip to processing pages
                return processPages(facebookPages, connectedPages);
              }
            }
          }
        }
      }
    }
    
    console.log('[API] Facebook pages API response status:', pagesResponse.status);
    console.log('[API] Response headers:', Object.fromEntries(pagesResponse.headers.entries()));

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
              `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}&fields=id,name,access_token`
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

    const responseText = await pagesResponse.text();
    console.log('[API] Raw response text:', responseText.substring(0, 500));
    
    let pagesData;
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
    } else {
      console.log('[API] ⚠️ No pages found. This could mean:');
      console.log('[API]   1. User has no Facebook pages');
      console.log('[API]   2. User doesn\'t have admin access to any pages');
      console.log('[API]   3. Token doesn\'t have required permissions');
    }

    // Fetch Instagram Business accounts for each Facebook page
    const instagramPages: any[] = [];
    
    for (const page of facebookPages) {
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
              instagramPages.push({
                id: instagramDetails.id,
                username: instagramDetails.username || instagramDetails.name || `Instagram ${instagramDetails.id}`,
                name: instagramDetails.name || instagramDetails.username || `Instagram ${instagramDetails.id}`,
                profile_picture_url: instagramDetails.profile_picture_url,
                access_token: page.access_token, // Use the page access token
                facebook_page_id: page.id, // Store the parent Facebook page ID
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching Instagram account for page ${page.id}:`, error);
        // Continue with other pages even if one fails
      }
    }
    
    const response = {
      connectedPages,
      pages: facebookPages.map((page: any) => ({
        ...page,
        provider: 'facebook',
      })),
      instagramPages: instagramPages.map((page: any) => ({
        ...page,
        provider: 'instagram',
      })),
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
          pageAccessToken,
          updatedAt: new Date(),
        },
        create: {
          userId: session.user.id,
          pageId,
          pageName,
          pageAccessToken,
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

