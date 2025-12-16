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
      return NextResponse.json({
        connectedPages,
        pages: [],
        error: 'No Facebook account connected',
      });
    }

    // Fetch user's Facebook pages
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${account.access_token}&fields=id,name,access_token`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Facebook API error:', errorText);
      return NextResponse.json({
        connectedPages,
        pages: [],
        error: 'Failed to fetch pages from Facebook',
      });
    }

    const data = await response.json();
    
    return NextResponse.json({
      connectedPages,
      pages: data.data || [],
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

