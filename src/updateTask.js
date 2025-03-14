const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  const taskId = event.pathParameters.id;
  
  try {
    const requestBody = JSON.parse(event.body);
    
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
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Task not found' })
      };
    }
    
    const timestamp = new Date().toISOString();
    
    // Build update expression
    let updateExpression = 'SET updatedAt = :updatedAt';
    const expressionAttributeValues = {
      ':updatedAt': timestamp
    };
    
    if (requestBody.title) {
      updateExpression += ', title = :title';
      expressionAttributeValues[':title'] = requestBody.title;
    }
    
    if (requestBody.description !== undefined) {
      updateExpression += ', description = :description';
      expressionAttributeValues[':description'] = requestBody.description;
    }
    
    if (requestBody.status) {
      updateExpression += ', #status = :status';
      expressionAttributeValues[':status'] = requestBody.status;
    }
    
    const updateParams = {
      TableName: process.env.TASKS_TABLE,
      Key: {
        id: taskId
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ReturnValues: 'ALL_NEW'
    };
    
    const result = await dynamoDB.update(updateParams).promise();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result.Attributes)
    };
  } catch (error) {
    console.error('Error updating task:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Failed to update task' })
    };
  }
};
