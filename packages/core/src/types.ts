export interface ErrorCode {
  readonly code: string;
  readonly message: string;
  readonly issues: readonly string[];
}

export class AppError extends Error {
  readonly code: string;
  readonly issues: readonly string[];
  readonly status: number;

  constructor(code: string, message: string, issues: readonly string[], status = 400) {
    super(message);
    this.code = code;
    this.message = message;
    this.issues = issues;
    this.status = status;
  }
}

export const enum AccountRole {
  User = 'user',
  Organization = 'organization',
  Admin = 'admin',
}

export const enum TaskStatus {
  Draft = 'draft',
  Published = 'published',
  Paused = 'paused',
  Delisted = 'delisted',
}

export const enum OfferingStatus {
  Active = 'active',
  Archived = 'archived',
}