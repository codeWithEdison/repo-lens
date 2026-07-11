You are working on an existing project named **RepoLens**.

RepoLens is an open-source repository contribution analyzer that allows a user to submit one or multiple repository URLs, analyze them, generate a technical contribution report, export the report, and then automatically delete all temporary data after a configured retention period.

Your task is to refactor and implement the project using the architecture and requirements below.

Do not redesign the existing frontend.

Do not introduce authentication, users, organizations, billing, Supabase, Prisma, PostgreSQL, or any permanent database.

---

# 1. Product Goal

RepoLens must behave like a stateless analysis tool rather than a SaaS platform.

The complete user workflow is:

```text
Paste one or multiple repository URLs
        ↓
Start analysis
        ↓
Track progress
        ↓
Generate contribution report
        ↓
View evidence
        ↓
Export PDF, JSON, or CSV
        ↓
Temporary workspace is deleted automatically
```

The application must require:

* No login
* No signup
* No authentication
* No user account
* No organization
* No billing
* No permanent persistence

Each analysis is temporary and isolated.

---

# 2. Required Architecture

Use the following architecture.

## Frontend

Keep the existing frontend and existing design.

Technology:

* React
* TypeScript
* Existing routing
* Existing UI components
* Existing styles

Do not redesign pages, routes, components, spacing, typography, charts, colors, or navigation unless a small change is required to connect the real API.

Replace mock data and mock API calls with the real backend.

## API Server

Use:

* Node.js
* Express
* TypeScript

The API server is responsible for:

* Validating analysis requests
* Generating analysis IDs
* Creating analysis workspaces
* Adding jobs to the queue
* Returning progress
* Returning reports
* Returning exports
* Deleting workspaces
* Serving Server-Sent Events when available
* Returning consistent errors

## Background Worker

Use:

* Node.js
* TypeScript
* BullMQ
* Redis

The worker is responsible for:

* Receiving analysis jobs
* Creating or verifying workspaces
* Cloning repositories
* Collecting Git metadata
* Analyzing repository structure
* Detecting contributors
* Calculating initial contribution metrics
* Generating report files
* Generating export files
* Updating progress continuously
* Deleting cloned repositories after processing

## Repository Analysis

Use:

* simple-git
* Octokit
* tree-sitter
* ts-morph

Use Octokit when GitHub API information is available.

Use simple-git for repository cloning and Git history inspection.

Use ts-morph for TypeScript and JavaScript structure analysis.

Create a clean adapter interface for tree-sitter so support for additional programming languages can be added later.

## AI Provider

Create an OpenAI-compatible provider abstraction.

Do not tightly couple the application to one AI vendor.

The first version may use deterministic and heuristic analysis without making real AI calls.

Advanced AI contribution analysis must not be implemented until the stateless architecture and base analysis pipeline are working correctly.

---

# 3. Remove Existing Database Architecture

Inspect the current codebase and remove every dependency, implementation, configuration, import, environment variable, service, hook, component, and unused file related to:

* Supabase
* PostgreSQL
* Prisma
* Authentication
* Organizations
* User profiles
* User accounts
* Sessions
* Permanent database persistence
* Database migrations
* Database schemas

Do not create:

* Prisma schemas
* SQL migrations
* Supabase tables
* Relational models
* Authentication middleware
* User session handling
* Organization models

After the refactor, searching the repository for `supabase`, `prisma`, `postgres`, `organization`, or authentication-related code should not return active application dependencies.

Do not remove ordinary words from documentation when they are used only for explanation, but remove all active architecture dependencies.

---

# 4. Repository Structure

Refactor the project toward the following structure while preserving the current frontend organization where practical:

```text
repo-lens/
├── src/
│   └── existing frontend
│
├── server/
│   ├── app.ts
│   ├── index.ts
│   ├── config/
│   ├── controllers/
│   ├── routes/
│   ├── middleware/
│   ├── services/
│   ├── utils/
│   └── types/
│
├── worker/
│   ├── index.ts
│   ├── jobs/
│   ├── analyzers/
│   ├── git/
│   ├── github/
│   ├── scoring/
│   ├── reports/
│   ├── exports/
│   ├── cleanup/
│   ├── ai/
│   └── utils/
│
├── shared/
│   ├── types/
│   ├── constants/
│   ├── schemas/
│   └── contracts/
│
├── workspace/
│   └── .gitkeep
│
├── docker/
│   ├── server.Dockerfile
│   ├── worker.Dockerfile
│   └── nginx.conf
│
├── docker-compose.yml
├── .env.example
└── README.md
```

Do not create:

```text
database/
prisma/
migrations/
supabase/
```

---

# 5. Temporary Workspace Model

Every analysis must have its own isolated directory.

Use a secure workspace root configured through an environment variable.

Default:

```text
workspace/
```

Example workspace:

```text
workspace/
└── analysis_8b4fd7c2/
    ├── metadata.json
    ├── progress.json
    ├── report.json
    ├── evidence.json
    ├── logs.json
    ├── repositories/
    │   ├── frontend/
    │   └── backend/
    └── exports/
        ├── report.pdf
        ├── report.csv
        └── report.json
```

The `repositories` directory must be deleted immediately after repository analysis completes, whether the analysis succeeds or fails.

The remaining workspace files may stay available until the retention period expires.

All workspace access must go through a dedicated `WorkspaceService`.

Do not spread direct filesystem operations throughout controllers and analyzers.

Create reusable methods such as:

```ts
createWorkspace(analysisId)
getWorkspacePath(analysisId)
writeMetadata(analysisId, metadata)
readMetadata(analysisId)
writeProgress(analysisId, progress)
readProgress(analysisId)
writeReport(analysisId, report)
readReport(analysisId)
writeEvidence(analysisId, evidence)
appendLog(analysisId, entry)
deleteRepositoriesDirectory(analysisId)
deleteWorkspace(analysisId)
workspaceExists(analysisId)
```

Use atomic file writes where possible:

1. Write to a temporary file.
2. Rename it to the final filename.

This prevents the frontend from reading partially written JSON.

---

# 6. Analysis ID

Generate a unique public analysis ID for every request.

Format:

```text
analysis_<random-id>
```

Example:

```text
analysis_8b4fd7c2
```

Requirements:

* Must be URL safe
* Must not contain paths
* Must not use user-provided values
* Must be validated before filesystem access
* Must be resistant to collisions
* Must not expose an absolute filesystem path

Create a reusable validation function.

Reject any analysis ID containing:

* `/`
* `\`
* `..`
* spaces
* unsupported characters

Prevent path traversal in every filesystem operation.

---

# 7. Shared Type Definitions

Create shared TypeScript types used by both the frontend and backend.

At minimum, create types for:

```ts
RepositoryInput
CreateAnalysisRequest
CreateAnalysisResponse
AnalysisMetadata
AnalysisStatus
AnalysisStage
AnalysisProgress
RepositoryProgress
Contributor
RepositorySummary
DetectedFeature
FeatureContributor
ContributionMetric
ContributionScore
ContributionReport
ContributionEvidence
AnalysisLogEntry
ApiErrorResponse
```

Suggested analysis statuses:

```ts
type AnalysisStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "expired";
```

Suggested stages:

```ts
type AnalysisStage =
  | "Queued"
  | "Preparing Workspace"
  | "Cloning Repositories"
  | "Reading Git History"
  | "Inspecting Project Structure"
  | "Analyzing Contributors"
  | "Detecting Features"
  | "Calculating Contribution"
  | "Generating Report"
  | "Generating Exports"
  | "Cleaning Temporary Repositories"
  | "Completed"
  | "Failed";
```

Use runtime request validation with a schema library already present in the project. If none exists, use Zod.

Do not rely only on TypeScript interfaces for API validation.

---

# 8. API Requirements

Implement the following endpoints.

## Create Analysis

```http
POST /api/analyses
```

Request:

```json
{
  "repositories": [
    {
      "url": "https://github.com/example/frontend"
    },
    {
      "url": "https://github.com/example/backend"
    }
  ]
}
```

Optional repository fields may include:

```json
{
  "url": "...",
  "branch": "main",
  "accessToken": "temporary-token"
}
```

Do not store access tokens in metadata, progress files, reports, logs, or exports.

Response:

```json
{
  "analysisId": "analysis_8b4fd7c2",
  "status": "queued",
  "progressUrl": "/api/progress/analysis_8b4fd7c2",
  "reportUrl": "/api/report/analysis_8b4fd7c2"
}
```

Requirements:

* Accept one or multiple repositories
* Validate supported repository URLs
* Reject duplicate URLs
* Apply a configurable maximum number of repositories
* Create the workspace
* Write initial metadata
* Write initial progress
* Add the analysis job to BullMQ
* Return immediately
* Never perform repository analysis inside the HTTP request

## Get Progress

```http
GET /api/progress/:analysisId
```

Read and return `progress.json`.

Example:

```json
{
  "analysisId": "analysis_8b4fd7c2",
  "status": "running",
  "overallProgress": 64,
  "currentStage": "Detecting Features",
  "message": "Grouping related changes into project features",
  "repositories": [
    {
      "name": "frontend",
      "url": "https://github.com/example/frontend",
      "progress": 78,
      "status": "running"
    },
    {
      "name": "backend",
      "url": "https://github.com/example/backend",
      "progress": 50,
      "status": "running"
    }
  ],
  "updatedAt": "2026-07-11T08:00:00.000Z"
}
```

Return:

* `404` when the workspace does not exist
* `410` when metadata indicates the analysis expired, when applicable
* `500` only for unexpected filesystem failures

## Progress Events

Also implement:

```http
GET /api/progress/:analysisId/events
```

Use Server-Sent Events.

Requirements:

* Send an initial progress event
* Send progress updates when `progress.json` changes
* Send periodic heartbeat events
* Close the stream when analysis completes or fails
* Clean up file watchers and timers when the client disconnects

The frontend may use SSE when supported and polling as fallback.

## Get Report

```http
GET /api/report/:analysisId
```

Requirements:

* Return `202` while the report is not ready
* Return the contents of `report.json` when completed
* Return structured failure details when the analysis failed
* Never expose internal paths or stack traces

## Export PDF

```http
GET /api/export/pdf/:analysisId
```

Return:

```text
application/pdf
```

Use a safe generated filename.

## Export JSON

```http
GET /api/export/json/:analysisId
```

Return the generated JSON export.

## Export CSV

```http
GET /api/export/csv/:analysisId
```

Return:

```text
text/csv
```

## Delete Analysis

```http
DELETE /api/analysis/:analysisId
```

Requirements:

* Remove the complete workspace
* If the job is still queued or running, attempt to cancel it safely
* Prevent the worker from recreating files after deletion
* Return a successful idempotent response when the workspace is already absent

---

# 9. Error Response Format

Use one consistent API error format:

```json
{
  "error": {
    "code": "ANALYSIS_NOT_FOUND",
    "message": "The requested analysis does not exist or has expired.",
    "details": null
  }
}
```

Create central Express error-handling middleware.

Do not return raw exceptions to the frontend.

Define error codes including:

```text
INVALID_REQUEST
INVALID_REPOSITORY_URL
UNSUPPORTED_REPOSITORY_PROVIDER
TOO_MANY_REPOSITORIES
ANALYSIS_NOT_FOUND
ANALYSIS_NOT_READY
ANALYSIS_FAILED
EXPORT_NOT_READY
QUEUE_UNAVAILABLE
REPOSITORY_CLONE_FAILED
REPOSITORY_TOO_LARGE
INTERNAL_ERROR
```

---

# 10. Queue and Redis

Use BullMQ and Redis.

Create queues for:

```text
repository-analysis
workspace-cleanup
```

The API adds jobs to `repository-analysis`.

The worker consumes jobs from `repository-analysis`.

Use controlled concurrency configured through environment variables.

Requirements:

* Configure retry attempts
* Use exponential backoff
* Store only the analysis ID and required repository connection information in the job payload
* Never place full repository contents in Redis
* Remove completed and failed jobs according to configurable queue retention
* Add worker event handlers for completed, failed, stalled, and error events
* Update workspace metadata and logs when queue events occur

The filesystem remains the source of truth for report and progress data.

Redis is only used for queue coordination.

---

# 11. Analysis Worker Pipeline

Implement the worker as a staged pipeline.

The initial version must prioritize reliable architecture and basic evidence-based analysis.

Use the following stages:

## Stage 1: Prepare Workspace

* Validate analysis ID
* Verify workspace exists
* Mark status as running
* Initialize logs
* Create repositories directory

## Stage 2: Clone Repositories

For every repository:

* Validate URL again
* Derive a safe local directory name
* Clone with `simple-git`
* Use shallow or full history according to configuration
* Do not run hooks
* Do not execute repository scripts
* Do not install dependencies
* Do not use repository-provided configuration as executable code
* Apply repository size and timeout limits
* Update repository-specific progress

For the initial contribution analysis, Git history is important. Prefer cloning enough history to calculate meaningful contribution metrics.

If shallow cloning is used for initial speed, create a clear strategy to fetch additional history when necessary.

## Stage 3: Collect Repository Metadata

Collect:

* Repository name
* Default branch
* Branches inspected
* Commit count
* Contributor identities
* First and last commit dates
* Tags
* Releases when available
* Pull requests when available through Octokit
* Languages
* Framework indicators
* Main directories
* Package manifests
* CI/CD files
* Docker files
* Documentation files
* Test directories

## Stage 4: Normalize Contributor Identities

The same person may commit using several names or email addresses.

Create a contributor identity normalization service.

Use evidence such as:

* Commit email
* Commit name
* GitHub login
* Pull-request author
* `.mailmap`

Do not automatically merge contributors when confidence is low.

Include identity confidence and aliases in `evidence.json`.

## Stage 5: Inspect Git History

Analyze:

* Commits
* Commit timestamps
* Commit messages
* Files changed
* Added, modified, deleted files
* Merge commits
* Reverts
* Co-authored commits
* Branch context when available
* Pull-request associations when available

Do not use commit count or lines changed as the final score.

Treat them only as evidence.

Reduce or exclude activity generated by:

* Merge commits
* Automated bots
* Dependency update bots
* Formatting-only changes
* Lockfile-only changes
* Generated files
* Minified files
* Build output
* Vendored code
* Repeated mass renames
* Reverted changes

## Stage 6: Inspect Source Structure

Create analyzers for:

* TypeScript
* JavaScript
* Generic repository structure

Use `ts-morph` to identify:

* New exported functions
* Classes
* Interfaces
* API handlers
* Routes
* Services
* Components
* Hooks
* Models
* Tests
* Configuration modules

Create a tree-sitter abstraction for future languages.

Do not block the MVP if unsupported languages exist.

Return lower-confidence generic analysis for unsupported languages.

## Stage 7: Detect Preliminary Features

For the first working implementation, use transparent heuristics.

Group related work using:

* Pull-request boundaries
* Issue references
* Branch names
* Commit message similarity
* Shared files and directories
* Time proximity
* Module names
* Routes
* Service names
* Database or schema files
* Test names
* README and documentation references

Examples of feature groups:

* Authentication
* Reservations
* Notifications
* Reporting
* Payments
* Vehicle Tracking
* Dashboard
* Search
* File Management

Every detected feature must include:

* Name
* Description
* Repositories involved
* Files involved
* Commits involved
* Pull requests involved
* First activity date
* Last activity date
* Primary contributor
* Supporting contributors
* Confidence
* Evidence references

Do not claim certainty when the evidence is weak.

## Stage 8: Calculate Contribution Metrics

Create a transparent scoring engine.

The score must not be based only on commits or lines of code.

For the MVP, calculate normalized metrics such as:

```text
Feature Ownership
Delivery and Completion
Technical Complexity
Consistency
Code Review and Collaboration
Quality and Testing
Architecture and Infrastructure
Maintenance and Stabilization
```

Suggested default weights:

```text
Feature Ownership: 30%
Delivery and Completion: 20%
Technical Complexity: 15%
Consistency: 10%
Quality and Testing: 10%
Architecture and Infrastructure: 5%
Code Review and Collaboration: 5%
Maintenance and Stabilization: 5%
```

Make weights configurable in a server configuration file, not through a complex UI.

Each score must include:

* Raw value
* Normalized value
* Weight
* Weighted result
* Confidence
* Evidence
* Human-readable explanation

Do not present the result as mathematically absolute.

Label it as an evidence-based technical contribution estimate.

## Stage 9: Generate Report

Generate `report.json`.

The report must support multi-repository projects.

A project may contain:

* Frontend repository
* Backend repository
* Mobile repository
* Infrastructure repository
* Documentation repository

Analyze all selected repositories as one project while preserving per-repository evidence.

The report should contain:

```ts
{
  analysisId,
  generatedAt,
  repositories,
  projectSummary,
  technologies,
  contributors,
  contributorRanking,
  detectedFeatures,
  featureOwnership,
  contributionTimeline,
  contributionScores,
  technicalShareRecommendation,
  methodology,
  limitations,
  warnings
}
```

The contribution percentages should total 100 after normalization, except when no reliable contribution can be calculated.

## Stage 10: Generate Evidence

Generate `evidence.json`.

The evidence file must contain enough information to explain every report conclusion.

Include:

* Contributor aliases
* Referenced commits
* Referenced pull requests
* Feature grouping evidence
* Ownership evidence
* Complexity indicators
* Consistency periods
* Quality indicators
* Excluded activity
* Confidence values
* Scoring calculations
* Warnings
* Limitations

Do not expose repository access tokens.

Do not expose sensitive environment variables.

## Stage 11: Generate Exports

Generate:

```text
exports/report.pdf
exports/report.csv
exports/report.json
```

The CSV should contain contributor-level results.

Suggested columns:

```text
Rank
Contributor
Contribution Percentage
Final Score
Feature Ownership Score
Delivery Score
Complexity Score
Consistency Score
Quality Score
Architecture Score
Review Score
Maintenance Score
Features Owned
Repositories
Confidence
```

The PDF should be readable, professional, and based on `report.json`.

Do not create a second independent report model for the PDF.

## Stage 12: Cleanup Repository Clones

Immediately delete:

```text
workspace/<analysis-id>/repositories/
```

Run this cleanup in a `finally` block.

Update logs when cleanup succeeds or fails.

Mark the analysis completed only after the report and exports are available.

---

# 12. Progress Tracking

Continuously update:

```text
progress.json
```

Suggested structure:

```json
{
  "analysisId": "analysis_8b4fd7c2",
  "status": "running",
  "overallProgress": 64,
  "currentStage": "Detecting Features",
  "message": "Grouping related changes across two repositories",
  "repositories": [
    {
      "name": "frontend",
      "url": "https://github.com/example/frontend",
      "progress": 78,
      "status": "running",
      "currentStage": "Inspecting Project Structure"
    }
  ],
  "startedAt": "2026-07-11T08:00:00.000Z",
  "updatedAt": "2026-07-11T08:03:00.000Z",
  "completedAt": null,
  "error": null
}
```

Progress values must:

* Never go backward
* Stay between 0 and 100
* Reach 100 only after report and exports are ready
* Update after each meaningful stage
* Include a clear current message

Do not fake progress using timers.

Progress must reflect actual worker stages.

---

# 13. Metadata

Store lightweight analysis metadata in:

```text
metadata.json
```

Suggested structure:

```json
{
  "analysisId": "analysis_8b4fd7c2",
  "createdAt": "2026-07-11T08:00:00.000Z",
  "updatedAt": "2026-07-11T08:04:00.000Z",
  "expiresAt": "2026-07-12T08:00:00.000Z",
  "status": "completed",
  "repositories": [
    {
      "name": "frontend",
      "provider": "github",
      "url": "https://github.com/example/frontend"
    }
  ],
  "reportReady": true,
  "exportsReady": true
}
```

Never store repository tokens.

---

# 14. Logs

Store structured logs in:

```text
logs.json
```

Use an array or JSON Lines format.

Each log entry should contain:

```json
{
  "timestamp": "2026-07-11T08:03:00.000Z",
  "level": "info",
  "stage": "Detecting Features",
  "message": "Detected 12 preliminary feature groups",
  "repository": "frontend",
  "durationMs": 1840,
  "details": null
}
```

Supported levels:

```text
debug
info
warning
error
```

Do not include:

* Access tokens
* Environment variables
* Full source-code contents
* Sensitive URLs containing credentials
* Absolute server paths in API responses

---

# 15. Cleanup Service

Implement automatic workspace cleanup.

Default retention:

```text
24 hours
```

Configure using:

```text
ANALYSIS_RETENTION_HOURS=24
```

The cleanup worker runs periodically.

Configure using:

```text
CLEANUP_INTERVAL_MINUTES=60
```

Cleanup process:

1. Scan the workspace root.
2. Validate every directory name before accessing it.
3. Read `metadata.json`.
4. Determine whether the workspace has expired.
5. Avoid deleting an actively running analysis unless it has exceeded a separate stale-job timeout.
6. Delete expired workspaces recursively.
7. Record cleanup activity in application logs.
8. Continue processing other workspaces if one deletion fails.

Also delete incomplete or orphaned workspaces older than the configured stale threshold.

---

# 16. Frontend Integration

Keep the existing frontend.

Do not redesign it.

Do not change existing routes unless a route is currently broken and a minimal repair is required.

Replace all mock analysis behavior with API integration.

Implement a frontend API client with methods such as:

```ts
createAnalysis()
getAnalysisProgress()
subscribeToAnalysisProgress()
getAnalysisReport()
downloadPdfExport()
downloadJsonExport()
downloadCsvExport()
deleteAnalysis()
```

Frontend workflow:

1. User enters one or multiple repository URLs.
2. Frontend calls `POST /api/analyses`.
3. Frontend stores the returned analysis ID temporarily in route state or session storage.
4. Frontend opens SSE progress updates.
5. If SSE fails, frontend polls progress.
6. When status becomes completed, frontend requests the report.
7. Existing report components render real data.
8. Export buttons call the real API endpoints.
9. Errors are shown using the existing notification design.

Do not add login screens.

Do not add signup screens.

Do not add organization pages.

Do not add user profile pages.

Do not add onboarding pages.

Do not add project history requiring permanent persistence.

A user may only access an analysis while they still know its analysis ID and while the temporary workspace exists.

---

# 17. Multiple Repository Analysis

The application must support analyzing several repositories together as one project.

Example:

```text
frontend
backend
mobile-app
infrastructure
```

Requirements:

* Accept multiple repository URLs in one analysis request
* Clone each repository into its own safe folder
* Track progress for every repository
* Normalize contributor identities across repositories
* Detect shared features across repositories
* Preserve repository-level evidence
* Produce one combined ranking
* Produce one combined technical-share recommendation
* Show which repositories each developer contributed to
* Avoid double-counting duplicated or mirrored repositories
* Reject exact duplicate URLs in the same request

---

# 18. Security Requirements

Repository content is untrusted input.

Implement the following protections.

## Never Execute Repository Code

Do not:

* Run npm install
* Run pnpm install
* Run yarn
* Run pip install
* Run Maven
* Run Gradle
* Run repository tests
* Run build scripts
* Run Git hooks
* Source shell scripts
* Load executable project configuration
* Execute package scripts

## Safe Git Operations

* Disable Git hooks
* Use command timeouts
* Limit repository size
* Limit file count
* Limit commit history when configured
* Sanitize branch names
* Sanitize local directory names
* Reject unsupported URL schemes
* Reject local filesystem paths
* Reject `file://` URLs
* Protect against shell injection
* Never concatenate untrusted values into shell commands

Use library APIs and argument arrays where possible.

## Network Security

Prevent Server-Side Request Forgery.

By default, allow only supported public Git providers:

* github.com
* gitlab.com
* bitbucket.org

Create a configuration option for explicitly allowed self-hosted Git domains.

Reject:

* localhost
* private IP addresses
* loopback addresses
* link-local addresses
* cloud metadata endpoints
* unsupported protocols
* credential-injected URLs

## Filesystem Security

* Validate analysis IDs
* Validate repository directory names
* Resolve and verify paths stay inside the workspace root
* Prevent symbolic-link path escapes
* Do not serve workspace directories statically
* Return files only through controlled API endpoints
* Delete cloned repositories immediately after analysis

## API Protection

Even without user authentication, implement:

* Rate limiting
* Request size limits
* Repository count limits
* Analysis concurrency limits
* CORS configuration
* Helmet
* Central error handling
* Input validation
* Timeouts
* Graceful shutdown

---

# 19. OpenAI-Compatible Provider Abstraction

Create an interface such as:

```ts
interface AIProvider {
  summarizeProject(input: ProjectSummaryInput): Promise<ProjectSummaryResult>;
  explainFeature(input: FeatureExplanationInput): Promise<FeatureExplanationResult>;
  explainContribution(input: ContributionExplanationInput): Promise<ContributionExplanationResult>;
}
```

Create:

```text
NoopAIProvider
OpenAICompatibleProvider
```

The default provider should be configurable.

The `NoopAIProvider` should allow the entire application to function without an API key.

It should generate deterministic fallback explanations using templates and evidence.

Environment variables may include:

```text
AI_PROVIDER=none
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
```

Do not send entire repositories to the AI provider.

Only send bounded, structured summaries.

Remove secrets and sensitive data before any external AI request.

---

# 20. Configuration

Create validated environment configuration.

Example `.env.example`:

```text
NODE_ENV=development

SERVER_PORT=4000
FRONTEND_ORIGIN=http://localhost:5173

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

WORKSPACE_ROOT=./workspace
ANALYSIS_RETENTION_HOURS=24
CLEANUP_INTERVAL_MINUTES=60
STALE_ANALYSIS_HOURS=6

ANALYSIS_WORKER_CONCURRENCY=2
MAX_REPOSITORIES_PER_ANALYSIS=5
MAX_REPOSITORY_SIZE_MB=500
MAX_FILES_PER_REPOSITORY=50000
MAX_ANALYSIS_DURATION_MINUTES=30
GIT_CLONE_TIMEOUT_MINUTES=10

ALLOWED_GIT_HOSTS=github.com,gitlab.com,bitbucket.org
ALLOW_PRIVATE_REPOSITORIES=false

AI_PROVIDER=none
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=

GITHUB_TOKEN=
```

Validate configuration during startup.

Fail clearly when required settings such as Redis configuration are invalid.

Do not require AI credentials for local development.

---

# 21. Docker

Create Docker support for:

* Frontend
* API server
* Analysis worker
* Redis

Use Docker Compose.

The API server and worker must share the same workspace volume.

Example services:

```text
frontend
server
worker
redis
```

Requirements:

* Use non-root users where practical
* Use multi-stage builds
* Persist only the temporary workspace volume
* Add health checks
* Add graceful shutdown
* Do not include secrets in images
* Ensure the worker can use Git
* Ensure server and worker use the same workspace root
* Ensure repository clones are not accessible from the frontend container

---

# 22. Testing

Add meaningful tests.

At minimum:

## Unit Tests

* Analysis ID generation and validation
* Path traversal prevention
* Repository URL validation
* Workspace creation
* Atomic JSON writing
* Progress calculation
* Contributor normalization
* Excluded activity classification
* Score normalization
* CSV generation
* Cleanup expiration logic

## Integration Tests

* Create an analysis
* Read queued progress
* Process a small fixture repository
* Generate a report
* Download JSON export
* Delete an analysis
* Return 404 for missing analysis
* Clean an expired workspace

Use local Git fixture repositories for tests.

Do not depend on external GitHub repositories in the default automated test suite.

---

# 23. Documentation

Update the README with:

* Project purpose
* Stateless architecture
* Local setup
* Environment variables
* Redis setup
* Docker setup
* Running frontend, API, and worker
* API endpoints
* Workspace lifecycle
* Security model
* Contribution scoring methodology
* Current limitations
* How to add a language analyzer
* How to add an AI provider
* How to contribute

Clearly state:

> RepoLens produces evidence-based technical contribution estimates. It should support human discussion and should not be treated as an unquestionable legal, financial, employment, or equity decision.

---

# 24. Implementation Order

Follow this implementation order strictly.

## Phase 1: Audit Existing Project

Before changing code:

1. Inspect the current repository.
2. Identify frontend structure.
3. Identify mock APIs.
4. Identify Supabase, Prisma, database, authentication, user, and organization dependencies.
5. Identify existing routes and reusable report components.
6. Produce a concise implementation checklist in the response.
7. Then begin refactoring.

Do not redesign the frontend.

## Phase 2: Remove Old Architecture

Remove:

* Supabase
* Prisma
* Database services
* Authentication
* Organizations
* User profiles
* Related environment variables
* Related unused dependencies

Ensure the frontend still builds.

## Phase 3: Shared Contracts

Create:

* Shared types
* Request schemas
* Report schemas
* Error contracts
* Progress contracts

## Phase 4: Filesystem Workspace

Implement and test:

* Workspace service
* Metadata
* Progress
* Logs
* Reports
* Evidence
* Atomic writes
* Secure path handling
* Deletion

## Phase 5: Express API

Implement all required endpoints with temporary placeholder jobs where needed.

Verify:

* Create analysis
* Progress retrieval
* Report retrieval
* Deletion
* Export retrieval

## Phase 6: Redis and BullMQ

Implement:

* Queue producer
* Analysis worker
* Job lifecycle
* Retry behavior
* Graceful shutdown

## Phase 7: Basic Repository Analysis

Implement:

* Repository validation
* Cloning
* Git metadata
* Contributors
* Commit classification
* Project structure
* Language detection
* Basic feature heuristics
* Initial scoring

Do not add advanced AI yet.

## Phase 8: Reports and Exports

Generate:

* report.json
* evidence.json
* report.csv
* report.pdf
* report JSON export

## Phase 9: Frontend Connection

Replace mock API calls.

Keep routes and visual design unchanged.

Connect:

* Repository input
* Multi-repository selection
* Analysis progress
* Report
* Exports
* Errors
* Deletion

## Phase 10: Cleanup and Security

Implement:

* Scheduled cleanup
* Clone deletion
* Rate limiting
* SSRF protection
* Size limits
* Timeouts
* Path safety
* Request validation

## Phase 11: Tests and Documentation

Add tests and update the README.

Only after these phases are fully working should advanced AI analysis be considered.

---

# 25. Coding Standards

Use:

* Strict TypeScript
* Clear service boundaries
* Dependency injection where useful
* Small focused modules
* Typed errors
* Central configuration
* Shared API contracts
* Reusable analyzers
* Explicit return types for public functions
* Async error handling
* Structured logging

Avoid:

* `any`
* Large controllers
* Direct filesystem access in routes
* Business logic in React components
* Hard-coded paths
* Hard-coded progress values
* Duplicated types
* Silent error handling
* Vendor-specific AI logic in analysis services
* Database abstractions that are not currently needed

---

# 26. Definition of Done

The architecture refactor is complete only when all of the following work:

1. The existing frontend still renders with its original design.
2. No login or account is required.
3. A user can submit one or multiple repository URLs.
4. The API returns a unique analysis ID.
5. The analysis is processed asynchronously through BullMQ.
6. Progress is stored in and returned from `progress.json`.
7. Each analysis has an isolated filesystem workspace.
8. The worker clones and analyzes repositories without executing them.
9. Repository clones are deleted immediately after processing.
10. The report is stored in `report.json`.
11. Supporting evidence is stored in `evidence.json`.
12. Logs are stored in `logs.json`.
13. PDF, JSON, and CSV exports are generated.
14. The frontend displays the real report.
15. Temporary workspaces are automatically deleted after the retention period.
16. The entire system works without Supabase, PostgreSQL, Prisma, authentication, or permanent storage.
17. The system works without an AI API key.
18. Tests cover the critical workspace, security, scoring, and cleanup behavior.
19. Docker Compose starts the frontend, API, worker, and Redis.
20. The README explains how to run and contribute to the project.

---

# 27. Final Instructions

Do not redesign the existing UI.

Do not introduce a database.

Do not introduce authentication.

Do not introduce permanent analysis history.

Do not begin with advanced AI analysis.

First make the full stateless architecture functional from repository submission to report export and cleanup.

When making changes:

1. Inspect existing files before editing.
2. Reuse working frontend components.
3. Make incremental changes.
4. Run formatting, type checking, tests, and builds after each major phase.
5. Fix errors before continuing.
6. Briefly document important architectural decisions.
7. Never claim a stage is complete without verifying it through commands or tests.

At the end, provide:

* Summary of changes
* Final project structure
* Removed dependencies
* Added dependencies
* Environment variables
* Commands to run locally
* Commands to run with Docker
* API endpoint summary
* Tests executed
* Remaining limitations
* Recommended next development phase
