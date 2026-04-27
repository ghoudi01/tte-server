# Tunisia Trust Engine - Server

## Overview
This is the backend server for Tunisia Trust Engine, built with:
- **NestJS** - HTTP application framework
- **tRPC** - Type-safe API endpoints
- **Prisma** - Database ORM and migrations
- **SQLite** - Local development database

## Features

### Order Management
- Create orders from multiple sources (WooCommerce, Shopify, Facebook, Instagram, Manual, etc.)
- Track order verification status and fraud scores
- Store detailed verification logs for each order
- Support for both successful and failed orders

### Points System
- Automatic points calculation for verified orders
- Bonus points for customer feedback (5 base + 5 for 4-5 stars + 5 extra for 5 stars)
- Tier system (Bronze, Silver, Gold, Platinum)
- Complete points history ledger

### Feedback System
- Submit feedback for completed orders
- Rating system (1-5 stars)
- Automatic points rewards based on rating quality

## Installation

```bash
cd server
pnpm install
```

## Development

```bash
# Start development server with hot reload
pnpm dev

# Generate Prisma client
pnpm prisma:generate

# Run development migrations
pnpm prisma:migrate
```

## API Endpoints

### tRPC Routers
- `auth`: `me`, `register`, `login`, `logout`
- `merchants`: `getProfile`, `create`, `update`, `regenerateApiKey`, `getDashboard`
- `orders`: `list`, `updateStatus`, `addFeedback`, `feedbackByOrder`
- `phoneVerification`: `check`, `reportVerdict`
- `reports`: `create`, `list`, `get`, `update`
- `automation`: merchant automation and IA helper procedures
- `roadmap`: roadmap feature foundations

### Plugin REST
- `POST /api/plugin/orders`
- `POST /api/plugin/orders/feedback`
- `POST /api/plugin/reports`
- `POST /api/phone-verification/check`
- `POST /api/spam-phones`
- `POST /tte/check-order`
- `POST /tte/order-feedback`

## Database Schema

Prisma models live in `prisma/schema.prisma`:
- `User`
- `Merchant`
- `Order`
- `OrderFeedback`
- `SpamPhone`
- `CreditTransaction`
- `Referral`
- `Report`

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
DATABASE_URL=file:./sqlite.db
JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=http://localhost:5173
```

## Testing

```bash
pnpm test:e2e
```

## Deployment

```bash
pnpm build
pnpm start
```
