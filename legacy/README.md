# Playoff Best Ball 2025

A fantasy football playoff best ball tracker built with Next.js, Prisma, and Neon DB. Features live scoring from ESPN and a fun chalk-on-pavement UI theme.

## Features

- **Live Leaderboard** - Real-time standings with weekly breakdowns
- **Roster Management** - View all team rosters with player scores
- **Explainable Scoring** - Click any player to see game-by-game scoring breakdowns
- **ESPN Integration** - Automatic score syncing from ESPN box scores
- **Best Ball Format** - Optimal lineup selection each week

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: Neon (Serverless Postgres) + Prisma 7
- **Styling**: Tailwind CSS 4
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) database

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/playoff-best-ball.git
   cd playoff-best-ball
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your Neon database credentials:

   ```
   DATABASE_URL="postgresql://..."
   DIRECT_URL="postgresql://..."
   ```

4. Push the database schema:

   ```bash
   npm run db:push
   ```

5. Seed the rosters:

   ```bash
   npm run db:seed
   ```

6. Start the development server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) to view the app.

## Scripts

| Command             | Description                    |
| ------------------- | ------------------------------ |
| `npm run dev`       | Start development server       |
| `npm run build`     | Build for production           |
| `npm run start`     | Start production server        |
| `npm run lint`      | Run ESLint                     |
| `npm run typecheck` | Run TypeScript type checking   |
| `npm run db:push`   | Push Prisma schema to database |
| `npm run db:seed`   | Seed database with rosters     |
| `npm run db:studio` | Open Prisma Studio             |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   ├── cron/          # Vercel cron job endpoint
│   │   ├── scores/        # Live scores endpoint
│   │   └── sync/          # Database sync endpoint
│   ├── admin/             # Admin page
│   ├── player/[playerId]/ # Player detail page
│   ├── rosters/           # All rosters page
│   ├── scoring/           # Scoring rules page
│   └── page.tsx           # Home/leaderboard
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── leaderboard.tsx   # Standings table
│   ├── roster-card.tsx   # Team roster card
│   ├── player-row.tsx    # Player row in roster
│   └── scoring-breakdown.tsx # Game scoring details
├── lib/                   # Utilities and services
│   ├── db/               # Prisma client
│   ├── espn/             # ESPN API client & parser
│   └── scoring/          # Scoring calculator
└── types/                # TypeScript types

prisma/
├── schema.prisma         # Database schema
└── seed.ts              # Seed script
```

## Scoring Rules

- **Passing**: 1 pt/30 yds, 6 pts/TD, -2 pts/INT
- **Rushing**: 1 pt/10 yds, 6 pts/TD
- **Receiving**: 1 pt/10 yds, 6 pts/TD, 0.5 PPR
- **Kicking**: 3-5 pts/FG (by distance), 1 pt/XP
- **Defense**: Points for sacks, INTs, fumbles, TDs, safeties

See the `/scoring` page for full details.

## Deployment

### Vercel

1. Push your code to GitHub
2. Import the project in Vercel
3. Add environment variables:
   - `DATABASE_URL`
   - `DIRECT_URL`
4. Deploy

The app includes a Vercel cron job (`/api/cron`) that syncs scores automatically.

## Development

### Commit Hooks

This project uses Husky and lint-staged for pre-commit checks:

- TypeScript type checking
- ESLint with auto-fix
- Prettier formatting

### Adding/Updating Rosters

Edit the roster data in `prisma/seed.ts` and run:

```bash
npm run db:seed
```

## License

MIT
