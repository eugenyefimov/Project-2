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
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
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
  
  try {
    // Check if task exists
    const getParams = {
      TableName: process.env.TASKS_TABLE,
      Key: {
        id: taskId
      }
    };
    
    const taskResult = await dynamoDB.get(getParams).promise();
    
    if (!taskResult.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Task not found' })
      };
    }
    
    // Check if user owns the task (if userId is stored in tasks)
    if (taskResult.Item.userId && taskResult.Item.userId !== userId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'You do not have permission to delete this task' })
      };
    }
    
    const deleteParams = {
      TableName: process.env.TASKS_TABLE,
      Key: {
        id: taskId
      },
      // Add condition to ensure task still exists when deleting
      ConditionExpression: 'attribute_exists(id)'
    };
    
    await dynamoDB.delete(deleteParams).promise();
    
    // Log successful deletion
    console.log(`Task deleted successfully: ${taskId}`);
    
    return {
      statusCode: 204,
      headers
    };
  } catch (error) {
    console.error('Error deleting task:', error);
    
    // Handle specific error types
    if (error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Task no longer exists' })
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to delete task',
        requestId: event.requestContext?.requestId
      })
    };
  }
};
