import { useEffect, useMemo, useState } from 'react';
import { Play, Square, FolderPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/select-native';
import { useActiveTrack, useProjects, useStartTrack, useStopTrack, useTasks } from '@/hooks/data';
import { formatDuration, fromLocalDateTimeInput, toLocalDateTimeInput } from '@/lib/utils';
import { toast } from 'sonner';

export function TimerPage() {
  const projects = useProjects();
  const active = useActiveTrack();
  const start = useStartTrack();
  const stop = useStopTrack();

  const [projectId, setProjectId] = useState<number | undefined>();
  const [taskId, setTaskId] = useState<number | undefined>();
  const [note, setNote] = useState('');
  const [startedAt, setStartedAt] = useState(() =>
    toLocalDateTimeInput(Math.floor(Date.now() / 1000)),
  );
  const [startedAtDirty, setStartedAtDirty] = useState(false);
  const tasks = useTasks(projectId);

  const activeId = active.data?.id;
  useEffect(() => {
    if (active.data) {
      setProjectId(active.data.project_id);
      setTaskId(active.data.task_id ?? undefined);
      setNote(active.data.note);
      setStartedAt(toLocalDateTimeInput(active.data.started_at));
    } else {
      setStartedAt(toLocalDateTimeInput(Math.floor(Date.now() / 1000)));
      setStartedAtDirty(false);
    }
    // Only re-sync when the active track changes identity, not on every refetch.
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!projectId && projects.data && projects.data.length > 0 && !active.data) {
      setProjectId(projects.data[0].id);
    }
  }, [projects.data, projectId, active.data]);

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const i = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(i);
  }, []);

  const elapsed = useMemo(() => {
    if (!active.data) return 0;
    return now - active.data.started_at;
  }, [active.data, now]);

  useEffect(() => {
    if (!active.data && !startedAtDirty) {
      setStartedAt(toLocalDateTimeInput(now));
    }
  }, [now, active.data, startedAtDirty]);

  const project = projects.data?.find((p) => p.id === active.data?.project_id);
  const task = tasks.data?.find((t) => t.id === active.data?.task_id);

  const noProjects = projects.data && projects.data.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Timer</h1>
        <p className="text-sm text-muted-foreground">Track your time on a project.</p>
      </div>

      {noProjects && (
        <Card>
          <CardContent className="p-6 flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">No projects yet</div>
              <div className="text-sm text-muted-foreground">Create one to start tracking.</div>
            </div>
            <Button asChild>
              <Link to="/projects">
                <FolderPlus className="size-4" /> New project
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{active.data ? 'Tracking' : 'Idle'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-5xl md:text-6xl font-mono tabular-nums tracking-tight">
            {active.data ? formatDuration(elapsed) : '0s'}
          </div>
          {active.data && (
            <div className="text-sm text-muted-foreground">
              <span
                className="inline-block size-2 rounded-full mr-2 align-middle"
                style={{ backgroundColor: project?.color }}
              />
              <span className="font-medium text-foreground">{project?.name}</span>
              {task && <> — {task.name}</>}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Project</Label>
              <NativeSelect
                value={projectId ?? ''}
                onChange={(e) => {
                  setProjectId(Number(e.target.value));
                  setTaskId(undefined);
                }}
                disabled={!!active.data}
              >
                <option value="" disabled>
                  Select project
                </option>
                {projects.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label>Task (optional)</Label>
              <NativeSelect
                value={taskId ?? ''}
                onChange={(e) => setTaskId(e.target.value ? Number(e.target.value) : undefined)}
                disabled={!!active.data || !projectId}
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

          <div className="space-y-1">
            <Label>Note</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What are you working on?"
              disabled={!!active.data}
            />
          </div>

          <div className="space-y-1">
            <Label>Start time</Label>
            <Input
              type="datetime-local"
              value={startedAt}
              max={toLocalDateTimeInput(now)}
              onChange={(e) => {
                setStartedAt(e.target.value);
                setStartedAtDirty(true);
              }}
              disabled={!!active.data}
            />
          </div>

          <div className="flex gap-2">
            {active.data ? (
              <Button
                size="lg"
                variant="destructive"
                onClick={async () => {
                  await stop.mutateAsync();
                  toast.success('Stopped');
                }}
                disabled={stop.isPending}
              >
                <Square className="size-4" /> Stop
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={async () => {
                  if (!projectId) return;
                  const nowTs = Math.floor(Date.now() / 1000);
                  const startTs = startedAtDirty
                    ? startedAt
                      ? fromLocalDateTimeInput(startedAt)
                      : NaN
                    : nowTs;
                  if (!Number.isFinite(startTs) || startTs > nowTs) {
                    toast.error('Invalid start time');
                    return;
                  }
                  try {
                    await start.mutateAsync({
                      project_id: projectId,
                      task_id: taskId ?? null,
                      note,
                      started_at: startTs,
                    });
                    toast.success('Started');
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Failed to start');
                  }
                }}
                disabled={!projectId || start.isPending}
              >
                <Play className="size-4" /> Start
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
