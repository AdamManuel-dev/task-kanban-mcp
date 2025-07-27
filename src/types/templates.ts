export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  category: 'bug' | 'feature' | 'meeting' | 'maintenance' | 'research' | 'review' | 'custom';
  title_template: string;
  description_template: string;
  priority: number;
  estimated_hours?: number;
  tags: string[];
  checklist_items: string[];
  custom_fields: Record<string, any>;
  created_by?: string;
  is_system: boolean;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface TaskTemplateCreateRequest {
  name: string;
  description: string;
  category: TaskTemplate['category'];
  title_template: string;
  description_template: string;
  priority?: number;
  estimated_hours?: number;
  tags?: string[];
  checklist_items?: string[];
  custom_fields?: Record<string, any>;
}

export interface TaskTemplateUpdateRequest {
  name?: string;
  description?: string;
  category?: TaskTemplate['category'];
  title_template?: string;
  description_template?: string;
  priority?: number;
  estimated_hours?: number;
  tags?: string[];
  checklist_items?: string[];
  custom_fields?: Record<string, any>;
  is_active?: boolean;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'date' | 'select' | 'boolean';
  description: string;
  required: boolean;
  default_value?: any;
  options?: string[]; // For select type
  validation?: {
    min_length?: number;
    max_length?: number;
    pattern?: string;
    min_value?: number;
    max_value?: number;
  };
}

export interface TaskFromTemplateRequest {
  template_id: string;
  board_id: string;
  variables: Record<string, any>;
  assignee?: string;
  due_date?: string;
  parent_task_id?: string;
}

export interface TaskCreationResult {
  task_id: string;
  title: string;
  description: string;
  created_checklist_items: number;
  applied_tags: string[];
  template_name: string;
}

export interface TemplateUsageStats {
  template_id: string;
  template_name: string;
  usage_count: number;
  last_used: string;
  success_rate: number;
  average_completion_time_hours?: number;
  most_common_variables: Record<string, any>;
}

export interface TemplateCategory {
  name: TaskTemplate['category'];
  display_name: string;
  description: string;
  icon: string;
  default_priority: number;
  suggested_tags: string[];
}
