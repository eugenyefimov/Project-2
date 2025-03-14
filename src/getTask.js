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
  
  // Validate path parameters
  if (!event.pathParameters || !event.pathParameters.id) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Task ID is required' })
    };
  }
  
  const taskId = event.pathParameters.id;
  const userId = event.requestContext?.authorizer?.claims?.sub || 'anonymous';
  
  const params = {
    TableName: process.env.TASKS_TABLE,
    Key: {
      id: taskId
    }
  };
  
  try {
    const result = await dynamoDB.get(params).promise();
    
    if (!result.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Task not found' })
      };
    }
    
    // Check if user has permission to view this task
    if (result.Item.userId && result.Item.userId !== userId && !event.requestContext?.authorizer?.claims?.isAdmin) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'You do not have permission to view this task' })
      };
    }
    
    // Add cache control headers for frequently accessed tasks
    const responseHeaders = {
      ...headers,
      'Cache-Control': 'max-age=60'
    };
    
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify(result.Item)
    };
  } catch (error) {
    console.error('Error fetching task:', error);
    
    // Add more detailed error information for debugging
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch task',
        requestId: event.requestContext?.requestId
      })
    };
  }
};
