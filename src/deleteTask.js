const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  const taskId = event.pathParameters.id;
  
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
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Task not found' })
      };
    }
    
    const deleteParams = {
      TableName: process.env.TASKS_TABLE,
      Key: {
        id: taskId
      }
    };
    
    await dynamoDB.delete(deleteParams).promise();
    
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    };
  } catch (error) {
    console.error('Error deleting task:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Failed to delete task' })
    };
  }
};
