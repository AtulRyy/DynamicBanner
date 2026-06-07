# ammas-banner

Centralised ad carousel board — a multi-tenant SaaS platform where store TVs display image slideshows managed from a cloud dashboard.

---

## How It Works

```
Super Admin  →  adds Client companies
Client Admin →  adds Branches, uploads images per branch
Store login  →  opens browser on TV → full-screen carousel auto-plays
```

Changes made by the Client Admin (new images, reordering, deletions) appear on the TV within 60 seconds automatically.

---

## Tech Stack

| | |
|---|---|
| **Backend** | Node.js Lambda functions (plain CommonJS JS) |
| **API** | AWS HTTP API Gateway |
| **Auth** | Amazon Cognito — 1 user pool, 3 groups (SUPER_ADMIN / CLIENT_ADMIN / STORE) |
| **Database** | DynamoDB on-demand |
| **File storage** | S3 + CloudFront CDN |
| **Infrastructure** | AWS SAM (CloudFormation + `Transform: AWS::Serverless-2016-10-31`) |
| **CI/CD** | Bitbucket Pipelines (pipeline YAML separate) |
| **Frontend** | React + Vite + Amplify — not built yet (Figma designs pending) |

---

## Project Structure

```
ammas/
│
├── packages/@ammas/              # Shared reusable packages (used by all Lambdas)
│   ├── db/index.js               # DynamoDB client singleton + key builders
│   ├── auth/index.js             # resolveUser(), assertClientAccess(), assertBranchAccess()
│   └── response/index.js         # ok(), created(), forbidden(), badRequest(), etc.
│
├── lambdas/                      # One folder per Lambda — each has index.js + template.yaml
│   ├── auth-post-confirm/        # Cognito PostConfirmation trigger → writes user to DDB
│   ├── admin-create-client/      # POST /admin/clients
│   ├── admin-list-clients/       # GET  /admin/clients
│   ├── admin-update-client/      # PUT  /admin/clients/{clientId}
│   ├── admin-delete-client/      # DELETE /admin/clients/{clientId}
│   ├── branches-create/          # POST /clients/{clientId}/branches
│   ├── branches-list/            # GET  /clients/{clientId}/branches
│   ├── branches-update/          # PUT  /clients/{clientId}/branches/{branchId}
│   ├── media-list/               # GET  …/media
│   ├── media-upload-url/         # POST …/media/upload-url  (returns presigned S3 PUT URL)
│   ├── media-delete/             # DELETE …/media/{mediaId}
│   ├── media-reorder/            # PUT  …/media/reorder
│   ├── media-processor/          # S3 trigger → Sharp thumbnail → DDB record
│   └── display-get-carousel/     # GET  /display/{branchId}/carousel  (TV polling endpoint)
│
├── infrastructure/               # Shared CloudFormation templates (deployed via root template)
│   ├── cognito.yaml              # User pool, 3 groups, 2 app clients
│   ├── dynamodb.yaml             # ammas-main + ammas-events tables + GSIs
│   ├── s3-storage.yaml           # S3 bucket + CloudFront CDN (OAC)
│   └── amplify.yaml              # Amplify app shell (FE wired later)
│
├── layers/sharp/                 # Lambda Layer — Sharp image library compiled for Linux
│   ├── build.sh                  # Run once: installs Sharp for Linux x64
│   └── template.yaml
│
├── template.yaml                 # ROOT SAM template — composes all nested stacks
├── package.json                  # All Lambda dependencies live here (single root package.json)
└── .npmrc                        # hoist=true — packages available in root node_modules
```

### Why one root `package.json`?

Lambdas don't have their own `package.json`. All dependencies (`@aws-sdk/*`, `uuid`, `@ammas/*`) are declared at the root. `hoist=true` in `.npmrc` puts everything into root `node_modules/`. SAM's esbuild runs from the root (`CodeUri: ./`) and bundles each Lambda individually using its entry point (`lambdas/<name>/index.js`).

---

## API Routes

| Method | Path | Lambda |
|---|---|---|
| POST | `/admin/clients` | admin-create-client |
| GET | `/admin/clients` | admin-list-clients |
| PUT | `/admin/clients/{clientId}` | admin-update-client |
| DELETE | `/admin/clients/{clientId}` | admin-delete-client |
| POST | `/clients/{clientId}/branches` | branches-create |
| GET | `/clients/{clientId}/branches` | branches-list |
| PUT | `/clients/{clientId}/branches/{branchId}` | branches-update |
| GET | `/clients/{clientId}/branches/{branchId}/media` | media-list |
| POST | `/clients/{clientId}/branches/{branchId}/media/upload-url` | media-upload-url |
| DELETE | `/clients/{clientId}/branches/{branchId}/media/{mediaId}` | media-delete |
| PUT | `/clients/{clientId}/branches/{branchId}/media/reorder` | media-reorder |
| GET | `/display/{branchId}/carousel` | display-get-carousel |

All routes require a Cognito JWT in the `Authorization` header. The API Gateway validates the token before the Lambda runs.

---

## Infrastructure Detail

### SAM = CloudFormation

SAM is not a separate tool — `template.yaml` is a CloudFormation template with `Transform: AWS::Serverless-2016-10-31`. `sam build` bundles the code; `sam deploy` runs `aws cloudformation deploy`.

### How it deploys

```
template.yaml  (root)
├── infrastructure/cognito.yaml       → Cognito User Pool + Groups + App Clients
├── infrastructure/dynamodb.yaml      → DynamoDB Tables
├── infrastructure/s3-storage.yaml    → S3 Bucket + CloudFront Distribution
├── layers/sharp/template.yaml        → Sharp Lambda Layer
├── lambdas/*/template.yaml  × 14    → one Lambda + IAM policy per file
└── AWS::Serverless::HttpApi          → shared API Gateway (defined inline in root)
```

Each Lambda template registers its own API route via the `Events.Api` property. The shared HTTP API Gateway ID is passed as a parameter from the root template.

### DynamoDB table design (`ammas-main`)

Single-table design — all entity types share one table.

| Entity | PK | SK |
|---|---|---|
| Client | `CLIENT#<id>` | `#METADATA` |
| Branch | `CLIENT#<clientId>` | `BRANCH#<branchId>` |
| User | `USER#<cognitoSub>` | `#METADATA` |
| Carousel config | `BRANCH#<branchId>` | `CAROUSEL#CONFIG` |
| Media item | `BRANCH#<branchId>` | `MEDIA#<mediaId>` |

GSIs: `GSI-EntityType` (list all clients), `GSI-UserByCognito` (auth guard lookup), `GSI-UserByEmail`

### Auth guard

Every Lambda calls `resolveUser(event)` from `@ammas/auth`. It extracts the `sub` claim from the JWT, looks up the user record via `GSI-UserByCognito`, then asserts the user's `clientId`/`branchId` matches the path parameter. A mismatch returns 403 — one client can never touch another's data.

### Media upload flow

1. Client Admin calls `POST …/media/upload-url` → Lambda returns a presigned S3 PUT URL (valid 5 min)
2. Browser uploads file directly to S3 — no bytes pass through Lambda
3. S3 fires `ObjectCreated` event → `media-processor` Lambda runs
4. `media-processor` generates a 320×180 thumbnail via Sharp (Lambda Layer), writes DDB record, bumps `carousel.updatedAt`
5. Store TV polls `/display/{branchId}/carousel` every 60s — detects `lastUpdatedAt` changed → reloads slides

The carousel polling endpoint returns `Cache-Control: max-age=55` so CloudFront caches it. 100 stores polling every 60s = ~1 Lambda call/min instead of 100.

---

## Build & Deploy

```bash
# 1. Install dependencies
pnpm install

# 2. Build Sharp layer for Linux (run once, requires Node + npm)
cd layers/sharp && bash build.sh && cd ../..

# 3. Bundle all Lambda functions
sam build

# 4. Deploy to staging
sam deploy \
  --stack-name ammas-banner-staging \
  --region ap-south-1 \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --parameter-overrides Environment=staging \
  --resolve-s3 \
  --no-confirm-changeset

# The deploy prints stack outputs:
#   ApiUrl, UserPoolId, AdminClientId, StoreClientId, MediaCdnDomain
```

After first deploy:
1. Go to AWS Console → Cognito → `ammas-banner-staging`
2. Create a user with your email → add to `SUPER_ADMIN` group
3. Use the `ApiUrl` output as the base URL for the frontend

---

## Adding a New Lambda

1. Create `lambdas/<name>/index.js` — export a `handler` function
2. Create `lambdas/<name>/template.yaml` — follow the pattern in any existing template
3. Add a nested stack entry in `template.yaml` (root), passing the required parameters
4. `sam build && sam deploy`

No `package.json` or `tsconfig.json` needed in the Lambda folder.
