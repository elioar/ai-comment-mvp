import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

// Get replies for a comment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { commentId } = await params;

    // Get the original comment and its connected page
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        connectedPage: true,
      },
    });

    if (!comment) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    // Verify user owns this comment's page
    if (comment.connectedPage.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Get page access token
    let pageAccessToken = comment.connectedPage.pageAccessToken;

    // If token is missing, try to refresh it
    if (!pageAccessToken) {
      const account = await prisma.account.findFirst({
        where: {
          userId: session.user.id,
          provider: 'facebook',
        },
      });

      if (account?.access_token) {
        const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?access_token=${account.access_token}&fields=id,access_token&limit=100`;
        const pagesResponse = await fetch(pagesUrl);

        if (pagesResponse.ok) {
          const pagesData = await pagesResponse.json();
          const page = pagesData.data?.find((p: any) => p.id === comment.connectedPage.pageId);
          if (page?.access_token) {
            pageAccessToken = page.access_token;
            await prisma.connectedPage.update({
              where: { id: comment.connectedPage.id },
              data: { pageAccessToken },
            });
          }
        }
      }
    }

    if (!pageAccessToken) {
      return NextResponse.json(
        { error: 'Page access token is missing. Please reconnect your Facebook account.' },
        { status: 401 }
      );
    }

    const isInstagram = comment.connectedPage.provider === 'instagram';

    // Facebook: GET /{comment-id}/comments
    // Instagram: GET /{ig-comment-id}/replies
    const endpointPath = isInstagram
      ? `${comment.commentId}/replies`
      : `${comment.commentId}/comments`;

    const fields = isInstagram
      ? 'id,text,username,timestamp'
      : 'id,message,from,created_time';

    const apiUrl = `https://graph.facebook.com/v24.0/${endpointPath}?access_token=${pageAccessToken}&fields=${fields}&limit=50`;    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to load replies';

      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        // Use default error message
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    const repliesRaw = data.data || [];

    const replies = repliesRaw.map((r: any) => {
      if (isInstagram) {
        return {
          id: r.id,
          message: r.text || '',
          authorName: r.username || 'Unknown',
          createdAt: r.timestamp || new Date().toISOString(),
        };
      }
      return {
        id: r.id,
        message: r.message || '',
        authorName: r.from?.name || 'Unknown',
        createdAt: r.created_time || new Date().toISOString(),
      };
    });

    return NextResponse.json({ replies });
  } catch (error: any) {    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
// Hide / unhide comment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { commentId } = await params;
    const body = await request.json();
    const { action } = body; // 'hide' or 'unhide'

    if (!action || (action !== 'hide' && action !== 'unhide')) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "hide" or "unhide"' },
        { status: 400 }
      );
    }

    // Get the comment from database
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        connectedPage: true,
      },
    });

    if (!comment) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    // Verify user owns this comment's page
    if (comment.connectedPage.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Get page access token
    let pageAccessToken = comment.connectedPage.pageAccessToken;
    
    // If token is missing, try to refresh it
    if (!pageAccessToken) {
      const account = await prisma.account.findFirst({
        where: {
          userId: session.user.id,
          provider: 'facebook',
        },
      });

      if (account?.access_token) {
        const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?access_token=${account.access_token}&fields=id,access_token&limit=100`;
        const pagesResponse = await fetch(pagesUrl);
        
        if (pagesResponse.ok) {
          const pagesData = await pagesResponse.json();
          const page = pagesData.data?.find((p: any) => p.id === comment.connectedPage.pageId);
          if (page?.access_token) {
            pageAccessToken = page.access_token;
            // Update stored token
            await prisma.connectedPage.update({
              where: { id: comment.connectedPage.id },
              data: { pageAccessToken },
            });
          }
        }
      }
    }

    if (!pageAccessToken) {
      return NextResponse.json(
        { error: 'Page access token is missing. Please reconnect your Facebook account.' },
        { status: 401 }
      );
    }

    // Call Facebook/Instagram Graph API to hide/unhide comment
    const isHidden = action === 'hide';
    const isInstagram = comment.connectedPage.provider === 'instagram';
    const apiUrl = `https://graph.facebook.com/v24.0/${comment.commentId}`;    // Facebook comments use "is_hidden"; Instagram comments use "hide"
    const form = new URLSearchParams();
    form.append('access_token', pageAccessToken);
    if (isInstagram) {
      form.append('hide', isHidden ? 'true' : 'false');
    } else {
      form.append('is_hidden', isHidden ? 'true' : 'false');
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to hide/unhide comment';
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        // Use default error message
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    // Update database status
    await prisma.comment.update({
      where: { id: commentId },
      data: {
        status: isHidden ? 'ignored' : 'pending',
      },
    });

    return NextResponse.json({
      success: true,
      message: isHidden ? 'Comment hidden successfully' : 'Comment unhidden successfully',
    });
  } catch (error: any) {    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Delete comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { commentId } = await params;

    // Get the comment from database
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        connectedPage: true,
      },
    });

    if (!comment) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    // Verify user owns this comment's page
    if (comment.connectedPage.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Get page access token
    let pageAccessToken = comment.connectedPage.pageAccessToken;
    
    // If token is missing, try to refresh it
    if (!pageAccessToken) {
      const account = await prisma.account.findFirst({
        where: {
          userId: session.user.id,
          provider: 'facebook',
        },
      });

      if (account?.access_token) {
        const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?access_token=${account.access_token}&fields=id,access_token&limit=100`;
        const pagesResponse = await fetch(pagesUrl);
        
        if (pagesResponse.ok) {
          const pagesData = await pagesResponse.json();
          const page = pagesData.data?.find((p: any) => p.id === comment.connectedPage.pageId);
          if (page?.access_token) {
            pageAccessToken = page.access_token;
            // Update stored token
            await prisma.connectedPage.update({
              where: { id: comment.connectedPage.id },
              data: { pageAccessToken },
            });
          }
        }
      }
    }

    if (!pageAccessToken) {
      return NextResponse.json(
        { error: 'Page access token is missing. Please reconnect your Facebook account.' },
        { status: 401 }
      );
    }

    // Call Facebook Graph API to delete comment
    const isInstagram = comment.connectedPage.provider === 'instagram';
    const apiUrl = `https://graph.facebook.com/v24.0/${comment.commentId}?access_token=${pageAccessToken}`;    const response = await fetch(apiUrl, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to delete comment';
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        // Use default error message
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    // Delete from database
    await prisma.comment.delete({
      where: { id: commentId },
    });

    return NextResponse.json({
      success: true,
      message: 'Comment deleted successfully',
    });
  } catch (error: any) {    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Reply to a comment (Facebook & Instagram)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { commentId } = await params;
    const body = await request.json().catch(() => ({}));
    const message: string | undefined = body.message;

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: 'Reply message is required' },
        { status: 400 }
      );
    }

    // Get the original comment and its connected page
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        connectedPage: true,
      },
    });

    if (!comment) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    // Verify user owns this comment's page
    if (comment.connectedPage.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Get page access token
    let pageAccessToken = comment.connectedPage.pageAccessToken;

    // If token is missing, try to refresh it via /me/accounts
    if (!pageAccessToken) {
      const account = await prisma.account.findFirst({
        where: {
          userId: session.user.id,
          provider: 'facebook',
        },
      });

      if (account?.access_token) {
        const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?access_token=${account.access_token}&fields=id,access_token&limit=100`;
        const pagesResponse = await fetch(pagesUrl);

        if (pagesResponse.ok) {
          const pagesData = await pagesResponse.json();
          const page = pagesData.data?.find((p: any) => p.id === comment.connectedPage.pageId);
          if (page?.access_token) {
            pageAccessToken = page.access_token;
            // Update stored token
            await prisma.connectedPage.update({
              where: { id: comment.connectedPage.id },
              data: { pageAccessToken },
            });
          }
        }
      }
    }

    if (!pageAccessToken) {
      return NextResponse.json(
        { error: 'Page access token is missing. Please reconnect your Facebook account.' },
        { status: 401 }
      );
    }

    const isInstagram = comment.connectedPage.provider === 'instagram';

    // Facebook: POST /{comment-id}/comments
    // Instagram: POST /{ig-comment-id}/replies
    const endpointPath = isInstagram
      ? `${comment.commentId}/replies`
      : `${comment.commentId}/comments`;

    const apiUrl = `https://graph.facebook.com/v24.0/${endpointPath}`;    const form = new URLSearchParams();
    form.append('access_token', pageAccessToken);
    form.append('message', message);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to send reply';

      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        // Use default error message
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    // Mark comment as replied in our database
    try {
      await prisma.comment.update({
        where: { id: commentId },
        data: {
          replied: true,
          replyMessage: message,
          status: 'replied',
        },
      });
    } catch (e) {
      // Don't fail the request if this update fails; the reply already exists on Meta    }

    return NextResponse.json({
      success: true,
      message: 'Reply sent successfully',
    });
  } catch (error: any) {    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

