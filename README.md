# My Comments - AI Comment Moderator

A modern Next.js application for automating Facebook comment management with AI.

## Features

- 🔐 Full authentication system with NextAuth.js
- 💾 Database integration with Prisma (SQLite)
- 🎨 Modern, responsive UI with dark mode
- 🌐 Multi-language support (English/Greek)
- 📱 Mobile-responsive design
- 🔒 Secure password hashing with bcrypt
- ✉️ Email verification and password reset

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn

### Installation

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file in the root directory:
   ```env
   # Database
   DATABASE_URL="file:./dev.db"

   # NextAuth
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="your-secret-key-here"
   
   # Generate a secret: openssl rand -base64 32
   ```

3. **Set up the database:**
   ```bash
   npm run db:push
   npm run db:generate
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000)** in your browser.

## Database Commands

- `npm run db:push` - Push schema changes to database (development)
- `npm run db:migrate` - Create and run migrations (production)
- `npm run db:generate` - Generate Prisma Client
- `npm run db:studio` - Open Prisma Studio to view/edit database

## Tech Stack

- **Framework:** Next.js 16
- **Database:** Prisma with SQLite (dev) / PostgreSQL (production)
- **Authentication:** NextAuth.js v5
- **Styling:** Tailwind CSS 4
- **Language:** TypeScript

## Project Structure

```
├── app/              # Next.js app directory
│   ├── api/         # API routes
│   ├── auth/        # Auth pages (login, register, etc.)
│   └── dashboard/   # Dashboard pages
├── components/      # React components
├── lib/             # Utilities and configurations
│   ├── auth.ts      # NextAuth configuration
│   ├── authFunctions.ts  # Auth helper functions
│   └── prisma.ts    # Prisma client
└── prisma/          # Prisma schema and migrations
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [NextAuth.js Documentation](https://next-auth.js.org)

## Deploy on Vercel

The easiest way to deploy is using the [Vercel Platform](https://vercel.com/new).

For production, update your `DATABASE_URL` to use PostgreSQL or another production database.
