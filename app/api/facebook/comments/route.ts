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

    // Fetch recent posts from the page
    const postsResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/posts?access_token=${connectedPage.pageAccessToken}&fields=id,message,created_time&limit=10`
    );

    if (!postsResponse.ok) {
      const errorText = await postsResponse.text();
      console.error('Facebook API error fetching posts:', errorText);
      // Still return stored comments even if API call fails
      const storedComments = await prisma.comment.findMany({
        where: {
          pageId: connectedPage.id,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 100,
      });
      return NextResponse.json({ 
        comments: storedComments,
        error: 'Failed to fetch new posts from Facebook',
      });
    }

    const postsData = await postsResponse.json();
    const posts = postsData.data || [];

    // Fetch comments for each post
    const allComments = [];
    
    for (const post of posts) {
      try {
        const commentsResponse = await fetch(
          `https://graph.facebook.com/v18.0/${post.id}/comments?access_token=${connectedPage.pageAccessToken}&fields=id,message,from,created_time&limit=25`
        );

        if (commentsResponse.ok) {
          const commentsData = await commentsResponse.json();
          const comments = commentsData.data || [];

          for (const comment of comments) {
            // Store comment in database
            await prisma.comment.upsert({
              where: {
                pageId_commentId: {
                  pageId: connectedPage.id,
                  commentId: comment.id,
                },
              },
              update: {
                message: comment.message || '',
                authorName: comment.from?.name || 'Unknown',
                authorId: comment.from?.id || '',
              },
              create: {
                pageId: connectedPage.id,
                commentId: comment.id,
                postId: post.id,
                message: comment.message || '',
                authorName: comment.from?.name || 'Unknown',
                authorId: comment.from?.id || '',
                createdAt: new Date(comment.created_time),
              },
            });

            allComments.push({
              ...comment,
              postId: post.id,
              postMessage: post.message,
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching comments for post ${post.id}:`, error);
        // Continue with next post
      }
    }

    // Get stored comments from database
    const storedComments = await prisma.comment.findMany({
      where: {
        pageId: connectedPage.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    return NextResponse.json({ 
      comments: storedComments,
      fetched: allComments.length 
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

