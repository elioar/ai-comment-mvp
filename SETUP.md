# Setup Guide

## Prerequisites
- Node.js 18+ installed
- npm or yarn

## Installation Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file in the root directory with the following:
   ```env
   # Database
   DATABASE_URL="file:./dev.db"

   # NextAuth
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="your-secret-key-here-change-in-production"
   
   # Generate a secret key: openssl rand -base64 32
   ```

3. **Set up the database:**
   ```bash
   npm run db:push
   ```

4. **Generate Prisma Client:**
   ```bash
   npm run db:generate
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```

## Database Commands

- `npm run db:push` - Push schema changes to database (development)
- `npm run db:migrate` - Create and run migrations (production)
- `npm run db:generate` - Generate Prisma Client
- `npm run db:studio` - Open Prisma Studio to view/edit database

## First User

After setting up, you can register a new user through the registration page. The password will be securely hashed using bcrypt.

## Notes

- The database uses SQLite for development (stored in `dev.db`)
- For production, consider using PostgreSQL or MySQL
- Change `NEXTAUTH_SECRET` to a secure random string in production
- OAuth providers (Google, Facebook) are optional - configure them in `.env` if needed

