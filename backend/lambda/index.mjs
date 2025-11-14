import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { IAMClient, CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "crypto";

// Initialize AWS SDK Clients
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const iam = new IAMClient({});
const sts = new STSClient({});
const s3 = new S3Client({});

// Configuration Constants
const USERS_TABLE = 'PhotoSnapUsers';
const BUCKET_NAME = 'photosnap-photos-153600892207';
const ACCOUNT_ID = '153600892207';
const REGION = 'us-east-2';

/**
 * Main Lambda handler for processing authentication requests.
 * @param {object} event - The API Gateway event object.
 * @returns {object} - The HTTP response object.
 */
export const handler = async (event) => {
    
    // ----------------------------------------------------------------------
    // CRITICAL FIX: Gracefully handle the CORS preflight OPTIONS request.
    // The OPTIONS request has an empty body, which causes JSON.parse(event.body) to crash.
    // By returning a 200 status here, the HTTP API Gateway will automatically
    // inject the Access-Control-Allow-* headers configured in the CORS tab.
    // ----------------------------------------------------------------------
    if (event.requestContext && event.requestContext.http.method === 'OPTIONS') {
        console.log("Received OPTIONS request. Returning 200 OK for CORS preflight.");
        return {
            statusCode: 200,
        };
    }
    
    let action, username, password, resetToken, newPassword, fileName, fileType;
    
    try {
        // Safely parse the body, defaulting to an empty object if the body is null/empty.
        const body = JSON.parse(event.body || '{}');
        ({ action, username, password, resetToken, newPassword, fileName, fileType } = body);
    } catch (parseError) {
        console.error("Failed to parse request body:", parseError);
        return errorResponse(400, 'Invalid request format or missing body.');
    }

    try {
        if (action === 'signup') {
            return await handleSignup(username, password);
        } else if (action === 'login') {
            return await handleLogin(username, password);
        } else if (action === 'request-reset') {
            return await handleRequestReset(username);
        } else if (action === 'reset-password') {
            return await handleResetPassword(username, resetToken, newPassword);
        } else if (action === 'get-upload-url') {
            return await handleGetUploadUrl(username, fileName, fileType);
        } else if (action === 'list-photos') {
            return await handleListPhotos(username);
        } else if (action === 'get-delete-url') {
            return await handleGetDeleteUrl(username, fileName);
        } else if (action === 'get-share-url') {
            return await handleGetShareUrl(username, fileName);
        } else {
            return errorResponse(400, 'Invalid action specified.');
        }
    } catch (error) {
        console.error('Execution Error:', error);
        // Generic 500 for security, but logging the error details.
        return errorResponse(500, 'Internal server error during authentication process.');
    }
};

/**
 * Handles the user sign-up process, creating a DynamoDB entry and an IAM role.
 */
async function handleSignup(username, password) {
    if (!username || !password) {
        return errorResponse(400, 'Username and password are required.');
    }

    // 1. Check for existing user
    const existingUser = await dynamodb.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { username }
    }));
    
    if (existingUser.Item) {
        return errorResponse(400, 'User already exists');
    }
    
    const passwordHash = hashPassword(password);
    const roleName = `PhotoSnapUserS3Access-${username}`;
    
    // 2. Create IAM Role for S3 Access
    await iam.send(new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify({
            Version: '2012-10-17',
            Statement: [{
                Effect: 'Allow',
                Principal: {
                    // This principal allows the Lambda's execution role to assume this new user role.
                    AWS: `arn:aws:iam::${ACCOUNT_ID}:role/PhotoSnapS3AuthLambdaExecutionRole` 
                },
                Action: 'sts:AssumeRole'
            }]
        })
    }));
    
    // 3. Attach S3 Policy (Least Privilege)
    await iam.send(new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: 'UserS3Access',
        PolicyDocument: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Action: 's3:ListBucket',
                    Resource: `arn:aws:s3:::${BUCKET_NAME}`,
                    // Restrict ListBucket only to the user's "folder" prefix
                    Condition: {
                        StringLike: {
                            's3:prefix': [`${username}/*`, `${username}`] // Added ${username} to allow listing root
                        }
                    }
                },
                {
                    Effect: 'Allow',
                    Action: [
                        's3:GetObject',
                        's3:PutObject',
                        's3:DeleteObject'
                    ],
                    // Allow R/W/D only on objects within the user's specific folder
                    Resource: `arn:aws:s3:::${BUCKET_NAME}/${username}/*` 
                }
            ]
        })
    }));
    
    // 4. Store user in DynamoDB
    await dynamodb.send(new PutCommand({
        TableName: USERS_TABLE,
        Item: {
            username,
            passwordHash,
            roleArn: `arn:aws:iam::${ACCOUNT_ID}:role/${roleName}`,
            createdAt: new Date().toISOString()
        }
    }));
    
    return successResponse({ message: `User ${username} created successfully. IAM Role ${roleName} created.` });
}

/**
 * Handles the user login process and returns temporary STS credentials.
 */
async function handleLogin(username, password) {
    if (!username || !password) {
        return errorResponse(400, 'Username and password are required.');
    }
    
    // 1. Fetch user from DynamoDB
    const result = await dynamodb.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { username }
    }));
    
    if (!result.Item) {
        return errorResponse(401, 'Invalid credentials');
    }
    
    const user = result.Item;
    const passwordHash = hashPassword(password);
    
    // 2. Validate password
    if (passwordHash !== user.passwordHash) {
        return errorResponse(401, 'Invalid credentials');
    }
    
    // 3. Assume the user's S3 Access Role (STS)
    const credentials = await sts.send(new AssumeRoleCommand({
        RoleArn: user.roleArn,
        RoleSessionName: `${username}-session`,
        DurationSeconds: 3600 // Credentials valid for 1 hour
    }));
    
    // 4. Return temporary credentials and S3 config to the client
    return successResponse({
        message: 'Login successful',
        credentials: {
            accessKeyId: credentials.Credentials.AccessKeyId,
            secretAccessKey: credentials.Credentials.SecretAccessKey,
            sessionToken: credentials.Credentials.SessionToken,
            expiration: credentials.Credentials.Expiration.toISOString()
        },
        s3Config: {
            bucket: BUCKET_NAME,
            folder: `${username}/`,
            region: REGION
        }
    });
}

/**
 * Handles password reset request - generates a reset token.
 */
async function handleRequestReset(username) {
    if (!username) {
        return errorResponse(400, 'Username is required.');
    }

    const result = await dynamodb.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { username }
    }));
    
    if (!result.Item) {
        return errorResponse(404, 'User not found');
    }
    
    // Generate 6-digit reset token
    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
    const resetExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
    
    await dynamodb.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { username },
        UpdateExpression: 'SET resetToken = :token, resetExpiry = :expiry',
        ExpressionAttributeValues: {
            ':token': resetToken,
            ':expiry': resetExpiry
        }
    }));
    
    return successResponse({ 
        message: 'Reset token generated',
        resetToken // In production, you'd email this instead
    });
}

/**
 * Handles password reset with token validation.
 */
async function handleResetPassword(username, resetToken, newPassword) {
    if (!username || !resetToken || !newPassword) {
        return errorResponse(400, 'Username, reset token, and new password are required.');
    }

    const result = await dynamodb.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { username }
    }));
    
    if (!result.Item) {
        return errorResponse(404, 'User not found');
    }
    
    const user = result.Item;
    
    if (!user.resetToken || user.resetToken !== resetToken) {
        return errorResponse(401, 'Invalid reset token');
    }
    
    if (new Date(user.resetExpiry) < new Date()) {
        return errorResponse(401, 'Reset token expired');
    }
    
    const newPasswordHash = hashPassword(newPassword);
    
    await dynamodb.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { username },
        UpdateExpression: 'SET passwordHash = :hash REMOVE resetToken, resetExpiry',
        ExpressionAttributeValues: {
            ':hash': newPasswordHash
        }
    }));
    
    return successResponse({ message: 'Password reset successful' });
}

/**
 * Generates a pre-signed URL for uploading a photo to S3.
 */
async function handleGetUploadUrl(username, fileName, fileType) {
    if (!username || !fileName || !fileType) {
        return errorResponse(400, 'Username, fileName, and fileType are required.');
    }

    // Verify user exists
    const result = await dynamodb.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { username }
    }));
    
    if (!result.Item) {
        return errorResponse(401, 'User not found');
    }

    const timestamp = Date.now();
    const key = `${username}/${timestamp}-${fileName}`;
    
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: fileType
    });

    // Generate pre-signed URL valid for 5 minutes
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return successResponse({
        uploadUrl,
        key,
        message: 'Pre-signed upload URL generated'
    });
}

/**
 * Lists all photos for a user by generating pre-signed URLs.
 */
async function handleListPhotos(username) {
    if (!username) {
        return errorResponse(400, 'Username is required.');
    }

    // Verify user exists
    const result = await dynamodb.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { username }
    }));
    
    if (!result.Item) {
        return errorResponse(401, 'User not found');
    }

    // Import ListObjectsV2Command
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    
    const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: `${username}/`
    });

    const listResponse = await s3.send(listCommand);
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
        return successResponse({
            photos: [],
            message: 'No photos found'
        });
    }

    // Generate pre-signed URLs for each photo (valid for 1 hour)
    const photos = await Promise.all(
        listResponse.Contents
            .filter(item => !item.Key.endsWith('/')) // Skip folder markers
            .map(async (item) => {
                const command = new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: item.Key
                });
                
                const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
                
                return {
                    key: item.Key,
                    fileName: item.Key.split('/').pop(),
                    url,
                    size: item.Size,
                    lastModified: item.LastModified
                };
            })
    );

    return successResponse({
        photos,
        count: photos.length,
        message: 'Photos retrieved successfully'
    });
}

/**
 * Generates a pre-signed URL for deleting a photo from S3.
 */
async function handleGetDeleteUrl(username, fileName) {
    if (!username || !fileName) {
        return errorResponse(400, 'Username and fileName are required.');
    }

    // Verify user exists
    const result = await dynamodb.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { username }
    }));
    
    if (!result.Item) {
        return errorResponse(401, 'User not found');
    }

    // Import DeleteObjectCommand
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    
    const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileName
    });

    // Generate pre-signed URL valid for 5 minutes
    const deleteUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return successResponse({
        deleteUrl,
        message: 'Pre-signed delete URL generated'
    });
}

/**
 * Generates a long-lived pre-signed URL for sharing photos publicly.
 */
async function handleGetShareUrl(username, fileName) {
    if (!username || !fileName) {
        return errorResponse(400, 'Username and fileName are required.');
    }

    // Verify user exists
    const result = await dynamodb.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { username }
    }));
    
    if (!result.Item) {
        return errorResponse(401, 'User not found');
    }

    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileName
    });

    // Generate pre-signed URL valid for 7 days (for sharing)
    const shareUrl = await getSignedUrl(s3, command, { expiresIn: 604800 });

    return successResponse({
        shareUrl,
        expiresIn: '7 days',
        message: 'Shareable URL generated'
    });
}

/**
 * Helper to generate a SHA256 hash of the password.
 */
function hashPassword(password) {
    return createHash('sha256').update(password).digest('hex');
}

/**
 * Helper to construct a successful HTTP response.
 */
function successResponse(data) {
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            // Included for robustness, though HTTP API CORS tab should handle it.
            'Access-Control-Allow-Origin': '*' 
        },
        body: JSON.stringify(data)
    };
}

/**
 * Helper to construct an error HTTP response.
 */
function errorResponse(statusCode, message) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            // Included for robustness, though HTTP API CORS tab should handle it.
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: message })
    };
}
