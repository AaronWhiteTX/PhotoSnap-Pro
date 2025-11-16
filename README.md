# PhotoSnapPro: Serverless Photo Gallery with Secure Sharing

A modern, serverless web application that allows users to sign up, authenticate, and securely manage and share their photos with time-limited public links. Built entirely on AWS with custom domain, global CDN, and security-first architecture using pre-signed URLs and least-privilege access controls.

**Live Demo:** [https://photosnap.pro](https://photosnap.pro)

## Architecture Diagram
```mermaid
graph TB
    subgraph Client["Client Layer"]
        User[User Browser/Mobile]
    end
    
    subgraph DNS["DNS Layer - Global Failover<br/>100% Uptime SLA"]
        Route53[Route 53<br/>Multi-Region DNS<br/>Anycast Routing]
    end
    
    subgraph CDN["CDN Layer - 450+ Edge Locations<br/>Automatic Failover"]
        CloudFront[CloudFront Distribution<br/>99.9% Availability SLA<br/>DDoS Protection]
        ACM[ACM Certificate<br/>Auto-Renewal<br/>TLS 1.2+]
    end
    
    subgraph Frontend["Frontend Layer - Multi-AZ<br/>99.99% Availability"]
        S3Frontend[S3 Static Hosting<br/>Cross-AZ Replication<br/>Versioning Enabled]
    end
    
    subgraph API["API Layer - Multi-AZ<br/>99.95% Availability SLA"]
        APIGW[API Gateway HTTP API<br/>Auto-Scaling<br/>Rate Limiting: 10k req/sec]
    end
    
    subgraph Compute["Compute Layer - Multi-AZ<br/>Auto-Retry on Failure"]
        Lambda[Lambda Function<br/>Runs Across 3+ AZs<br/>Automatic Failover<br/>512MB Memory]
    end
    
    subgraph IAM_Boundary["IAM Security Boundary - Least Privilege"]
        subgraph IAM_Roles["IAM Roles"]
            LambdaRole[Lambda Execution Role<br/>DynamoDB + IAM + STS + S3]
            UserRole[Per-User S3 Roles<br/>Folder-Level Access Only]
        end
        STS[Security Token Service<br/>1-Hour Temp Credentials]
    end
    
    subgraph Storage["Storage Layer - Multi-AZ Replication"]
        DynamoDB[(DynamoDB<br/>3 AZ Synchronous Replication<br/>PITR: 35-Day Backup<br/>99.99% Availability)]
        S3Photos[(S3 Photos Bucket<br/>Cross-AZ Replication<br/>11 9's Durability<br/>Versioning Enabled)]
    end
    
    subgraph Monitoring["Monitoring & Alerting"]
        CloudWatch[CloudWatch Logs<br/>7-Day Retention]
        Alarms[CloudWatch Alarms<br/>Errors > 5 per 5min<br/>SNS Email Alerts]
    end
    
    User -->|DNS Lookup| Route53
    Route53 -->|Route to Nearest Edge| CloudFront
    CloudFront <-->|SSL/TLS Termination| ACM
    CloudFront -->|Fetch Origin| S3Frontend
    S3Frontend -->|Cached Response| CloudFront
    CloudFront -->|HTTPS Response| User
    
    User -->|HTTPS API Requests| APIGW
    APIGW -->|Invoke Function| Lambda
    Lambda -->|Response| APIGW
    APIGW -->|JSON Response| User
    
    Lambda -->|Read/Write| DynamoDB
    Lambda -->|Create IAM Roles| UserRole
    Lambda -->|AssumeRole Request| STS
    STS -->|Temporary Credentials| Lambda
    Lambda -->|Generate Pre-signed URLs| S3Photos
    
    User -->|Direct Upload/Download| S3Photos
    S3Photos -->|Verify IAM Permissions| UserRole
    
    LambdaRole -.->|Grants Permissions| Lambda
    
    Lambda -.->|Execution Logs| CloudWatch
    APIGW -.->|Access Logs| CloudWatch
    CloudWatch -->|Error Threshold Breach| Alarms
    Alarms -.->|Email Notification| User
    
    style Route53 fill:#8c4fff,stroke:#333,stroke-width:2px
    style CloudFront fill:#ff9900,stroke:#333,stroke-width:2px
    style ACM fill:#dd344c,stroke:#333,stroke-width:2px
    style S3Frontend fill:#569a31,stroke:#333,stroke-width:2px
    style APIGW fill:#ff4f8b,stroke:#333,stroke-width:2px
    style Lambda fill:#ff9900,stroke:#333,stroke-width:2px
    style DynamoDB fill:#527fff,stroke:#333,stroke-width:2px
    style S3Photos fill:#569a31,stroke:#333,stroke-width:2px
    style LambdaRole fill:#dd344c,stroke:#333,stroke-width:2px
    style UserRole fill:#dd344c,stroke:#333,stroke-width:2px
    style STS fill:#dd344c,stroke:#333,stroke-width:2px
    style CloudWatch fill:#ff4f8b,stroke:#333,stroke-width:2px
    style Alarms fill:#ff4f8b,stroke:#333,stroke-width:2px
```

*Figure 1: Serverless architecture with fault-tolerance across all layers. Every service runs across multiple Availability Zones with automatic failover. DNS provides global routing with failover policies, IAM boundaries enforce least-privilege access, and monitoring ensures rapid incident detection.*

## Features

### Core Functionality
- **User Authentication:** Secure signup/login with SHA256 password hashing
- **Password Reset:** Token-based password recovery system (15-minute expiry)
- **Photo Upload:** Drag-and-drop or click-to-upload with preview
- **Photo Gallery:** Grid view with hover effects and modal viewer
- **Branded Photo Sharing:** Generate shareable links with marketing viewer (7-day expiry)
- **URL Shortener:** Mobile-friendly short links (35 chars vs 2000+) prevent message splitting
- **Native Mobile Sharing:** iOS/Android share sheet with automatic clipboard fallbacks
- **Photo Deletion:** Secure deletion with confirmation modal

### Security Features
- **Pre-signed URLs:** All S3 operations use temporary, signed URLs - zero credentials in browser
- **Base64 URL Encoding:** Preserves AWS security tokens in share links
- **Least-Privilege IAM:** Per-user IAM roles with folder-level S3 access only
- **STS Temporary Credentials:** 1-hour session tokens for authenticated operations
- **SHA256 Password Hashing:** Passwords never stored in plaintext
- **HTTPS/SSL:** CloudFront with ACM certificate for encrypted traffic

### Resilience Features
- **Point-in-Time Recovery (PITR):** DynamoDB backup enabled with 35-day retention for data recovery
- **CloudWatch Alarms:** Automated alerts when Lambda errors exceed 5 per 5-minute period
- **Multi-AZ DynamoDB:** Automatic replication across availability zones
- **S3 Durability:** 99.999999999% (11 9's) durability with cross-AZ replication
- **CloudFront HA:** Automatic failover across global edge locations

### Infrastructure
- **Custom Domain:** photosnap.pro with Route 53 DNS management
- **Global CDN:** CloudFront distribution for low-latency worldwide access
- **Mobile Responsive:** Desktop and mobile optimized UI
- **Serverless:** Auto-scaling with zero server management
- **Cost-Optimized:** $0.50/month (Route 53 only, everything else free tier)

## Solution Architecture

| **AWS Component** | **Service Layer** | **Primary Function / Role** | 
| :--- | :--- | :--- | 
| **Route 53** | DNS | Custom domain DNS management and routing to CloudFront |
| **CloudFront** | CDN | Global content delivery with SSL/TLS termination and caching |
| **ACM** | Security | SSL/TLS certificate for HTTPS on custom domain |
| **S3 Static Hosting** | Frontend | Hosts static HTML, CSS, and JavaScript files |
| **API Gateway (HTTP API)** | API Layer | Exposes `/auth` endpoint for all backend operations with CORS handling |
| **Lambda** | Backend Logic | Handles authentication, pre-signed URL generation, and photo operations |
| **DynamoDB (Users)** | Data Storage | Stores user credentials (hashed), IAM role ARNs, and reset tokens with PITR enabled (35-day retention) |
| **DynamoDB (ShortLinks)** | Data Storage | Stores URL mappings (shortId → longUrl) with 7-day TTL auto-expiration |
| **IAM** | Security | Creates per-user least-privilege roles with folder-level S3 access |
| **STS** | Security | Issues temporary credentials for authenticated S3 operations |
| **S3 Photos Bucket** | Storage | Stores user photos with per-user folder isolation |
| **CloudWatch** | Monitoring | Logs and monitors Lambda executions and API Gateway requests with error alarms |

## Monitoring and Alerts

### CloudWatch Alarms Configuration
**Lambda Error Alarm:**
- **Metric:** Lambda Errors
- **Threshold Type:** Static
- **Condition:** Greater than 5 errors
- **Period:** 5 minutes
- **Action:** SNS notification (can be configured for email/SMS alerts)

**Purpose:** Provides immediate notification when the application experiences elevated error rates, enabling rapid response to service degradation or attacks.

### Point-in-Time Recovery (PITR)
**DynamoDB PITR Configuration:**
- **Status:** Enabled
- **Retention Period:** 35 days
- **Recovery Window:** Continuous backup allowing restore to any point in the last 35 days
- **Use Cases:** 
  - Recover from accidental deletions
  - Restore after data corruption
  - Compliance requirements for data retention
  - Testing with production-like data

## Key Architectural Decisions

### 1. Pre-signed URL Architecture
**Problem:** Initially attempted direct S3 uploads with AWS credentials exposed in browser, causing security vulnerabilities and CORS issues.

**Solution:** Implemented pre-signed URL pattern where:
- Client requests pre-signed URL from Lambda
- Lambda generates time-limited, cryptographically signed S3 URL (5 min for uploads, 1 hour for views, 7 days for shares)
- Client uploads/downloads directly to/from S3 using signed URL
- URL expires automatically, revoking access

**Benefits:**
- Zero AWS credentials in browser/network traffic
- Lambda maintains centralized access control
- Time-limited access prevents unauthorized long-term usage
- Follows AWS security best practices

### 2. Branded Photo Sharing with Marketing Funnel
**Feature:** Users can share photos via public links that display in a branded viewer page with conversion-optimized CTA.

**Implementation:**
- Share button generates viewer URL: `photosnap.pro/viewer.html?u=<base64-encoded-url>`
- Viewer page displays photo with PhotoSnap branding and "Start Free Today" CTA
- Converts photo sharing into marketing opportunity (viral growth loop)

**Technical Details:**
- Lambda `get-share-url` action generates 7-day pre-signed S3 URLs
- Frontend uses Base64 encoding (`btoa()`) to encode S3 URL in query parameter
- Viewer uses Base64 decoding (`atob()`) to extract and display photo
- Base64 encoding prevents AWS security token corruption (preserves `+` signs and special characters)

**Challenge Solved:**
Initial implementation used URL encoding (`encodeURIComponent()`) which converted plus signs in AWS security tokens to spaces, causing `InvalidToken` errors. Base64 encoding preserves all characters perfectly.

### 3. URL Shortener for Mobile Compatibility
**Problem:** Share links were 2000+ characters, causing messaging apps (SMS, WhatsApp, iMessage) to split URLs across multiple messages, breaking the link on mobile devices.

**Solution:** Implemented URL shortening service:
- User shares photo → generates 6-character random ID (e.g., `aBc123`)
- Stores mapping in DynamoDB: `shortId → viewer URL`
- Returns short link: `https://photosnap.pro/s/aBc123`
- CloudFront routes `/s/*` requests to redirect Lambda
- Lambda looks up shortId and redirects to full viewer URL

**Technical Details:**
- Short IDs: 6 alphanumeric characters (56 billion possible combinations)
- TTL: 7-day automatic expiration via DynamoDB TTL attribute
- Collision handling: Checks for existing IDs before saving (max 5 retries)
- CloudFront behavior: Routes `/s/*` to API Gateway → PhotoSnapRedirect Lambda

**Mobile Integration:**
- Native share sheet on iOS/Android (via `navigator.share` API)
- Automatic fallback to clipboard API on desktop browsers
- Legacy browser support via `execCommand('copy')`
- Manual copy input as final fallback

**Benefits:**
- Share links work perfectly in SMS, WhatsApp, iMessage, etc.
- Professional appearance (35 chars vs 2000+)
- Reduced bandwidth and improved user experience
- No additional cost (within free tier)

### 4. CORS Configuration
**Challenge:** API Gateway's automatic CORS injection failed to apply headers correctly for cross-origin requests.

**Solution:** 
- Configured HTTP API CORS settings with specific origin (`https://photosnap.pro`)
- Lambda explicitly handles OPTIONS preflight requests returning 200 status
- All responses include `Access-Control-Allow-Origin` header
- S3 photos bucket CORS allows GET requests from photosnap.pro

### 5. Custom Domain with CloudFront
**Setup:**
- Domain purchased and nameservers pointed to Route 53
- CloudFront distribution created with S3 website endpoint as origin
- SSL certificate requested via ACM in us-east-1 (required for CloudFront)
- Route 53 A records (alias) point to CloudFront distribution
- Cache invalidation strategy for deployment updates

**Benefits:**
- Professional branding (photosnap.pro vs long S3 URL)
- HTTPS/SSL encryption for security
- Global edge locations for low latency
- Caching improves performance and reduces costs

### 6. Least-Privilege Security Model
Instead of proxying S3 requests through Lambda (costly and high-latency), the application uses:
- **Per-User IAM Roles:** Each user gets dedicated role with access limited to `s3://bucket-name/username/*`
- **STS AssumeRole:** Lambda assumes user's role and returns temporary credentials (1-hour expiry)
- **Direct S3 Access:** Client uploads/downloads directly using temporary credentials

This approach is highly scalable, cost-effective, and follows the principle of least privilege.

### 7. Password Security
- Passwords hashed with SHA256 before storage in DynamoDB
- Reset tokens are 6-digit codes with 15-minute expiration
- Token-based password recovery prevents email dependency

### 8. Data Resilience Strategy
**DynamoDB PITR (35 days):**
- Continuous backup of all user data, credentials, and IAM role mappings
- Point-in-time restore capability for disaster recovery
- Protects against accidental deletions or data corruption
- Meets compliance requirements for data retention

**Multi-AZ Replication:**
- DynamoDB automatically replicates data across multiple availability zones
- S3 Standard storage class provides cross-AZ redundancy
- CloudFront uses multiple edge locations for high availability

**Monitoring and Alerting:**
- CloudWatch alarms notify on error rate increases (>5 errors per 5 minutes)
- Lambda execution logs captured for debugging and audit trails
- API Gateway access logs track all API requests

## API Endpoints

**Base URL:** `https://kjencmxwf0.execute-api.us-east-2.amazonaws.com/auth/auth`

All requests are POST with JSON body:

| **Action** | **Description** | **Request Body** | **Response** |
| :--- | :--- | :--- | :--- |
| `signup` | Create new user account | `{action, username, password}` | Success message + IAM role created |
| `login` | Authenticate user | `{action, username, password}` | Temporary credentials + S3 config |
| `request-reset` | Generate password reset token | `{action, username}` | 6-digit token (15 min expiry) |
| `reset-password` | Reset password with token | `{action, username, resetToken, newPassword}` | Success confirmation |
| `get-upload-url` | Get pre-signed upload URL | `{action, username, fileName, fileType}` | Signed PUT URL (5 min expiry) |
| `list-photos` | List user's photos | `{action, username}` | Array of photos with signed GET URLs (1 hr expiry) |
| `get-delete-url` | Get pre-signed delete URL | `{action, username, fileName}` | Signed DELETE URL (5 min expiry) |
| `get-share-url` | Get shareable public link | `{action, username, fileName}` | Signed GET URL (7 day expiry) |
| `create-short-url` | Generate shortened URL | `{action, longUrl}` | Short URL with 6-char ID (7 day expiry) |

## File Structure

```
photosnap-pro/
├── README.md
├── images/
│   ├── Visual Diagram.png          # Architecture diagram (high-res)
├── docs/
│   ├── 01-architecture-diagram.md
│   ├── 02-deployed-environment.md
│   ├── 03-cost-analysis.md
│   ├── 04-security-overview.md
│   └── 05-resilience-walkthrough.md
├── frontend/
│   ├── index.html          # Main dashboard with auth forms and photo gallery
│   ├── landing.html        # Marketing landing page
│   ├── viewer.html         # Branded photo viewer for shared links
│   ├── styles.css          # Dashboard styling
│   ├── landing.css         # Landing page styling
│   └── app.js              # Frontend logic (auth, upload, share with URL shortener)
└── backend/
    └── lambda/
        └── index.mjs       # Lambda function for all backend operations + URL shortening
```

## Setup and Deployment

### Prerequisites
- AWS Account
- Custom domain (optional but recommended)
- AWS CLI configured

### 1. DynamoDB Setup
```bash
# Create users table with PITR enabled
aws dynamodb create-table \
  --table-name PhotoSnapUsers \
  --attribute-definitions AttributeName=username,AttributeType=S \
  --key-schema AttributeName=username,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Enable Point-in-Time Recovery
aws dynamodb update-continuous-backups \
  --table-name PhotoSnapUsers \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true

# Create short links table
aws dynamodb create-table \
  --table-name PhotoSnapShortLinks \
  --attribute-definitions AttributeName=shortId,AttributeType=S \
  --key-schema AttributeName=shortId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Enable TTL for automatic expiration
aws dynamodb update-time-to-live \
  --table-name PhotoSnapShortLinks \
  --time-to-live-specification "Enabled=true, AttributeName=ttl"
```

### 2. S3 Buckets
```bash
# Frontend bucket
aws s3 mb s3://photosnap-frontend-<account-id>
aws s3 website s3://photosnap-frontend-<account-id> \
  --index-document landing.html

# Photos bucket
aws s3 mb s3://photosnap-photos-<account-id>
```

### 3. Lambda Deployment
1. Create Lambda execution role with permissions:
   - DynamoDB: GetItem, PutItem, UpdateItem (both tables)
   - IAM: CreateRole, PutRolePolicy
   - STS: AssumeRole
   - S3: PutObject, GetObject, ListBucket, DeleteObject
   - CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents

2. Deploy Lambda function:
```bash
cd backend/lambda
zip function.zip index.mjs
aws lambda create-function \
  --function-name PhotoSnapAuthFunction \
  --runtime nodejs20.x \
  --role arn:aws:iam::<account-id>:role/PhotoSnapLambdaExecutionRole \
  --handler index.handler \
  --zip-file fileb://function.zip
```

### 4. CloudWatch Alarms
```bash
# Create SNS topic for alarm notifications
aws sns create-topic --name PhotoSnapAlerts

# Subscribe email to SNS topic
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-2:<account-id>:PhotoSnapAlerts \
  --protocol email \
  --notification-endpoint your-email@example.com

# Create CloudWatch alarm for Lambda errors
aws cloudwatch put-metric-alarm \
  --alarm-name PhotoSnapLambdaErrors \
  --alarm-description "Alert when Lambda errors exceed threshold" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=FunctionName,Value=PhotoSnapAuthFunction \
  --alarm-actions arn:aws:sns:us-east-2:<account-id>:PhotoSnapAlerts
```

### 5. API Gateway
```bash
# Create HTTP API
aws apigatewayv2 create-api \
  --name PhotoSnapAPI \
  --protocol-type HTTP \
  --cors-configuration AllowOrigins="https://photosnap.pro",AllowMethods="POST,OPTIONS",AllowHeaders="Content-Type"

# Create route and integration
aws apigatewayv2 create-integration \
  --api-id <api-id> \
  --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:<region>:<account-id>:function:PhotoSnapAuthFunction

aws apigatewayv2 create-route \
  --api-id <api-id> \
  --route-key "POST /auth" \
  --target integrations/<integration-id>
```

### 6. CloudFront and Custom Domain (Optional)
1. Request SSL certificate in ACM (us-east-1 region)
2. Create CloudFront distribution with S3 website endpoint as origin
3. Configure Route 53 hosted zone for custom domain
4. Create A record (alias) pointing to CloudFront distribution
5. Add CloudFront behavior for `/s/*` path to route to redirect Lambda (for URL shortener)

### 7. Frontend Deployment
```bash
# Upload frontend files to S3
aws s3 cp frontend/ s3://photosnap-frontend-<account-id>/ --recursive

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id <dist-id> \
  --paths "/*"
```

## Security Considerations

1. **No Credentials in Browser:** Pre-signed URLs eliminate need for AWS credentials in client-side code
2. **Base64 Encoding:** Preserves AWS security tokens in shareable URLs (prevents `+` sign corruption)
3. **Time-Limited Access:** All signed URLs expire automatically (5 min to 7 days depending on operation)
4. **Folder Isolation:** IAM policies restrict users to their own S3 folder only
5. **HTTPS Only:** CloudFront enforces HTTPS, redirecting HTTP requests
6. **CORS Properly Configured:** Prevents unauthorized cross-origin requests
7. **Password Hashing:** SHA256 ensures passwords never stored in plaintext
8. **Token Expiration:** Password reset tokens expire after 15 minutes
9. **Data Backup:** PITR enabled with 35-day retention for disaster recovery
10. **Error Monitoring:** CloudWatch alarms alert on abnormal error rates
11. **Short Link Expiration:** URL shortener links auto-expire after 7 days via TTL

## Performance Optimizations

- **CloudFront Edge Caching:** Static assets served from global edge locations
- **Direct S3 Upload:** Files uploaded directly to S3 without Lambda proxy (lower latency)
- **Lazy Loading:** Photos loaded on-demand in gallery view
- **Pre-signed URL Caching:** View URLs valid for 1 hour to reduce Lambda invocations
- **Base64 Encoding:** Lightweight encoding for share URLs (no server processing)
- **Serverless Auto-scaling:** Lambda and API Gateway scale automatically with demand
- **URL Shortening:** Reduces bandwidth and improves mobile UX (35 chars vs 2000+)

## Future Enhancements

- Photo albums/collections
- Image compression and thumbnail generation
- Email-based password reset (SES integration)
- Social login (Cognito integration)
- Analytics dashboard (view counts, shares)
- Batch photo operations
- Photo editing capabilities
- Mobile app (React Native)
- Share link analytics (track views, clicks)
- Advanced monitoring dashboards (CloudWatch Insights)
- Custom short link domains (e.g., ps.pro/abc123)
- QR code generation for short links
- Custom vanity URLs (e.g., /s/mydog instead of /s/abc123)

## Technologies Used

- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Backend:** AWS Lambda (Node.js 20.x)
- **Database:** Amazon DynamoDB (with PITR, 2 tables)
- **Storage:** Amazon S3
- **API:** AWS API Gateway (HTTP API)
- **CDN:** Amazon CloudFront
- **DNS:** Amazon Route 53
- **Security:** AWS IAM, AWS STS, AWS ACM
- **Monitoring:** Amazon CloudWatch (Logs + Alarms)
- **Encoding:** Base64 for secure URL parameter passing
- **URL Shortening:** Base62 encoding (alphanumeric) with DynamoDB storage

## Cost Optimization

This serverless architecture is highly cost-effective:
- **Lambda:** Pay per request (1M free requests/month)
- **DynamoDB (2 tables):** On-demand pricing with PITR ($0.20/GB-month for backup storage)
- **S3:** Pay for storage and bandwidth only
- **CloudFront:** Free tier includes 1TB data transfer
- **API Gateway:** Pay per request (1M free requests/month)
- **CloudWatch:** Free tier includes 5GB logs, 10 alarms
- **Route 53:** $0.50/month for hosted zone

**Estimated monthly cost:**
- **Personal use (< 100 users, < 10GB photos, < 1000 shares/month):** $0.50-$2/month
- **Small business (1,000 users, 100GB photos, 10k shares/month):** $8-15/month
- **Most services within AWS free tier**

## License

MIT License - feel free to use this project for learning or commercial purposes.

## Author

Built as a portfolio project demonstrating serverless architecture, AWS security best practices, modern web development, fault-tolerant design, mobile-first UX, and growth marketing through viral sharing loops.

---

**Created:** November 2025  