import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type Project,
  type Task,
  type Track,
  type ApiKey,
  type ApiKeyCreated,
} from '@/lib/api';

export function useProjects(includeArchived = false) {
  return useQuery({
    queryKey: ['projects', includeArchived],
    queryFn: () => api.get<Project[]>(`/api/projects${includeArchived ? '?archived=true' : ''}`),
  });
}

export function useTasks(projectId?: number, includeArchived = false) {
  return useQuery({
    queryKey: ['tasks', projectId, includeArchived],
    queryFn: () => {
      const params = new URLSearchParams();
      if (projectId) params.set('project_id', String(projectId));
      if (includeArchived) params.set('archived', 'true');
      return api.get<Task[]>(`/api/tasks${params.toString() ? '?' + params.toString() : ''}`);
    },
    enabled: projectId !== undefined,
  });
}

export function useActiveTrack() {
  return useQuery({
    queryKey: ['tracks', 'active'],
    queryFn: () => api.get<Track | null>('/api/tracks/active'),
    refetchInterval: 30_000,
  });
}

export function useTracks(params: {
  from?: number;
  to?: number;
  project_id?: number;
  task_id?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  });
  return useQuery({
    queryKey: ['tracks', params],
    queryFn: () => api.get<Track[]>(`/api/tracks?${qs.toString()}`),
  });
}

export function useStartTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { project_id: number; task_id?: number | null; note?: string }) =>
      api.post<Track>('/api/tracks/start', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tracks'] });
    },
  });
}

export function useStopTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Track>('/api/tracks/stop'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracks'] }),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color?: string }) =>
      api.post<Project>('/api/projects', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number;
      name?: string;
      color?: string;
      archived?: boolean;
    }) => api.patch<Project>(`/api/projects/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { project_id: number; name: string }) => api.post<Task>('/api/tasks', data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['tasks', vars.project_id] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; archived?: boolean }) =>
      api.patch<Task>(`/api/tasks/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number;
      project_id?: number;
      task_id?: number | null;
      note?: string;
      started_at?: number;
      ended_at?: number | null;
    }) => api.patch<Track>(`/api/tracks/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracks'] }),
  });
}

export function useCreateManualTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      project_id: number;
      task_id?: number | null;
      note?: string;
      started_at: number;
      ended_at: number;
    }) => api.post<Track>('/api/tracks', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracks'] }),
  });
}

export function useDeleteTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/tracks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracks'] }),
  });
}

export function useApiKeys() {
  return useQuery({
    queryKey: ['keys'],
    queryFn: () => api.get<ApiKey[]>('/api/keys'),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string) => api.post<ApiKeyCreated>('/api/keys', { label }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keys'] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keys'] }),
  });
}

export type SummaryRow = { bucket: string; seconds: number; count: number };
export type ProjectSummaryRow = {
  project_id: number;
  project_name: string;
  project_color: string;
  seconds: number;
  count: number;
};
type HeatmapRow = { day: string; seconds: number };

export function useStatsSummary(
  params: {
    group_by: 'day' | 'week' | 'month' | 'year' | 'project';
    from?: number;
    to?: number;
    project_id?: number;
    task_id?: number;
  },
  options?: { enabled?: boolean },
) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined) qs.set(k, String(v));
  });
  return useQuery<SummaryRow[] | ProjectSummaryRow[]>({
    queryKey: ['stats', 'summary', params],
    queryFn: () => api.get(`/api/stats/summary?${qs.toString()}`),
    enabled: options?.enabled,
  });
}

export function useHeatmap(year: number, projectId?: number) {
  const qs = new URLSearchParams({ year: String(year) });
  if (projectId) qs.set('project_id', String(projectId));
  return useQuery({
    queryKey: ['stats', 'heatmap', year, projectId],
    queryFn: () => api.get<HeatmapRow[]>(`/api/stats/heatmap?${qs.toString()}`),
  });
}
