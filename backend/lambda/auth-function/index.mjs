import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { IAMClient, CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "crypto";

const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const iam = new IAMClient({});
const sts = new STSClient({});
const s3 = new S3Client({});

const USERS_TABLE = 'PhotoSnapUsers';
const SHORT_LINKS_TABLE = 'PhotoSnapShortLinks';
const BUCKET_NAME = 'photosnap-photos-153600892207';
const ACCOUNT_ID = '153600892207';
const REGION = 'us-east-2';

function generateShortId() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let shortId = '';
    for (let i = 0; i < 6; i++) {
        shortId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return shortId;
}

export const handler = async (event) => {
    
    if (event.requestContext && event.requestContext.http.method === 'OPTIONS') {
        console.log("Received OPTIONS request. Returning 200 OK for CORS preflight.");
        return {
            statusCode: 200,
        };
    }
    
    let action, username, password, resetToken, newPassword, fileName, fileType, longUrl;
    
    try {
        const body = JSON.parse(event.body || '{}');
        ({ action, username, password, resetToken, newPassword, fileName, fileType, longUrl } = body);
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
        } else if (action === 'create-short-url') {
            return await handleCreateShortUrl(longUrl);
        } else {
            return errorResponse(400, 'Invalid action specified.');
        }
    } catch (error) {
        console.error('Execution Error:', error);
        return errorResponse(500, 'Internal server error during authentication process.');
    }
};

async function handleSignup(username, password) {
    if (!username || !password) {
        return errorResponse(400, 'Username and password are required.');
    }

    const existingUser = await dynamodb.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { username }
    }));
    
    if (existingUser.Item) {
        return errorResponse(400, 'User already exists');
    }
    
    const passwordHash = hashPassword(password);
    const roleName = `PhotoSnapUserS3Access-${username}`;
    
    await iam.send(new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify({
            Version: '2012-10-17',
            Statement: [{
                Effect: 'Allow',
                Principal: {
                    AWS: `arn:aws:iam::${ACCOUNT_ID}:role/PhotoSnapS3AuthLambdaExecutionRole` 
                },
                Action: 'sts:AssumeRole'
            }]
        })
    }));
    
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
                    Condition: {
                        StringLike: {
                            's3:prefix': [`${username}/*`, `${username}`]
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
                    Resource: `arn:aws:s3:::${BUCKET_NAME}/${username}/*` 
                }
            ]
        })
    }));
    
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

async function handleLogin(username, password) {
    if (!username || !password) {
        return errorResponse(400, 'Username and password are required.');
    }
    
    const result = await dynamodb.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { username }
    }));
    
    if (!result.Item) {
        return errorResponse(401, 'Invalid credentials');
    }
    
    const user = result.Item;
    const passwordHash = hashPassword(password);
    
    if (passwordHash !== user.passwordHash) {
        return errorResponse(401, 'Invalid credentials');
    }
    
    const credentials = await sts.send(new AssumeRoleCommand({
        RoleArn: user.roleArn,
        RoleSessionName: `${username}-session`,
        DurationSeconds: 3600
    }));
    
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
    
    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
    const resetExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    
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
        resetToken
    });
}

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

async function handleGetUploadUrl(username, fileName, fileType) {
    if (!username || !fileName || !fileType) {
        return errorResponse(400, 'Username, fileName, and fileType are required.');
    }

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

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return successResponse({
        uploadUrl,
        key,
        message: 'Pre-signed upload URL generated'
    });
}

async function handleListPhotos(username) {
    if (!username) {
        return errorResponse(400, 'Username is required.');
    }

    const result = await dynamodb.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { username }
    }));
    
    if (!result.Item) {
        return errorResponse(401, 'User not found');
    }

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

    const photos = await Promise.all(
        listResponse.Contents
            .filter(item => !item.Key.endsWith('/'))
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

async function handleGetDeleteUrl(username, fileName) {
    if (!username || !fileName) {
        return errorResponse(400, 'Username and fileName are required.');
    }

    const result = await dynamodb.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { username }
    }));
    
    if (!result.Item) {
        return errorResponse(401, 'User not found');
    }

    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    
    const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileName
    });

    const deleteUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return successResponse({
        deleteUrl,
        message: 'Pre-signed delete URL generated'
    });
}

async function handleGetShareUrl(username, fileName) {
    if (!username || !fileName) {
        return errorResponse(400, 'Username and fileName are required.');
    }

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

    const shareUrl = await getSignedUrl(s3, command, { expiresIn: 604800 });

    return successResponse({
        shareUrl,
        expiresIn: '7 days',
        message: 'Shareable URL generated'
    });
}

async function handleCreateShortUrl(longUrl) {
    if (!longUrl) {
        return errorResponse(400, 'longUrl is required');
    }
    
    let shortId = generateShortId();
    let attempts = 0;
    
    while (attempts < 5) {
        const existing = await dynamodb.send(new GetCommand({
            TableName: SHORT_LINKS_TABLE,
            Key: { shortId }
        }));
        
        if (!existing.Item) break;
        shortId = generateShortId();
        attempts++;
    }
    
    await dynamodb.send(new PutCommand({
        TableName: SHORT_LINKS_TABLE,
        Item: {
            shortId,
            longUrl,
            createdAt: new Date().toISOString(),
            ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
        }
    }));
    
    return successResponse({ 
        shortUrl: `https://photosnap.pro/s/${shortId}`,
        shortId 
    });
}

function hashPassword(password) {
    return createHash('sha256').update(password).digest('hex');
}

function successResponse(data) {
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*' 
        },
        body: JSON.stringify(data)
    };
}

function errorResponse(statusCode, message) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: message })
    };
}
