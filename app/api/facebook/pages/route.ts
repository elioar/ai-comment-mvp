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

    // Fetch user's Facebook pages
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${account.access_token}&fields=id,name,access_token`
    );

    if (!pagesResponse.ok) {
      const errorText = await pagesResponse.text();
      console.error('Facebook API error:', errorText);
      return NextResponse.json({
        connectedPages,
        pages: [],
        instagramPages: [],
        error: 'Failed to fetch pages from Facebook',
      });
    }

    const pagesData = await pagesResponse.json();
    const facebookPages = pagesData.data || [];

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
    
    return NextResponse.json({
      connectedPages,
      pages: facebookPages.map((page: any) => ({
        ...page,
        provider: 'facebook',
      })),
      instagramPages: instagramPages.map((page: any) => ({
        ...page,
        provider: 'instagram',
      })),
    });
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

    return NextResponse.json({ success: true, page: connectedPage });
  } catch (error) {
    console.error('Error connecting page:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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

