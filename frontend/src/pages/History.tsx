import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Download } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/confirm-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select-native';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import {
  useCreateManualTrack,
  useDeleteTrack,
  useProjects,
  useTasks,
  useTracks,
  useUpdateTrack,
} from '@/hooks/data';
import { formatDuration, fromLocalDateTimeInput, toLocalDateTimeInput } from '@/lib/utils';
import { toast } from 'sonner';
import type { Track } from '@/lib/api';

export function HistoryPage() {
  const [filterProject, setFilterProject] = useState<number | undefined>();
  const projects = useProjects(true);
  const tracks = useTracks({ project_id: filterProject, limit: 500 });
  const projectsById = useMemo(
    () => new Map((projects.data || []).map((p) => [p.id, p])),
    [projects.data],
  );

  const [editing, setEditing] = useState<Track | null>(null);
  const [creatingManual, setCreatingManual] = useState(false);

  const downloadExport = (format: 'csv' | 'json') => {
    const qs = new URLSearchParams({ format });
    if (filterProject) qs.set('project_id', String(filterProject));
    window.open(`/api/export?${qs.toString()}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">History</h1>
          <p className="text-sm text-muted-foreground">All tracked time entries.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadExport('csv')}>
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="outline" onClick={() => downloadExport('json')}>
            <Download className="size-4" /> JSON
          </Button>
          <Button onClick={() => setCreatingManual(true)}>
            <Plus className="size-4" /> Add entry
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label>Project</Label>
            <NativeSelect
              value={filterProject ?? ''}
              onChange={(e) =>
                setFilterProject(e.target.value ? Number(e.target.value) : undefined)
              }
            >
              <option value="">All</option>
              {projects.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Project / Task</th>
                <th className="p-3 font-medium">Note</th>
                <th className="p-3 font-medium">Started</th>
                <th className="p-3 font-medium">Duration</th>
                <th className="p-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {tracks.data?.map((t) => {
                const project = projectsById.get(t.project_id);
                const duration = (t.ended_at ?? Math.floor(Date.now() / 1000)) - t.started_at;
                return (
                  <tr key={t.id} className="border-b last:border-b-0">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: project?.color || '#888' }}
                        />
                        {project?.name || `#${t.project_id}`}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground max-w-md truncate">{t.note}</td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      {format(t.started_at * 1000, 'yyyy-MM-dd HH:mm')}
                    </td>
                    <td className="p-3 font-mono tabular-nums whitespace-nowrap">
                      {formatDuration(duration)}
                      {t.ended_at === null && <span className="text-primary ml-1">●</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => setEditing(t)}>
                          <Pencil className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {tracks.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {editing && <EditTrackDialog track={editing} onClose={() => setEditing(null)} />}
      {creatingManual && <ManualTrackDialog onClose={() => setCreatingManual(false)} />}
    </div>
  );
}

function EditTrackDialog({ track, onClose }: { track: Track; onClose: () => void }) {
  const projects = useProjects(true);
  const [projectId, setProjectId] = useState(track.project_id);
  const tasks = useTasks(projectId, true);
  const [taskId, setTaskId] = useState<number | undefined>(track.task_id ?? undefined);
  const [note, setNote] = useState(track.note);
  const [startedAt, setStartedAt] = useState(toLocalDateTimeInput(track.started_at));
  const [endedAt, setEndedAt] = useState(
    track.ended_at ? toLocalDateTimeInput(track.ended_at) : '',
  );

  const update = useUpdateTrack();
  const del = useDeleteTrack();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Project</Label>
              <NativeSelect
                value={projectId}
                onChange={(e) => {
                  setProjectId(Number(e.target.value));
                  setTaskId(undefined);
                }}
              >
                {projects.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label>Task</Label>
              <NativeSelect
                value={taskId ?? ''}
                onChange={(e) => setTaskId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">— none —</option>
                {tasks.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div>
            <Label>Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Started</Label>
              <Input
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
              />
            </div>
            <div>
              <Label>Ended</Label>
              <Input
                type="datetime-local"
                value={endedAt}
                onChange={(e) => setEndedAt(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <ConfirmButton
            variant="destructive"
            destructive
            title="Delete this entry?"
            description="This action cannot be undone."
            confirmLabel="Delete"
            onConfirm={async () => {
              await del.mutateAsync(track.id);
              toast.success('Deleted');
              onClose();
            }}
          >
            <Trash2 className="size-4" /> Delete
          </ConfirmButton>
          <div className="flex-1" />
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={async () => {
              try {
                await update.mutateAsync({
                  id: track.id,
                  project_id: projectId,
                  task_id: taskId ?? null,
                  note,
                  started_at: fromLocalDateTimeInput(startedAt),
                  ended_at: endedAt ? fromLocalDateTimeInput(endedAt) : null,
                });
                toast.success('Saved');
                onClose();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Failed');
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualTrackDialog({ onClose }: { onClose: () => void }) {
  const projects = useProjects();
  const [projectId, setProjectId] = useState<number | undefined>();
  const tasks = useTasks(projectId);
  const [taskId, setTaskId] = useState<number | undefined>();
  const [note, setNote] = useState('');
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600 * 1000);
  const [startedAt, setStartedAt] = useState(
    toLocalDateTimeInput(Math.floor(oneHourAgo.getTime() / 1000)),
  );
  const [endedAt, setEndedAt] = useState(toLocalDateTimeInput(Math.floor(now.getTime() / 1000)));
  const create = useCreateManualTrack();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Project</Label>
              <NativeSelect
                value={projectId ?? ''}
                onChange={(e) => {
                  setProjectId(Number(e.target.value));
                  setTaskId(undefined);
                }}
              >
                <option value="" disabled>
                  Select
                </option>
                {projects.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label>Task</Label>
              <NativeSelect
                value={taskId ?? ''}
                onChange={(e) => setTaskId(e.target.value ? Number(e.target.value) : undefined)}
                disabled={!projectId}
              >
                <option value="">— none —</option>
                {tasks.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div>
            <Label>Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Started</Label>
              <Input
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
              />
            </div>
            <div>
              <Label>Ended</Label>
              <Input
                type="datetime-local"
                value={endedAt}
                onChange={(e) => setEndedAt(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={!projectId}
            onClick={async () => {
              if (!projectId) return;
              try {
                await create.mutateAsync({
                  project_id: projectId,
                  task_id: taskId ?? null,
                  note,
                  started_at: fromLocalDateTimeInput(startedAt),
                  ended_at: fromLocalDateTimeInput(endedAt),
                });
                toast.success('Added');
                onClose();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Failed');
              }
            }}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
