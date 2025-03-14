const AWS = require('aws-sdk');
// Initialize DynamoDB client with automatic retries and timeout
const dynamoDB = new AWS.DynamoDB.DocumentClient({
  maxRetries: 3,
  httpOptions: {
    timeout: 5000
  }
});

// Common response headers
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key'
};

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  // Handle preflight OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  // Get user ID from authorizer if available
  const userId = event.requestContext?.authorizer?.claims?.sub;
  const isAdmin = event.requestContext?.authorizer?.claims?.isAdmin === 'true';
  
  // Parse query string parameters
  const queryParams = event.queryStringParameters || {};
  const limit = parseInt(queryParams.limit) || 50;
  const status = queryParams.status;
  const lastEvaluatedKey = queryParams.nextToken ? JSON.parse(decodeURIComponent(queryParams.nextToken)) : null;
  
  try {
    let params = {
      TableName: process.env.TASKS_TABLE,
      Limit: Math.min(limit, 100) // Cap at 100 items per request
    };
    
    // Add pagination support
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }
    
    // Filter by user ID if not admin
    if (userId && !isAdmin) {
      params.FilterExpression = 'userId = :userId';
      params.ExpressionAttributeValues = {
        ':userId': userId
      };
    }
    
    // Add status filter if provided
    if (status) {
      if (params.FilterExpression) {
        params.FilterExpression += ' AND status = :status';
        params.ExpressionAttributeValues[':status'] = status;
      } else {
        params.FilterExpression = 'status = :status';
        params.ExpressionAttributeValues = {
          ':status': status
        };
      }
    }
    
    // Use query instead of scan if filtering by userId and GSI exists
    if (userId && !isAdmin && process.env.USE_GSI === 'true') {
      params = {
        TableName: process.env.TASKS_TABLE,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        },
        Limit: Math.min(limit, 100)
      };
      
      // Add status filter if provided
      if (status) {
        params.FilterExpression = 'status = :status';
        params.ExpressionAttributeValues[':status'] = status;
      }
      
      // Add pagination support
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }
    }
    
    // Execute the query or scan
    const result = userId && !isAdmin && process.env.USE_GSI === 'true' 
      ? await dynamoDB.query(params).promise()
      : await dynamoDB.scan(params).promise();
    
    // Create pagination token if more results exist
    const nextToken = result.LastEvaluatedKey 
      ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey)) 
      : null;
    
    // Add cache control headers
    const responseHeaders = {
      ...headers,
      'Cache-Control': 'max-age=60'
    };
    
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        tasks: result.Items,
        count: result.Count,
        nextToken: nextToken
      })
    };
  } catch (error) {
    console.error('Error fetching tasks:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch tasks',
        requestId: event.requestContext?.requestId
      })
    };
  }
};
