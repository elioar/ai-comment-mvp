import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';
import type { JWT } from 'next-auth/jwt';
import type { Session, User, Account, Profile } from 'next-auth';
import { prisma } from './prisma';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

export const authOptions = {
  // Adapter is needed for OAuth providers to store accounts in database
  // It won't interfere with JWT sessions
  adapter: PrismaAdapter(prisma) as any,
  trustHost: true,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            return null;
          }

          const email = credentials.email as string;
          const password = credentials.password as string;

          const user = await prisma.user.findUnique({
            where: { email },
          });

          if (!user || !user.password) {
            return null;
          }

          const isPasswordValid = await bcrypt.compare(
            password,
            user.password
          );

          if (!isPasswordValid) {
            return null;
          }

          // Optional: Require email verification before login
          // Uncomment the lines below to enforce email verification
          // if (!user.emailVerified) {
          //   throw new Error('Please verify your email address before logging in. Check your inbox for the verification link.');
          // }

          return {
            id: user.id,
            name: user.name || user.email.split('@')[0], // Fallback to email username if name is null
            email: user.email,
            image: user.image || undefined, // Convert null to undefined
          };
        } catch (error) {
          console.error('Authorization error:', error);
          return null;
        }
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
        ...(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET
          ? [
              FacebookProvider({
                clientId: process.env.FACEBOOK_CLIENT_ID,
                clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
                authorization: {
                  params: {
                    scope: 'pages_read_engagement pages_show_list pages_manage_posts instagram_basic instagram_manage_comments',
                  },
                },
              }),
            ]
          : []),
  ],
  pages: {
    signIn: '/login',
    signOut: '/',
    error: '/login',
  },
  callbacks: {
    async signIn({ user, account, profile }: { user: User; account?: Account | null; profile?: Profile }) {
      // If this is Facebook OAuth, link it to the current logged-in user
      if (account?.provider === 'facebook') {
        try {
          // Get the original user ID from cookie (set before OAuth)
          const cookieStore = await cookies();
          const linkingUserId = cookieStore.get('linking_user_id')?.value;
          
          if (linkingUserId && linkingUserId !== user.id) {
            // Store the new user ID before we change it (this is the duplicate created by OAuth)
            const newUserId = user.id;
            
            // Link the Facebook account to the original user immediately
            await prisma.account.updateMany({
              where: {
                providerAccountId: account.providerAccountId,
                provider: 'facebook',
              },
              data: {
                userId: linkingUserId,
              },
            });

            // Get the original user to update the user object
            const originalUser = await prisma.user.findUnique({
              where: { id: linkingUserId },
            });

            if (originalUser) {
              // Update the user object to point to original user
              // This prevents NextAuth from creating a new session with the new user
              user.id = originalUser.id;
              user.email = originalUser.email;
              user.name = originalUser.name || user.name;
              
              // Delete the duplicate user created by OAuth (use the stored newUserId)
              try {
                await prisma.user.delete({
                  where: { id: newUserId },
                });
                console.log('Linked Facebook account to existing user:', originalUser.email);
              } catch (deleteError) {
                // User might have dependencies, that's okay
                console.log('Could not delete duplicate user, but account is linked');
              }
            }
          }
        } catch (error) {
          console.error('Error in signIn callback during account linking:', error);
        }
      }
      
      return true;
    },
    async jwt({ token, user, account }: { token: JWT; user?: User | undefined; account?: Account | null }) {
      try {
        if (user) {
          // If we have an existing token with a user ID and this is a Facebook OAuth,
          // and the user ID matches the token ID (meaning we linked in signIn callback),
          // keep the original token to preserve the session
          if (token.id && account?.provider === 'facebook' && user.id === token.id) {
            // The signIn callback already linked the account and updated user.id to original user
            // Just keep the existing token to preserve the session
            console.log('Preserving original user session during Facebook linking:', token.id);
            return token;
          }
          
          // Normal sign-in - update token with user info
          token.id = user.id;
          token.name = user.name;
          token.email = user.email;
        }
        return token;
      } catch (error) {
        console.error('JWT callback error:', error);
        return token;
      }
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      try {
        if (token && session.user) {
          session.user.id = token.id as string;
          session.user.name = token.name as string;
          session.user.email = token.email as string;
        }
        return session;
      } catch (error) {
        console.error('Session callback error:', error);
        return session;
      }
    },
  },
  events: {
    async signIn(message: { user: User; account?: any; profile?: any; isNewUser?: boolean }) {
      // Log successful sign-ins in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Sign in successful:', { 
          userId: message.user.id, 
          email: message.user.email, 
          isNewUser: message.isNewUser,
          provider: message.account?.provider
        });
      }
    },
    async signOut() {
      // Handle sign out if needed
    },
  },
  // Logger removed - NextAuth v5 handles logging internally
  // If you need custom logging, you can add it back with the correct v5 signature
  session: {
    strategy: 'jwt' as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};
