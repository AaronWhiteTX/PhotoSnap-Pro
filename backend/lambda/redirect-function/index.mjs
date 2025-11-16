import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-east-2" });
const ddb = DynamoDBDocumentClient.from(client);

const SHORT_LINKS_TABLE = "PhotoSnapShortLinks";

function generateShortId() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let shortId = '';
    for (let i = 0; i < 6; i++) {
        shortId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return shortId;
}

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    const path = event.rawPath || event.path;
    const method = event.requestContext?.http?.method || event.httpMethod;
    
    const headers = {
        'Access-Control-Allow-Origin': 'https://photosnap.pro',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };
    
    if (method === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }
    
    if (method === 'POST' && path === '/shorten') {
        try {
            const body = JSON.parse(event.body);
            const { longUrl } = body;
            
            if (!longUrl) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'longUrl is required' })
                };
            }
            
            let shortId = generateShortId();
            let attempts = 0;
            
            while (attempts < 5) {
                const existing = await ddb.send(new GetCommand({
                    TableName: SHORT_LINKS_TABLE,
                    Key: { shortId }
                }));
                
                if (!existing.Item) {
                    break;
                }
                
                shortId = generateShortId();
                attempts++;
            }
            
            if (attempts === 5) {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: 'Failed to generate unique short ID' })
                };
            }
            
            await ddb.send(new PutCommand({
                TableName: SHORT_LINKS_TABLE,
                Item: {
                    shortId,
                    longUrl,
                    createdAt: new Date().toISOString(),
                    ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
                }
            }));
            
            const shortUrl = `https://photosnap.pro/s/${shortId}`;
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ shortUrl, shortId })
            };
            
        } catch (error) {
            console.error('Error creating short link:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Internal server error' })
            };
        }
    }
    
    if (method === 'GET' && path.startsWith('/s/')) {
        const shortId = path.split('/')[2];
        
        if (!shortId) {
            return {
                statusCode: 404,
                headers: { ...headers, 'Content-Type': 'text/html' },
                body: '<html><body><h1>404 - Short link not found</h1></body></html>'
            };
        }
        
        try {
            const result = await ddb.send(new GetCommand({
                TableName: SHORT_LINKS_TABLE,
                Key: { shortId }
            }));
            
            if (!result.Item) {
                return {
                    statusCode: 404,
                    headers: { ...headers, 'Content-Type': 'text/html' },
                    body: '<html><body><h1>404 - Short link not found or expired</h1></body></html>'
                };
            }
            
            return {
                statusCode: 302,
                headers: {
                    'Location': result.Item.longUrl,
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                },
                body: ''
            };
            
        } catch (error) {
            console.error('Error retrieving short link:', error);
            return {
                statusCode: 500,
                headers: { ...headers, 'Content-Type': 'text/html' },
                body: '<html><body><h1>500 - Internal server error</h1></body></html>'
            };
        }
    }
    
    return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Not found' })
    };
};