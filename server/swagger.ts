import swaggerJsdoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Vue Admin API',
      version: '1.0.0',
      description: 'Vue Admin 后台管理系统接口文档',
    },
    servers: [
      { url: 'http://localhost:3000/api/v1', description: '本地开发' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            code: { type: 'integer', example: 0 },
            message: { type: 'string', example: '操作成功' },
            data: { type: 'object' },
          },
        },
        PageResult: {
          type: 'object',
          properties: {
            code: { type: 'integer', example: 0 },
            data: {
              type: 'object',
              properties: {
                rows: { type: 'array', items: { type: 'object' } },
                total: { type: 'integer', example: 100 },
              },
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            username: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            avatar: { type: 'string' },
            bio: { type: 'string' },
            status: { type: 'integer' },
            deptId: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Menu: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            parentId: { type: 'integer' },
            name: { type: 'string' },
            path: { type: 'string' },
            component: { type: 'string' },
            icon: { type: 'string' },
            type: { type: 'string', enum: ['M', 'C', 'F'] },
            sort: { type: 'integer' },
            hidden: { type: 'integer' },
            status: { type: 'integer' },
            perms: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Role: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            code: { type: 'string' },
            status: { type: 'integer' },
            sort: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Department: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            parentId: { type: 'integer' },
            name: { type: 'string' },
            sort: { type: 'integer' },
            leader: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
            status: { type: 'integer' },
            children: { type: 'array', items: { $ref: '#/components/schemas/Department' } },
          },
        },
        DictType: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            code: { type: 'string' },
            status: { type: 'integer' },
            remark: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        DictData: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            dictTypeId: { type: 'integer' },
            label: { type: 'string' },
            value: { type: 'string' },
            sort: { type: 'integer' },
            status: { type: 'integer' },
            remark: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Notice: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            title: { type: 'string' },
            content: { type: 'string' },
            type: { type: 'string', enum: ['notice', 'announcement'] },
            status: { type: 'integer' },
            priority: { type: 'integer' },
            createdBy: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Log: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            type: { type: 'string', enum: ['login', 'operation'] },
            userId: { type: 'integer' },
            username: { type: 'string' },
            action: { type: 'string' },
            target: { type: 'string' },
            details: { type: 'string' },
            ipAddress: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  apis: ['./routes/*.ts', './controllers/*.ts'],
}

export default swaggerJsdoc(options)