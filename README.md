# TTE Server

NestJS backend server for Tunisia Trust Engine. Provides both tRPC and REST APIs for order management, merchant authentication, phone verification, and plugin integrations.

## Architecture

### Technology Stack
- **NestJS** - Progressive Node.js framework
- **tRPC** - Type-safe API endpoints for web dashboard
- **Express REST** - Plugin integration endpoints
- **Prisma ORM** - Database migrations and queries
- **SQLite** - Local development database
- **JWT** - Authentication tokens
- **Zod** - Runtime validation

### Project Structure

```
server/
├── src/
│   ├── modules/          # Feature modules
│   │   ├── auth/         # Authentication module
│   │   ├── merchants/    # Merchant management
│   │   ├── orders/       # Order processing
│   │   ├── phone-verification/  # Phone trust checks
│   │   ├── reports/      # Report system
│   │   └── payments/     # Credits and billing
│   ├── trpc/             # tRPC routers and procedures
│   ├── routers/          # REST API routes
│   ├── middleware/       # Custom middleware
│   ├── config/           # Configuration management
│   ├── schema/           # Validation schemas
│   └── tests/            # Test suites
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── migrations/       # Migration files
├── public/               # Static assets
└── dist/                 # Compiled output
```

## Key Features

### Order Management
- Create orders from multiple sources (WooCommerce, Shopify, Facebook, Instagram, Manual)
- Track verification status and fraud scores
- Store detailed verification logs
- Support for both successful and failed orders

### Points & Rewards System
- Automatic points calculation for verified orders
- Bonus points for customer feedback (5 base + 5 for 4-5 stars + 5 extra for 5 stars)
- Tier system (Bronze, Silver, Gold, Platinum)
- Complete points history ledger

### Phone Verification
- Trust score calculation (0-100)
- Spam detection and reporting
- Real-time verification checks
- Ordered verdict feedback loop

### Merchant API Keys
- Generate and rotate API keys
- Key-based authentication for plugins
- Usage tracking per merchant

### Plugin REST Endpoints
- Receives orders from external platforms
- Handles phone verification requests
- Accepts spam/not-spam feedback
- Sends webhook notifications

## API Endpoints

### tRPC Routers (used by web frontend)

| Router | Procedures | Purpose |
|--------|------------|---------|
| `auth` | `me`, `register`, `login`, `logout` | Merchant authentication |
| `merchants` | `getProfile`, `create`, `update`, `regenerateApiKey`, `getDashboard` | Merchant CRUD |
| `orders` | `list`, `updateStatus`, `addFeedback`, `feedbackByOrder` | Order management |
| `phoneVerification` | `check`, `reportVerdict` | Phone trust checks |
| `reports` | `create`, `list`, `get`, `update` | Issue reports |
| `automation` | Various | Merchant automation helpers |
| `roadmap` | Various | Feature flags and roadmap |

### REST Plugin Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/plugin/orders` | POST | Create order from plugin |
| `/api/plugin/orders/feedback` | POST | Submit order feedback |
| `/api/plugin/reports` | POST | Report issues |
| `/api/phone-verification/check` | POST | Check phone trust score |
| `/api/spam-phones` | POST | Report spam number |
| `/tte/check-order` | POST | Quick order decision (legacy) |
| `/tte/order-feedback` | POST | Order feedback (legacy) |
| `/api/webhooks/*` | POST | Webhook event handlers |

## Database Schema

### Core Models

- **User** - Authentication accounts
- **Merchant** - Business profiles and API keys
- **Order** - Order records with verification status
- **OrderFeedback** - Customer ratings and reviews
- **SpamPhone** - Reported spam/not-spam numbers
- **CreditTransaction** - Points and credits ledger
- **Referral** - Referral program tracking
- **Report** - Merchant-submitted reports

### Prisma Commands

```bash
# Generate Prisma client
pnpm prisma:generate

# Run migrations
pnpm prisma:migrate

# Open Prisma Studio (GUI)
pnpm prisma:studio

# Reset database (dev only)
pnpm prisma:reset
```

## Installation & Development

### Setup

```bash
cd server
pnpm install
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL="file:./sqlite.db"
JWT_SECRET="your-super-secret-jwt-key-here"
CORS_ORIGIN="http://localhost:5173"
PORT=4000
NODE_ENV="development"
```

### Running

```bash
# Development with hot reload
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run tests
pnpm test
pnpm test:e2e
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | `file:./sqlite.db` |
| `JWT_SECRET` | JWT signing secret | (required) |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |
| `PORT` | Server port | `4000` |
| `NODE_ENV` | Environment mode | `development` |
| `IA_SYSTEM_URL` | IA System service URL | (optional) |

## Testing

```bash
# Unit tests
pnpm test

# End-to-end tests
pnpm test:e2e

# Test with coverage
pnpm test:cov
```

## Deployment

### Build

```bash
pnpm build
pnpm start
```

### Docker (optional)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
CMD ["node", "dist/main"]
```

## Plugin Integration Guide

All plugin endpoints require an `X-API-Key` header with a valid merchant API key.

### Order Creation Example

```javascript
fetch('http://localhost:4000/api/plugin/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'tte_xxxxxxxxxxxxxxxx'
  },
  body: JSON.stringify({
    externalId: 'SHOP-12345',
    source: 'shopify',
    customer: {
      name: 'Ahmed Ben Ali',
      phone: '+21698123456',
      email: 'ahmed@example.com',
      address: {
        street: '15 Avenue Habib Bourguiba',
        city: 'Tunis',
        region: 'tunis',
        postalCode: '1000'
      }
    },
    items: [],
    total: 250.00,
    paymentMethod: 'cod'
  })
});
```

### Phone Verification Example

```javascript
fetch('http://localhost:4000/api/phone-verification/check', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'tte_xxxxxxxxxxxxxxxx'
  },
  body: JSON.stringify({
    phoneNumber: '+21698123456',
    orderId: 'optional-order-id'
  })
});
```

### Spam Reporting Example

```javascript
fetch('http://localhost:4000/api/spam-phones', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'tte_xxxxxxxxxxxxxxxx'
  },
  body: JSON.stringify({
    phoneNumber: '+21698123456',
    verdict: 'spam',  // or 'not_spam'
    orderId: 12345,
    reason: 'Customer refused after confirmation',
    source: 'shopify-plugin'
  })
});
```

## Error Handling

API returns standard HTTP status codes:

- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Invalid/missing API key
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `429 Too Many Requests` - Rate limited
- `500 Internal Server Error` - Server error

Error response format:

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "Phone number is required",
    "details": {}
  }
}
```

## Contributing

See `docs/DEVELOPER_ONBOARDING.md` for development setup and coding standards.

## License

MIT
