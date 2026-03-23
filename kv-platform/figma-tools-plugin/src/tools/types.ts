import type React from 'react';

export type ToolId = 'crawl-to-cms' | 'sync-to-cms' | 'kv-to-avatarframe';

export type ToolRoute = '/' | `/tools/${string}`;

export type ToolDefinition = {
  id: ToolId;
  name: string;
  description: string;
  route: ToolRoute;
  Component: React.ComponentType;
};
