# Tunisia Trust Engine - Server

## Overview
This is the backend server for Tunisia Trust Engine, built with:
- **Strapi CMS** - Content management and admin panel
- **tRPC** - Type-safe API endpoints
- **Drizzle ORM** - Database ORM with type safety
- **Better SQLite3** - Embedded database (can be switched to PostgreSQL)

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

# Generate database schema
pnpm db:generate

# Push schema to database
pnpm db:push

# Open database studio
pnpm db:studio
```

## API Endpoints

### Orders
- `POST /trpc/orders.create` - Create a new order
- `GET /trpc/orders.getAll` - Get all orders (filtered by user)
- `GET /trpc/orders.getById` - Get specific order details
- `POST /trpc/orders.updateStatus` - Update order status
- `POST /trpc/orders.submitFeedback` - Submit feedback for an order
- `GET /trpc/orders.getPointsHistory` - Get user's points history
- `GET /trpc/orders.getDashboardStats` - Get dashboard statistics

## Database Schema

### Tables
- `users` - User accounts with points and tiers
- `orders` - All orders from all platforms
- `order_verification_logs` - Detailed verification history
- `points_history` - Points transaction ledger
- `feedbacks` - Customer feedback and ratings

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
DATABASE_URL=file:./sqlite.db
JWT_SECRET=your-secret-key
NODE_ENV=development
```

## Testing

```bash
pnpm test
```

## Deployment

```bash
pnpm build
pnpm start
```
