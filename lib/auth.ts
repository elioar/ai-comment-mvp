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
  // Ensure NEXTAUTH_URL is set for production
  ...(process.env.NEXTAUTH_URL && { url: process.env.NEXTAUTH_URL }),
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
        } catch (error) {          return null;
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
            clientId: process.env.FACEBOOK_CLIENT_ID!,
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
            authorization: {
              params: {
                scope: 'pages_read_engagement pages_manage_engagement pages_show_list pages_manage_posts instagram_basic instagram_manage_comments business_management ads_read',
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
      if (account?.provider === 'facebook' && account?.access_token) {
        try {
          // Get the original user ID from cookie (set before OAuth)
          const cookieStore = await cookies();
          const linkingUserId = cookieStore.get('linking_user_id')?.value;
          
          // Exchange short-lived token for long-lived token (60 days) immediately
          let longLivedToken = account.access_token;          try {
            const tokenExchangeUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${account.access_token}`;
            
            const tokenResponse = await fetch(tokenExchangeUrl);
            
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json();
              longLivedToken = tokenData.access_token;              // Note: We can't mutate account.access_token directly (it's read-only)
              // We'll update it in the database after NextAuth saves the account
            } else {
              const errorText = await tokenResponse.text();              // Continue with short-lived token - we'll try to exchange it later
            }
          } catch (tokenError) {            // Continue with short-lived token
          }
          
          if (linkingUserId && linkingUserId !== user.id) {
            // Store the new user ID before we change it (this is the duplicate created by OAuth)
            const newUserId = user.id;

            // Link the Facebook account to the original user immediately with long-lived token            const updateResult = await prisma.account.updateMany({
              where: {
                providerAccountId: account.providerAccountId,
                provider: 'facebook',
              },
              data: {
                userId: linkingUserId,
                access_token: longLivedToken, // Store the long-lived token
              },
            });            // Get the original user to update the user object
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
                });              } catch (deleteError) {
                // User might have dependencies, that's okay              }
            }
          } else if (linkingUserId && linkingUserId === user.id) {
            // Account already linked to this user (reconnection scenario)
            // Just update the token            const updateResult = await prisma.account.updateMany({
              where: {
                providerAccountId: account.providerAccountId,
                provider: 'facebook',
                userId: linkingUserId,
              },
              data: {
                access_token: longLivedToken, // Update with long-lived token
              },
            });          } else {          }
        } catch (error) {        }
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
            // Just keep the existing token to preserve the session            return token;
          }
          
          // Normal sign-in - update token with user info
          token.id = user.id;
          token.name = user.name;
          token.email = user.email;
        }
        return token;
      } catch (error) {        return token;
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
      } catch (error) {        return session;
      }
    },
  },
  events: {
    async signIn(message: { user: User; account?: any; profile?: any; isNewUser?: boolean }) {
      // If this is Facebook OAuth, ensure the token in database is long-lived
      // This runs AFTER NextAuth's PrismaAdapter has saved the account
      if (message.account?.provider === 'facebook' && message.account?.access_token) {        try {
          // Find the account that was just created/updated by NextAuth
          const savedAccount = await prisma.account.findFirst({
            where: {
              provider: 'facebook',
              providerAccountId: message.account.providerAccountId,
              userId: message.user.id,
            },
          });

          if (savedAccount) {            // Check if the stored token is the same as the original (short-lived) token
            // This means the exchange in signIn callback might have failed
            if (savedAccount.access_token === message.account.access_token) {              // Token wasn't exchanged in signIn callback, try now
              try {
                const tokenExchangeUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${message.account.access_token}`;
                const tokenResponse = await fetch(tokenExchangeUrl);
                
                if (tokenResponse.ok) {
                  const tokenData = await tokenResponse.json();
                  const longLivedToken = tokenData.access_token;
                  
                  // Update the stored token in database
                  await prisma.account.update({
                    where: { id: savedAccount.id },
                    data: { access_token: longLivedToken },
                  });
                  
                } else {
                  const errorText = await tokenResponse.text();                }
              } catch (tokenError) {              }
            } else {            }
          } else {          }
        } catch (error) {        }
      }
      
      // Log successful sign-ins in development
      if (process.env.NODE_ENV === 'development') {      }
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
