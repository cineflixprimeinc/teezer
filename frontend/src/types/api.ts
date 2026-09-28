export type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
  meta?: PaginationMeta;
};

export type PaginationMeta = {
  current_page?: number;
  last_page?: number;
  per_page?: number;
  total?: number;
  next_page_url?: string | null;
  counts?: Record<string, number>;
};

export type Paginated<T> = ApiResponse<T[]> & { meta: PaginationMeta };
