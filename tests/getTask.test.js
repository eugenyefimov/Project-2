const { handler } = require('../src/getTask');
const AWS = require('aws-sdk');

// Mock DynamoDB
jest.mock('aws-sdk', () => {
  const mDynamoDBDocumentClient = {
    get: jest.fn().mockReturnThis(),
    promise: jest.fn()
  };
  
  const mDynamoDB = {
    DocumentClient: jest.fn(() => mDynamoDBDocumentClient)
  };
  
  return {
    DynamoDB: mDynamoDB
  };
});

describe('getTask Lambda function', () => {
  let mockDynamoDBClient;
  
  beforeEach(() => {
    process.env.TASKS_TABLE = 'Tasks';
    jest.clearAllMocks();
    
    // Get reference to the mocked DynamoDB client
    mockDynamoDBClient = new AWS.DynamoDB.DocumentClient();
  });
  
  test('should get a task successfully', async () => {
    // Setup mock response
    mockDynamoDBClient.promise.mockResolvedValueOnce({
      Item: {
        id: 'test-id',
        title: 'Test Task',
        description: 'This is a test task',
        status: 'PENDING',
        userId: 'user-123'
      }
    });
    
    const event = {
      pathParameters: {
        id: 'test-id'
      },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123'
          }
        }
      }
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe('test-id');
    expect(body.title).toBe('Test Task');
    
    // Verify DynamoDB was called with correct parameters
    expect(mockDynamoDBClient.get).toHaveBeenCalledWith({
      TableName: 'Tasks',
      Key: {
        id: 'test-id'
      }
    });
  });
  
  test('should return 404 if task not found', async () => {
    // Setup mock response for task not found
    mockDynamoDBClient.promise.mockResolvedValueOnce({
      Item: null
    });
    
    const event = {
      pathParameters: {
        id: 'non-existent-id'
      }
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Task not found');
  });
  
  test('should return 403 if user does not have permission', async () => {
    // Setup mock response
    mockDynamoDBClient.promise.mockResolvedValueOnce({
      Item: {
        id: 'test-id',
        title: 'Test Task',
        userId: 'user-456' // Different from requesting user
      }
    });
    
    const event = {
      pathParameters: {
        id: 'test-id'
      },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123'
          }
        }
      }
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('permission');
  });
  
  test('should handle OPTIONS request for CORS', async () => {
    const event = {
      httpMethod: 'OPTIONS'
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(200);
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(response.headers['Access-Control-Allow-Methods']).toContain('GET');
  });
  
  test('should return 400 if task ID is missing', async () => {
    const event = {
      pathParameters: null
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Task ID is required');
  });
  
  test('should handle DynamoDB errors', async () => {
    // Setup DynamoDB to throw an error
    mockDynamoDBClient.promise.mockRejectedValueOnce(new Error('DynamoDB error'));
    
    const event = {
      pathParameters: {
        id: 'test-id'
      }
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Failed to fetch task');
  });
  
  test('should allow admin to view any task', async () => {
    // Setup mock response
    mockDynamoDBClient.promise.mockResolvedValueOnce({
      Item: {
        id: 'test-id',
        title: 'Test Task',
        userId: 'user-456' // Different from requesting user
      }
    });
    
    const event = {
      pathParameters: {
        id: 'test-id'
      },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-user',
            isAdmin: true
          }
        }
      }
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe('test-id');
  });
});