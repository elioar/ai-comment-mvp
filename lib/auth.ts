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
      // Handle account linking for OAuth providers
      if (account && account.provider !== 'credentials' && user.email) {
        try {
          // Find existing user with same email
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email },
            include: { accounts: true },
          });

          // If user exists and it's a different user (OAuth might create new user)
          if (existingUser && existingUser.id !== user.id) {
            // Check if this provider account is already linked to existing user
            const existingAccount = await prisma.account.findFirst({
              where: {
                userId: existingUser.id,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            });

            // If not linked, link it
            if (!existingAccount) {
              // Update the OAuth account to point to existing user
              await prisma.account.updateMany({
                where: {
                  providerAccountId: account.providerAccountId,
                  provider: account.provider,
                },
                data: {
                  userId: existingUser.id,
                },
              });

              // Delete the duplicate user created by OAuth if it exists
              try {
                await prisma.user.delete({
                  where: { id: user.id },
                });
              } catch (deleteError) {
                // User might not exist yet, that's okay
                console.log('User to delete not found, continuing...');
              }

              console.log(`Linked ${account.provider} account to existing user:`, existingUser.email);
            }
          }
        } catch (error) {
          console.error('Error in signIn callback during account linking:', error);
          // Still allow sign-in to continue
        }
      }
      return true;
    },
    async jwt({ token, user }: { token: JWT; user?: User | undefined }) {
      try {
        if (user) {
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
      // Link OAuth account to existing user account by email
      if (message.account && message.account.provider !== 'credentials' && message.user.email) {
        try {
          // Find existing user with same email
          const existingUser = await prisma.user.findUnique({
            where: { email: message.user.email },
            include: { accounts: true },
          });

          // If user exists and it's a different user (OAuth created new user)
          if (existingUser && existingUser.id !== message.user.id) {
            // Check if Facebook account is already linked to existing user
            const existingFacebookAccount = await prisma.account.findFirst({
              where: {
                userId: existingUser.id,
                provider: 'facebook',
              },
            });

            // If not linked, link it
            if (!existingFacebookAccount) {
              // Update the OAuth account to point to existing user
              await prisma.account.updateMany({
                where: {
                  providerAccountId: message.account.providerAccountId,
                  provider: message.account.provider,
                },
                data: {
                  userId: existingUser.id,
                },
              });

              // Delete the duplicate user created by OAuth
              await prisma.user.delete({
                where: { id: message.user.id },
              });

              console.log('Linked Facebook account to existing user:', existingUser.email);
            }
          }
        } catch (error) {
          console.error('Error linking accounts:', error);
        }
      }

      // Log successful sign-ins in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Sign in successful:', { 
          userId: message.user.id, 
          email: message.user.email, 
          isNewUser: message.isNewUser 
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
