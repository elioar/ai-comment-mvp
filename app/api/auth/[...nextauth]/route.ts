import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

// Validate required environment variables at startup
if (!process.env.NEXTAUTH_SECRET) {
  console.error(
    '⚠️  NEXTAUTH_SECRET is not set. Please set it in your environment variables.\n' +
    '   You can generate one by running: openssl rand -base64 32'
  );
}

if (!process.env.DATABASE_URL) {
  console.error(
    '⚠️  DATABASE_URL is not set. Please set it in your environment variables.'
  );
}

// NextAuth v5 returns handlers object with GET and POST
const { handlers } = NextAuth(authOptions);

export const { GET, POST } = handlers;
