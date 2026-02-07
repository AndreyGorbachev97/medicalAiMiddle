import { Request } from 'express';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
  };
}

export interface AnalysisRequest extends Request {
  files?: {
    [fieldname: string]: Express.Multer.File[];
  } | Express.Multer.File[];
  body: {
    description?: string;
  };
}

export interface RegisterRequest extends Request {
  body: {
    email: string;
    password: string;
    name?: string;
  };
}

export interface LoginRequest extends Request {
  body: {
    email: string;
    password: string;
  };
}

