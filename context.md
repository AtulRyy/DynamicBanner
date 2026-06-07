# ammas-banner — Project Context

**Last updated:** 2026-06-02

## What This Is

A multi-tenant SaaS platform for managing digital signage / ad carousels on store TVs.

**User hierarchy:**
```
Super Admin (you) → creates Clients → Client receives CLIENT_ADMIN Cognito login
Client Admin → creates Branches → Branch receives STORE Cognito login
Store login → displays full-screen image carousel on TV
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TailwindCSS (not built yet — Figma designs pending) |
| API | AWS HTTP API Gateway |
| Backend | Node.js 20 Lambda functions (TypeScript, esbuild-bundled) |
| Auth | Amazon Cognito (1 user pool, 3 groups, 2 app clients) |
| Database | DynamoDB on-demand |
| Storage | S3 + CloudFront CDN |
| IaC | SAM (CloudFormation + Transform) |
| CI/CD | Bitbucket Pipelines (pipeline YAML to be written separately) |
| Monorepo | pnpm workspaces |

## Project Structure

```
ammas/
├── packages/@ammas/
│   ├── types/      # Shared TypeScript interfaces + enums
│   ├── db/         # DynamoDB client singleton + key builders
│   ├── auth/       # resolveUser(), assertClientAccess(), assertBranchAccess()
│   └── response/   # ok(), created(), forbidden(), badRequest(), etc.
│
├── lambdas/                        # One folder per Lambda function
│   ├── auth-post-confirm/          # Cognito PostConfirmation trigger
│   ├── admin-create-client/        # POST /admin/clients
│   ├── admin-list-clients/         # GET  /admin/clients
│   ├── admin-update-client/        # PUT  /admin/clients/{clientId}
│   ├── admin-delete-client/        # DELETE /admin/clients/{clientId}
│   ├── branches-create/            # POST /clients/{clientId}/branches
│   ├── branches-list/              # GET  /clients/{clientId}/branches
│   ├── branches-update/            # PUT  /clients/{clientId}/branches/{branchId}
│   ├── media-list/                 # GET  /clients/{clientId}/branches/{branchId}/media
│   ├── media-upload-url/           # POST .../media/upload-url
│   ├── media-delete/               # DELETE .../media/{mediaId}
│   ├── media-reorder/              # PUT .../media/reorder
│   ├── media-processor/            # S3 trigger → Sharp thumbnails → DDB record
│   └── display-get-carousel/       # GET /display/{branchId}/carousel (cached 55s)
│
│   Each lambda has: src/index.ts, package.json, tsconfig.json, template.yaml
│
├── infrastructure/
│   ├── cognito.yaml       # User pool, 3 groups, 2 app clients
│   ├── dynamodb.yaml      # ammas-main + ammas-events tables + GSIs
│   ├── s3-storage.yaml    # S3 bucket + CloudFront OAC distribution
│   └── amplify.yaml       # Amplify app shell (FE wired later)
│
├── layers/sharp/          # Sharp image resizing Lambda Layer (Linux x64)
│   ├── package.json
│   ├── build.sh           # Run before sam build: installs Sharp for Linux
│   └── template.yaml
│
├── template.yaml          # ROOT SAM template — composes all nested stacks
└── package.json           # build, deploy:staging, deploy:prod scripts
```

## DynamoDB Data Model (ammas-main table)

| Entity | PK | SK |
|---|---|---|
| Client | `CLIENT#<id>` | `#METADATA` |
| Branch | `CLIENT#<clientId>` | `BRANCH#<branchId>` |
| User | `USER#<cognitoSub>` | `#METADATA` |
| Carousel Config | `BRANCH#<branchId>` | `CAROUSEL#CONFIG` |
| Media Item | `BRANCH#<branchId>` | `MEDIA#<mediaId>` |

GSIs: `GSI-EntityType`, `GSI-UserByCognito`, `GSI-UserByEmail`

## First Deploy Steps

```bash
# 1. Build Sharp layer (one-time, requires npm)
cd layers/sharp && bash build.sh && cd ../..

# 2. Build all Lambda bundles
sam build

# 3. Deploy (Bitbucket pipeline will call this)
sam deploy \
  --stack-name ammas-banner-staging \
  --region ap-south-1 \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --parameter-overrides Environment=staging \
  --resolve-s3 --no-confirm-changeset

# 4. Note the stack outputs (ApiUrl, UserPoolId, AdminClientId, StoreClientId, MediaCdnDomain)

# 5. Create SUPER_ADMIN user in Cognito console → add to SUPER_ADMIN group
```

## Session Log

- **2026-06-02** — Initial scaffold with CDK (packages/api, packages/infra) — scrapped
- **2026-06-02** — Rebuilt with SAM/CloudFormation architecture:
  per-Lambda folders + templates, shared @ammas/* packages, infrastructure/ templates, root template.yaml
  Frontend not built (Figma designs pending, Amplify shell ready)
