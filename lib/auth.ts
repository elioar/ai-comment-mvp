import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';
import type { JWT } from 'next-auth/jwt';
import type { Session, User, Account, Profile } from 'next-auth';
import { prisma } from './prisma';
import bcrypt from 'bcryptjs';

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
                allowDangerousEmailAccountLinking: true, // Allow linking accounts with same email
                authorization: {
                  params: {
                    scope: 'pages_read_engagement pages_show_list pages_manage_posts',
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
      // Always return true to allow sign-in
      // We'll link the Facebook account to the current logged-in user after OAuth completes
      // This allows linking regardless of email matching
      return true;
    },
    async jwt({ token, user, account }: { token: JWT; user?: User | undefined; account?: Account | null }) {
      try {
        if (user) {
          // If we have an existing token with a user ID and this is a Facebook OAuth,
          // we're linking accounts - preserve the original user ID
          if (token.id && account?.provider === 'facebook' && user.id !== token.id) {
            // This is a linking scenario - keep the original user's session
            // The account will be linked via the link-account API
            console.log('Preserving original user session during Facebook linking:', token.id);
            return token; // Keep the original token
          }
          
          // Normal sign-in - update token with new user
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
      // If this is a Facebook OAuth and a new user was created, try to link to existing user
      if (message.account?.provider === 'facebook' && message.isNewUser) {
        try {
          // Try to get the original user ID from cookie (set before OAuth)
          // Note: In NextAuth events, we don't have direct access to cookies,
          // so we'll handle this in the link-account API after redirect
          // For now, we'll check for recent sessions with non-Facebook accounts
          const recentSessions = await prisma.session.findMany({
            where: {
              expires: {
                gte: new Date(Date.now() - 10 * 60 * 1000), // Last 10 minutes
              },
            },
            include: {
              user: {
                include: {
                  accounts: true,
                },
              },
            },
            orderBy: {
              expires: 'desc',
            },
            take: 5,
          });

          // Find a session user that has non-Facebook accounts (likely the original user)
          const originalUser = recentSessions.find(
            (s) => 
              s.user.id !== message.user.id && 
              s.user.accounts.some((acc) => acc.provider !== 'facebook')
          )?.user;

          if (originalUser) {
            // Link the Facebook account to the original user
            await prisma.account.updateMany({
              where: {
                providerAccountId: message.account.providerAccountId,
                provider: 'facebook',
              },
              data: {
                userId: originalUser.id,
              },
            });

            // Delete the duplicate user created by OAuth
            try {
              await prisma.user.delete({
                where: { id: message.user.id },
              });
              console.log(`Linked Facebook account to original user: ${originalUser.email}`);
            } catch (error) {
              console.log('Could not delete duplicate user, but account is linked');
            }
          }
        } catch (error) {
          console.error('Error in signIn event during account linking:', error);
        }
      }
      
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
