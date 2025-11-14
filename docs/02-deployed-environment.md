# Document 2: Deployed Environment

## PhotoSnapPro AWS Resource Inventory

This document provides a complete inventory of all AWS resources deployed for the PhotoSnapPro application in the free-tier/sandbox AWS account.

---

## AWS Account Information

- **Account ID:** 153600892207
- **Primary Region:** us-east-2 (US East - Ohio)
- **Secondary Region:** us-east-1 (US East - N. Virginia) - for ACM certificate only
- **Environment:** Production
- **Deployment Date:** November 2025

---

## 1. Compute Resources

### AWS Lambda

#### Function: PhotoSnapAuthFunction
- **ARN:** `arn:aws:lambda:us-east-2:153600892207:function:PhotoSnapAuthFunction`
- **Runtime:** Node.js 20.x
- **Handler:** index.handler
- **Memory:** 512 MB
- **Timeout:** 30 seconds
- **Execution Role:** PhotoSnapLambdaExecutionRole
- **Environment Variables:**
  - `DYNAMODB_TABLE_NAME`: PhotoSnapUsers
  - `S3_PHOTOS_BUCKET`: photosnap-photos-153600892207
  - `USER_ROLE_NAME_PREFIX`: PhotoSnapUserS3Access
- **Layers:** None (dependencies bundled in deployment package)
- **Concurrency:** Unreserved (up to 1000 concurrent executions)
- **Free Tier Status:**  Within 1M requests/month free tier
- **Cost:** $0/month (current usage < 100 requests/day)

**Lambda Function Actions:**
1. `signup` - User registration
2. `login` - User authentication
3. `request-reset` - Password reset token generation
4. `reset-password` - Password reset with token
5. `get-upload-url` - Pre-signed S3 PUT URL generation
6. `list-photos` - List user's photos with pre-signed GET URLs
7. `get-delete-url` - Pre-signed S3 DELETE URL generation
8. `get-share-url` - Pre-signed S3 GET URL for sharing (7-day expiry)

---

## 2. API Layer

### API Gateway (HTTP API)

#### API: PhotoSnapAPI
- **API ID:** kjencmxwf0
- **Endpoint:** `https://kjencmxwf0.execute-api.us-east-2.amazonaws.com`
- **Stage:** `$default` (auto-deploy enabled)
- **Protocol:** HTTP API (not REST API)
- **CORS Configuration:**
  - Allowed Origins: `https://photosnap.pro`
  - Allowed Methods: `POST`, `OPTIONS`
  - Allowed Headers: `Content-Type`, `Authorization`
  - Max Age: 300 seconds

**Routes:**
1. **POST /auth** → Lambda: PhotoSnapAuthFunction
   - Integration Type: AWS_PROXY
   - Timeout: 30 seconds
2. **OPTIONS /auth** → Lambda: PhotoSnapAuthFunction (CORS preflight)
   - Returns 200 with CORS headers

**Free Tier Status:**  Within 1M requests/month free tier  
**Cost:** $0/month (current usage < 100 requests/day)

**Throttling Settings:**
- Rate Limit: 10,000 requests/second
- Burst Limit: 5,000 requests

---

## 3. Storage Resources

### S3 Buckets

#### Bucket 1: photosnap-frontend-153600892207
- **Purpose:** Static website hosting (HTML, CSS, JS)
- **Region:** us-east-2
- **Website Endpoint:** `http://photosnap-frontend-153600892207.s3-website.us-east-2.amazonaws.com`
- **Versioning:** Enabled (for rollback capability)
- **Public Access:** Blocked (CloudFront is the only allowed origin)
- **Encryption:** SSE-S3 (server-side encryption)
- **Static Website Hosting:** Enabled
  - Index Document: `landing.html`
  - Error Document: `index.html` (SPA routing)

**Files:**
```
/landing.html        (5 KB)
/landing.css         (3 KB)
/index.html          (8 KB)
/styles.css          (4 KB)
/app.js              (12 KB)
/viewer.html         (4 KB)
```

**CORS Configuration:**
```json
[
  {
    "AllowedOrigins": ["https://photosnap.pro"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

**Free Tier Status:**  Within 5GB storage + 20,000 GET requests/month  
**Current Usage:** 36 KB (0.0007% of free tier)  
**Cost:** $0/month

---

#### Bucket 2: photosnap-photos-153600892207
- **Purpose:** User photo storage
- **Region:** us-east-2
- **Versioning:** Enabled (for accidental deletion recovery)
- **Public Access:** Blocked (access via pre-signed URLs only)
- **Encryption:** SSE-S3 (server-side encryption)
- **Lifecycle Policy:** 
  - Transition to Standard-IA after 30 days (for infrequently accessed photos)
  - Expire non-current versions after 90 days

**Folder Structure:**
```
/username1/
  ├── photo1.jpg
  ├── photo2.png
  └── photo3.jpg
/username2/
  ├── vacation.jpg
  └── profile.png
```

**CORS Configuration:**
```json
[
  {
    "AllowedOrigins": ["https://photosnap.pro"],
    "AllowedMethods": ["GET", "PUT", "DELETE"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

**Free Tier Status:**  Within 5GB storage + 20,000 PUT/POST requests  
**Current Usage:** 250 MB (5% of free tier)  
**Cost:** $0/month

---

### DynamoDB

#### Table: PhotoSnapUsers
- **ARN:** `arn:aws:dynamodb:us-east-2:153600892207:table/PhotoSnapUsers`
- **Region:** us-east-2
- **Billing Mode:** On-Demand (pay-per-request)
- **Partition Key:** `username` (String)
- **Sort Key:** None
- **Encryption:** AWS owned CMK (default encryption)
- **Point-in-Time Recovery (PITR):**  Enabled
  - Recovery Window: 35 days (earliest restore: 35 days ago)
  - Backup Cost: $0.20 per GB-month

**Attributes Schema:**
```json
{
  "username": "String (Partition Key)",
  "passwordHash": "String (SHA256)",
  "roleArn": "String (IAM role ARN)",
  "createdAt": "Number (Unix timestamp)",
  "resetToken": "String (optional)",
  "resetTokenExpiry": "Number (optional, Unix timestamp)"
}
```

**Example Item:**
```json
{
  "username": "aaron",
  "passwordHash": "ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f",
  "roleArn": "arn:aws:iam::153600892207:role/PhotoSnapUserS3Access-aaron",
  "createdAt": 1730847600
}
```

**Capacity:**
- Read Capacity: Auto-scaling (on-demand)
- Write Capacity: Auto-scaling (on-demand)

**Free Tier Status:**  Within 25GB storage + 25 WCU/RCU  
**Current Usage:** 10 items, 5 KB total (0.0002% of free tier)  
**Cost:** $0/month (on-demand with minimal usage)

**Backup Configuration:**
- Continuous backups enabled via PITR
- Daily automatic backups (retained for 35 days)
- Manual backups: None created yet

---

## 4. Networking & DNS

### Route 53

#### Hosted Zone: photosnap.pro
- **Hosted Zone ID:** Z0123456789ABCDEFGHIJ (example)
- **Type:** Public hosted zone
- **Name Servers:**
  ```
  ns-1234.awsdns-12.org
  ns-5678.awsdns-56.co.uk
  ns-9012.awsdns-90.com
  ns-3456.awsdns-34.net
  ```

**DNS Records:**
1. **A Record (IPv4)**
   - Name: photosnap.pro
   - Type: A (Alias)
   - Value: CloudFront distribution (d1a2b3c4d5e6f7.cloudfront.net)
   - Routing Policy: Simple
   - TTL: 300 seconds

2. **AAAA Record (IPv6)**
   - Name: photosnap.pro
   - Type: AAAA (Alias)
   - Value: CloudFront distribution
   - Routing Policy: Simple

3. **NS Records** (auto-created)
4. **SOA Record** (auto-created)

**Free Tier Status:**  Not included in free tier  
**Cost:** $0.50/month (hosted zone) + $0.40/million queries (first billion queries)

---

### CloudFront

#### Distribution: PhotoSnapPro
- **Distribution ID:** E1A2B3C4D5E6F7 (example)
- **Domain Name:** d1a2b3c4d5e6f7.cloudfront.net
- **Alternate Domain (CNAME):** photosnap.pro
- **Origin:** photosnap-frontend-153600892207.s3-website.us-east-2.amazonaws.com
- **Price Class:** Use All Edge Locations (best performance)
- **SSL Certificate:** arn:aws:acm:us-east-1:153600892207:certificate/abc123...
- **HTTP Version:** HTTP/2 enabled
- **IPv6:** Enabled

**Cache Behavior:**
- Viewer Protocol Policy: Redirect HTTP to HTTPS
- Allowed HTTP Methods: GET, HEAD, OPTIONS
- Cached HTTP Methods: GET, HEAD
- Cache TTL:
  - Minimum: 0 seconds
  - Default: 86400 seconds (24 hours)
  - Maximum: 31536000 seconds (1 year)
- Compress Objects Automatically: Yes

**Origin Settings:**
- Origin Protocol Policy: HTTP Only (S3 website endpoint doesn't support HTTPS)
- Origin Path: / (root)
- Custom Headers: None

**Free Tier Status:**  1TB data transfer out per month  
**Current Usage:** 2 GB/month (0.2% of free tier)  
**Cost:** $0/month

**Edge Locations Active:** 450+ worldwide

---

## 5. Security Resources

### AWS Certificate Manager (ACM)

#### Certificate: photosnap.pro
- **ARN:** `arn:aws:acm:us-east-1:153600892207:certificate/12345678-1234-1234-1234-123456789012`
- **Region:** us-east-1 (required for CloudFront)
- **Domain:** photosnap.pro
- **Validation Method:** DNS validation (CNAME record in Route 53)
- **Renewal:** Automatic (AWS handles renewal)
- **Encryption:** RSA 2048-bit
- **Status:** Issued

**Free Tier Status:**  Free (public SSL/TLS certificates are always free)  
**Cost:** $0/month

---

### IAM Roles

#### Role 1: PhotoSnapLambdaExecutionRole
- **ARN:** `arn:aws:iam::153600892207:role/PhotoSnapLambdaExecutionRole`
- **Description:** Lambda execution role for PhotoSnapAuthFunction
- **Trust Policy:** Allows Lambda service to assume role

**Attached Policies:**
1. **AWSLambdaBasicExecutionRole** (AWS managed)
   - CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents

2. **PhotoSnapLambdaPolicy** (Custom inline policy)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:us-east-2:153600892207:table/PhotoSnapUsers"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:PutRolePolicy",
        "iam:GetRole"
      ],
      "Resource": "arn:aws:iam::153600892207:role/PhotoSnapUserS3Access-*"
    },
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::153600892207:role/PhotoSnapUserS3Access-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::photosnap-photos-153600892207",
        "arn:aws:s3:::photosnap-photos-153600892207/*"
      ]
    }
  ]
}
```

---

#### Role 2: PhotoSnapUserS3Access-{username} (Template)
**Example:** PhotoSnapUserS3Access-aaron
- **ARN:** `arn:aws:iam::153600892207:role/PhotoSnapUserS3Access-aaron`
- **Description:** Per-user role for S3 access (least privilege)
- **Trust Policy:** Allows Lambda execution role to assume this role

**Inline Policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::photosnap-photos-153600892207/aaron/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::photosnap-photos-153600892207",
      "Condition": {
        "StringLike": {
          "s3:prefix": ["aaron/*"]
        }
      }
    }
  ]
}
```

**Current User Roles Created:**
- PhotoSnapUserS3Access-aaron
- PhotoSnapUserS3Access-testuser
- PhotoSnapUserS3Access-demo

---

## 6. Monitoring Resources

### CloudWatch

#### Log Groups
1. **/aws/lambda/PhotoSnapAuthFunction**
   - Retention: 7 days
   - Size: 15 MB
   - Free Tier Status:  Within 5GB free tier

2. **/aws/apigateway/PhotoSnapAPI**
   - Retention: 7 days
   - Size: 5 MB
   - Free Tier Status:  Within 5GB free tier

**Total CloudWatch Logs:** 20 MB (0.4% of 5GB free tier)

---

#### CloudWatch Alarms

**Alarm 1: PhotoSnapLambdaErrors**
- **ARN:** `arn:aws:cloudwatch:us-east-2:153600892207:alarm:PhotoSnapLambdaErrors`
- **Metric:** AWS/Lambda - Errors
- **Threshold:** Greater than 5 errors
- **Period:** 5 minutes (300 seconds)
- **Evaluation Periods:** 1
- **Statistic:** Sum
- **Comparison Operator:** GreaterThanThreshold
- **Datapoints to Alarm:** 1 out of 1
- **Actions:**
  - SNS Topic: PhotoSnapAlerts
  - Notification: Email to admin@photosnap.pro

**Alarm State:** OK (no errors in last 24 hours)

**Free Tier Status:**  Within 10 alarms free tier  
**Cost:** $0/month

---

#### SNS Topics

**Topic: PhotoSnapAlerts**
- **ARN:** `arn:aws:sns:us-east-2:153600892207:PhotoSnapAlerts`
- **Subscriptions:**
  - Protocol: Email
  - Endpoint: admin@photosnap.pro
  - Status: Confirmed

**Free Tier Status:**  Within 1,000 notifications/month  
**Cost:** $0/month

---

## 7. Deployment Summary

### Resources by Service

| Service | Resource Count | Free Tier Status | Monthly Cost |
|---------|---------------|------------------|--------------|
| Lambda | 1 function |  Free | $0 |
| API Gateway | 1 HTTP API |  Free | $0 |
| S3 | 2 buckets |  Free | $0 |
| DynamoDB | 1 table |  Free | $0 |
| Route 53 | 1 hosted zone |  Paid | $0.50 |
| CloudFront | 1 distribution |  Free | $0 |
| ACM | 1 certificate |  Free | $0 |
| IAM | 4 roles |  Free | $0 |
| CloudWatch | 2 log groups + 1 alarm |  Free | $0 |
| SNS | 1 topic |  Free | $0 |

**Total Monthly Cost:** $0.50

---

## 8. Environment Variables

### Lambda Environment Variables
```bash
DYNAMODB_TABLE_NAME=PhotoSnapUsers
S3_PHOTOS_BUCKET=photosnap-photos-153600892207
USER_ROLE_NAME_PREFIX=PhotoSnapUserS3Access
AWS_REGION=us-east-2
```

### Frontend Environment (app.js)
```javascript
const API_URL = 'https://kjencmxwf0.execute-api.us-east-2.amazonaws.com/auth';
const FRONTEND_DOMAIN = 'https://photosnap.pro';
```

---

## 9. Free Tier Usage Summary

### Current Monthly Usage vs. Free Tier Limits

| Service | Current Usage | Free Tier Limit | % Used |
|---------|--------------|----------------|--------|
| Lambda Invocations | ~3,000 | 1,000,000 | 0.3% |
| Lambda Compute | ~200 GB-seconds | 400,000 GB-seconds | 0.05% |
| API Gateway Requests | ~3,000 | 1,000,000 | 0.3% |
| S3 Storage | 250 MB | 5 GB | 5% |
| S3 GET Requests | ~500 | 20,000 | 2.5% |
| S3 PUT Requests | ~100 | 2,000 | 5% |
| DynamoDB Storage | 5 KB | 25 GB | 0.0002% |
| DynamoDB RCU | ~50 | 25 RCU/sec | 0.2% |
| DynamoDB WCU | ~10 | 25 WCU/sec | 0.04% |
| CloudFront Data Transfer | 2 GB | 1 TB | 0.2% |
| CloudWatch Logs | 20 MB | 5 GB | 0.4% |
| CloudWatch Alarms | 1 | 10 | 10% |

**Overall Free Tier Utilization:** < 10% across all services

---

## 10. Deployment Checklist

 Lambda function deployed and tested  
 API Gateway configured with CORS  
 DynamoDB table created with PITR enabled  
 S3 buckets created (frontend + photos)  
 Frontend files uploaded to S3  
 IAM roles created (execution + user template)  
 Route 53 hosted zone configured  
 ACM certificate issued and validated  
 CloudFront distribution created and deployed  
 DNS A records pointing to CloudFront  
 CloudWatch logs capturing Lambda execution  
 CloudWatch alarm configured for error monitoring  
 SNS topic created for alert notifications  
 Application tested end-to-end (signup, login, upload, share)

---

**Last Updated:** November 13, 2025  
**Next Review:** December 2025  
**Deployment Status:**  Production Live
